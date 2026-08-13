/**
 * Preload API 类型定义
 * 定义 preload 脚本通过 contextBridge 暴露给渲染进程的 API 契约
 */

import type {
  AgentChatMessage,
  ModelDeltaPayload,
  ToolCallPayload,
  StateChangePayload,
  Live2DActionPayload,
  TtsChunkPayload,
} from './ipc.js';
import type {
  Conversation,
  MessageRecord,
  UpdateConversationInput,
  AddMessageInput,
} from './database.js';
import type { AppConfig } from './config.js';

/**
 * 上下文水位级别
 */
export type ContextLevel = 'normal' | 'soft-limit' | 'hard-limit';

/**
 * 取消订阅函数类型
 * 用于停止监听 IPC 事件
 */
export type Unsubscribe = () => void;

/**
 * Preload 暴露的 API 接口
 * 渲染进程可通过 window.apis 访问
 */
export interface PreloadApi {
  /** 智能体聊天相关 API */
  agent: {
    /** 发送聊天消息（双向 invoke） */
    sendMessage: (message: AgentChatMessage) => Promise<AgentChatMessage>;
    /** 监听聊天流数据（单向 on） */
    onStream: (callback: (payload: ModelDeltaPayload) => void) => Unsubscribe;
    /** 中断当前生成（单向 send） */
    interrupt: () => void;
  };
  /** 智能体工具调用相关 API */
  agentTool: {
    /** 触发工具调用（双向 invoke） */
    invoke: (payload: ToolCallPayload) => Promise<ToolCallPayload>;
    /** 监听工具调用进度（单向 on） */
    onProgress: (callback: (payload: ToolCallPayload) => void) => Unsubscribe;
  };
  /** 模型增量输出相关 API */
  model: {
    /** 监听模型增量数据（单向 on） */
    onDelta: (callback: (payload: ModelDeltaPayload) => void) => Unsubscribe;
    /** 监听生成完成事件（单向 on） */
    onDone: (callback: (payload: ModelDeltaPayload) => void) => Unsubscribe;
  };
  /** 状态变更相关 API */
  state: {
    /** 监听状态变更事件（单向 on） */
    onChange: (callback: (payload: StateChangePayload) => void) => Unsubscribe;
    /** 查询当前状态（双向 invoke） */
    query: () => Promise<StateChangePayload[]>;
  };
  /** Live2D 动作相关 API */
  live2d: {
    /** 发送 Live2D 动作指令（单向 send） */
    sendAction: (payload: Live2DActionPayload) => void;
    /** 发送 Live2D 情感指令（单向 send） */
    sendEmotion: (payload: Live2DActionPayload) => void;
  };
  /** TTS 语音合成相关 API */
  tts: {
    /** 发起语音合成（双向 invoke） */
    synthesize: (text: string) => Promise<TtsChunkPayload>;
    /** 监听 TTS 音频块（单向 on） */
    onChunk: (callback: (payload: TtsChunkPayload) => void) => Unsubscribe;
    /** 监听 TTS 合成完成（单向 on） */
    onDone: (callback: (payload: TtsChunkPayload) => void) => Unsubscribe;
  };
  /** 会话管理相关 API */
  conversation: {
    /** 创建新会话 */
    create: (title?: string) => Promise<Conversation>;
    /** 获取会话列表 */
    list: (limit?: number, offset?: number) => Promise<Conversation[]>;
    /** 获取单个会话详情 */
    get: (id: string) => Promise<Conversation | null>;
    /** 更新会话 */
    update: (id: string, updates: UpdateConversationInput) => Promise<void>;
    /** 删除会话 */
    remove: (id: string) => Promise<void>;
    /** 获取会话消息列表 */
    listMessages: (conversationId: string, limit?: number, offset?: number) => Promise<MessageRecord[]>;
    /** 添加消息到会话 */
    addMessage: (input: AddMessageInput) => Promise<MessageRecord>;
  };
  /** 配置管理相关 API */
  config: {
    /** 获取当前完整配置 */
    get: () => Promise<AppConfig>;
    /** 更新指定配置项（点号分隔路径，如 'model.defaultModel'） */
    update: (path: string, value: unknown) => Promise<void>;
    /** 监听配置变更事件 */
    onChange: (callback: (event: { path: string; value: unknown }) => void) => Unsubscribe;
    /** 从 Ollama 刷新可用模型列表 */
    refreshModels: () => Promise<{ models: string[]; success: boolean; message?: string }>;
    /** 检测 Ollama 服务状态 */
    checkOllama: () => Promise<boolean>;
    /** 尝试启动 Ollama 服务 */
    startOllama: () => Promise<boolean>;
  };
  /** 上下文管理相关 API */
  context: {
    /** 触发软水位压缩 */
    compress: () => Promise<{ success: boolean; savedTokens: number; message?: string }>;
    /** 强制截断上下文 */
    truncate: () => Promise<{ success: boolean; savedTokens: number; message?: string }>;
    /** 获取上下文使用统计 */
    stats: () => Promise<{ totalTokens: number; hardLimit: number; level: ContextLevel; messageCount: number }>;
  };
  /** 记忆系统相关 API */
  memory: {
    /** 搜索记忆 */
    search: (query: string, limit?: number) => Promise<MemorySearchResult[]>;
    /** 添加记忆 */
    add: (content: string, type?: string, metadata?: Record<string, unknown>, importance?: number) => Promise<MemoryAddResult>;
    /** 获取所有记忆 */
    list: (limit?: number, type?: string) => Promise<MemoryEntrySummary[]>;
    /** 删除记忆 */
    remove: (id: string) => Promise<{ success: boolean }>;
    /** 运行遗忘曲线清理 */
    forget: () => Promise<{ success: boolean; forgottenCount: number; message?: string }>;
  };
}

/** 记忆搜索结果 */
export interface MemorySearchResult {
  id: string;
  type: string;
  content: string;
  score: number;
  importance: number;
  createdAt: number;
  lastAccessedAt: number;
}

/** 记忆添加结果 */
export interface MemoryAddResult {
  id: string;
  type: string;
  content: string;
  createdAt: number;
}

/** 记忆条目摘要 */
export interface MemoryEntrySummary {
  id: string;
  type: string;
  content: string;
  importance: number;
  accessCount: number;
  createdAt: number;
  lastAccessedAt: number;
}