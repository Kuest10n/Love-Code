/**
 * Electron 主进程入口
 * 负责创建主窗口、Live2D 窗口以及注册全部 IPC 通信通道
 * 集成 AgentCore、EmotionPipeline、Personality、MemoryManager、Database 等核心模块
 */

import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent, type IpcMainEvent } from 'electron';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ConfigManager } from './config/config.js';
import { AgentCore } from './agent/agent-core.js';
import { ContextManager } from './agent/context-manager.js';
import { ToolRegistry } from './tools/registry.js';
import { MemoryManager } from './memory/memory-manager.js';
import { MemoryPersistence } from './memory/memory-persistence.js';
import { EmotionPipeline, toSharedEmotionType } from './emotion/emotion-pipeline.js';
import { Personality } from './personality/personality.js';
import { DatabaseManager } from './database/db.js';
import type { Conversation, MessageRecord, UpdateConversationInput, AddMessageInput } from './database/db.js';
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
import type { AppConfig } from '@shared/types/config.js';
import type { ContextLevel } from '@shared/types/preload-api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 全局配置管理器实例 */
let configManager: ConfigManager | null = null;
/** 主窗口引用 */
let mainWindow: BrowserWindow | null = null;
/** Live2D 窗口引用 */
let live2dWindow: BrowserWindow | null = null;
/** Agent 核心实例 */
let agent: AgentCore | null = null;
/** 上下文管理器实例 */
let contextMgr: ContextManager | null = null;
/** 工具注册中心实例 */
let toolRegistry: ToolRegistry | null = null;
/** 记忆管理器实例 */
let memoryMgr: MemoryManager | null = null;
/** 记忆持久化实例 */
let memoryPersistence: MemoryPersistence | null = null;
/** 情感管道实例 */
let emotionPipeline: EmotionPipeline | null = null;
/** 人格系统实例 */
let personality: Personality | null = null;
/** 数据库实例 */
let database: DatabaseManager | null = null;

/**
 * 获取预加载脚本路径
 * @returns 预加载脚本的绝对路径
 */
function getPreloadPath(): string {
  const preloadPath = resolve(__dirname, '../../preload/preload/index.js');
  console.log(`[Preload] __dirname = ${__dirname}`);
  console.log(`[Preload] preload path = ${preloadPath}`);
  console.log(`[Preload] file exists = ${existsSync(preloadPath)}`);
  return preloadPath;
}

/**
 * 获取渲染进程入口 URL
 * 开发模式下使用 Vite 服务器地址，生产模式下使用本地文件
 * @returns 渲染进程入口地址
 */
function getRendererUrl(): string {
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:5173';
  }
  // __dirname 为 dist/main/main/，需要回到 dist/renderer/index.html
  return `file://${resolve(__dirname, '../../renderer/index.html')}`;
}

/**
 * 创建主窗口
 * 主窗口为应用的核心交互界面
 * @param config 应用配置
 */
function createMainWindow(config: AppConfig): void {
  const preloadPath = getPreloadPath();
  const rendererUrl = getRendererUrl();
  console.log(`[Window] Creating main window...`);
  console.log(`[Window] Renderer URL: ${rendererUrl}`);
  console.log(`[Window] Preload: ${preloadPath}`);

  mainWindow = new BrowserWindow({
    width: config.ui.windowWidth,
    height: config.ui.windowHeight,
    title: 'Love Code - 本地优先 AI 伴侣',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    backgroundColor: '#1a1a2e',
    show: false,
  });

  mainWindow.loadURL(rendererUrl);

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Window] Main window finished loading');
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`[Window] Failed to load: ${errorCode} ${errorDescription}`);
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levelStr = level === 0 ? 'INFO' : level === 1 ? 'WARN' : 'ERROR';
    console.log(`[Renderer ${levelStr}] ${message} (${sourceId}:${line})`);
  });

  mainWindow.once('ready-to-show', () => {
    console.log('[Window] Main window ready to show');
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    console.log('[Window] Main window closed');
    mainWindow = null;
  });
}

/**
 * 创建 Live2D 窗口
 * Live2D 窗口为透明、无边框、置顶的浮动窗口
 * @param config 应用配置
 */
