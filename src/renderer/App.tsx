/**
 * App 主组件
 * 提供聊天界面、状态面板、情感指示与控制栏
 */

import { useState, useCallback, useEffect, useRef, type ReactElement } from 'react';
import { ChatInput } from './components/ChatInput.js';
import { ChatMessageList } from './components/ChatMessageList.js';
import { StatusBar } from './components/StatusBar.js';
import type { AgentChatMessage, ModelDeltaPayload, StateChangePayload } from '@shared/types/ipc.js';
import type { EmotionType } from '@shared/types/emotion.js';

/** 聊天消息显示格式 */
interface DisplayMessage extends AgentChatMessage {
  /** 是否为流式消息 */
  streaming?: boolean;
  /** 情感标签 */
  emotion?: EmotionType;
  /** 时间戳字符串 */
  timestampStr: string;
}

/** 主组件 */
export default function App(): ReactElement {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState<EmotionType>('neutral');
  const [agentStatus, setAgentStatus] = useState<string>('idle');
  const [modelTier, setModelTier] = useState<string>('L1');
  const [contextUsage, setContextUsage] = useState<{ used: number; limit: number }>({ used: 0, limit: 4096 });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const streamingMessageRef = useRef<DisplayMessage | null>(null);

  /** 格式化时间戳 */
  const formatTimestamp = useCallback((ts: number): string => {
    const date = new Date(ts);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }, []);

  /** 发送消息 */
  const handleSendMessage = useCallback(async (content: string): Promise<void> => {
    if (!content.trim() || isStreaming) return;

    const userMessage: DisplayMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
      timestampStr: formatTimestamp(Date.now()),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);

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

    try {
      const result = await window.apis.agent.sendMessage(userMessage);

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessage.id
            ? { ...msg, content: result.content, streaming: false, timestamp: Date.now(), timestampStr: formatTimestamp(Date.now()) }
            : msg,
        ),
      );
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
    }
  }, [isStreaming, formatTimestamp]);

  /** 监听模型增量输出 */
  useEffect(() => {
    const unsubscribe = window.apis.model.onDelta((payload: ModelDeltaPayload) => {
      if (!streamingMessageRef.current) return;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === streamingMessageRef.current!.id
            ? { ...msg, content: msg.content + payload.content }
            : msg,
        ),
      );
    });

    const doneUnsubscribe = window.apis.model.onDone(() => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === streamingMessageRef.current?.id
            ? { ...msg, streaming: false }
            : msg,
        ),
      );
      setIsStreaming(false);
      streamingMessageRef.current = null;
    });

    return () => {
      unsubscribe();
      doneUnsubscribe();
    };
  }, []);

  /** 监听状态变更 */
  useEffect(() => {
    const unsubscribe = window.apis.state.onChange((payload: StateChangePayload) => {
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

    void window.apis.state.query().then((states: StateChangePayload[]) => {
      for (const state of states) {
        if (state.namespace === 'agent') setAgentStatus(String(state.value));
        if (state.namespace === 'model') setModelTier(String(state.value));
        if (state.namespace === 'emotion') setCurrentEmotion(String(state.value) as EmotionType);
      }
    });

    return unsubscribe;
  }, []);

  /** 清空对话 */
  const handleClearChat = useCallback((): void => {
    setMessages([]);
  }, []);

  /** 中断生成 */
  const handleInterrupt = useCallback((): void => {
    window.apis.agent.onStream(() => {});
  }, []);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>💕</div>
          <div style={styles.title}>
            <h1 style={styles.titleText}>Love Code</h1>
            <span style={styles.subtitle}>本地优先 AI 伴侣</span>
          </div>
        </div>
        <div style={styles.headerRight}>
          <button style={styles.iconButton} onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            {isSidebarOpen ? '◀' : '▶'}
          </button>
          <button style={styles.iconButton} onClick={handleClearChat}>
            🗑️
          </button>
        </div>
      </header>

      <main style={styles.main}>
        {isSidebarOpen && (
          <aside style={styles.sidebar}>
            <StatusBar
              agentStatus={agentStatus}
              modelTier={modelTier}
              currentEmotion={currentEmotion}
              contextUsage={contextUsage}
            />
          </aside>
        )}

        <section style={styles.chatSection}>
          <ChatMessageList messages={messages} isStreaming={isStreaming} />

          <div style={styles.inputArea}>
            {isStreaming && (
              <button style={styles.interruptButton} onClick={handleInterrupt}>
                ⏹ 中断生成
              </button>
            )}
            <ChatInput onSend={handleSendMessage} disabled={isStreaming} />
          </div>
        </section>
      </main>
    </div>
  );
}

/** 样式定义 */
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
  },
  main: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  sidebar: {
    width: '240px',
    borderRight: '1px solid rgba(255,255,255,0.1)',
    padding: '16px',
    overflowY: 'auto',
    background: 'rgba(22, 33, 62, 0.5)',
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
};