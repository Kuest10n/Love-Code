/**
 * 情感计算管道
 * 实现 L0 关键词粗判 → L1 细判 → 响应映射的三级情感分析
 * 情感影响 TTS 参数与文本风格
 */

import type { EmotionType as SharedEmotionType, EmotionState as SharedEmotionState } from '@shared/types/emotion.js';

/**
 * 情感类型枚举
 * 覆盖基础情感与复合情感，用于管道内部精确表达
 */
export const EMOTION = {
  /** 中性 / 平静 */
  NEUTRAL: 'neutral',
  /** 开心 / 愉悦 */
  HAPPY: 'happy',
  /** 兴奋 / 激动 */
  EXCITED: 'excited',
  /** 悲伤 / 难过 */
  SAD: 'sad',
  /** 生气 / 愤怒 */
  ANGRY: 'angry',
  /** 焦虑 / 紧张 */
  ANXIOUS: 'anxious',
  /** 惊讶 / 诧异 */
  SURPRISED: 'surprised',
  /** 恐惧 / 害怕 */
  FEARFUL: 'fearful',
  /** 厌恶 / 嫌弃 */
  DISGUSTED: 'disgusted',
  /** 沉思 / 思考 */
  THOUGHTFUL: 'thoughtful',
  /** 困倦 / 疲倦 */
  SLEEPY: 'sleepy',
  /** 暧昧 / 性感 */
  SEXY: 'sexy',
  /** 好奇 / 感兴趣 */
  CURIOUS: 'curious',
  /** 得意 / 自豪 */
  PROUD: 'proud',
  /** 害羞 / 腼腆 */
  SHY: 'shy',
} as const;

/** 情感类型联合 */
export type EmotionType = (typeof EMOTION)[keyof typeof EMOTION];

/**
 * 情感强度等级
 * 管道内部使用三档制，简化 TTS 参数映射
 */
export const EMOTION_INTENSITY = {
  /** 低强度 */
  LOW: 'low',
  /** 中等强度 */
  MEDIUM: 'medium',
  /** 高强度 */
  HIGH: 'high',
} as const;

/** 情感强度联合类型 */
export type EmotionIntensity = (typeof EMOTION_INTENSITY)[keyof typeof EMOTION_INTENSITY];

/**
 * 情感状态接口
 * 描述管道分析输出的完整情感快照
 */
export interface EmotionState {
  /** 主导情感类型 */
  emotion: EmotionType;
  /** 情感强度 */
  intensity: EmotionIntensity;
  /** 置信度（0.0 ~ 1.0） */
  confidence: number;
  /** 时间戳（毫秒） */
  timestamp: number;
}

/** 情感规则 */
interface EmotionRule {
  /** 情感类型 */
  emotion: EmotionType;
  /** 触发关键词列表 */
  keywords: string[];
  /** 权重（0.0 ~ 1.0） */
  weight: number;
}

/** TTS 参数映射 */
export interface TtsParams {
  /** 语速倍率 */
  rate: number;
  /** 音量倍率 */
  volume: number;
  /** 音调偏移 */
  pitch: number;
}

/** 文本风格映射 */
export interface StyleConfig {
  /** 表情符号 */
  emoji: string;
  /** 前缀语气词候选 */
  prefix: string[];
  /** 后缀语气词候选 */
  suffix: string[];
  /** 最大感叹号数量 */
  maxExclamation: number;
}

/** 默认 TTS 参数 */
const DEFAULT_TTS: TtsParams = {
  rate: 1.0,
  volume: 1.0,
  pitch: 0,
};

