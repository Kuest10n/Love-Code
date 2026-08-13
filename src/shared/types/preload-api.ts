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
}