/**
 * Agent 核心编排器
 * 整合 L0 规则路由、L1/L2 模型调度、流式输出、工具执行与记忆集成
 */

import { RuleRouter } from '../router/rule-router.js';
import { ModelPool, MODEL_TIER, type ModelTier } from '../router/model-pool.js';
import { OllamaClient } from './ollama-client.js';
import { ToolRegistry, registerBuiltinTools } from '../tools/registry.js';
import { MemoryManager } from '../memory/memory-manager.js';
import type { AgentChatMessage } from '@shared/types/ipc.js';
import type { AppConfig } from '@shared/types/config.js';

/** 代理状态 */
export const AGENT_STATUS = {
  IDLE: 'idle',
  THINKING: 'thinking',
  STREAMING: 'streaming',
  TOOL_CALL: 'tool_call',
  ERROR: 'error',
} as const;

export type AgentStatus = (typeof AGENT_STATUS)[keyof typeof AGENT_STATUS];

/** 生成事件回调 */
export type GenerateEventCallback = (
  event: 'delta' | 'done' | 'error' | 'status-change' | 'tool-call',
  data: string | AgentStatus | Error | ToolCallEvent,
) => void;

/** 工具调用事件 */
export interface ToolCallEvent {
  toolName: string;
  args: Record<string, unknown>;
  status: 'start' | 'success' | 'error';
  result?: unknown;
  error?: string;
}

/** 聊天请求选项 */
export interface ChatOptions {
  /** 是否强制使用 L2 */
  forceL2?: boolean;
  /** 上下文消息历史 */
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  /** 最大 token 数 */
  maxTokens?: number;
  /** 是否启用工具调用 */
  enableTools?: boolean;
  /** 是否启用记忆 */
  enableMemory?: boolean;
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
  /** 工具调用记录 */
  toolCalls: ToolCallEvent[];
}

/** 工具调用检测结果 */
interface DetectedToolCall {
  name: string;
  args: Record<string, unknown>;
}

/** 工具调用执行结果 */
interface ToolCallResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

import { EmotionPipeline, type EmotionState, toSharedEmotionType } from '../emotion/emotion-pipeline.js';
import { Personality } from '../personality/personality.js';
import { TtsManager } from '../tts/tts-engine.js';
import { ActiveEngine } from '../active/active-engine.js';

/**
 * AgentCore 类
 * 核心编排器，协调规则路由、模型调度、工具执行与记忆检索
 */
export class AgentCore {
  private config: AppConfig;
  private ruleRouter: RuleRouter;
  private modelPool: ModelPool;
  private ollamaClient: OllamaClient;
  private toolRegistry: ToolRegistry;
  private memoryManager: MemoryManager;
  private emotionPipeline: EmotionPipeline | null;
  private personality: Personality | null;
  private ttsEngine: TtsManager | null;
  private activeEngine: ActiveEngine | null;
  private status: AgentStatus;
  private abortController: AbortController | null;
  private listeners: Set<GenerateEventCallback>;
  private currentEmotion: EmotionState | null;