/** 情感 → TTS 参数映射表 */
const EMOTION_TTS_MAP: Record<EmotionType, TtsParams> = {
  [EMOTION.NEUTRAL]: { rate: 1.0, volume: 1.0, pitch: 0 },
  [EMOTION.HAPPY]: { rate: 1.15, volume: 1.1, pitch: 2 },
  [EMOTION.EXCITED]: { rate: 1.3, volume: 1.2, pitch: 4 },
  [EMOTION.SAD]: { rate: 0.85, volume: 0.8, pitch: -2 },
  [EMOTION.ANGRY]: { rate: 1.2, volume: 1.3, pitch: 1 },
  [EMOTION.ANXIOUS]: { rate: 1.05, volume: 0.9, pitch: 1 },
  [EMOTION.SURPRISED]: { rate: 1.2, volume: 1.15, pitch: 3 },
  [EMOTION.FEARFUL]: { rate: 0.9, volume: 0.85, pitch: 2 },
  [EMOTION.DISGUSTED]: { rate: 0.95, volume: 0.9, pitch: 0 },
  [EMOTION.THOUGHTFUL]: { rate: 0.9, volume: 0.95, pitch: -1 },
  [EMOTION.SLEEPY]: { rate: 0.85, volume: 0.7, pitch: -2 },
  [EMOTION.SEXY]: { rate: 0.9, volume: 0.85, pitch: 1 },
  [EMOTION.CURIOUS]: { rate: 1.1, volume: 1.0, pitch: 2 },
  [EMOTION.PROUD]: { rate: 1.05, volume: 1.05, pitch: 1 },
  [EMOTION.SHY]: { rate: 0.95, volume: 0.8, pitch: 2 },
};

/** 情感 → 文本风格映射表 */
const EMOTION_STYLE_MAP: Record<EmotionType, StyleConfig> = {
  [EMOTION.NEUTRAL]: { emoji: '🙂', prefix: ['嗯', '好的', '了解'], suffix: ['～', '。'], maxExclamation: 1 },
  [EMOTION.HAPPY]: { emoji: '😊', prefix: ['太好了！', '真棒！', '哈哈'], suffix: ['！', '～'], maxExclamation: 3 },
  [EMOTION.EXCITED]: { emoji: '🤩', prefix: ['哇！', '太棒了！', '真的吗！'], suffix: ['！！', '～～'], maxExclamation: 5 },
  [EMOTION.SAD]: { emoji: '😢', prefix: ['哎...', '我明白', '真遗憾'], suffix: ['...', '。'], maxExclamation: 0 },
  [EMOTION.ANGRY]: { emoji: '😠', prefix: ['哼！', '真是的', '太过分了'], suffix: ['！', '。'], maxExclamation: 2 },
  [EMOTION.ANXIOUS]: { emoji: '😰', prefix: ['别担心', '放松点', '没事的'], suffix: ['～', '。'], maxExclamation: 1 },
  [EMOTION.SURPRISED]: { emoji: '😲', prefix: ['诶？', '什么？', '不会吧'], suffix: ['！', '？'], maxExclamation: 3 },
  [EMOTION.FEARFUL]: { emoji: '😨', prefix: ['别怕', '我在这', '没事的'], suffix: ['...', '。'], maxExclamation: 1 },
  [EMOTION.DISGUSTED]: { emoji: '🤢', prefix: ['呃...', '这有点', '不太好'], suffix: ['...', '。'], maxExclamation: 0 },
  [EMOTION.THOUGHTFUL]: { emoji: '🤔', prefix: ['让我想想', '嗯...', '这个问题'], suffix: ['...', '。'], maxExclamation: 0 },
  [EMOTION.SLEEPY]: { emoji: '😴', prefix: ['嗯...', '有点困', '休息一下'], suffix: ['...', '。'], maxExclamation: 0 },
  [EMOTION.SEXY]: { emoji: '😊', prefix: ['嘿嘿', '你真可爱', '～'], suffix: ['～', '♪'], maxExclamation: 1 },
  [EMOTION.CURIOUS]: { emoji: '🤨', prefix: ['有意思', '让我看看', '这是什么'], suffix: ['？', '～'], maxExclamation: 2 },
  [EMOTION.PROUD]: { emoji: '😌', prefix: ['做得好！', '我就知道', '真棒'], suffix: ['！', '～'], maxExclamation: 2 },
  [EMOTION.SHY]: { emoji: '😳', prefix: ['嗯...', '那个', '不好意思'], suffix: ['...', '。'], maxExclamation: 1 },
};