function createLive2DWindow(config: AppConfig): void {
  if (!config.live2d.enabled) return;

  live2dWindow = new BrowserWindow({
    width: 350,
    height: 500,
    x: 50,
    y: 50,
    frame: false,
    transparent: true,
    alwaysOnTop: config.live2d.alwaysOnTop,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  live2dWindow.setAlwaysOnTop(true, 'floating');

  const live2dHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Live2D</title>
<style>
  html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; height: 100%; }
  #live2d-container { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
</style>
</head>
<body>
<div id="live2d-container"></div>
<script>
  const { ipcRenderer } = require('electron');
  // Live2D 模型加载逻辑将在 renderer 层实现
</script>
</body>
</html>`;

  live2dWindow.loadURL(
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:5173/#live2d'
      : `data:text/html;charset=utf-8,${encodeURIComponent(live2dHtml)}`,
  );

  live2dWindow.on('closed', () => {
    live2dWindow = null;
  });
}

/**
 * 向指定窗口发送消息
 * @param window 目标窗口
 * @param channel 通道名称
 * @param payload 消息载荷
 */
function sendToWindow(
  window: BrowserWindow | null,
  channel: string,
  payload: unknown,
): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, payload);
  }
}

/**
 * 向所有窗口广播消息
 * @param channel 通道名称
 * @param payload 消息载荷
 */
function broadcastToAll(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
  if (live2dWindow && !live2dWindow.isDestroyed()) {
    live2dWindow.webContents.send(channel, payload);
  }
}

/**
 * 注册 6 通道 IPC 通信处理器
 * 涵盖智能体聊天、工具调用、模型增量输出、状态变更、Live2D 动作与 TTS 合成
 */
function registerIpcHandlers(): void {
  // ========== 1. 智能体聊天通道 ==========

  /** 处理聊天发送请求 - 集成 AgentCore 全链路 */
  ipcMain.handle(
    AGENT_CHANNELS.SEND,
    async (_event: IpcMainInvokeEvent, message: AgentChatMessage): Promise<AgentChatMessage> => {
      if (!agent) {
        return { ...message, content: '系统尚未初始化，请稍后重试...', timestamp: Date.now() };
      }

      console.log('[IPC] AGENT_CHANNELS.SEND received:', message.content.slice(0, 100));

      // L0+ 情感分析
      if (emotionPipeline) {
        emotionPipeline.analyze(message.content);
      }

      // 上下文水位检查
      if (contextMgr) {
        const level = contextMgr.addMessage(
          message.role === 'tool' ? 'user' : message.role,
          message.content,
        );
        if (level === 'hard-limit') {
          await contextMgr.forceTruncate();
        } else if (level === 'soft-limit') {
          void contextMgr.compress();
        }
      }

      // 调用 Agent 核心
      console.log('[IPC] Calling agent.chat...');
      const result = await agent.chat(message);
      console.log('[IPC] agent.chat returned:', { contentLen: result.content.length, tier: result.tier, fromRule: result.fromRule });

      // 记录助手回复
      if (contextMgr && result.content) {
        contextMgr.addMessage('assistant', result.content);
      }

      // 应用人格清洗输出
      let finalContent = result.content;
      if (personality) {
        const validation = personality.validateOutput(finalContent);
        if (!validation.valid) {
          finalContent = personality.sanitizeOutput(finalContent);
        }
      }

      // 应用情感风格
      if (emotionPipeline) {
        finalContent = emotionPipeline.applyStyle(finalContent);
      }

      // 存储记忆
      if (memoryMgr && result.content) {
        await memoryMgr.add('context', `用户: ${message.content}\n助手: ${result.content}`);
      }

      return {
        ...message,
        id: message.id,
        content: finalContent,
        timestamp: Date.now(),
      };
    },
  );

  /** 处理聊天中断请求 */
  ipcMain.on(AGENT_CHANNELS.INTERRUPT, (_event: IpcMainEvent): void => {
    console.log('[IPC] INTERRUPT received');
    agent?.interrupt();
  });

  // ========== 2. 智能体工具调用通道 ==========

  /** 处理工具调用请求 */
  ipcMain.handle(
    AGENT_TOOL_CALL_CHANNELS.INVOKE,
    async (_event: IpcMainInvokeEvent, payload: ToolCallPayload): Promise<ToolCallPayload> => {
      if (!toolRegistry) {
        return { ...payload, status: 'error', result: undefined, errorMessage: '工具系统未初始化' };
      }

      const args = payload.args ?? {};
      const result = await toolRegistry.execute(payload.toolName, args);

      return {
        ...payload,
        status: result.success ? 'success' : 'error',
        result: result.success ? JSON.stringify(result.result) : undefined,
        errorMessage: result.success ? undefined : result.error,
      };
    },
  );

  /** 广播工具调用进度 */
  ipcMain.on(
    AGENT_TOOL_CALL_CHANNELS.ON_PROGRESS,
    (_event: IpcMainEvent, payload: ToolCallPayload): void => {
      broadcastToAll(AGENT_TOOL_CALL_CHANNELS.ON_PROGRESS, payload);
    },
  );

  // ========== 3. 模型增量输出通道 ==========

  /** 接收模型增量数据并转发 */
  ipcMain.on(
    MODEL_DELTA_CHANNELS.ON_DELTA,
    (_event: IpcMainEvent, payload: ModelDeltaPayload): void => {
      sendToWindow(mainWindow, MODEL_DELTA_CHANNELS.ON_DELTA, payload);
    },
  );

  /** 接收生成完成通知并转发 */
  ipcMain.on(
    MODEL_DELTA_CHANNELS.ON_DONE,
    (_event: IpcMainEvent, payload: ModelDeltaPayload): void => {
      sendToWindow(mainWindow, MODEL_DELTA_CHANNELS.ON_DONE, payload);

      // 检查是否需要升级模型
      if (agent && agent.getStatus() === 'idle') {
        // 可根据使用频率决定是否保留 L2
      }
    },
  );

  // ========== 4. 状态变更通道 ==========

  /** 处理状态查询请求 - 聚合各子系统状态 */
  ipcMain.handle(
    STATE_CHANGE_CHANNELS.QUERY,
    async (_event: IpcMainInvokeEvent): Promise<StateChangePayload[]> => {
      const states: StateChangePayload[] = [];

      // Agent 状态
      if (agent) {
        states.push({
          namespace: 'agent',
          key: 'status',
          value: agent.getStatus(),
          timestamp: Date.now(),
        });
      }

      // 模型状态
      if (agent) {
        states.push({
          namespace: 'model',
          key: 'tier',
          value: agent.getActiveTier(),
          timestamp: Date.now(),
        });
      }

      // 情感状态（转换为共享类型）
      if (emotionPipeline) {
        const currentEmotion = emotionPipeline.getCurrentEmotion();
        const sharedType = toSharedEmotionType(currentEmotion.emotion);
        states.push({
          namespace: 'emotion',
          key: 'current',
          value: sharedType,
          timestamp: Date.now(),
        });
      }

      // 上下文水位
      if (contextMgr) {
        states.push({
          namespace: 'context',
          key: 'usage',
          value: `${contextMgr.getTotalTokens()}/${contextMgr['config']?.hardLimit ?? 4096}`,
          timestamp: Date.now(),
        });
      }

      return states;
    },
  );

  /** 广播状态变更事件 */
  ipcMain.on(
    STATE_CHANGE_CHANNELS.ON_STATE,
    (_event: IpcMainEvent, payload: StateChangePayload): void => {
      broadcastToAll(STATE_CHANGE_CHANNELS.ON_STATE, payload);
    },
  );

  // ========== 5. Live2D 动作通道 ==========

  /** 转发 Live2D 动作到 Live2D 窗口 */
  ipcMain.on(
    LIVE2D_ACTION_CHANNELS.SEND_ACTION,
    (_event: IpcMainEvent, payload: Live2DActionPayload): void => {
      sendToWindow(live2dWindow, LIVE2D_ACTION_CHANNELS.SEND_ACTION, payload);
    },
  );

  /** 根据情感自动推送 Live2D 表情 */
  ipcMain.on(
    LIVE2D_ACTION_CHANNELS.SEND_EMOTION,
    (_event: IpcMainEvent, payload: Live2DActionPayload): void => {
      sendToWindow(live2dWindow, LIVE2D_ACTION_CHANNELS.SEND_EMOTION, payload);
    },
  );

  // ========== 6. TTS 合成通道 ==========

  /** 处理 TTS 合成请求 - 集成情感参数 */
  ipcMain.handle(
    TTS_CHUNK_CHANNELS.SYNTHESIZE,
    async (_event: IpcMainInvokeEvent, text: string): Promise<TtsChunkPayload> => {
      // 获取情感 TTS 参数
      const emotionTts = emotionPipeline?.getTtsParams();

      // 实际 TTS 合成逻辑（edge-tts / ChatTTS 集成点）
      return {
        taskId: crypto.randomUUID(),
        text,
        audioData: '',
        format: 'mp3',
        sampleRate: emotionTts ? Math.round(24000 * emotionTts.rate) : 24000,
        isLast: true,
        sequence: 0,
      };
    },
  );

  /** 转发 TTS 音频块到渲染进程 */
  ipcMain.on(
    TTS_CHUNK_CHANNELS.ON_CHUNK,
    (_event: IpcMainEvent, payload: TtsChunkPayload): void => {
      sendToWindow(mainWindow, TTS_CHUNK_CHANNELS.ON_CHUNK, payload);
    },
  );

  /** 转发 TTS 完成通知到渲染进程 */
  ipcMain.on(
    TTS_CHUNK_CHANNELS.ON_DONE,
    (_event: IpcMainEvent, payload: TtsChunkPayload): void => {
      sendToWindow(mainWindow, TTS_CHUNK_CHANNELS.ON_DONE, payload);
    },
  );

  // ========== 7. 会话管理通道 ==========

  /** 创建会话 */
  ipcMain.handle(
    CONVERSATION_CHANNELS.CREATE,
    async (_event: IpcMainInvokeEvent, input: { title?: string }): Promise<Conversation> => {
      if (!database) {
        throw new Error('数据库未初始化');
      }
      return database.createConversation(input);
    },
  );

  /** 获取会话列表 */
  ipcMain.handle(
    CONVERSATION_CHANNELS.LIST,
    async (_event: IpcMainInvokeEvent, payload: { limit?: number; offset?: number }): Promise<Conversation[]> => {
      if (!database) {
        throw new Error('数据库未初始化');
      }
      return database.listConversations(payload?.limit ?? 50, payload?.offset ?? 0);
    },
  );

  /** 获取单个会话详情 */
  ipcMain.handle(
    CONVERSATION_CHANNELS.GET,
    async (_event: IpcMainInvokeEvent, id: string): Promise<Conversation | null> => {
      if (!database) {
        throw new Error('数据库未初始化');
      }
      return database.getConversation(id);
    },
  );

  /** 更新会话 */
  ipcMain.handle(
    CONVERSATION_CHANNELS.UPDATE,
    async (_event: IpcMainInvokeEvent, payload: { id: string; updates: UpdateConversationInput }): Promise<void> => {
      if (!database) {
        throw new Error('数据库未初始化');
      }
      database.updateConversation(payload.id, payload.updates);
    },
  );

  /** 删除会话 */
  ipcMain.handle(
    CONVERSATION_CHANNELS.DELETE,
    async (_event: IpcMainInvokeEvent, id: string): Promise<void> => {
      if (!database) {
        throw new Error('数据库未初始化');
      }
      database.deleteConversation(id);
    },
  );

  /** 获取会话消息列表 */
  ipcMain.handle(
    CONVERSATION_CHANNELS.LIST_MESSAGES,
    async (_event: IpcMainInvokeEvent, payload: { conversationId: string; limit?: number; offset?: number }): Promise<MessageRecord[]> => {
      if (!database) {
        throw new Error('数据库未初始化');
      }
      return database.listMessages(payload.conversationId, payload?.limit ?? 100, payload?.offset ?? 0);
    },
  );

  /** 添加消息到会话 */
  ipcMain.handle(
    CONVERSATION_CHANNELS.ADD_MESSAGE,
    async (_event: IpcMainInvokeEvent, input: AddMessageInput): Promise<MessageRecord> => {
      if (!database) {
        throw new Error('数据库未初始化');
      }
      const message = database.addMessage(input);

      // 自动更新会话的最后消息摘要
      const conv = database.getConversation(input.conversationId);
      if (conv) {
        database.updateConversation(input.conversationId, {
          lastMessage: input.content.slice(0, 100),
        });
      }

      return message;
    },
  );

  // ========== 8. 配置管理通道 ==========

  /** 获取当前配置 */
  ipcMain.handle(
    CONFIG_CHANNELS.GET,
    async (): Promise<AppConfig> => {
      if (!configManager) {
        throw new Error('配置管理器未初始化');
      }
      return configManager.getConfig();
    },
  );

  /** 更新指定配置项 */
  ipcMain.handle(
    CONFIG_CHANNELS.UPDATE,
    async (_event, payload: { path: string; value: unknown }): Promise<void> => {
      if (!configManager) {
        throw new Error('配置管理器未初始化');
      }
      const { path, value } = payload;
      console.log('[Config] Updating config:', path, '=', value);
      configManager.setValue(path, value);

      // 广播配置变更事件
      broadcastToAll(CONFIG_CHANNELS.ON_CHANGE, { path, value });

      // 如果模型配置变更，需要通知 AgentCore 重新加载
      if (path === 'model.defaultModel' && agent) {
        console.log('[Config] Model changed, updating agent...');
        agent.setModel(value as string);
      }
    },
  );

  /** 从 Ollama 刷新可用模型列表 */
  ipcMain.handle(
    CONFIG_CHANNELS.REFRESH_MODELS,
    async (): Promise<{ models: string[]; success: boolean; message?: string }> => {
      if (!configManager) {
        return { models: [], success: false, message: '配置管理器未初始化' };
      }
      const result = await configManager.refreshModels();
      console.log('[Config] Refresh models result:', result.message);

      // 如果成功更新了模型列表，广播变更事件
      if (result.success) {
        broadcastToAll(CONFIG_CHANNELS.ON_CHANGE, {
          path: 'model.availableModels',
          value: result.models,
        });
      }

      return result;
    },
  );

  // ========== 9. 上下文管理通道 ==========

  /** 触发上下文压缩 */
  ipcMain.handle(
    CONTEXT_CHANNELS.COMPRESS,
    async (): Promise<{ success: boolean; savedTokens: number; message?: string }> => {
      if (!contextMgr) {
        return { success: false, savedTokens: 0, message: '上下文管理器未初始化' };
      }
      const result = await contextMgr.compress();
      console.log('[Context] Compression result:', { savedTokens: result.savedTokens, latencyMs: result.latencyMs });

      // 广播状态更新
      broadcastToAll(STATE_CHANGE_CHANNELS.ON_STATE, {
        namespace: 'context',
        key: 'usage',
        value: `${contextMgr.getTotalTokens()}/${contextMgr['config']?.hardLimit ?? 4096}`,
        timestamp: Date.now(),
      });

      return {
        success: true,
        savedTokens: result.savedTokens,
        message: `压缩完成，节省 ${result.savedTokens} tokens`,
      };
    },
  );

  /** 强制截断上下文 */
  ipcMain.handle(
    CONTEXT_CHANNELS.TRUNCATE,
    async (): Promise<{ success: boolean; savedTokens: number; message?: string }> => {
      if (!contextMgr) {
        return { success: false, savedTokens: 0, message: '上下文管理器未初始化' };
      }
      const result = contextMgr.forceTruncate();
      console.log('[Context] Truncation result:', { savedTokens: result.savedTokens });

      broadcastToAll(STATE_CHANGE_CHANNELS.ON_STATE, {
        namespace: 'context',
        key: 'usage',
        value: `${contextMgr.getTotalTokens()}/${contextMgr['config']?.hardLimit ?? 4096}`,
        timestamp: Date.now(),
      });

      return {
        success: true,
        savedTokens: result.savedTokens,
        message: `截断完成，节省 ${result.savedTokens} tokens`,
      };
    },
  );

  /** 获取上下文使用统计 */
  ipcMain.handle(
    CONTEXT_CHANNELS.STATS,
    async (): Promise<{ totalTokens: number; hardLimit: number; level: ContextLevel; messageCount: number }> => {
      if (!contextMgr) {
        return { totalTokens: 0, hardLimit: 4096, level: 'normal' as ContextLevel, messageCount: 0 };
      }
      return {
        totalTokens: contextMgr.getTotalTokens(),
        hardLimit: contextMgr['config']?.hardLimit ?? 4096,
        level: contextMgr.getLevel(),
        messageCount: contextMgr.getMessages().length,
      };
    },
  );

  // ========== 10. 记忆系统通道 ==========

  /** 搜索记忆 */
  ipcMain.handle(
    MEMORY_CHANNELS.SEARCH,
    async (_event, payload: { query: string; limit?: number }) => {
      if (!memoryMgr) {
        throw new Error('记忆管理器未初始化');
      }

      const results = await memoryMgr.search(payload.query, {
        limit: payload.limit ?? 10,
      });

      // 更新访问计数
      if (memoryPersistence && results.length > 0) {
        try {
          memoryPersistence.search(payload.query, { limit: results.length });
        } catch {}
      }

      return results.map((r) => ({
        id: r.entry.id,
        type: r.entry.type,
        content: r.entry.content,
        score: r.score,
        importance: r.entry.importance,
        createdAt: r.entry.createdAt,
        lastAccessedAt: r.entry.lastAccessedAt,
      }));
    },
  );

  /** 添加记忆 */
  ipcMain.handle(
    MEMORY_CHANNELS.ADD,
    async (_event, payload: { type?: string; content: string; metadata?: Record<string, unknown>; importance?: number }) => {
      if (!memoryPersistence) {
        throw new Error('记忆持久化未初始化');
      }

      const type = (payload.type ?? 'context') as 'fact' | 'preference' | 'context' | 'emotion' | 'skill';
      const entry = await memoryPersistence.add(type, payload.content, payload.metadata, payload.importance ?? 0.5);

      return {
        id: entry.id,
        type: entry.type,
        content: entry.content,
        createdAt: entry.createdAt,
      };
    },
  );

  /** 获取所有记忆 */
  ipcMain.handle(
    MEMORY_CHANNELS.LIST,
    async (_event, payload: { limit?: number; type?: string }) => {
      if (!memoryMgr) {
        throw new Error('记忆管理器未初始化');
      }

      const entries = memoryMgr.getAllEntries();
      const filtered = payload.type ? entries.filter((e) => e.type === payload.type) : entries;
      const limited = filtered.slice(0, payload.limit ?? 50);

      return limited.map((e) => ({
        id: e.id,
        type: e.type,
        content: e.content,
        importance: e.importance,
        accessCount: e.accessCount,
        createdAt: e.createdAt,
        lastAccessedAt: e.lastAccessedAt,
      }));
    },
  );

  /** 删除记忆 */
  ipcMain.handle(
    MEMORY_CHANNELS.DELETE,
    async (_event, id: string) => {
      if (!memoryMgr) {
        throw new Error('记忆管理器未初始化');
      }

      const deleted = memoryMgr.delete(id);
      if (deleted && database) {
        try {
          database.deleteMemory(id);
        } catch {}
      }

      return { success: deleted };
    },
  );

  /** 运行遗忘曲线清理 */
  ipcMain.handle(
    MEMORY_CHANNELS.FORGET,
    async () => {
      if (!memoryPersistence) {
        throw new Error('记忆持久化未初始化');
      }

      const forgottenCount = await memoryPersistence.runForgettingCurve();
      console.log('[Memory] 遗忘曲线清理完成，清除', forgottenCount, '条过期记忆');

      return {
        success: true,
        forgottenCount,
        message: forgottenCount > 0 ? `已清除 ${forgottenCount} 条过期记忆` : '没有需要清除的记忆',
      };
    },
  );

  // ========== 11. Ollama 状态管理通道 ==========

  /** 检测 Ollama 服务状态 */
  ipcMain.handle(
    CONFIG_CHANNELS.CHECK_OLLAMA,
    async (): Promise<boolean> => {
      if (!configManager) {
        return false;
      }
      return await configManager.checkOllama();
    },
  );

  /** 尝试启动 Ollama 服务 */
  ipcMain.handle(
    CONFIG_CHANNELS.START_OLLAMA,
    async (): Promise<boolean> => {
      if (!configManager) {
        return false;
      }
      const success = await configManager.startOllama();
      if (success) {
        broadcastToAll(CONFIG_CHANNELS.ON_CHANGE, {
          path: 'ollama.isOnline',
          value: true,
        });
      }
      return success;
    },
  );
}

/**
 * 应用就绪后初始化
 * 创建窗口、初始化各模块、注册 IPC 处理器
 */
app.whenReady().then(async () => {
  configManager = new ConfigManager();
  const config = configManager.initialize();

  // 初始化数据库
  database = new DatabaseManager(config.database);
  database.initialize();

  // 初始化核心模块
  personality = new Personality();
  emotionPipeline = new EmotionPipeline();
  memoryMgr = new MemoryManager();
  contextMgr = new ContextManager();
  toolRegistry = new ToolRegistry();

  // 初始化记忆持久化
  memoryPersistence = new MemoryPersistence(memoryMgr, database);
  memoryPersistence.loadFromDatabase().then(() => {
    console.log('[Memory] 记忆系统初始化完成');
  }).catch((err) => {
    console.warn('[Memory] 记忆系统初始化失败:', err);
  });

  // 初始化 Agent 并注入依赖
  agent = new AgentCore(config, {
    toolRegistry,
    memoryManager: memoryMgr,
    emotionPipeline,
    personality,
    skipInit: false,
  });

  // 设置 Agent 事件监听 - 转发增量到渲染进程
  agent.addListener((event, data) => {
    console.log('[Agent] event:', event, typeof data === 'string' ? data.slice(0, 50) : data);
    if (event === 'delta' && typeof data === 'string') {
      sendToWindow(mainWindow, MODEL_DELTA_CHANNELS.ON_DELTA, {
        sessionId: 'agent-stream',
        content: data,
        isDone: false,
        model: agent?.getActiveTier() ?? 'L1',
      });
    } else if (event === 'done') {
      sendToWindow(mainWindow, MODEL_DELTA_CHANNELS.ON_DONE, {
        sessionId: 'agent-stream',
        content: '',
        isDone: true,
        model: agent?.getActiveTier() ?? 'L1',
      });
    } else if (event === 'status-change') {
      if (typeof data === 'string') {
        broadcastToAll(STATE_CHANGE_CHANNELS.ON_STATE, {
          namespace: 'agent',
          key: 'status',
          value: data,
          timestamp: Date.now(),
        });
      } else if (typeof data === 'object' && data !== null) {
        const payload = data as unknown as { namespace: string; value: unknown };
        broadcastToAll(STATE_CHANGE_CHANNELS.ON_STATE, {
          namespace: payload.namespace,
          key: 'update',
          value: payload.value,
          timestamp: Date.now(),
        });
      }
    } else if (event === 'error' && data instanceof Error) {
      console.error('[Agent] error:', data.message);
      broadcastToAll(STATE_CHANGE_CHANNELS.ON_STATE, {
        namespace: 'agent',
        key: 'error',
        value: data.message,
        timestamp: Date.now(),
      });
    }
  });

  createMainWindow(config);
  createLive2DWindow(config);
  registerIpcHandlers();

  // 根据配置自动尝试启动 Ollama
  void configManager.autoStartOllamaIfConfigured();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(config);
    }
  });
});

/**
 * 所有窗口关闭后退出应用（macOS 除外）
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * 应用即将退出时保存配置
 */
app.on('before-quit', () => {
  configManager?.save();
});

/**
 * 开发模式下的热重载支持
 */
if (process.env.NODE_ENV === 'development') {
  app.on('browser-window-created', (_event, window) => {
    window.webContents.on('devtools-opened', () => {
      window.webContents.reload();
    });
  });
}