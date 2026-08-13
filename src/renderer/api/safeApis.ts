/**
 * 安全的 IPC API 访问层
 * 当在浏览器环境（非 Electron）运行时提供 mock 实现
 * 确保 UI 组件能在无 Preload 脚本的情况下正常渲染
 */

import type { PreloadApi, Unsubscribe } from '@shared/types/preload-api.js';
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
import type { ContextLevel } from '@shared/types/preload-api.js';

/** 运行模式：Electron 真实模式 或 浏览器预览模式 */
export type RuntimeMode = 'electron' | 'preview';

/**
 * 获取当前运行模式
 * 通过检测 window.apis 是否存在来判断
 */
export function getRuntimeMode(): RuntimeMode {
  if (isElectron()) {
    return 'electron';
  }
  return 'preview';
}

/**
 * 检查当前是否运行在 Electron 环境中
 * 检测方式：window.apis 由 preload 脚本通过 contextBridge 注入
 */
function isElectron(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.apis !== undefined) return true;
  if (typeof window.process !== 'undefined' && window.process?.versions?.electron) return true;
  return false;
}

/**
 * 创建空的取消订阅函数
 */
function noopUnsubscribe(): void {
  // 空操作
}

/**
 * Mock 实现：模拟延迟
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mock 实现：模拟流式响应
 */
async function mockSendMessage(message: AgentChatMessage): Promise<AgentChatMessage> {
  await delay(500);
  return {
    id: message.id,
    role: 'assistant',
    content: `[预览模式] 收到消息：${message.content}。请在 Electron 应用中运行以调用真实模型。`,
    timestamp: Date.now(),
    model: 'preview',
  };
}

/**
 * Mock 实现：onDelta 立即返回空取消函数
 */
function mockOnDelta(_callback: (payload: ModelDeltaPayload) => void): Unsubscribe {
  return noopUnsubscribe;
}

/**
 * Mock 实现：onDone 立即返回空取消函数
 */
function mockOnDone(_callback: (payload: ModelDeltaPayload) => void): Unsubscribe {
  return noopUnsubscribe;
}

/**
 * Mock 实现：onChange 立即返回空取消函数
 */
function mockOnChange(_callback: (payload: StateChangePayload) => void): Unsubscribe {
  return noopUnsubscribe;
}

/**
 * Mock 实现：query 返回空状态列表
 */
async function mockQuery(): Promise<StateChangePayload[]> {
  return [];
}

/**
 * Mock 实现：onStream 立即返回空取消函数
 */
function mockOnStream(_callback: (payload: ModelDeltaPayload) => void): Unsubscribe {
  return noopUnsubscribe;
}

/**
 * Mock 实现：onProgress 立即返回空取消函数
 */
function mockOnProgress(_callback: (payload: ToolCallPayload) => void): Unsubscribe {
  return noopUnsubscribe;
}

/**
 * Mock 实现：invoke 立即返回空结果
 */
async function mockInvoke(payload: ToolCallPayload): Promise<ToolCallPayload> {
  return {
    ...payload,
    status: 'success',
    result: 'mock: 工具调用已完成',
  };
}

/**
 * Mock 实现：synthesize 返回空音频
 */
async function mockSynthesize(text: string): Promise<TtsChunkPayload> {
  return {
    taskId: `mock-${Date.now()}`,
    text,
    audioData: '',
    format: 'mp3',
    sampleRate: 44100,
    isLast: true,
    sequence: 0,
  };
}

/**
 * Mock 实现：onChunk 立即返回空取消函数
 */
function mockOnChunk(_callback: (payload: TtsChunkPayload) => void): Unsubscribe {
  return noopUnsubscribe;
}

/**
 * Mock 实现：onDone (tts) 立即返回空取消函数
 */
function mockTtsOnDone(_callback: (payload: TtsChunkPayload) => void): Unsubscribe {
  return noopUnsubscribe;
}

/**
 * Mock 实现：sendAction 空操作
 */
function mockSendAction(_payload: Live2DActionPayload): void {
  // 空操作
}

/**
 * Mock 实现：sendEmotion 空操作
 */
function mockSendEmotion(_payload: Live2DActionPayload): void {
  // 空操作
}

// ========== Conversation Mock Implementations ==========

