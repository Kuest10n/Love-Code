import type { EmotionType } from './emotion.js';

/**
 * 聊天消息角色枚举
 */
export const ChatRole = {
  /** 用户消息 */
  User: 'user',
  /** 助手消息 */
  Assistant: 'assistant',
  /** 系统提示 */
  System: 'system',
  /** 工具消息 */
  Tool: 'tool',
} as const;

/** 聊天消息角色类型 */
export type ChatRole = (typeof ChatRole)[keyof typeof ChatRole];

/**
 * 聊天消息接口
 * 表示一条完整的对话消息
 */
export interface AgentChatMessage {
  /** 消息唯一标识 */
  id: string;
  /** 消息角色 */
  role: ChatRole;
  /** 消息内容文本 */
  content: string;
  /** 消息时间戳（毫秒） */
  timestamp: number;
  /** 发送方使用的模型名称 */
  model?: string;
  /** 关联的情感类型 */
  emotion?: EmotionType;
  /** 工具调用信息 */
  toolCalls?: ToolCallInfo[];
}

/**
 * 工具调用信息接口
 */
export interface ToolCallInfo {
  /** 工具调用 ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具参数 */
  arguments: Record<string, unknown>;
  /** 工具执行结果 */
  result?: string;
  /** 执行状态 */
  status: 'pending' | 'running' | 'success' | 'error';
}

/**
 * 模型增量输出载荷
 * 用于流式生成场景下逐段传递模型输出
 */
export interface ModelDeltaPayload {
  /** 会话唯一标识 */
  sessionId: string;
  /** 本次增量的文本内容 */
  content: string;
  /** 是否已生成完成 */
  isDone: boolean;
  /** 生成使用的模型名称 */
  model: string;
  /** 完成原因 */
  doneReason?: 'stop' | 'length' | 'tool_calls' | 'error';
}

/**
 * 工具调用载荷
 * 用于触发或响应一个工具调用
 */
export interface ToolCallPayload {
  /** 工具调用唯一标识 */
  callId: string;
  /** 工具名称 */
  toolName: string;
  /** 工具参数（结构化） */
  args: Record<string, unknown>;
  /** 工具执行结果 */
  result?: string;
  /** 执行状态 */
  status: 'pending' | 'running' | 'success' | 'error';
  /** 错误信息 */
  errorMessage?: string;
}

/**
 * 状态变更载荷
 * 用于广播应用内部的状态变化
 */
export interface StateChangePayload {
  /** 状态命名空间（如 'app' | 'agent' | 'model' | 'tts' | 'emotion' | 'context' | 'system'） */
  namespace: 'app' | 'agent' | 'model' | 'tts' | 'emotion' | 'context' | 'system';
  /** 状态键名 */
  key: string;
  /** 状态值 */
  value: unknown;
  /** 变更时间戳 */
  timestamp: number;
}

/**
 * Live2D 动作载荷
 * 用于向虚拟形象发送动画或情感指令
 */
export interface Live2DActionPayload {
  /** 动作名称（对应 Live2D 模型的动作组） */
  actionGroup?: string;
  /** 动作索引 */
  actionIndex?: number;
  /** 情感类型 */
  emotion?: EmotionType;
  /** 情感强度（0.0 ~ 1.0） */
  intensity?: number;
  /** 随机动作概率（0.0 ~ 1.0） */
  probability?: number;
}

/**
 * TTS 音频块载荷
 * 用于流式语音合成场景下传递音频数据
 */
export interface TtsChunkPayload {
  /** 合成任务唯一标识 */
  taskId: string;
  /** 本块对应的文本片段 */
  text: string;
  /** 音频二进制数据（base64 编码） */
  audioData: string;
  /** 音频格式 */
  format: 'mp3' | 'wav' | 'ogg';
  /** 采样率（Hz） */
  sampleRate: number;
  /** 是否已为最后一块 */
  isLast: boolean;
  /** 序号（从 0 开始） */
  sequence: number;
}

/**
 * IPC 消息载荷联合类型
 * 所有通道通信载荷的汇总
 */
export type IpcPayload =
  | AgentChatMessage
  | ModelDeltaPayload
  | ToolCallPayload
  | StateChangePayload
  | Live2DActionPayload
  | TtsChunkPayload;