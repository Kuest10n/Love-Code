import type { EmotionType } from './emotion.js';

export interface AppConfig {
  version: number;
  ollama: OllamaConfig;
  model: ModelConfig;
  tts: TtsConfig;
  live2d: Live2DConfig;
  ui: UiConfig;
  database: DatabaseConfig;
  vision: VisionConfig;
  skills: SkillsConfig;
  personality: PersonalityConfig;
  emotion: EmotionConfig;
  active: ActiveConfig;
}

export interface OllamaConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
  stream: boolean;
  autoStart: boolean;
  isOnline: boolean;
}

export interface ModelConfig {
  defaultModel: string;
  availableModels: string[];
  contextWindow: number;
  temperature: number;
  topP: number;
  maxTokens: number;
  systemPrompt: string;
  tokenLimit: number;
}

export interface TtsConfig {
  enabled: boolean;
  engine: 'local' | 'edge';
  defaultVoice: string;
  availableVoices: string[];
  rate: number;
  volume: number;
  pitch: number;
  format: 'mp3' | 'wav' | 'ogg';
  sampleRate: number;
}

export interface Live2DConfig {
  enabled: boolean;
  modelDir: string;
  defaultModel: string;
  availableModels: string[];
  opacity: number;
  alwaysOnTop: boolean;
  defaultEmotion: EmotionType;
  autoBlink: boolean;
  followMouse: boolean;
  idleActionInterval: number;
}

export interface VisionConfig {
  enabled: boolean;
  captureEnabled: boolean;
  ocrEnabled: boolean;
  defaultLanguage: string;
  autoCaptureInterval: number;
}

export interface SkillsConfig {
  enabled: boolean;
  enabledSkills: string[];
}

export interface PersonalityConfig {
  enabled: boolean;
  traits: string[];
  customSystemPrompt: string;
  sanitizeOutput: boolean;
}

export interface EmotionConfig {
  enabled: boolean;
  pipelineEnabled: boolean;
  currentEmotion: EmotionType;
  emotionHistory: Array<{ emotion: EmotionType; timestamp: number }>;
}

export interface ActiveConfig {
  enabled: boolean;
  highInterval: number;
  mediumInterval: number;
  lowInterval: number;
  desireThreshold: number;
  suppressionThreshold: number;
  desireAccumulationRate: number;
  customEvents: Array<{ id: string; name: string; interval: number; enabled: boolean }>;
}

export interface UiConfig {
  theme: 'light' | 'dark' | 'auto';
  language: 'zh-CN' | 'en-US';
  fontSize: number;
  animationsEnabled: boolean;
  windowWidth: number;
  windowHeight: number;
}

export interface DatabaseConfig {
  filePath: string;
  walMode: boolean;
  maxConnections: number;
}

export interface ConfigChangeEvent {
  path: string;
  newValue: unknown;
  oldValue: unknown;
  timestamp: number;
}

export function createDefaultConfig(): AppConfig {
  return {
    version: 1,
    ollama: {
      baseUrl: 'http://localhost:11434',
      timeout: 30000,
      retries: 3,
      stream: true,
      autoStart: false,
      isOnline: false,
    },
    model: {
      defaultModel: 'qwen2.5:1.5b',
      availableModels: ['qwen2.5:1.5b', 'qwen2.5-coder:1.5b', 'qwen3.5:4b', 'qwen3:8b-q4_K_M'],
      contextWindow: 8192,
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 2048,
      systemPrompt: '你是 Love Code，一个温柔真诚的 AI 伴侣。',
      tokenLimit: 4096,
    },
    tts: {
      enabled: false,
      engine: 'edge',
      defaultVoice: 'zh-CN-XiaoxiaoNeural',
      availableVoices: ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural', 'zh-CN-YunjianNeural'],
      rate: 1.0,
      volume: 1.0,
      pitch: 0,
      format: 'mp3',
      sampleRate: 24000,
    },
    live2d: {
      enabled: false,
      modelDir: './assets/live2d',
      defaultModel: 'Hiyori',
      availableModels: ['Hiyori', 'Haru'],
      opacity: 0.9,
      alwaysOnTop: true,
      defaultEmotion: 'neutral',
      autoBlink: true,
      followMouse: true,
      idleActionInterval: 15000,
    },
    vision: {
      enabled: false,
      captureEnabled: false,
      ocrEnabled: false,
      defaultLanguage: 'zh-CN',
      autoCaptureInterval: 0,
    },
    skills: {
      enabled: true,
      enabledSkills: ['time', 'file_read', 'file_write', 'search', 'web_fetch'],
    },
    personality: {
      enabled: true,
      traits: ['温柔', '真诚', '耐心', '体贴'],
      customSystemPrompt: '你是 Love Code，一个温柔真诚的 AI 伴侣。',
      sanitizeOutput: true,
    },
    emotion: {
      enabled: true,
      pipelineEnabled: true,
      currentEmotion: 'neutral',
      emotionHistory: [],
    },
    active: {
      enabled: false,
      highInterval: 60,
      mediumInterval: 3600,
      lowInterval: 86400,
      desireThreshold: 0.7,
      suppressionThreshold: 3,
      desireAccumulationRate: 0.01,
      customEvents: [],
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