/** L0 粗判规则表 */
const L0_RULES: EmotionRule[] = [
  { emotion: EMOTION.HAPPY, keywords: ['开心', '高兴', '快乐', '喜欢', '爱', '棒', '哈哈', '嘻嘻', 'happy', 'great'], weight: 0.9 },
  { emotion: EMOTION.SAD, keywords: ['难过', '伤心', '哭', '失落', '孤单', 'sad', 'unhappy', 'cry'], weight: 0.9 },
  { emotion: EMOTION.ANGRY, keywords: ['生气', '愤怒', '讨厌', '烦', '气', 'angry', 'hate'], weight: 0.85 },
  { emotion: EMOTION.ANXIOUS, keywords: ['焦虑', '紧张', '担心', '压力', 'anxious', 'worried', 'stress'], weight: 0.8 },
  { emotion: EMOTION.SURPRISED, keywords: ['惊讶', '吃惊', '没想到', 'wow', 'surprise'], weight: 0.85 },
  { emotion: EMOTION.FEARFUL, keywords: ['害怕', '恐惧', '担心', '怕', 'scared', 'afraid'], weight: 0.8 },
  { emotion: EMOTION.DISGUSTED, keywords: ['恶心', '讨厌', '反感', 'disgust', 'gross'], weight: 0.75 },
  { emotion: EMOTION.CURIOUS, keywords: ['好奇', '想知道', '为什么', '怎么', '?', '？', 'why', 'how'], weight: 0.7 },
  { emotion: EMOTION.SLEEPY, keywords: ['困', '累', '想睡觉', '晚安', 'sleep', 'tired'], weight: 0.85 },
];

/**
 * 将管道情感类型转换为共享情感类型
 * 用于与 UI / Live2D 层互操作
 */
export function toSharedEmotionType(type: EmotionType): SharedEmotionType {
  const mapping: Record<EmotionType, SharedEmotionType> = {
    [EMOTION.NEUTRAL]: 'neutral',
    [EMOTION.HAPPY]: 'happy',
    [EMOTION.EXCITED]: 'happy',
    [EMOTION.SAD]: 'sad',
    [EMOTION.ANGRY]: 'angry',
    [EMOTION.ANXIOUS]: 'neutral',
    [EMOTION.SURPRISED]: 'surprised',
    [EMOTION.FEARFUL]: 'fearful',
    [EMOTION.DISGUSTED]: 'disgusted',
    [EMOTION.THOUGHTFUL]: 'focused',
    [EMOTION.SLEEPY]: 'sleepy',
    [EMOTION.SEXY]: 'comforting',
    [EMOTION.CURIOUS]: 'curious',
    [EMOTION.PROUD]: 'proud',
    [EMOTION.SHY]: 'shy',
  };
  return mapping[type] ?? 'neutral';
}

/**
 * 将管道情感状态转换为共享情感状态
 * 用于传递给 UI 渲染层
 */
export function toSharedEmotionState(state: EmotionState): SharedEmotionState {
  return {
    type: toSharedEmotionType(state.emotion),
    intensity: state.confidence,
    duration: 0,
    isTransitioning: false,
    updatedAt: state.timestamp,
  };
}

/**
 * EmotionPipeline 类
 * 情感计算管道，实现 L0 关键词粗判 → L1 细判 → 响应映射
 */
export class EmotionPipeline {
  /** 当前情感状态 */
  private currentEmotion: EmotionState;
  /** 情感历史记录 */
  private emotionHistory: EmotionState[];
  /** 历史最大条数 */
  private readonly maxHistory: number;

  /**
   * 构造函数
   * @param maxHistory 历史记录最大条数
   */
  constructor(maxHistory: number = 50) {
    this.currentEmotion = {
      emotion: EMOTION.NEUTRAL,
      intensity: EMOTION_INTENSITY.MEDIUM,
      confidence: 0,
      timestamp: Date.now(),
    };
    this.emotionHistory = [];
    this.maxHistory = maxHistory;
  }

  /**
   * 分析用户输入情感
   * @param input 用户输入文本
   * @returns 情感状态
   */
  analyze(input: string): EmotionState {
    const l0Result = this.l0CoarseAnalysis(input);

    if (l0Result.confidence > 0.7) {
      return this.updateEmotion(l0Result);
    }

    return this.currentEmotion;
  }

  /**
   * L0 关键词粗判
   * 基于关键词匹配与权重计算情感得分
   * @param input 用户输入文本
   * @returns 情感状态
   */
  private l0CoarseAnalysis(input: string): EmotionState {
    const lower = input.toLowerCase();
    let bestMatch: { emotion: EmotionType; score: number } | null = null;

    for (const rule of L0_RULES) {
      let matchCount = 0;
      for (const keyword of rule.keywords) {
        if (lower.includes(keyword.toLowerCase())) {
          matchCount++;
        }
      }

      if (matchCount > 0) {
        const score = (matchCount / rule.keywords.length) * rule.weight;
        if (bestMatch === null || score > bestMatch.score) {
          bestMatch = { emotion: rule.emotion, score };
        }
      }
    }

    if (bestMatch !== null) {
      return {
        emotion: bestMatch.emotion,
        intensity: this.scoreToIntensity(bestMatch.score),
        confidence: bestMatch.score,
        timestamp: Date.now(),
      };
    }

    return {
      emotion: EMOTION.NEUTRAL,
      intensity: EMOTION_INTENSITY.LOW,
      confidence: 0.1,
      timestamp: Date.now(),
    };
  }

