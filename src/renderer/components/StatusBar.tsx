/**
 * StatusBar 组件
 * 显示 Agent 状态、模型层级、情感状态、上下文水位
 */

import type { ReactElement } from 'react';
import type { EmotionType } from '@shared/types/emotion.js';

interface StatusBarProps {
  agentStatus: string;
  modelTier: string;
  currentEmotion: EmotionType;
  contextUsage: { used: number; limit: number };
}

/** 情感映射，键名与 EmotionType 枚举值保持一致 */
const EMOTION_LABELS: Record<string, { emoji: string; label: string }> = {
  neutral: { emoji: '🙂', label: '平静' },
  happy: { emoji: '😊', label: '开心' },
  sad: { emoji: '😢', label: '难过' },
  angry: { emoji: '😠', label: '生气' },
  surprised: { emoji: '😲', label: '惊讶' },
  fearful: { emoji: '😨', label: '恐惧' },
  disgusted: { emoji: '🤢', label: '厌恶' },
  trustful: { emoji: '🥺', label: '信任' },
  expectant: { emoji: '🤞', label: '期待' },
  shy: { emoji: '😳', label: '害羞' },
  sleepy: { emoji: '😴', label: '困倦' },
  focused: { emoji: '🎯', label: '专注' },
  curious: { emoji: '🤨', label: '好奇' },
  proud: { emoji: '😌', label: '自豪' },
  comforting: { emoji: '🤗', label: '安慰' },
};

/** 状态组件 */
export function StatusBar({ agentStatus, modelTier, currentEmotion, contextUsage }: StatusBarProps): ReactElement {
  const emotionInfo = EMOTION_LABELS[currentEmotion] ?? EMOTION_LABELS.neutral;
  const contextPercent = Math.round((contextUsage.used / contextUsage.limit) * 100);
  const contextColor = contextPercent > 95 ? '#ff6363' : contextPercent > 70 ? '#ffc107' : '#4caf50';

  /** Agent 状态颜色 */
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'idle': return '#4caf50';
      case 'thinking': return '#ffc107';
      case 'streaming': return '#2196f3';
      case 'error': return '#ff6363';
      default: return '#888';
    }
  };

  /** 模型层级颜色 */
  const getTierColor = (tier: string): string => {
    switch (tier) {
      case 'L0': return '#888';
      case 'L1': return '#4caf50';
      case 'L2': return '#ffc107';
      default: return '#888';
    }
  };

  /** Agent 状态中文标签 */
  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'idle': return '空闲';
      case 'thinking': return '思考中';
      case 'streaming': return '生成中';
      default: return status;
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.titleSection}>
        <h3 style={styles.title}>系统状态</h3>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Agent 状态</div>
        <div style={styles.statusRow}>
          <div style={{ ...styles.statusDot, background: getStatusColor(agentStatus) }} />
          <span style={styles.statusText}>{getStatusLabel(agentStatus)}</span>
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>模型层级</div>
        <div style={styles.statusRow}>
          <div style={{ ...styles.statusDot, background: getTierColor(modelTier) }} />
          <span style={styles.statusText}>{modelTier}</span>
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>当前情感</div>
        <div style={styles.emotionRow}>
          <span style={styles.emotionEmoji}>{emotionInfo.emoji}</span>
          <span style={styles.emotionLabel}>{emotionInfo.label}</span>
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>上下文使用</div>
        <div style={styles.progressContainer}>
          <div
            style={{
              ...styles.progressBar,
              width: `${Math.min(contextPercent, 100)}%`,
              background: contextColor,
            }}
          />
        </div>
        <div style={styles.progressText}>
          {contextUsage.used.toLocaleString()} / {contextUsage.limit.toLocaleString()} tokens ({contextPercent}%)
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>快捷操作</div>
        <div style={styles.quickActions}>
          <button style={styles.actionButton}>📋 查看记忆</button>
          <button style={styles.actionButton}>⚙️ 设置</button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  titleSection: {
    paddingBottom: '8px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: '#e0e0e0',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionTitle: {
    fontSize: '12px',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  statusText: {
    fontSize: '14px',
    color: '#e0e0e0',
  },
  emotionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  emotionEmoji: {
    fontSize: '24px',
  },
  emotionLabel: {
    fontSize: '14px',
    color: '#e0e0e0',
  },
  progressContainer: {
    width: '100%',
    height: '8px',
    background: 'rgba(255,255,255,0.1)',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: '11px',
    color: '#888',
  },
  quickActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  actionButton: {
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#e0e0e0',
    fontSize: '13px',
    cursor: 'pointer',
    textAlign: 'left',
  },
};