/**
 * Preload 脚本
 * 通过 contextBridge 向渲染进程暴露经过类型化的 IPC API
 * 严格遵循 Electron 安全最佳实践：contextIsolation + nodeIntegration 禁用
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  AGENT_CHANNELS,
  AGENT_TOOL_CALL_CHANNELS,
  MODEL_DELTA_CHANNELS,
  STATE_CHANGE_CHANNELS,
  LIVE2D_ACTION_CHANNELS,
  TTS_CHUNK_CHANNELS,
  CONVERSATION_CHANNELS,
  CONFIG_CHANNELS,
  CONTEXT_CHANNELS,
  MEMORY_CHANNELS,
} from '@shared/ipc-channels.js';
import type {
  AgentChatMessage,
  ModelDeltaPayload,
  ToolCallPayload,
  StateChangePayload,
  Live2DActionPayload,
  TtsChunkPayload,
} from '@shared/types/ipc.js';
import type {
  Conversation,
  MessageRecord,
  UpdateConversationInput,
  AddMessageInput,
} from '@shared/types/database.js';
import type { AppConfig } from '@shared/types/config.js';
import type { PreloadApi, Unsubscribe } from '@shared/types/preload-api.js';

/**
 * 创建一个类型安全的 IPC 事件监听器
 * @param channel 通道名称
 * @param callback 回调函数
 * @returns 取消订阅函数
 */
