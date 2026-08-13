/**
 * ChatMessageList 组件
 * 渲染聊天消息列表，支持流式动画和消息气泡样式
 */

import { useEffect, useRef, type ReactElement } from 'react';
import type { AgentChatMessage } from '@shared/types/ipc.js';

interface DisplayMessage extends AgentChatMessage {
  streaming?: boolean;
  timestampStr: string;
}

interface ChatMessageListProps {
  messages: DisplayMessage[];
  isStreaming: boolean;
  onSend?: (content: string) => void;
}

/** 消息列表组件 */
export function ChatMessageList({ messages, isStreaming, onSend }: ChatMessageListProps): ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);

  /** 自动滚动到底部 */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  /** 渲染单条消息 */
  const renderMessage = (msg: DisplayMessage): ReactElement => {
    const isUser = msg.role === 'user';

    return (
      <div key={msg.id} style={{ ...styles.messageRow, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
        <div style={{ ...styles.avatar, background: isUser ? '#667eea' : '#764ba2' }}>
          {isUser ? '👤' : '💕'}
        </div>

        <div style={{ ...styles.bubble, ...(isUser ? styles.userBubble : styles.assistantBubble) }}>
          <div style={styles.timestamp}>{msg.timestampStr}</div>
          <div style={styles.content}>
            {msg.content || (msg.streaming ? '思考中...' : '')}
            {msg.streaming && msg.content && (
              <span style={styles.cursor}>▊</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (messages.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyIcon}>💕</div>
        <div style={styles.emptyText}>开始一段对话吧～</div>
        <div style={styles.emptyHints}>
          <button type="button" style={styles.hintChip} onClick={() => onSend?.('你好')}>你好</button>
          <button type="button" style={styles.hintChip} onClick={() => onSend?.('帮我写代码')}>帮我写代码</button>
          <button type="button" style={styles.hintChip} onClick={() => onSend?.('分析这段文本')}>分析这段文本</button>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} style={styles.container}>
      {messages.map(renderMessage)}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  messageRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    maxWidth: '80%',
  },
  avatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    flexShrink: 0,
  },
  bubble: {
    padding: '12px 16px',
    borderRadius: '12px',
    maxWidth: '100%',
    wordBreak: 'break-word',
  },
  userBubble: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    borderBottomRightRadius: '4px',
  },
  assistantBubble: {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderBottomLeftRadius: '4px',
  },
  timestamp: {
    fontSize: '11px',
    opacity: 0.6,
    marginBottom: '4px',
  },
  content: {
    fontSize: '14px',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
  },
  cursor: {
    animation: 'blink 1s infinite',
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    opacity: 0.5,
  },
  emptyIcon: {
    fontSize: '64px',
  },
  emptyText: {
    fontSize: '18px',
  },
  emptyHints: {
    display: 'flex',
    gap: '12px',
  },
  hintChip: {
    padding: '8px 16px',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '20px',
    fontSize: '13px',
    color: 'inherit',
    cursor: 'pointer',
    outline: 'none',
    fontFamily: 'inherit',
  },
};