  /**
   * 分数转强度
   * @param score 情感得分（0.0 ~ 1.0）
   * @returns 情感强度
   */
  private scoreToIntensity(score: number): EmotionIntensity {
    if (score >= 0.8) return EMOTION_INTENSITY.HIGH;
    if (score >= 0.5) return EMOTION_INTENSITY.MEDIUM;
    return EMOTION_INTENSITY.LOW;
  }

  /**
   * 更新当前情感状态
   * @param state 新情感状态
   * @returns 应用的情感状态
   */
  private updateEmotion(state: EmotionState): EmotionState {
    this.emotionHistory.push(this.currentEmotion);
    if (this.emotionHistory.length > this.maxHistory) {
      this.emotionHistory.shift();
    }

    this.currentEmotion = state;
    return state;
  }

  /**
   * 获取当前情感状态
   * @returns 当前情感状态
   */
  getCurrentEmotion(): EmotionState {
    return this.currentEmotion;
  }

  /**
   * 获取情感历史
   * @returns 情感历史记录副本
   */
  getHistory(): EmotionState[] {
    return [...this.emotionHistory];
  }

  /**
   * 获取 TTS 参数
   * @param emotion 情感类型（可选，默认使用当前情感）
   * @param intensity 情感强度（可选，默认使用当前强度）
   * @returns TTS 参数
   */
  getTtsParams(emotion?: EmotionType, intensity?: EmotionIntensity): TtsParams {
    const targetEmotion = emotion ?? this.currentEmotion.emotion;
    const targetIntensity = intensity ?? this.currentEmotion.intensity;
    const baseTts = EMOTION_TTS_MAP[targetEmotion] ?? DEFAULT_TTS;

    const intensityMultiplier =
      targetIntensity === EMOTION_INTENSITY.HIGH
        ? 1.2
        : targetIntensity === EMOTION_INTENSITY.MEDIUM
          ? 1.0
          : 0.85;

    return {
      rate: Math.round(baseTts.rate * intensityMultiplier * 100) / 100,
      volume: Math.round(baseTts.volume * intensityMultiplier * 100) / 100,
      pitch: Math.round(baseTts.pitch * intensityMultiplier),
    };
  }

  /**
   * 获取文本风格配置
   * @param emotion 情感类型（可选，默认使用当前情感）
   * @returns 文本风格配置
   */
  getStyle(emotion?: EmotionType): StyleConfig {
    const targetEmotion = emotion ?? this.currentEmotion.emotion;
    return EMOTION_STYLE_MAP[targetEmotion] ?? EMOTION_STYLE_MAP[EMOTION.NEUTRAL];
  }

  /**
   * 应用风格到文本
   * 根据情感风格自动添加前缀、控制感叹号数量、附加表情
   * @param text 原始文本
   * @param emotion 情感类型（可选，默认使用当前情感）
   * @returns 风格化文本
   */
  applyStyle(text: string, emotion?: EmotionType): string {
    const style = this.getStyle(emotion);
    let result = text;

    if (Math.random() < 0.3 && style.prefix.length > 0) {
      const prefix = style.prefix[Math.floor(Math.random() * style.prefix.length)];
      result = `${prefix} ${result}`;
    }

    const exclamationCount = (result.match(/[！!]/g) ?? []).length;
    if (exclamationCount > style.maxExclamation) {
      result = result.replace(/[！!]/g, '').trim();
      if (style.maxExclamation > 0) {
        result = result + '！'.repeat(Math.min(exclamationCount, style.maxExclamation));
      }
    }

    if (style.emoji && Math.random() < 0.2) {
      result = `${result} ${style.emoji}`;
    }

    return result;
  }

  /**
   * 重置情感状态
   */
  reset(): void {
    this.currentEmotion = {
      emotion: EMOTION.NEUTRAL,
      intensity: EMOTION_INTENSITY.MEDIUM,
      confidence: 0,
      timestamp: Date.now(),
    };
    this.emotionHistory = [];
  }
}