  constructor(
    config: AppConfig,
    options: {
      toolRegistry?: ToolRegistry;
      memoryManager?: MemoryManager;
      emotionPipeline?: EmotionPipeline;
      personality?: Personality;
      ttsEngine?: TtsManager;
      activeEngine?: ActiveEngine;
      skipInit?: boolean;
    } = {},
  ) {
    this.config = config;
    this.ruleRouter = new RuleRouter();
    this.modelPool = new ModelPool(
      config.model.defaultModel,
      config.model.defaultModel,
      5 * 60 * 1000,
    );
    this.ollamaClient = new OllamaClient(config.ollama);
    this.toolRegistry = options.toolRegistry ?? new ToolRegistry();
    this.memoryManager = options.memoryManager ?? new MemoryManager();
    this.emotionPipeline = options.emotionPipeline ?? null;
    this.personality = options.personality ?? null;
    this.ttsEngine = options.ttsEngine ?? null;
    this.activeEngine = options.activeEngine ?? null;
    this.status = AGENT_STATUS.IDLE;
    this.abortController = null;
    this.listeners = new Set();
    this.currentEmotion = null;

    if (!options.skipInit) {
      registerBuiltinTools(this.toolRegistry);
    }

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
   * 获取工具注册表
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
   * 获取记忆管理器
   */
  getMemoryManager(): MemoryManager {
    return this.memoryManager;
  }

  /**
   * 获取当前情感状态
   */
  getCurrentEmotion(): EmotionState | null {
    return this.currentEmotion;
  }

  /**
   * 获取情感管道
   */
  getEmotionPipeline(): EmotionPipeline | null {
    return this.emotionPipeline;
  }

  /**
   * 获取人格管理器
   */
  getPersonality(): Personality | null {
    return this.personality;
  }

  /**
   * 获取 TTS 引擎
   */
  getTtsEngine(): TtsManager | null {
    return this.ttsEngine;
  }

  /**
   * 获取主动引擎
   */
  getActiveEngine(): ActiveEngine | null {
    return this.activeEngine;
  }

  /**
   * 分析用户情感
   */
  analyzeEmotion(text: string): EmotionState | null {
    if (!this.emotionPipeline) return null;

    const emotion = this.emotionPipeline.analyze(text);
    this.currentEmotion = emotion;

    // 转换为共享类型并发射情感状态变更
    const sharedType = toSharedEmotionType(emotion.emotion);
    this.emit('status-change', {
      namespace: 'emotion',
      value: sharedType,
    } as unknown as AgentStatus);

    return emotion;
  }

  /**
   * 应用情感到 TTS
   */
  applyEmotionToTTS(emotion: EmotionState): void {
    if (!this.emotionPipeline || !this.ttsEngine) return;

    const ttsParams = this.emotionPipeline.getTtsParams(emotion.emotion, emotion.intensity);
    this.ttsEngine.applyEmotionParams(ttsParams.rate, ttsParams.volume, ttsParams.pitch);
  }

  /**
   * 检查并清洗输出（人格系统）
   */
  sanitizeOutput(text: string): string {
    if (!this.personality) return text;
    return this.personality.sanitizeOutput(text);
  }

  /**
   * 构建系统提示（包含人格注入）
   */
  buildSystemPrompt(context?: string): string {
    if (!this.personality) return context ?? '';
    const basePrompt = this.personality.getSystemPrompt();
    return context ? `${basePrompt}\n\n${context}` : basePrompt;
  }

  /**
   * 动态切换默认模型
   */
  setModel(modelName: string): void {
    console.log('[AgentCore] Setting model to:', modelName);
    this.config.model.defaultModel = modelName;
    this.modelPool.setResidentModel(modelName);
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
   */
  async chat(
    message: AgentChatMessage,
    options: ChatOptions = {},
  ): Promise<GenerateResult> {
    const startTime = performance.now();
    const toolCalls: ToolCallEvent[] = [];
    const userText = message.content;

    // 执行情感分析并广播结果
    this.analyzeEmotion(userText);

    const ruleMatch = this.ruleRouter.match(userText);
    if (ruleMatch.matched && !options.forceL2) {
      const response = ruleMatch.response ?? '';
      this.setStatus(AGENT_STATUS.STREAMING);

      queueMicrotask(() => {
        this.emit('delta', response);
        queueMicrotask(() => {
          this.emit('done', '');
          this.setStatus(AGENT_STATUS.IDLE);
        });
      });

      this.autoStoreMemory(userText, response).catch(() => {});

      return {
        content: response,
        tier: MODEL_TIER.L0,
        latencyMs: ruleMatch.latencyMs,
        fromRule: true,
        toolCalls,
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
      this.autoStoreMemory(userText, fallbackResponse).catch(() => {});
      return {
        content: fallbackResponse,
        tier: activeTier,
        latencyMs: performance.now() - startTime,
        fromRule: false,
        toolCalls,
      };
    }

    this.setStatus(AGENT_STATUS.THINKING);

    const isHealthy = await this.ollamaClient.healthCheck();
    if (!isHealthy) {
      const errorMsg = '模型服务未启动，请先启动 Ollama 后重试。';
      this.emit('delta', errorMsg);
      this.emit('done', '');
      this.emit('error', new Error(errorMsg));
      this.setStatus(AGENT_STATUS.IDLE);
      return {
        content: errorMsg,
        tier: activeTier,
        latencyMs: performance.now() - startTime,
        fromRule: false,
        toolCalls,
      };
    }

    const enrichedMessages = await this.buildMessages(userText, options);

    const result = await this.streamGenerateWithTools(
      userText,
      modelInfo.name,
      enrichedMessages,
      options,
      startTime,
      toolCalls,
    );

    return result;
  }

  /**
   * 构建发送给模型的消息（注入记忆 + 工具描述）
   */
  private async buildMessages(
    userText: string,
    options: ChatOptions,
  ): Promise<Array<{ role: 'user' | 'assistant' | 'system'; content: string }>> {
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

    let systemPrompt = this.config.model.systemPrompt;

    if (options.enableMemory !== false) {
      try {
        const relevantMemories = await this.memoryManager.search(userText, { limit: 3 });
        if (relevantMemories.length > 0) {
          const memoryContext = relevantMemories
            .map((m) => `- [${m.entry.type}] ${m.entry.content}`)
            .join('\n');
          systemPrompt += `\n\n相关记忆:\n${memoryContext}`;
        }
      } catch {}
    }

    if (options.enableTools !== false && this.config.skills.enabled) {
      const toolDescriptions = this.toolRegistry.getToolSummaries()
        .filter((t) => this.config.skills.enabledSkills.includes(t.name));
      if (toolDescriptions.length > 0) {
        const toolsDesc = toolDescriptions
          .map((t) => `工具: ${t.name}\n描述: ${t.description}\n参数: ${t.parameters}`)
          .join('\n---\n');
        systemPrompt += `\n\n可用工具:\n${toolsDesc}\n\n如需使用工具，请在回复末尾使用 XML 格式标记，例如：\n<tool_call name="工具名" args='{"key":"value"}' />\n系统会自动识别并执行该工具，然后将结果返回给你。\n\n重要：\n1. 只使用上面列出的工具\n2. 工具调用标签会被系统自动移除，用户不会看到\n3. 不要在工具标签内或周围添加额外说明文字\n4. 如果没有合适的工具，直接回答即可，不要输出任何工具调用标签`;
      }
    }

    messages.push({ role: 'system', content: systemPrompt });

    if (options.messages && options.messages.length > 0) {
      messages.push(...options.messages);
    }

    return messages;
  }

  /**
   * 带工具执行的流式生成
   */
  private async streamGenerateWithTools(
    userText: string,
    modelName: string,
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options: ChatOptions,
    startTime: number,
    toolCalls: ToolCallEvent[],
  ): Promise<GenerateResult> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    this.setStatus(AGENT_STATUS.STREAMING);
    console.log('[AgentCore] streamGenerateWithTools start:', { model: modelName, promptLen: userText.length });

    let fullContent = '';
    let iteration = 0;
    const maxIterations = 5;

    while (iteration < maxIterations) {
      iteration++;
      let chunkBuffer = '';

      try {
        await this.ollamaClient.chatStream(
          {
            model: modelName,
            messages,
            temperature: this.config.model.temperature,
            maxTokens: options.maxTokens ?? this.config.model.maxTokens,
          },
          (chunk, done) => {
            chunkBuffer += chunk;
            fullContent += chunk;
            this.emit('delta', chunk);

            if (done) {
              console.log('[AgentCore] streamGenerate iteration done:', {
                iteration,
                totalLen: fullContent.length,
                latency: performance.now() - startTime,
              });
            }
          },
          signal,
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          console.log('[AgentCore] streamGenerate aborted');
          this.emit('done', '');
          this.setStatus(AGENT_STATUS.IDLE);
          break;
        } else {
          console.error('[AgentCore] streamGenerate error:', error);
          this.handleError(error);
          break;
        }
      }

      if (signal.aborted) break;

      const detectedToolCall = this.detectToolCall(fullContent);
      if (!detectedToolCall || options.enableTools === false) {
        break;
      }

      const toolResult = await this.executeToolCall(detectedToolCall, toolCalls);

      messages.push({
        role: 'assistant',
        content: fullContent,
      });
      messages.push({
        role: 'user',
        content: `工具 ${detectedToolCall.name} 执行结果:\n${JSON.stringify(toolResult, null, 2)}\n请基于此结果继续回复。`,
      });

      fullContent = '';
      this.setStatus(AGENT_STATUS.THINKING);

      if (toolResult.success === false) {
        console.warn('[AgentCore] Tool execution failed:', detectedToolCall.name, toolResult.error);
      }
    }

    this.emit('done', '');
    this.setStatus(AGENT_STATUS.IDLE);

    // 清理输出中的工具调用标签
    const cleanedContent = this.stripToolCallTags(fullContent);

    this.autoStoreMemory(userText, cleanedContent).catch(() => {});

    return {
      content: cleanedContent,
      tier: this.modelPool.getActiveTier(),
      latencyMs: performance.now() - startTime,
      fromRule: false,
      toolCalls,
    };
  }

  /**
   * 从模型输出中检测工具调用
   */
  private detectToolCall(content: string): DetectedToolCall | null {
    const patterns: Array<{ regex: RegExp; extract: (m: RegExpMatchArray) => { name: string; argsStr: string } | null }> = [
      {
        regex: /\[TOOL_CALL:\s*(\{[^}]+\})\]/,
        extract: (m) => {
          try {
            const obj = JSON.parse(m[1]);
            const name = obj.name ?? obj.tool ?? obj.function;
            const args = obj.args ?? obj.parameters ?? obj.input ?? {};
            if (typeof name === 'string') return { name, argsStr: JSON.stringify(args) };
          } catch {
            return null;
          }
          return null;
        },
      },
      {
        regex: /tool_call\s*\(\s*"(\w+)"\s*,\s*(\{[^}]*\})/,
        extract: (m) => ({ name: m[1], argsStr: m[2] }),
      },
      {
        regex: /<tool>\s*<name>(\w+)<\/name>\s*<args>(\{[^}]*\})<\/args>\s*<\/tool>/,
        extract: (m) => ({ name: m[1], argsStr: m[2] }),
      },
      {
        regex: /<(\w+)\s+tool_call\s*=\s*'(\{[\s\S]*?\})'\s*\/?>/,
        extract: (m) => ({ name: m[1], argsStr: m[2] }),
      },
      {
        regex: /<(\w+)\s+tool_call\s*=\s*"(\{[\s\S]*?\})"\s*\/?>/,
        extract: (m) => ({ name: m[1], argsStr: m[2] }),
      },
      {
        regex: /<(\w+)\s+tool_call\s*=\s*'([^']*)'\s*\/?>/,
        extract: (m) => ({ name: m[1], argsStr: m[2] }),
      },
      {
        regex: /<(\w+)\s+tool_call\s*=\s*"([^"]*)"\s*\/?>/,
        extract: (m) => ({ name: m[1], argsStr: m[2] }),
      },
      {
        regex: /<tool_call\s+name\s*=\s*"(\w+)"\s+args\s*=\s*'(\{[^}]*\})'\s*\/?>/,
        extract: (m) => ({ name: m[1], argsStr: m[2] }),
      },
      {
        regex: /<tool_call\s+name\s*=\s*'(\w+)'\s+args\s*=\s*"(\{[^}]*\})"\s*\/?>/,
        extract: (m) => ({ name: m[1], argsStr: m[2] }),
      },
      {
        regex: /<(\w+)>(\{[\s\S]*?\})<\/\1>/,
        extract: (m) => ({ name: m[1], argsStr: m[2] }),
      },
    ];

    for (const { regex, extract } of patterns) {
      const match = content.match(regex);
      if (match) {
        try {
          const extracted = extract(match);
          if (!extracted) continue;
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(extracted.argsStr);
          } catch {
            args = { value: extracted.argsStr };
          }
          if (this.toolRegistry.getTool(extracted.name)) {
            return { name: extracted.name, args };
          }
        } catch {
          // Continue trying other patterns
        }
      }
    }

    return null;
  }

  /**
   * 从输出内容中移除所有工具调用标签
   * 确保即使用了未注册的工具，XML标签也不会暴露给用户
   */
  private stripToolCallTags(content: string): string {
    let result = content;

    // 移除 [TOOL_CALL: {...}] 格式
    result = result.replace(/\[TOOL_CALL:\s*\{[^}]*\}\]/gi, '');

    // 移除 <tool><name>X</name><args>{...}</args></tool> 格式
    result = result.replace(/<tool>\s*<name>\w+<\/name>\s*<args>[\s\S]*?<\/args>\s*<\/tool>/gi, '');

    // 移除 <tool_call name="X" args='{...}' /> 格式
    result = result.replace(/<tool_call\s+name\s*=\s*["'][^"']+["']\s+args\s*=\s*["'][\s\S]*?["']\s*\/?>/gi, '');

    // 移除 <time tool_call='{...}' /> 格式（单引号，支持JSON内容）
    result = result.replace(/<\w+\s+tool_call\s*=\s*'\{[\s\S]*?\}'\s*\/?>/g, '');

    // 移除 <time tool_call="{...}" /> 格式（双引号，支持JSON内容）
    result = result.replace(/<\w+\s+tool_call\s*=\s*"\{[\s\S]*?\}"\s*\/?>/g, '');

    // 移除 <time tool_call='...' /> 格式（单引号，简单内容）
    result = result.replace(/<\w+\s+tool_call\s*=\s*'[^']*'\s*\/?>/g, '');

    // 移除 <time tool_call="..." /> 格式（双引号，简单内容）
    result = result.replace(/<\w+\s+tool_call\s*=\s*"[^"]*"\s*\/?>/g, '');

    // 移除 <time>{...}</time> XML body 格式
    result = result.replace(/<(\w+)>[\s\S]*?<\/\1>/g, '');

    // 移除 tool_call("name", {...}) 函数调用格式
    result = result.replace(/tool_call\s*\(\s*"[^"]*"\s*,\s*\{[\s\S]*?\}\s*\)/g, '');

    // 清理残留的空行和空白
    result = result.replace(/\n{3,}/g, '\n\n');
    result = result.replace(/[ \t]+$/gm, '');

    return result.trim();
  }

  /**
   * 执行工具调用
   */
  private async executeToolCall(
    toolCall: DetectedToolCall,
    toolCalls: ToolCallEvent[],
  ): Promise<ToolCallResult> {
    const startEvent: ToolCallEvent = {
      toolName: toolCall.name,
      args: toolCall.args,
      status: 'start',
    };
    toolCalls.push(startEvent);
    this.setStatus(AGENT_STATUS.TOOL_CALL);
    this.emit('tool-call', startEvent);

    const result = await this.toolRegistry.execute(toolCall.name, toolCall.args);

    const endEvent: ToolCallEvent = {
      toolName: toolCall.name,
      args: toolCall.args,
      status: result.success ? 'success' : 'error',
      result: result.result,
      error: result.error,
    };
    toolCalls.push(endEvent);
    this.emit('tool-call', endEvent);

    return result.success
      ? { success: true, result: result.result }
      : { success: false, error: result.error };
  }

  /**
   * 自动存储对话到记忆系统
   */
  private async autoStoreMemory(userText: string, assistantText: string): Promise<void> {
    try {
      if (userText.length > 10) {
        await this.memoryManager.add('context', userText, { role: 'user' }, 0.5);
      }
      if (assistantText.length > 10) {
        await this.memoryManager.add('context', assistantText, { role: 'assistant' }, 0.5);
      }
    } catch (error) {
      console.warn('[AgentCore] Auto store memory failed:', error);
    }
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
   */
  private shouldUpgradeToL2(text: string): boolean {
    const charCount = text.length;
    const l1Threshold = 200;
    return charCount > l1Threshold;
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
  private emit(event: 'delta' | 'done' | 'error' | 'status-change' | 'tool-call', data: string | AgentStatus | Error | ToolCallEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event, data as never);
      } catch (error) {
        console.error('[AgentCore] Listener error:', error);
      }
    }
  }
}
