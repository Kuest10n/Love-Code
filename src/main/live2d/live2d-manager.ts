/**
 * Live2D 管理器
 * 实现 Cubism 4.0 模型管理、动作映射与情感驱动的行为控制
 * 主进程负责决策，渲染层负责执行
 */

import { createHash } from 'node:crypto';

export interface Live2DModelConfig {
  id: string;
  name: string;
  modelPath: string;
  texturesPath: string;
  motionsPath: string;
  expressionsPath: string;
  isDefault: boolean;
}

export const LIVE2D_MOTION_GROUP = {
  IDLE: 'Idle',
  TAP_HEAD: 'TapHead',
  Flick_Head: 'Flick_Head',
  Flick_Body: 'Flick_Body',
  Special: 'Special',
  Facial: 'Facial',
} as const;

export type Live2DMotionGroup = (typeof LIVE2D_MOTION_GROUP)[keyof typeof LIVE2D_MOTION_GROUP];

export const LIVE2D_EXPRESSION = {
  SMILE: 'Smile',
  PUZZLE: 'Puzzle',
  ANGRY: 'Angry',
  SLEEPY: 'Sleepy',
  HAPPY: 'Happy',
  SHY: 'Shy',
  SURPRISED: 'Surprised',
  NEUTRAL: 'Neutral',
} as const;

export type Live2DExpression = (typeof LIVE2D_EXPRESSION)[keyof typeof LIVE2D_EXPRESSION];

export interface MotionDecision {
  group: Live2DMotionGroup;
  index?: number;
  priority: number;
  probability: number;
  emotion?: string;
  reason: string;
}

export interface MouthSyncConfig {
  enabled: boolean;
  minOpen: number;
  maxOpen: number;
  responseSpeed: number;
}

interface MotionRule {
  pattern: RegExp;
  emotions: string[];
  decision: Omit<MotionDecision, 'reason'>;
  priority: number;
}

const DEFAULT_MOTION_RULES: MotionRule[] = [
  {
    pattern: /你好|在吗|hi|hello/i,
    emotions: ['neutral', 'happy'],
    decision: { group: LIVE2D_MOTION_GROUP.TAP_HEAD, priority: 80, probability: 1.0 },
    priority: 100,
  },
  {
    pattern: /谢谢|感谢|thanks|thank you/i,
    emotions: ['happy', 'grateful'],
    decision: { group: LIVE2D_MOTION_GROUP.Flick_Head, priority: 70, probability: 0.8 },
    priority: 90,
  },
  {
    pattern: /再见|拜拜|bye|goodbye/i,
    emotions: ['neutral', 'sad'],
    decision: { group: LIVE2D_MOTION_GROUP.Flick_Head, priority: 85, probability: 1.0 },
    priority: 85,
  },
  {
    pattern: /[?？]|为什么|怎么|什么/i,
    emotions: ['curious', 'thinking'],
    decision: { group: LIVE2D_MOTION_GROUP.Flick_Head, priority: 50, probability: 0.5 },
    priority: 60,
  },
  {
    pattern: /开心|高兴|快乐|喜欢|棒|哈哈/i,
    emotions: ['happy', 'excited'],
    decision: { group: LIVE2D_MOTION_GROUP.Special, index: 1, priority: 75, probability: 0.9 },
    priority: 80,
  },
  {
    pattern: /难过|伤心|哭|失落|孤单/i,
    emotions: ['sad'],
    decision: { group: LIVE2D_MOTION_GROUP.Flick_Body, priority: 60, probability: 0.6 },
    priority: 70,
  },
  {
    pattern: /生气|愤怒|讨厌|烦/i,
    emotions: ['angry'],
    decision: { group: LIVE2D_MOTION_GROUP.Flick_Body, priority: 65, probability: 0.7 },
    priority: 75,
  },
  {
    pattern: /困|累|想睡觉|晚安/i,
    emotions: ['sleepy', 'tired'],
    decision: { group: LIVE2D_MOTION_GROUP.Special, index: 2, priority: 70, probability: 0.85 },
    priority: 65,
  },
];

const EMOTION_EXPRESSION_MAP: Record<string, Live2DExpression> = {
  neutral: LIVE2D_EXPRESSION.NEUTRAL,
  happy: LIVE2D_EXPRESSION.HAPPY,
  excited: LIVE2D_EXPRESSION.HAPPY,
  sad: LIVE2D_EXPRESSION.SHY,
  angry: LIVE2D_EXPRESSION.ANGRY,
  anxious: LIVE2D_EXPRESSION.PUZZLE,
  surprised: LIVE2D_EXPRESSION.SURPRISED,
  fearful: LIVE2D_EXPRESSION.SHY,
  disgusted: LIVE2D_EXPRESSION.ANGRY,
  thoughtful: LIVE2D_EXPRESSION.PUZZLE,
  sleepy: LIVE2D_EXPRESSION.SLEEPY,
  curious: LIVE2D_EXPRESSION.PUZZLE,
  proud: LIVE2D_EXPRESSION.HAPPY,
  shy: LIVE2D_EXPRESSION.SHY,
};

