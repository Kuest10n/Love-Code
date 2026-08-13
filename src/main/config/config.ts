/**
 * 配置管理器
 * 负责配置的加载、保存、热更新与事件通知
 */

import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import type {
  AppConfig,
  ConfigChangeEvent,
} from '@shared/types/config.js';
import { createDefaultConfig } from '@shared/types/config.js';
import { OllamaClient } from '../agent/ollama-client.js';
import { exec as execSync } from 'node:child_process';

/**
 * 配置验证 Schema（基于 Zod）
 * 用于运行时校验配置文件的合法性
 */
const configSchema = z.object({
  version: z.number().int().positive(),
  ollama: z.object({
    baseUrl: z.string().url(),
    timeout: z.number().int().positive(),
    retries: z.number().int().min(0).max(10),
    stream: z.boolean(),
    autoStart: z.boolean().default(false),
    isOnline: z.boolean().default(false),
  }),
  model: z.object({
    defaultModel: z.string().min(1),
    availableModels: z.array(z.string().min(1)),
    contextWindow: z.number().int().positive(),
    temperature: z.number().min(0).max(2),
    topP: z.number().min(0).max(1),
    maxTokens: z.number().int().positive(),
    systemPrompt: z.string(),
    tokenLimit: z.number().int().positive().default(4096),
  }),
  tts: z.object({
    enabled: z.boolean(),
    engine: z.enum(['local', 'edge']).default('edge'),
    defaultVoice: z.string().min(1),
    availableVoices: z.array(z.string()).default([]),
    rate: z.number().min(0.5).max(2),
    volume: z.number().min(0).max(1),
    pitch: z.number().min(-10).max(10),
    format: z.enum(['mp3', 'wav', 'ogg']),
    sampleRate: z.number().int().positive(),
  }),
  live2d: z.object({
    enabled: z.boolean(),
    modelDir: z.string(),
    defaultModel: z.string().min(1),
    availableModels: z.array(z.string()).default([]),
    opacity: z.number().min(0).max(1),
    alwaysOnTop: z.boolean(),
    defaultEmotion: z.string(),
    autoBlink: z.boolean(),
    followMouse: z.boolean(),
    idleActionInterval: z.number().int().positive(),
  }),
  vision: z.object({
    enabled: z.boolean().default(false),
    captureEnabled: z.boolean().default(false),
    ocrEnabled: z.boolean().default(false),
    defaultLanguage: z.string().default('zh-CN'),
    autoCaptureInterval: z.number().int().default(0),
  }).default({ enabled: false, captureEnabled: false, ocrEnabled: false, defaultLanguage: 'zh-CN', autoCaptureInterval: 0 }),
  skills: z.object({
    enabled: z.boolean().default(true),
    enabledSkills: z.array(z.string()).default([]),
  }).default({ enabled: true, enabledSkills: [] }),
  personality: z.object({
    enabled: z.boolean().default(true),
    traits: z.array(z.string()).default([]),
    customSystemPrompt: z.string().default(''),
    sanitizeOutput: z.boolean().default(true),
  }).default({ enabled: true, traits: [], customSystemPrompt: '', sanitizeOutput: true }),
  emotion: z.object({
    enabled: z.boolean().default(true),
    pipelineEnabled: z.boolean().default(true),
    currentEmotion: z.string().default('neutral'),
    emotionHistory: z.array(z.object({ emotion: z.string(), timestamp: z.number() })).default([]),
  }).default({ enabled: true, pipelineEnabled: true, currentEmotion: 'neutral', emotionHistory: [] }),
  active: z.object({
    enabled: z.boolean().default(false),
    highInterval: z.number().int().default(60),
    mediumInterval: z.number().int().default(3600),
    lowInterval: z.number().int().default(86400),
    desireThreshold: z.number().default(0.7),
    suppressionThreshold: z.number().int().default(3),
    desireAccumulationRate: z.number().default(0.01),
    customEvents: z.array(z.object({ id: z.string(), name: z.string(), interval: z.number(), enabled: z.boolean() })).default([]),
  }).default({ enabled: false, highInterval: 60, mediumInterval: 3600, lowInterval: 86400, desireThreshold: 0.7, suppressionThreshold: 3, desireAccumulationRate: 0.01, customEvents: [] }),
  ui: z.object({
    theme: z.enum(['light', 'dark', 'auto']),
    language: z.enum(['zh-CN', 'en-US']),
    fontSize: z.number().int().positive(),
    animationsEnabled: z.boolean(),
    windowWidth: z.number().int().positive(),
    windowHeight: z.number().int().positive(),
  }),
  database: z.object({
    filePath: z.string(),
    walMode: z.boolean(),
    maxConnections: z.number().int().min(1).max(20),
  }),
});

/**
 * 配置管理器类
 * 扩展 EventEmitter 以支持配置变更事件监听
 */
export class ConfigManager extends EventEmitter {
  /** 当前配置快照 */
  private config: AppConfig;
  /** 配置文件绝对路径 */
  private readonly filePath: string;
  /** 防抖定时器引用 */
  private saveTimer: ReturnType<typeof setTimeout> | null;
  /** 防抖延迟（毫秒） */
  private readonly saveDebounceMs = 300;

  /**
   * 构造函数
   * @param configPath 配置文件路径，默认为用户目录下的 love-code/config.json
   */
  constructor(configPath?: string) {
    super();
    this.filePath = configPath ?? resolve(process.cwd(), 'config.json');
    this.config = createDefaultConfig();
    this.saveTimer = null;
  }

