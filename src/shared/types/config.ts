/**
 * 应用配置类型定义
 * 涵盖应用运行所需的全部可配置项
 */

import type { EmotionType } from './emotion.js';

/**
 * 应用根配置接口
 */
export interface AppConfig {
  /** 配置版本号（用于迁移） */
  version: number;
  /** Ollama 模型配置 */
  ollama: OllamaConfig;
  /** 模型参数配置 */
  model: ModelConfig;
  /** 语音合成配置 */
  tts: TtsConfig;
  /** Live2D 虚拟形象配置 */
  live2d: Live2DConfig;
  /** 界面偏好配置 */
  ui: UiConfig;
  /** 数据库配置 */
  database: DatabaseConfig;
}

/**
 * Ollama 服务连接配置
 */
export interface OllamaConfig {
  /** Ollama 服务地址 */
  baseUrl: string;
  /** 连接超时（毫秒） */
  timeout: number;
  /** 请求重试次数 */
  retries: number;
  /** 是否启用流式输出 */
  stream: boolean;
}

/**
 * 模型参数配置
 */
export interface ModelConfig {
  /** 默认模型名称 */
  defaultModel: string;
  /** 可用模型列表 */
  availableModels: string[];
  /** 上下文窗口大小 */
  contextWindow: number;
  /** 生成温度（0.0 ~ 2.0） */
  temperature: number;
  /** Top-P 采样（0.0 ~ 1.0） */
  topP: number;
  /** 最大生成 token 数 */
  maxTokens: number;
  /** 系统提示词 */
  systemPrompt: string;
}

/**
 * 语音合成配置
 */
export interface TtsConfig {
  /** 是否启用 TTS */
  enabled: boolean;
  /** 默认说话人 */
  defaultVoice: string;
  /** 语速倍率（0.5 ~ 2.0） */
  rate: number;
  /** 音量倍率（0.0 ~ 1.0） */
  volume: number;
  /** 音调调整（-10 ~ 10） */
  pitch: number;
  /** 音频输出格式 */
  format: 'mp3' | 'wav' | 'ogg';
  /** 采样率 */
  sampleRate: number;
}

/**
 * Live2D 虚拟形象配置
 */
export interface Live2DConfig {
  /** 是否启用 Live2D */
  enabled: boolean;
  /** 模型资源根目录 */
  modelDir: string;
  /** 默认模型名称 */
  defaultModel: string;
  /** 背景透明度（0.0 ~ 1.0） */
  opacity: number;
  /** 是否置顶 */
  alwaysOnTop: boolean;
  /** 默认情感 */
  defaultEmotion: EmotionType;
  /** 自动眨眼 */
  autoBlink: boolean;
  /** 跟随鼠标 */
  followMouse: boolean;
  /**  idle 动作间隔（毫秒） */
  idleActionInterval: number;
}

/**
 * 界面偏好配置
 */
export interface UiConfig {
  /** 主题模式 */
  theme: 'light' | 'dark' | 'auto';
  /** 语言 */
  language: 'zh-CN' | 'en-US';
  /** 字体大小（像素） */
  fontSize: number;
  /** 动画效果开关 */
  animationsEnabled: boolean;
  /** 主窗口宽度 */
  windowWidth: number;
  /** 主窗口高度 */
  windowHeight: number;
}

/**
 * 数据库配置
 */
export interface DatabaseConfig {
  /** 数据库文件路径 */
  filePath: string;
  /** 是否启用 WAL 模式 */
  walMode: boolean;
  /** 最大连接数 */
  maxConnections: number;
}

/**
 * 配置变更事件载荷
 */
export interface ConfigChangeEvent {
  /** 变更的配置路径（点号分隔） */
  path: string;
  /** 新值 */
  newValue: unknown;
  /** 旧值 */
  oldValue: unknown;
  /** 变更时间戳 */
  timestamp: number;
}

/**
 * 默认配置工厂函数
 * @returns 完整的默认 AppConfig
 */
export function createDefaultConfig(): AppConfig {
  return {
    version: 1,
    ollama: {
      baseUrl: 'http://localhost:11434',
      timeout: 30000,
      retries: 3,
      stream: true,
    },
    model: {
      defaultModel: 'qwen2.5:7b',
      availableModels: ['qwen2.5:7b', 'qwen2.5:14b', 'llama3.1:8b'],
      contextWindow: 8192,
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 2048,
      systemPrompt: '你是一个友好的 AI 助手。',
    },
    tts: {
      enabled: true,
      defaultVoice: 'zh-CN-XiaoxiaoNeural',
      rate: 1.0,
      volume: 1.0,
      pitch: 0,
      format: 'mp3',
      sampleRate: 24000,
    },
    live2d: {
      enabled: true,
      modelDir: './assets/live2d',
      defaultModel: 'Haru',
      opacity: 0.9,
      alwaysOnTop: true,
      defaultEmotion: 'neutral',
      autoBlink: true,
      followMouse: true,
      idleActionInterval: 15000,
    },
    ui: {
      theme: 'dark',
      language: 'zh-CN',
      fontSize: 14,
      animationsEnabled: true,
      windowWidth: 1200,
      windowHeight: 800,
    },
    database: {
      filePath: './data/app.db',
      walMode: true,
      maxConnections: 4,
    },
  };
}