const DEFAULT_MODELS: Live2DModelConfig[] = [
  {
    id: 'default',
    name: 'Hiyori',
    modelPath: 'models/Hiyori/Hiyori.model3.json',
    texturesPath: 'models/Hiyori/textures',
    motionsPath: 'models/Hiyori/motions',
    expressionsPath: 'models/Hiyori/expressions',
    isDefault: true,
  },
];

export class Live2DManager {
  private models: Map<string, Live2DModelConfig>;
  private activeModelId: string | null;
  private motionRules: MotionRule[];
  private mouthSyncConfig: MouthSyncConfig;
  private motionHistory: Array<{ decision: MotionDecision; timestamp: number }>;
  private expressionHistory: Array<{ expression: Live2DExpression; timestamp: number }>;

  constructor() {
    this.models = new Map();
    this.activeModelId = null;
    this.motionRules = [...DEFAULT_MOTION_RULES];
    this.mouthSyncConfig = {
      enabled: true,
      minOpen: 0.1,
      maxOpen: 0.8,
      responseSpeed: 0.15,
    };
    this.motionHistory = [];
    this.expressionHistory = [];

    for (const model of DEFAULT_MODELS) {
      this.registerModel(model);
    }

    const defaultModel = DEFAULT_MODELS.find((m) => m.isDefault);
    if (defaultModel) {
      this.activateModel(defaultModel.id);
    }
  }

  registerModel(config: Live2DModelConfig): void {
    this.models.set(config.id, config);
  }

  listModels(): Live2DModelConfig[] {
    return Array.from(this.models.values());
  }

  activateModel(modelId: string): boolean {
    if (!this.models.has(modelId)) {
      return false;
    }
    this.activeModelId = modelId;
    return true;
  }

  getActiveModel(): Live2DModelConfig | null {
    if (!this.activeModelId) return null;
    return this.models.get(this.activeModelId) ?? null;
  }

  addMotionRule(rule: MotionRule): void {
    this.motionRules.push(rule);
    this.motionRules.sort((a, b) => b.priority - a.priority);
  }

  decideMotion(text: string, emotion?: string): MotionDecision | null {
    let bestMatch: { rule: MotionRule; score: number } | null = null;

    for (const rule of this.motionRules) {
      if (rule.pattern.test(text)) {
        let score = rule.priority;
        if (emotion && rule.emotions.includes(emotion)) {
          score += 50;
        }
        if (bestMatch === null || score > bestMatch.score) {
          bestMatch = { rule, score };
        }
      }
    }

    if (bestMatch) {
      const { rule } = bestMatch;
      const shouldTrigger = Math.random() < rule.decision.probability;
      if (shouldTrigger) {
        const decision: MotionDecision = {
          ...rule.decision,
          emotion,
          reason: `规则匹配: ${rule.pattern.source}`,
        };
        this.recordMotion(decision);
        return decision;
      }
    }

    return this.getIdleMotion();
  }

  getIdleMotion(): MotionDecision {
    return {
      group: LIVE2D_MOTION_GROUP.IDLE,
      priority: 10,
      probability: 1.0,
      reason: '空闲待机',
    };
  }

  decideExpression(emotion: string): Live2DExpression {
    const expression = EMOTION_EXPRESSION_MAP[emotion] ?? LIVE2D_EXPRESSION.NEUTRAL;
    this.recordExpression(expression);
    return expression;
  }

  generateRenderCommand(text: string, emotion?: string): {
    motion: MotionDecision | null;
    expression: Live2DExpression;
    mouthSync: MouthSyncConfig;
  } {
    const motion = this.decideMotion(text, emotion);
    const expression = this.decideExpression(emotion ?? 'neutral');
    return {
      motion,
      expression,
      mouthSync: { ...this.mouthSyncConfig },
    };
  }

  updateMouthSync(config: Partial<MouthSyncConfig>): void {
    this.mouthSyncConfig = { ...this.mouthSyncConfig, ...config };
  }

  getMouthSyncConfig(): MouthSyncConfig {
    return { ...this.mouthSyncConfig };
  }

  private recordMotion(decision: MotionDecision): void {
    this.motionHistory.push({ decision, timestamp: Date.now() });
    if (this.motionHistory.length > 50) {
      this.motionHistory.shift();
    }
  }

  private recordExpression(expression: Live2DExpression): void {
    this.expressionHistory.push({ expression, timestamp: Date.now() });
    if (this.expressionHistory.length > 50) {
      this.expressionHistory.shift();
    }
  }

  getMotionHistory(): Array<{ decision: MotionDecision; timestamp: number }> {
    return [...this.motionHistory];
  }

  getExpressionHistory(): Array<{ expression: Live2DExpression; timestamp: number }> {
    return [...this.expressionHistory];
  }

  clearHistory(): void {
    this.motionHistory = [];
    this.expressionHistory = [];
  }

  getConfigHash(): string {
    const configString = JSON.stringify({
      models: Array.from(this.models.entries()),
      rules: this.motionRules.map((r) => r.pattern.source),
      mouthSync: this.mouthSyncConfig,
    });
    return createHash('sha256').update(configString).digest('hex').slice(0, 12);
  }
}
