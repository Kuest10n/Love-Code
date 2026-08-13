import { useState, useCallback, useEffect, useRef, type ReactElement } from 'react';
import { ChatInput } from './components/ChatInput.js';
import { ChatMessageList } from './components/ChatMessageList.js';
import { StatusBar } from './components/StatusBar.js';
import { SettingsPanel } from './components/SettingsPanel.js';
import { getSafeApis, getRuntimeMode, type RuntimeMode } from './api/safeApis.js';
import type { AgentChatMessage, ModelDeltaPayload, StateChangePayload } from '@shared/types/ipc.js';
import type { Conversation, MessageRecord } from '@shared/types/database.js';
import type { EmotionType } from '@shared/types/emotion.js';
import type { AppConfig } from '@shared/types/config.js';
import type { ContextLevel } from '@shared/types/preload-api.js';

interface DisplayMessage extends AgentChatMessage {
  streaming?: boolean;
  emotion?: EmotionType;
  timestampStr: string;
}

export default function App(): ReactElement {
  const apis = getSafeApis();
  const runtimeMode: RuntimeMode = getRuntimeMode();
  const isElectron = runtimeMode === 'electron';

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState<EmotionType>('neutral');
  const [agentStatus, setAgentStatus] = useState<string>('idle');
  const [modelTier, setModelTier] = useState<string>('L1');
  const [contextUsage, setContextUsage] = useState<{ used: number; limit: number }>({ used: 0, limit: 4096 });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<AppConfig | null>(null);
  const [, setContextLevel] = useState<ContextLevel>('normal');
  const [, setContextMessageCount] = useState(0);
  const [configSaveStatus, setConfigSaveStatus] = useState<string>('');

  void setContextLevel;
  void setContextMessageCount;

  const streamingMessageRef = useRef<DisplayMessage | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const pendingDeltaRef = useRef<string>('');
  const messagesLoadedRef = useRef<string | null>(null);

  const formatTimestamp = useCallback((ts: number): string => {
    const date = new Date(ts);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }, []);

  const loadConversations = useCallback(async (): Promise<void> => {
    setIsLoadingConversations(true);
    try {
      const convs = await apis.conversation.list(50, 0);
      setConversations(convs);

      if (convs.length > 0 && !currentConversationId) {
        const activeConv = convs.find((c) => c.isActive) ?? convs[0];
        setCurrentConversationId(activeConv.id);
      }
    } catch (error) {
      console.error('[App] Failed to load conversations:', error);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [apis, currentConversationId]);

  const loadConversationMessages = useCallback(async (conversationId: string): Promise<void> => {
    try {
      const records = await apis.conversation.listMessages(conversationId, 200, 0);
      const displayMsgs: DisplayMessage[] = records.map((r: MessageRecord) => ({
        id: r.id,
        role: r.role,
        content: r.content,
        timestamp: r.createdAt,
        timestampStr: formatTimestamp(r.createdAt),
      }));
      setMessages(displayMsgs);
      messagesLoadedRef.current = conversationId;
    } catch (error) {
      console.error('[App] Failed to load messages:', error);
      setMessages([]);
    }
  }, [apis, formatTimestamp]);

  const handleCreateConversation = useCallback(async (): Promise<void> => {
    try {
      const conv = await apis.conversation.create('新对话');
      setConversations((prev) => [conv, ...prev]);
      setCurrentConversationId(conv.id);
      setMessages([]);
      messagesLoadedRef.current = conv.id;
      console.log('[App] Created conversation:', conv.id);
    } catch (error) {
      console.error('[App] Failed to create conversation:', error);
    }
  }, [apis]);

  const handleSwitchConversation = useCallback(async (convId: string): Promise<void> => {
    if (convId === currentConversationId) return;
    setCurrentConversationId(convId);
    setMessages([]);
    await loadConversationMessages(convId);
    console.log('[App] Switched to conversation:', convId);
  }, [currentConversationId, loadConversationMessages]);

  const handleDeleteConversation = useCallback(async (convId: string): Promise<void> => {
    try {
      await apis.conversation.remove(convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));

      if (convId === currentConversationId) {
        const remaining = conversations.filter((c) => c.id !== convId);
        if (remaining.length > 0) {
          setCurrentConversationId(remaining[0].id);
          await loadConversationMessages(remaining[0].id);
        } else {
          setCurrentConversationId(null);
          setMessages([]);
        }
      }
      console.log('[App] Deleted conversation:', convId);
    } catch (error) {
      console.error('[App] Failed to delete conversation:', error);
    }
  }, [apis, currentConversationId, conversations, loadConversationMessages]);

  const handleSendMessage = useCallback(async (content: string): Promise<void> => {
    if (!content.trim() || isStreaming) return;

    let convId = currentConversationId;

    if (!convId) {
      try {
        const conv = await apis.conversation.create('新对话');
        convId = conv.id;
        setConversations((prev) => [conv, ...prev]);
        setCurrentConversationId(convId);
        messagesLoadedRef.current = convId;
      } catch (error) {
        console.error('[App] Failed to create conversation:', error);
        return;
      }
    }

    const userMessage: DisplayMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
      timestampStr: formatTimestamp(Date.now()),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);

    try {
      await apis.conversation.addMessage({
        conversationId: convId,
        role: 'user',
        content: content.trim(),
        tokenCount: 0,
        createdAt: userMessage.timestamp,
      });
    } catch (error) {
      console.warn('[App] Failed to persist user message:', error);
    }

    const assistantMessage: DisplayMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      timestampStr: formatTimestamp(Date.now()),
      streaming: true,
    };

    setMessages((prev) => [...prev, assistantMessage]);
    streamingMessageRef.current = assistantMessage;
    streamingMessageIdRef.current = assistantMessage.id;
    pendingDeltaRef.current = '';

    try {
      const result = await apis.agent.sendMessage(userMessage);

      const finalContent = result.content;

      // Apply any delta content that arrived before/around the `await`
      // (e.g. L0 rule synchronous emit) plus the returned final content.
      const resolvedContent = pendingDeltaRef.current || finalContent;

      setMessages((prev) => {
        const targetId = streamingMessageIdRef.current ?? assistantMessage.id;
        return prev.map((msg) =>
          msg.id === targetId
            ? { ...msg, content: resolvedContent, streaming: false, timestamp: Date.now(), timestampStr: formatTimestamp(Date.now()) }
            : msg,
        );
      });

      try {
        await apis.conversation.addMessage({
          conversationId: convId,
          role: 'assistant',
          content: finalContent,
          tokenCount: 0,
          createdAt: Date.now(),
        });

        await apis.conversation.update(convId, {
          lastMessage: finalContent.slice(0, 100),
        });

        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? { ...c, lastMessage: finalContent.slice(0, 100), updatedAt: Date.now() }
              : c,
          ),
        );
      } catch (error) {
        console.warn('[App] Failed to persist assistant message:', error);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessage.id
            ? { ...msg, content: `错误: ${errorMsg}`, streaming: false }
            : msg,
        ),
      );
    } finally {
      setIsStreaming(false);
      streamingMessageRef.current = null;
      streamingMessageIdRef.current = null;
      pendingDeltaRef.current = '';

      // 立即刷新上下文状态
      void (async () => {
        try {
          const stats = await apis.context.stats();
          setContextUsage({ used: stats.totalTokens, limit: stats.hardLimit });
          setContextLevel(stats.level);
          setContextMessageCount(stats.messageCount);
        } catch {
          // Silent fail
        }
      })();
    }
  }, [isStreaming, formatTimestamp, apis, currentConversationId]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // Load initial config
  useEffect(() => {
    void (async () => {
      try {
        const config = await apis.config.get();
        setCurrentConfig(config);
      } catch (error) {
        console.error('[App] Failed to load config:', error);
      }
    })();
  }, [apis]);

  // Load initial context stats and set up periodic refresh
  useEffect(() => {
    void (async () => {
      try {
        const stats = await apis.context.stats();
        setContextUsage({ used: stats.totalTokens, limit: stats.hardLimit });
        setContextLevel(stats.level);
        setContextMessageCount(stats.messageCount);
      } catch (error) {
        console.error('[App] Failed to load context stats:', error);
      }
    })();

    // Refresh context stats every 2 seconds
    const interval = setInterval(() => {
      void (async () => {
        try {
          const stats = await apis.context.stats();
          setContextUsage({ used: stats.totalTokens, limit: stats.hardLimit });
          setContextLevel(stats.level);
          setContextMessageCount(stats.messageCount);
        } catch {
          // Silent fail for periodic refresh
        }
      })();
    }, 2000);

    return () => clearInterval(interval);
  }, [apis]);

  // Listen for config changes
  useEffect(() => {
    const unsubscribe = apis.config.onChange((event: { path: string; value: unknown }) => {
      console.log('[App] Config changed:', event.path, '=', event.value);
      setCurrentConfig((prev) => {
        if (!prev) return prev;
        const newConfig = { ...prev } as any;
        const keys = event.path.split('.');
        let obj: any = newConfig;
        for (let i = 0; i < keys.length - 1; i++) {
          if (obj[keys[i]] === undefined) obj[keys[i]] = {};
          obj = obj[keys[i]];
        }
        obj[keys[keys.length - 1]] = event.value;
        return newConfig;
      });
      setConfigSaveStatus('已保存 ✓');
      setTimeout(() => setConfigSaveStatus(''), 2000);
    });

    return unsubscribe;
  }, [apis]);

  useEffect(() => {
    if (currentConversationId && messagesLoadedRef.current !== currentConversationId) {
      void loadConversationMessages(currentConversationId);
    }
  }, [currentConversationId, loadConversationMessages]);

  useEffect(() => {
    const unsubscribe = apis.model.onDelta((payload: ModelDeltaPayload) => {
      if (!streamingMessageRef.current && !streamingMessageIdRef.current) return;

      pendingDeltaRef.current += payload.content;

      const targetId = streamingMessageRef.current?.id ?? streamingMessageIdRef.current;
      if (!targetId) return;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === targetId
            ? { ...msg, content: msg.content + payload.content }
            : msg,
        ),
      );
    });

    const doneUnsubscribe = apis.model.onDone(() => {
      const targetId = streamingMessageRef.current?.id ?? streamingMessageIdRef.current;
      setMessages((prev) =>
        prev.map((msg) =>
          targetId && msg.id === targetId
            ? { ...msg, streaming: false }
            : msg,
        ),
      );
      setIsStreaming(false);
      streamingMessageRef.current = null;
      // Keep streamingMessageIdRef.current so the post-await update in
      // handleSendMessage can still locate the message by id.
    });

    return () => {
      unsubscribe();
      doneUnsubscribe();
    };
  }, [apis]);

  useEffect(() => {
    const unsubscribe = apis.state.onChange((payload: StateChangePayload) => {
      if (payload.namespace === 'agent') {
        setAgentStatus(String(payload.value));
      } else if (payload.namespace === 'model') {
        setModelTier(String(payload.value));
      } else if (payload.namespace === 'emotion') {
        setCurrentEmotion(String(payload.value) as EmotionType);
      } else if (payload.namespace === 'context') {
        const strVal = String(payload.value);
        const [used, limit] = strVal.split('/').map(Number);
        if (!Number.isNaN(used) && !Number.isNaN(limit)) {
          setContextUsage({ used, limit });
        }
      }
    });

    void apis.state.query().then((states: StateChangePayload[]) => {
      for (const state of states) {
        if (state.namespace === 'agent') setAgentStatus(String(state.value));
        if (state.namespace === 'model') setModelTier(String(state.value));
        if (state.namespace === 'emotion') setCurrentEmotion(String(state.value) as EmotionType);
      }
    });

    return unsubscribe;
  }, [apis]);

  const handleClearChat = useCallback((): void => {
    setMessages([]);
    if (currentConversationId) {
      void apis.conversation.update(currentConversationId, { lastMessage: '' });
    }
  }, [apis, currentConversationId]);

  const handleInterrupt = useCallback((): void => {
    apis.agent.interrupt();
    setIsStreaming(false);
    streamingMessageRef.current = null;
    streamingMessageIdRef.current = null;
    pendingDeltaRef.current = '';
  }, [apis]);

  // void markers placed after declarations at bottom

  const handleRefreshModels = useCallback(async (): Promise<{ success: boolean; models?: string[]; message?: string }> => {
    try {
      setConfigSaveStatus('正在从 Ollama 获取模型列表...');
      const result = await apis.config.refreshModels();
      console.log('[App] Refresh models result:', result);
      if (result.success) {
        setConfigSaveStatus(result.message ?? `成功获取 ${result.models.length} 个模型`);
      } else {
        setConfigSaveStatus(result.message ?? '获取模型列表失败');
      }
      setTimeout(() => setConfigSaveStatus(''), 3000);
      return result;
    } catch (error) {
      console.error('[App] Failed to refresh models:', error);
      setConfigSaveStatus('获取模型列表失败');
      setTimeout(() => setConfigSaveStatus(''), 3000);
      return { success: false, message: '获取模型列表失败' };
    }
  }, [apis]);

  const handleContextCompress = useCallback(async (): Promise<void> => {
    try {
      const result = await apis.context.compress();
      console.log('[App] Context compress result:', result);
      if (result.success) {
        setConfigSaveStatus(`压缩完成，节省 ${result.savedTokens} tokens`);
        setTimeout(() => setConfigSaveStatus(''), 3000);
      }
    } catch (error) {
      console.error('[App] Failed to compress context:', error);
    }
  }, [apis]);

  const handleContextTruncate = useCallback(async (): Promise<void> => {
    try {
      const result = await apis.context.truncate();
      console.log('[App] Context truncate result:', result);
      if (result.success) {
        setConfigSaveStatus(`截断完成，节省 ${result.savedTokens} tokens`);
        setTimeout(() => setConfigSaveStatus(''), 3000);
      }
    } catch (error) {
      console.error('[App] Failed to truncate context:', error);
    }
  }, [apis]);

  const handleCheckOllama = useCallback(async (): Promise<boolean> => {
    try {
      const online = await apis.config.checkOllama();
      console.log('[App] Ollama check result:', online);
      return online;
    } catch (error) {
      console.error('[App] Failed to check Ollama:', error);
      return false;
    }
  }, [apis]);

  const handleStartOllama = useCallback(async (): Promise<boolean> => {
    try {
      const success = await apis.config.startOllama();
      console.log('[App] Ollama start result:', success);
      return success;
    } catch (error) {
      console.error('[App] Failed to start Ollama:', error);
      return false;
    }
  }, [apis]);

  const handleViewMemory = useCallback((): void => {
    setShowMemory((prev) => !prev);
    setShowSettings(false);
  }, []);

  const handleOpenSettings = useCallback((): void => {
    setShowSettings((prev) => !prev);
    setShowMemory(false);
  }, []);

  const handleConfigUpdate = useCallback(async (path: string, value: unknown): Promise<void> => {
    try {
      await apis.config.update(path, value);
      console.log('[App] Config updated:', path, '=', value);
      setConfigSaveStatus('已保存 ✓');
      setTimeout(() => setConfigSaveStatus(''), 2000);
    } catch (error) {
      console.error('[App] Failed to update config:', error);
      setConfigSaveStatus('保存失败');
      setTimeout(() => setConfigSaveStatus(''), 2000);
    }
  }, [apis]);

  const formatConversationTime = useCallback((ts: number): string => {
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60_000) return '刚刚';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
    const date = new Date(ts);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }, []);

  void handleContextCompress;
  void handleContextTruncate;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>💕</div>
          <div style={styles.title}>
            <h1 style={styles.titleText}>Love Code</h1>
            <span style={styles.subtitle}>本地优先 AI 伴侣</span>
          </div>
          <span style={{
            ...styles.modeBadge,
            background: isElectron ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 152, 0, 0.2)',
            borderColor: isElectron ? '#4caf50' : '#ff9800',
            color: isElectron ? '#4caf50' : '#ff9800',
          }}>
            {isElectron ? '● Electron' : '● 预览模式'}
          </span>
        </div>
        <div style={styles.headerRight}>
          <button style={styles.iconButton} onClick={() => setIsSidebarOpen(!isSidebarOpen)} title="切换会话列表">
            {isSidebarOpen ? '◀' : '▶'}
          </button>
          <button style={styles.iconButton} onClick={handleClearChat} title="清空当前对话">
            🗑️
          </button>
        </div>
      </header>

      {!isElectron && (
        <div style={styles.previewWarning}>
          ⚠️ 当前在浏览器预览模式，模型不会被调用。请通过 Electron 应用运行以使用真实 AI 模型。
        </div>
      )}

      <main style={styles.main}>
        {isSidebarOpen && (
          <aside style={styles.sidebar}>
            <div style={styles.conversationHeader}>
              <span style={styles.conversationHeaderTitle}>📝 会话历史</span>
              <button
                style={styles.newConversationButton}
                onClick={() => void handleCreateConversation()}
                title="新建会话"
              >
                + 新对话
              </button>
            </div>

            <div style={styles.conversationList}>
              {isLoadingConversations ? (
                <p style={styles.emptyHint}>加载中...</p>
              ) : conversations.length === 0 ? (
                <p style={styles.emptyHint}>暂无会话记录</p>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.id}
                    style={{
                      ...styles.conversationItem,
                      ...(conv.id === currentConversationId ? styles.conversationItemActive : {}),
                    }}
                    onClick={() => void handleSwitchConversation(conv.id)}
                  >
                    <div style={styles.conversationItemHeader}>
                      <span style={styles.conversationTitle}>
                        {conv.title || '新对话'}
                      </span>
                      <button
                        style={styles.deleteButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteConversation(conv.id);
                        }}
                        title="删除会话"
                      >
                        ✕
                      </button>
                    </div>
                    <div style={styles.conversationItemMeta}>
                      <span style={styles.conversationPreview}>
                        {conv.lastMessage || '暂无消息'}
                      </span>
                      <span style={styles.conversationTime}>
                        {formatConversationTime(conv.updatedAt)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={styles.sidebarDivider} />

            <StatusBar
              agentStatus={agentStatus}
              modelTier={modelTier}
              currentEmotion={currentEmotion}
              contextUsage={contextUsage}
              onViewMemory={handleViewMemory}
              onOpenSettings={handleOpenSettings}
            />
          </aside>
        )}

        <section style={styles.chatSection}>
          <ChatMessageList messages={messages} isStreaming={isStreaming} onSend={handleSendMessage} />

          <div style={styles.inputArea}>
            {isStreaming && (
              <button style={styles.interruptButton} onClick={handleInterrupt}>
                ⏹ 中断生成
              </button>
            )}
            <ChatInput onSend={handleSendMessage} disabled={isStreaming} />
          </div>
        </section>

        {showSettings && (
          <SettingsPanel
            config={currentConfig}
            onUpdate={handleConfigUpdate}
            onRefreshModels={handleRefreshModels}
            onCheckOllama={handleCheckOllama}
            onStartOllama={handleStartOllama}
            onClose={() => setShowSettings(false)}
            onSaveStatus={configSaveStatus}
            currentEmotion={currentEmotion}
          />
        )}

        {showMemory && (
          <div style={styles.modalOverlay} onClick={() => setShowMemory(false)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h2 style={styles.modalTitle}>📋 记忆</h2>
                <button style={styles.closeButton} onClick={() => setShowMemory(false)}>✕</button>
              </div>
              <div style={styles.modalBody}>
                <div style={styles.memorySection}>
                  <h3 style={styles.sectionTitle}>当前会话消息</h3>
                  {messages.length === 0 ? (
                    <p style={styles.emptyHint}>暂无对话记录。开始一段对话后，消息将显示在此处。</p>
                  ) : (
                    <div style={styles.memoryList}>
                      {messages.map((msg) => (
                        <div key={msg.id} style={styles.memoryItem}>
                          <span style={{
                            ...styles.memoryRole,
                            color: msg.role === 'user' ? '#667eea' : '#4caf50',
                          }}>
                            {msg.role === 'user' ? '👤 用户' : '💕 AI'}
                          </span>
                          <span style={styles.memoryContent}>
                            {msg.content.slice(0, 100)}{msg.content.length > 100 ? '...' : ''}
                          </span>
                          <span style={styles.memoryTime}>
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={styles.memorySection}>
                  <h3 style={styles.sectionTitle}>统计信息</h3>
                  <div style={styles.settingsRow}>
                    <span style={styles.settingsLabel}>总会话数</span>
                    <span style={styles.settingsValue}>{conversations.length}</span>
                  </div>
                  <div style={styles.settingsRow}>
                    <span style={styles.settingsLabel}>当前会话消息数</span>
                    <span style={styles.settingsValue}>{messages.length}</span>
                  </div>
                  <div style={styles.settingsRow}>
                    <span style={styles.settingsLabel}>用户消息</span>
                    <span style={styles.settingsValue}>{messages.filter(m => m.role === 'user').length}</span>
                  </div>
                  <div style={styles.settingsRow}>
                    <span style={styles.settingsLabel}>AI 回复</span>
                    <span style={styles.settingsValue}>{messages.filter(m => m.role === 'assistant').length}</span>
                  </div>
                </div>
                {!isElectron && (
                  <div style={styles.memorySection}>
                    <h3 style={styles.sectionTitle}>提示</h3>
                    <p style={styles.emptyHint}>
                      记忆功能在 Electron 模式下提供持久化存储。当前为浏览器预览模式。
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    background: 'rgba(26, 26, 46, 0.8)',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    backdropFilter: 'blur(10px)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logo: {
    fontSize: '28px',
  },
  title: {
    display: 'flex',
    flexDirection: 'column',
  },
  titleText: {
    margin: 0,
    fontSize: '1.2rem',
    fontWeight: 600,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    fontSize: '0.75rem',
    color: '#888',
  },
  modeBadge: {
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 600,
    border: '1px solid',
    letterSpacing: '0.5px',
  },
  headerRight: {
    display: 'flex',
    gap: '8px',
  },
  iconButton: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    width: '36px',
    height: '36px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    color: 'inherit',
    fontFamily: 'inherit',
  },
  previewWarning: {
    padding: '8px 20px',
    background: 'rgba(255, 152, 0, 0.15)',
    borderBottom: '1px solid rgba(255, 152, 0, 0.3)',
    color: '#ff9800',
    fontSize: '13px',
    textAlign: 'center',
  },
  main: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  sidebar: {
    width: '260px',
    borderRight: '1px solid rgba(255,255,255,0.1)',
    padding: '12px',
    overflowY: 'auto',
    background: 'rgba(22, 33, 62, 0.5)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  conversationHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 8px 8px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  conversationHeaderTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#aaa',
  },
  newConversationButton: {
    background: 'rgba(102, 126, 234, 0.2)',
    border: '1px solid rgba(102, 126, 234, 0.4)',
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '12px',
    color: '#667eea',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  conversationList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxHeight: '300px',
    overflowY: 'auto',
  },
  conversationItem: {
    padding: '8px 10px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background 0.15s',
    background: 'rgba(255,255,255,0.02)',
  },
  conversationItemActive: {
    background: 'rgba(102, 126, 234, 0.2)',
    border: '1px solid rgba(102, 126, 234, 0.3)',
  },
  conversationItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  conversationTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#eee',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  deleteButton: {
    background: 'transparent',
    border: 'none',
    color: '#666',
    fontSize: '11px',
    cursor: 'pointer',
    padding: '2px 4px',
    borderRadius: '4px',
    lineHeight: 1,
  },
  conversationItemMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
  },
  conversationPreview: {
    fontSize: '11px',
    color: '#888',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  conversationTime: {
    fontSize: '10px',
    color: '#555',
    flexShrink: 0,
  },
  sidebarDivider: {
    height: '1px',
    background: 'rgba(255,255,255,0.1)',
    margin: '4px 0',
  },
  chatSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  inputArea: {
    padding: '16px 20px',
    borderTop: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(26, 26, 46, 0.8)',
  },
  interruptButton: {
    width: '100%',
    padding: '8px',
    marginBottom: '8px',
    background: 'rgba(255, 99, 99, 0.2)',
    border: '1px solid rgba(255, 99, 99, 0.5)',
    borderRadius: '8px',
    color: '#ff6363',
    cursor: 'pointer',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    width: '480px',
    maxHeight: '80%',
    background: '#1e1e32',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '12px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(26, 26, 46, 0.8)',
  },
  modalTitle: {
    margin: 0,
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#fff',
  },
  closeButton: {
    background: 'transparent',
    border: 'none',
    color: '#aaa',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  modalBody: {
    padding: '16px 20px',
    overflowY: 'auto',
    flex: 1,
  },
  settingsSection: {
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#888',
    marginBottom: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  settingsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  settingsLabel: {
    color: '#aaa',
    fontSize: '13px',
  },
  settingsValue: {
    color: '#fff',
    fontSize: '13px',
    fontWeight: 500,
  },
  memorySection: {
    marginBottom: '20px',
  },
  memoryList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  memoryItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '8px',
    fontSize: '13px',
  },
  memoryRole: {
    fontWeight: 600,
    flexShrink: 0,
  },
  memoryContent: {
    flex: 1,
    color: '#ccc',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  memoryTime: {
    color: '#666',
    fontSize: '11px',
    flexShrink: 0,
  },
  emptyHint: {
    color: '#888',
    fontSize: '13px',
    textAlign: 'center',
    padding: '20px',
    margin: 0,
  },
  modelSelect: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '6px',
    padding: '6px 12px',
    color: '#fff',
    fontSize: '13px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    minWidth: '180px',
  },
  refreshButton: {
    background: 'rgba(102, 126, 234, 0.15)',
    border: '1px solid rgba(102, 126, 234, 0.4)',
    borderRadius: '6px',
    padding: '6px 10px',
    color: '#667eea',
    fontSize: '14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    lineHeight: 1,
  },
  progressBarContainer: {
    width: '100%',
    height: '8px',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: '4px',
    overflow: 'hidden',
    marginTop: '8px',
    marginBottom: '4px',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s ease, background 0.3s ease',
    minWidth: '2px',
  },
  buttonRow: {
    display: 'flex',
    gap: '10px',
    marginTop: '12px',
  },
  actionButton: {
    flex: 1,
    padding: '10px 14px',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
  compressButton: {
    background: 'rgba(102, 126, 234, 0.15)',
    borderColor: 'rgba(102, 126, 234, 0.4)',
    color: '#667eea',
  },
  truncateButton: {
    background: 'rgba(255, 99, 99, 0.15)',
    borderColor: 'rgba(255, 99, 99, 0.4)',
    color: '#ff6363',
  },
  saveStatus: {
    marginTop: '10px',
    padding: '6px 10px',
    background: 'rgba(76, 175, 80, 0.15)',
    border: '1px solid rgba(76, 175, 80, 0.3)',
    borderRadius: '6px',
    textAlign: 'center' as const,
  },
  saveStatusText: {
    color: '#4caf50',
    fontSize: '12px',
    fontWeight: 500,
  },
};