  /**
   * 初始化配置管理器
   * 加载本地配置文件，若文件不存在则创建默认配置
   * @returns 加载后的配置对象
   */
  public initialize(): AppConfig {
    if (existsSync(this.filePath)) {
      this.load();
    } else {
      this.save();
    }
    return this.config;
  }

  /**
   * 从磁盘加载配置
   * @returns 加载后的配置对象
   * @throws 当配置格式无效时抛出错误
   */
  public load(): AppConfig {
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      const result = configSchema.safeParse(parsed);

      if (!result.success) {
        throw new Error(
          `配置校验失败: ${result.error.errors.map((e) => e.message).join('; ')}`,
        );
      }

      const oldConfig = this.config;
      this.config = result.data as AppConfig;

      this.emit('change', {
        path: '*',
        newValue: this.config,
        oldValue: oldConfig,
        timestamp: Date.now(),
      } satisfies ConfigChangeEvent);

      return this.config;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`加载配置失败: ${message}`);
    }
  }

  /**
   * 将当前配置持久化到磁盘
   */
  public save(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.filePath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  /**
   * 防抖保存配置
   * 在短时间内多次调用时合并为一次写操作
   */
  public saveDebounced(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, this.saveDebounceMs);
  }

  /**
   * 获取当前配置快照
   * @returns 配置对象的深拷贝
   */
  public getConfig(): AppConfig {
    return structuredClone(this.config);
  }

  /**
   * 获取指定路径的配置值
   * 支持点号分隔的嵌套路径（如 'model.temperature'）
   * @param path 配置路径
   * @returns 配置值，路径不存在返回 undefined
   */
  public getValue<T = unknown>(path: string): T | undefined {
    const keys = path.split('.');
    let current: unknown = this.config;
    for (const key of keys) {
      if (typeof current === 'object' && current !== null && key in current) {
        current = (current as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }
    return current as T;
  }

  /**
   * 更新指定路径的配置值
   * @param path 配置路径（点号分隔）
   * @param value 新值
   */
  public setValue(path: string, value: unknown): void {
    const keys = path.split('.');
    const lastKey = keys.pop();
    if (lastKey === undefined) return;

    let target: Record<string, unknown> = this.config as unknown as Record<string, unknown>;
    for (const key of keys) {
      if (typeof target[key] !== 'object' || target[key] === null) {
        target[key] = {};
      }
      target = target[key] as Record<string, unknown>;
    }

    const oldValue = target[lastKey];
    target[lastKey] = value;

    this.emit('change', {
      path,
      newValue: value,
      oldValue,
      timestamp: Date.now(),
    } satisfies ConfigChangeEvent);

    this.saveDebounced();
  }

  /**
   * 重置为默认配置
   */
  public reset(): void {
    const oldConfig = this.config;
    this.config = createDefaultConfig();
    this.emit('change', {
      path: '*',
      newValue: this.config,
      oldValue: oldConfig,
      timestamp: Date.now(),
    } satisfies ConfigChangeEvent);
    this.save();
  }

  /**
   * 从 Ollama 刷新可用模型列表
   * @returns 刷新结果
   */
  public async refreshModels(): Promise<{ models: string[]; success: boolean; message?: string }> {
    try {
      const client = new OllamaClient(this.config.ollama);
      const models = await client.listModels();

      if (models.length === 0) {
        return {
          models: [],
          success: false,
          message: 'Ollama 中没有可用的模型，请先 pull 模型',
        };
      }

      // 更新配置中的可用模型列表
      this.setValue('model.availableModels', models);

      return {
        models,
        success: true,
        message: `成功获取 ${models.length} 个模型`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        models: [],
        success: false,
        message: `获取模型列表失败: ${message}`,
      };
    }
  }

  /**
   * 检测 Ollama 服务是否在线
   * @returns 是否在线
   */
  public async checkOllama(): Promise<boolean> {
    try {
      const client = new OllamaClient(this.config.ollama);
      const online = await client.healthCheck();
      this.setValue('ollama.isOnline', online);
      return online;
    } catch {
      this.setValue('ollama.isOnline', false);
      return false;
    }
  }

  /**
   * 尝试启动 Ollama 服务
   * 仅在 Windows 系统尝试 `ollama serve`；在其他平台返回 false
   * @returns 是否成功启动
   */
  public async startOllama(): Promise<boolean> {
    // 先检测是否已经在线
    const online = await this.checkOllama();
    if (online) return true;

    try {
      const command = process.platform === 'win32' ? 'ollama serve' : 'ollama serve > /dev/null 2>&1 &';
      execSync(command, {
        timeout: 3000,
      });

      // 等待 1.5 秒后重新检测
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return await this.checkOllama();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[Config] Failed to start Ollama:', message);
      return false;
    }
  }

  /**
   * 在应用启动时根据配置自动尝试启动 Ollama
   */
  public async autoStartOllamaIfConfigured(): Promise<void> {
    if (!this.config.ollama.autoStart) return;
    const online = await this.checkOllama();
    if (!online) {
      console.log('[Config] autoStart enabled, attempting to start Ollama...');
      const started = await this.startOllama();
      console.log('[Config] Ollama auto-start result:', started ? 'success' : 'failed');
    }
  }
}