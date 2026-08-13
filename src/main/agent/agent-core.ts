/**
 * Agent 核心编排器
 * 整合 L0 规则路由、L1/L2 模型调度、流式输出与中断控制
 */

import { RuleRouter } from '../router/rule-router.js';
import { ModelPool, MODEL_TIER, type ModelTier } from '../router/model-pool.js';
import { OllamaClient } from './ollama-client.js';
import type { AgentChatMessage } from '@shared/types/ipc.js';
import type { AppConfig } from '@shared/types/config.js';

/** 代理状态 */
export const AGENT_STATUS = {
  IDLE: 'idle',
  THINKING: 'thinking',
  STREAMING: 'streaming',
  ERROR: 'error',
} as const;

export type AgentStatus = (typeof AGENT_STATUS)[keyof typeof AGENT_STATUS];

/** 生成事件回调 */
export type GenerateEventCallback = (
  event: 'delta' | 'done' | 'error' | 'status-change',
  data: string | AgentStatus | Error,
) => void;

/** 聊天请求选项 */
export interface ChatOptions {
  /** 是否强制使用 L2 */
  forceL2?: boolean;
  /** 上下文消息历史 */
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  /** 最大 token 数 */
  maxTokens?: number;
}

/** 生成结果 */
export interface GenerateResult {
  /** 完整响应文本 */
  content: string;
  /** 使用的模型层级 */
  tier: ModelTier;
  /** 耗时（毫秒） */
  latencyMs: number;
  /** 是否由 L0 规则命中 */
  fromRule: boolean;
}

/**
 * AgentCore 类
 * 核心编排器，协调规则路由、模型调度与流式生成
 */
export class AgentCore {
  private config: AppConfig;
  private ruleRouter: RuleRouter;
  private modelPool: ModelPool;
  private ollamaClient: OllamaClient;
  private status: AgentStatus;
  private abortController: AbortController | null;
  private listeners: Set<GenerateEventCallback>;

  constructor(config: AppConfig) {
    this.config = config;
    this.ruleRouter = new RuleRouter();
    this.modelPool = new ModelPool(
      'qwen3:4b',
      config.model.defaultModel,
      5 * 60 * 1000,
    );
    this.ollamaClient = new OllamaClient(config.ollama);
    this.status = AGENT_STATUS.IDLE;
    this.abortController = null;
    this.listeners = new Set();

    this.modelPool.addListener((info) => {
      this.emit('status-change', `model:${info.tier}=${info.status}`);
    });
  }

  /**
   * 获取当前状态
   */
  getStatus(): AgentStatus {
    return this.status;
  }

  /**
   * 获取当前活跃模型层级
   */
  getActiveTier(): ModelTier {
    return this.modelPool.getActiveTier();
  }

  /**
   * 添加事件监听器
   */
  addListener(callback: GenerateEventCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * 处理聊天请求
   * @param message 用户消息
   * @param options 可选参数
   */
  async chat(
    message: AgentChatMessage,
    options: ChatOptions = {},
  ): Promise<GenerateResult> {
    const startTime = performance.now();
    const userText = message.content;

    const ruleMatch = this.ruleRouter.match(userText);
    if (ruleMatch.matched && !options.forceL2) {
      this.setStatus(AGENT_STATUS.STREAMING);
      this.emit('delta', ruleMatch.response ?? '');
      this.emit('done', '');
      this.setStatus(AGENT_STATUS.IDLE);

      return {
        content: ruleMatch.response ?? '',
        tier: MODEL_TIER.L0,
        latencyMs: ruleMatch.latencyMs,
        fromRule: true,
      };
    }

    if (options.forceL2 || this.shouldUpgradeToL2(userText)) {
      await this.modelPool.upgradeToL2();
    } else {
      this.modelPool.touchModel(MODEL_TIER.L1);
    }

    const activeTier = this.modelPool.getActiveTier();
    const modelInfo = this.modelPool.getModelInfo(activeTier);

    if (!modelInfo || modelInfo.status !== 'ready') {
      const fallbackResponse = this.modelPool.getFallbackResponse();
      this.emit('delta', fallbackResponse);
      this.emit('done', '');
      return {
        content: fallbackResponse,
        tier: activeTier,
        latencyMs: performance.now() - startTime,
        fromRule: false,
      };
    }

    this.setStatus(AGENT_STATUS.THINKING);
    const result = await this.streamGenerate(userText, modelInfo.name, options, startTime);
    return result;
  }

  /**
   * 中断当前生成
   */
  interrupt(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.setStatus(AGENT_STATUS.IDLE);
  }

  /**
   * 判断是否需要升级到 L2
   * 基于文本长度和复杂度启发式判断
   */
  private shouldUpgradeToL2(text: string): boolean {
    const charCount = text.length;
    const l1Threshold = 200;
    return charCount > l1Threshold;
  }

  /**
   * 流式生成实现
   */
  private async streamGenerate(
    prompt: string,
    modelName: string,
    options: ChatOptions,
    startTime: number,
  ): Promise<GenerateResult> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    this.setStatus(AGENT_STATUS.STREAMING);

    const messages = options.messages ?? [
      { role: 'system' as const, content: this.config.model.systemPrompt },
      { role: 'user' as const, content: prompt },
    ];

    let fullContent = '';

    try {
      await this.ollamaClient.chatStream(
        {
          model: modelName,
          messages,
          temperature: this.config.model.temperature,
          maxTokens: options.maxTokens ?? this.config.model.maxTokens,
        },
        (chunk, done) => {
          fullContent += chunk;
          this.emit('delta', chunk);

          if (done) {
            this.emit('done', '');
            this.setStatus(AGENT_STATUS.IDLE);
          }
        },
        signal,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.emit('done', '');
        this.setStatus(AGENT_STATUS.IDLE);
      } else {
        this.handleError(error);
      }
    }

    return {
      content: fullContent,
      tier: this.modelPool.getActiveTier(),
      latencyMs: performance.now() - startTime,
      fromRule: false,
    };
  }

  /**
   * 错误处理
   */
  private handleError(error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    this.setStatus(AGENT_STATUS.ERROR);
    this.emit('error', err);
    this.setStatus(AGENT_STATUS.IDLE);
  }

  /**
   * 设置状态
   */
  private setStatus(status: AgentStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.emit('status-change', status);
    }
  }

  /**
   * 发射事件
   */
  private emit(event: 'delta' | 'done' | 'error' | 'status-change', data: string | AgentStatus | Error): void {
    for (const listener of this.listeners) {
      try {
        listener(event, data);
      } catch (error) {
        console.error('[AgentCore] Listener error:', error);
      }
    }
  }
}