function createListener<T>(
  channel: string,
  callback: (payload: T) => void,
): Unsubscribe {
  const handler = (_event: IpcRendererEvent, payload: T): void => {
    callback(payload);
  };
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

/**
 * 构建 Preload API 实现
 * @returns 完整的 PreloadApi 实现对象
 */
function buildApi(): PreloadApi {
  return {
    agent: {
      sendMessage: (message: AgentChatMessage): Promise<AgentChatMessage> =>
        ipcRenderer.invoke(AGENT_CHANNELS.SEND, message),
      onStream: (callback: (payload: ModelDeltaPayload) => void): Unsubscribe =>
        createListener<ModelDeltaPayload>(AGENT_CHANNELS.ON_STREAM, callback),
      interrupt: (): void =>
        ipcRenderer.send(AGENT_CHANNELS.INTERRUPT),
    },
    agentTool: {
      invoke: (payload: ToolCallPayload): Promise<ToolCallPayload> =>
        ipcRenderer.invoke(AGENT_TOOL_CALL_CHANNELS.INVOKE, payload),
      onProgress: (callback: (payload: ToolCallPayload) => void): Unsubscribe =>
        createListener<ToolCallPayload>(AGENT_TOOL_CALL_CHANNELS.ON_PROGRESS, callback),
    },
    model: {
      onDelta: (callback: (payload: ModelDeltaPayload) => void): Unsubscribe =>
        createListener<ModelDeltaPayload>(MODEL_DELTA_CHANNELS.ON_DELTA, callback),
      onDone: (callback: (payload: ModelDeltaPayload) => void): Unsubscribe =>
        createListener<ModelDeltaPayload>(MODEL_DELTA_CHANNELS.ON_DONE, callback),
    },
    state: {
      onChange: (callback: (payload: StateChangePayload) => void): Unsubscribe =>
        createListener<StateChangePayload>(STATE_CHANGE_CHANNELS.ON_STATE, callback),
      query: (): Promise<StateChangePayload[]> =>
        ipcRenderer.invoke(STATE_CHANGE_CHANNELS.QUERY),
    },
    live2d: {
      sendAction: (payload: Live2DActionPayload): void =>
        ipcRenderer.send(LIVE2D_ACTION_CHANNELS.SEND_ACTION, payload),
      sendEmotion: (payload: Live2DActionPayload): void =>
        ipcRenderer.send(LIVE2D_ACTION_CHANNELS.SEND_EMOTION, payload),
    },
    tts: {
      synthesize: (text: string): Promise<TtsChunkPayload> =>
        ipcRenderer.invoke(TTS_CHUNK_CHANNELS.SYNTHESIZE, text),
      onChunk: (callback: (payload: TtsChunkPayload) => void): Unsubscribe =>
        createListener<TtsChunkPayload>(TTS_CHUNK_CHANNELS.ON_CHUNK, callback),
      onDone: (callback: (payload: TtsChunkPayload) => void): Unsubscribe =>
        createListener<TtsChunkPayload>(TTS_CHUNK_CHANNELS.ON_DONE, callback),
    },
    conversation: {
      create: (title?: string): Promise<Conversation> =>
        ipcRenderer.invoke(CONVERSATION_CHANNELS.CREATE, { title }),
      list: (limit?: number, offset?: number): Promise<Conversation[]> =>
        ipcRenderer.invoke(CONVERSATION_CHANNELS.LIST, { limit, offset }),
      get: (id: string): Promise<Conversation | null> =>
        ipcRenderer.invoke(CONVERSATION_CHANNELS.GET, id),
      update: (id: string, updates: UpdateConversationInput): Promise<void> =>
        ipcRenderer.invoke(CONVERSATION_CHANNELS.UPDATE, { id, updates }),
      remove: (id: string): Promise<void> =>
        ipcRenderer.invoke(CONVERSATION_CHANNELS.DELETE, id),
      listMessages: (conversationId: string, limit?: number, offset?: number): Promise<MessageRecord[]> =>
        ipcRenderer.invoke(CONVERSATION_CHANNELS.LIST_MESSAGES, { conversationId, limit, offset }),
      addMessage: (input: AddMessageInput): Promise<MessageRecord> =>
        ipcRenderer.invoke(CONVERSATION_CHANNELS.ADD_MESSAGE, input),
    },
    config: {
      get: (): Promise<AppConfig> =>
        ipcRenderer.invoke(CONFIG_CHANNELS.GET),
      update: (path: string, value: unknown): Promise<void> =>
        ipcRenderer.invoke(CONFIG_CHANNELS.UPDATE, { path, value }),
      onChange: (callback: (event: { path: string; value: unknown }) => void): Unsubscribe =>
        createListener<{ path: string; value: unknown }>(CONFIG_CHANNELS.ON_CHANGE, callback),
      refreshModels: (): Promise<{ models: string[]; success: boolean; message?: string }> =>
        ipcRenderer.invoke(CONFIG_CHANNELS.REFRESH_MODELS),
      checkOllama: (): Promise<boolean> =>
        ipcRenderer.invoke(CONFIG_CHANNELS.CHECK_OLLAMA),
      startOllama: (): Promise<boolean> =>
        ipcRenderer.invoke(CONFIG_CHANNELS.START_OLLAMA),
    },
    context: {
      compress: (): Promise<{ success: boolean; savedTokens: number; message?: string }> =>
        ipcRenderer.invoke(CONTEXT_CHANNELS.COMPRESS),
      truncate: (): Promise<{ success: boolean; savedTokens: number; message?: string }> =>
        ipcRenderer.invoke(CONTEXT_CHANNELS.TRUNCATE),
      stats: (): Promise<{ totalTokens: number; hardLimit: number; level: 'normal' | 'soft-limit' | 'hard-limit'; messageCount: number }> =>
        ipcRenderer.invoke(CONTEXT_CHANNELS.STATS),
    },
    memory: {
      search: (query: string, limit?: number) =>
        ipcRenderer.invoke(MEMORY_CHANNELS.SEARCH, { query, limit }),
      add: (content: string, type?: string, metadata?: Record<string, unknown>, importance?: number) =>
        ipcRenderer.invoke(MEMORY_CHANNELS.ADD, { content, type, metadata, importance }),
      list: (limit?: number, type?: string) =>
        ipcRenderer.invoke(MEMORY_CHANNELS.LIST, { limit, type }),
      remove: (id: string) =>
        ipcRenderer.invoke(MEMORY_CHANNELS.DELETE, id),
      forget: () =>
        ipcRenderer.invoke(MEMORY_CHANNELS.FORGET),
    },
  };
}

/**
 * 通过 contextBridge 暴露 API 到渲染进程的 window.apis
 */
contextBridge.exposeInMainWorld('apis', buildApi());