/**
 * 情感类型定义
 * 描述智能体可表达的情感维度与强度
 */

/**
 * 情感类型枚举
 * 覆盖常见的基础情感与复合情感
 */
export const EmotionType = {
  /** 中性 / 平静 */
  Neutral: 'neutral',
  /** 开心 / 愉悦 */
  Happy: 'happy',
  /** 悲伤 / 难过 */
  Sad: 'sad',
  /** 生气 / 愤怒 */
  Angry: 'angry',
  /** 惊讶 / 诧异 */
  Surprised: 'surprised',
  /** 恐惧 / 害怕 */
  Fearful: 'fearful',
  /** 厌恶 / 嫌弃 */
  Disgusted: 'disgusted',
  /** 信任 / 信赖 */
  Trustful: 'trustful',
  /** 期待 / 盼望 */
  Expectant: 'expectant',
  /** 害羞 / 腼腆 */
  Shy: 'shy',
  /** 困倦 / 疲倦 */
  Sleepy: 'sleepy',
  /** 专注 / 认真 */
  Focused: 'focused',
  /** 好奇 / 感兴趣 */
  Curious: 'curious',
  /** 得意 / 自豪 */
  Proud: 'proud',
  /** 安慰 / 温柔 */
  Comforting: 'comforting',
} as const;

/** 情感类型联合 */
export type EmotionType = (typeof EmotionType)[keyof typeof EmotionType];

/**
 * 情感强度等级
 * 采用 5 档制用于 UI 与 Live2D 的平滑过渡
 */
export const EmotionIntensity = {
  /** 极弱（几乎不可察觉） */
  VeryLow: 0.2,
  /** 弱 */
  Low: 0.4,
  /** 中等（默认） */
  Normal: 0.6,
  /** 强 */
  High: 0.8,
  /** 极强（峰值表现） */
  VeryHigh: 1.0,
} as const;

/** 情感强度数值类型（0.0 ~ 1.0） */
export type EmotionIntensityValue = number;

/**
 * 情感状态接口
 * 完整描述当前的情感状态快照
 */
export interface EmotionState {
  /** 主导情感类型 */
  type: EmotionType;
  /** 情感强度（0.0 ~ 1.0） */
  intensity: EmotionIntensityValue;
  /** 情感持续时间（毫秒） */
  duration: number;
  /** 是否为过渡态 */
  isTransitioning: boolean;
  /** 上一个情感类型（用于过渡动画） */
  previousType?: EmotionType;
  /** 过渡进度（0.0 旧 → 1.0 新） */
  transitionProgress?: number;
  /** 时间戳 */
  updatedAt: number;
}