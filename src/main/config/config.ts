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
  }),
  model: z.object({
    defaultModel: z.string().min(1),
    availableModels: z.array(z.string().min(1)),
    contextWindow: z.number().int().positive(),
    temperature: z.number().min(0).max(2),
    topP: z.number().min(0).max(1),
    maxTokens: z.number().int().positive(),
    systemPrompt: z.string(),
  }),
  tts: z.object({
    enabled: z.boolean(),
    defaultVoice: z.string().min(1),
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
    opacity: z.number().min(0).max(1),
    alwaysOnTop: z.boolean(),
    defaultEmotion: z.string(),
    autoBlink: z.boolean(),
    followMouse: z.boolean(),
    idleActionInterval: z.number().int().positive(),
  }),
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
}