let mockConversations: Conversation[] = [];
let mockMessages: Map<string, MessageRecord[]> = new Map();
let mockConfig: AppConfig | null = null;
let mockContextStatsData = {
  totalTokens: 0,
  hardLimit: 4096,
  level: 'normal' as ContextLevel,
  messageCount: 0,
};
let mockMemoryEntries: Array<{ id: string; type: string; content: string; importance: number; accessCount: number; createdAt: number; lastAccessedAt: number }> = [];

async function mockConfigGet(): Promise<AppConfig> {
  if (!mockConfig) {
    const { createDefaultConfig } = await import('@shared/types/config.js');
    mockConfig = createDefaultConfig();
  }
  return mockConfig;
}

async function mockConfigUpdate(path: string, value: unknown): Promise<void> {
  if (!mockConfig) {
    await mockConfigGet();
  }
  if (mockConfig) {
    const keys = path.split('.');
    let obj: any = mockConfig;
    for (let i = 0; i < keys.length - 1; i++) {
      if (obj[keys[i]] === undefined) {
        obj[keys[i]] = {};
      }
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    console.log(`[Mock] Config updated: ${path} =`, value);
  }
}

function mockConfigOnChange(_callback: (event: { path: string; value: unknown }) => void): Unsubscribe {
  return noopUnsubscribe;
}

async function mockConfigRefreshModels(): Promise<{ models: string[]; success: boolean; message?: string }> {
  if (!mockConfig) {
    await mockConfigGet();
  }
  const models = mockConfig?.model.availableModels ?? [];
  return {
    models,
    success: true,
    message: `预览模式：使用 ${models.length} 个预设模型`,
  };
}

async function mockConfigCheckOllama(): Promise<boolean> {
  await delay(300);
  return false;
}

async function mockConfigStartOllama(): Promise<boolean> {
  await delay(500);
  return false;
}

async function mockContextCompress(): Promise<{ success: boolean; savedTokens: number; message?: string }> {
  return { success: true, savedTokens: 0, message: '预览模式：上下文压缩未启用' };
}

async function mockContextTruncate(): Promise<{ success: boolean; savedTokens: number; message?: string }> {
  return { success: true, savedTokens: 0, message: '预览模式：上下文截断未启用' };
}

async function mockContextStats(): Promise<{ totalTokens: number; hardLimit: number; level: ContextLevel; messageCount: number }> {
  return { ...mockContextStatsData };
}

// ========== Memory Mock Implementations ==========

async function mockMemorySearch(query: string, limit?: number) {
  const results = mockMemoryEntries
    .filter((m) => m.content.toLowerCase().includes(query.toLowerCase()))
    .slice(0, limit ?? 10)
    .map((m) => ({
      id: m.id,
      type: m.type,
      content: m.content,
      score: 0.8,
      importance: m.importance,
      createdAt: m.createdAt,
      lastAccessedAt: m.lastAccessedAt,
    }));
  return results;
}

async function mockMemoryAdd(content: string, type?: string, _metadata?: Record<string, unknown>, importance?: number) {
  const now = Date.now();
  const entry = {
    id: `mock-memory-${now}-${Math.random().toString(36).slice(2, 8)}`,
    type: type ?? 'context',
    content,
    importance: importance ?? 0.5,
    accessCount: 0,
    createdAt: now,
    lastAccessedAt: now,
  };
  mockMemoryEntries.push(entry);
  return {
    id: entry.id,
    type: entry.type,
    content: entry.content,
    createdAt: entry.createdAt,
  };
}

async function mockMemoryList(limit?: number, type?: string) {
  const filtered = type ? mockMemoryEntries.filter((m) => m.type === type) : mockMemoryEntries;
  return filtered.slice(0, limit ?? 50);
}

async function mockMemoryRemove(id: string) {
  mockMemoryEntries = mockMemoryEntries.filter((m) => m.id !== id);
  return { success: true };
}

async function mockMemoryForget() {
  const now = Date.now();
  const before = mockMemoryEntries.length;
  mockMemoryEntries = mockMemoryEntries.filter((m) => {
    const daysSinceAccess = (now - m.lastAccessedAt) / (1000 * 60 * 60 * 24);
    return daysSinceAccess < 30 || m.importance >= 0.7;
  });
  const forgottenCount = before - mockMemoryEntries.length;
  return {
    success: true,
    forgottenCount,
    message: forgottenCount > 0 ? `已清除 ${forgottenCount} 条过期记忆` : '没有需要清除的记忆',
  };
}

function createMockConversation(input: { title?: string }): Conversation {
  const now = Date.now();
  const conv: Conversation = {
    id: `mock-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title ?? '新对话',
    createdAt: now,
    updatedAt: now,
    lastMessage: '',
    isActive: true,
  };
  mockConversations = [conv, ...mockConversations];
  mockMessages.set(conv.id, []);
  return conv;
}

async function mockCreate(title?: string): Promise<Conversation> {
  return createMockConversation({ title });
}

async function mockList(limit: number = 50, offset: number = 0): Promise<Conversation[]> {
  return mockConversations.slice(offset, offset + limit);
}

async function mockGet(id: string): Promise<Conversation | null> {
  return mockConversations.find((c) => c.id === id) ?? null;
}

async function mockUpdate(id: string, updates: UpdateConversationInput): Promise<void> {
  const conv = mockConversations.find((c) => c.id === id);
  if (conv) {
    if (updates.title !== undefined) conv.title = updates.title;
    if (updates.lastMessage !== undefined) conv.lastMessage = updates.lastMessage;
    if (updates.isActive !== undefined) conv.isActive = updates.isActive;
    conv.updatedAt = Date.now();
  }
}

async function mockRemove(id: string): Promise<void> {
  mockConversations = mockConversations.filter((c) => c.id !== id);
  mockMessages.delete(id);
}

async function mockListMessages(conversationId: string, limit: number = 100, offset: number = 0): Promise<MessageRecord[]> {
  const msgs = mockMessages.get(conversationId) ?? [];
  return msgs.slice(offset, offset + limit);
}

async function mockAddMessage(input: AddMessageInput): Promise<MessageRecord> {
  const now = Date.now();
  const msg: MessageRecord = {
    id: input.id ?? `mock-${now}-${Math.random().toString(36).slice(2, 8)}`,
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    tokenCount: input.tokenCount ?? 0,
    emotion: input.emotion,
    createdAt: input.createdAt ?? now,
  };
  const msgs = mockMessages.get(input.conversationId) ?? [];
  msgs.push(msg);
  mockMessages.set(input.conversationId, msgs);

  const conv = mockConversations.find((c) => c.id === input.conversationId);
  if (conv) {
    conv.lastMessage = input.content.slice(0, 100);
    conv.updatedAt = now;
  }

  return msg;
}

/**
 * 构建 Mock API 实现
 */
function buildMockApi(): PreloadApi {
  return {
    agent: {
      sendMessage: mockSendMessage,
      onStream: mockOnStream,
      interrupt: (): void => {
        console.log('[Mock] interrupt called');
      },
    },
    agentTool: {
      invoke: mockInvoke,
      onProgress: mockOnProgress,
    },
    model: {
      onDelta: mockOnDelta,
      onDone: mockOnDone,
    },
    state: {
      onChange: mockOnChange,
      query: mockQuery,
    },
    live2d: {
      sendAction: mockSendAction,
      sendEmotion: mockSendEmotion,
    },
    tts: {
      synthesize: mockSynthesize,
      onChunk: mockOnChunk,
      onDone: mockTtsOnDone,
    },
    conversation: {
      create: mockCreate,
      list: mockList,
      get: mockGet,
      update: mockUpdate,
      remove: mockRemove,
      listMessages: mockListMessages,
      addMessage: mockAddMessage,
    },
    config: {
      get: mockConfigGet,
      update: mockConfigUpdate,
      onChange: mockConfigOnChange,
      refreshModels: mockConfigRefreshModels,
      checkOllama: mockConfigCheckOllama,
      startOllama: mockConfigStartOllama,
    },
    context: {
      compress: mockContextCompress,
      truncate: mockContextTruncate,
      stats: mockContextStats,
    },
    memory: {
      search: mockMemorySearch,
      add: mockMemoryAdd,
      list: mockMemoryList,
      remove: mockMemoryRemove,
      forget: mockMemoryForget,
    },
  };
}

/**
 * 获取安全的 API 实例
 * 如果在 Electron 环境中则使用真实 API，否则使用 Mock 实现
 */
export function getSafeApis(): PreloadApi {
  if (isElectron()) {
    console.log('[safeApis] Using Electron (real) APIs');
    return window.apis;
  }
  console.warn('[safeApis] Using preview (mock) APIs - model will not be called. Run in Electron for real AI.');
  return buildMockApi();
}