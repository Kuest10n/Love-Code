/**
 * ModelPool 模型池
 * 管理 L1（轻量）和 L2（重量）模型的分时复用
 * L1 常驻，L2 按需加载，闲置自动回退
 */

/** 模型层级 */
export const MODEL_TIER = {
  L0: 'L0',
  L1: 'L1',
  L2: 'L2',
} as const;

export type ModelTier = (typeof MODEL_TIER)[keyof typeof MODEL_TIER];

/** 模型状态 */
export const MODEL_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  UNLOADED: 'unloaded',
} as const;

export type ModelStatus = (typeof MODEL_STATUS)[keyof typeof MODEL_STATUS];

/** 模型信息 */
export interface ModelInfo {
  /** 模型层级 */
  tier: ModelTier;
  /** 模型名称 */
  name: string;
  /** 当前状态 */
  status: ModelStatus;
  /** 最后使用时间戳 */
  lastUsedAt: number;
}

/** 模型事件回调 */
export type ModelEventCallback = (info: ModelInfo) => void;

/** 兜底话术（模型切换期间使用） */
const FALLBACK_RESPONSES = [
  '稍等一下，我正在调整状态...',
  '让我准备一下，马上就好～',
  '嗯，这个问题我需要稍微思考一下。',
];

/**
 * ModelPool 类
 * 管理模型的加载、卸载和切换
 */
export class ModelPool {
  private models: Map<ModelTier, ModelInfo>;
  private listeners: Set<ModelEventCallback>;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly idleTimeout: number;

  constructor(l1Model: string, l2Model: string, idleTimeoutMs: number = 5 * 60 * 1000) {
    this.models = new Map();
    this.listeners = new Set();
    this.idleTimeout = idleTimeoutMs;

    this.models.set(MODEL_TIER.L1, {
      tier: MODEL_TIER.L1,
      name: l1Model,
      status: MODEL_STATUS.READY,
      lastUsedAt: Date.now(),
    });

    this.models.set(MODEL_TIER.L2, {
      tier: MODEL_TIER.L2,
      name: l2Model,
      status: MODEL_STATUS.UNLOADED,
      lastUsedAt: 0,
    });
  }

  /**
   * 添加事件监听器
   */
  addListener(callback: ModelEventCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * 获取模型信息
   */
  getModelInfo(tier: ModelTier): ModelInfo | undefined {
    return this.models.get(tier);
  }

  /**
   * 获取当前活跃的模型层级
   */
  getActiveTier(): ModelTier {
    const l2 = this.models.get(MODEL_TIER.L2);
    if (l2 && l2.status === MODEL_STATUS.READY) {
      return MODEL_TIER.L2;
    }
    return MODEL_TIER.L1;
  }

  /**
   * 请求升级到 L2
   */
  async upgradeToL2(): Promise<void> {
    const l2 = this.models.get(MODEL_TIER.L2);
    if (!l2) return;

    if (l2.status === MODEL_STATUS.READY) {
      this.touchModel(MODEL_TIER.L2);
      return;
    }

    this.updateModelStatus(MODEL_TIER.L2, MODEL_STATUS.LOADING);
    this.notifyListeners();

    await new Promise((resolve) => setTimeout(resolve, 15000));

    this.updateModelStatus(MODEL_TIER.L2, MODEL_STATUS.READY);
    this.touchModel(MODEL_TIER.L2);
    this.notifyListeners();
  }

  /**
   * 回退到 L1
   */
  async downgradeToL1(): Promise<void> {
    const l2 = this.models.get(MODEL_TIER.L2);
    if (!l2 || l2.status !== MODEL_STATUS.READY) return;

    this.updateModelStatus(MODEL_TIER.L2, MODEL_STATUS.LOADING);
    this.notifyListeners();

    await new Promise((resolve) => setTimeout(resolve, 2000));

    this.updateModelStatus(MODEL_TIER.L2, MODEL_STATUS.UNLOADED);
    this.notifyListeners();
  }

  /**
   * 使用模型后刷新最后使用时间
   */
  touchModel(tier: ModelTier): void {
    const model = this.models.get(tier);
    if (model) {
      model.lastUsedAt = Date.now();
      this.checkIdleTimeout();
    }
  }

  /**
   * 检查 L2 闲置超时
   */
  private checkIdleTimeout(): void {
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
    }

    const l2 = this.models.get(MODEL_TIER.L2);
    if (l2 && l2.status === MODEL_STATUS.READY) {
      this.fallbackTimer = setTimeout(() => {
        void this.downgradeToL1();
      }, this.idleTimeout);
    }
  }

  /**
   * 获取兜底响应（模型切换期间使用）
   */
  getFallbackResponse(): string {
    const index = Math.floor(Math.random() * FALLBACK_RESPONSES.length);
    return FALLBACK_RESPONSES[index];
  }

  /**
   * 更新模型状态
   */
  private updateModelStatus(tier: ModelTier, status: ModelStatus): void {
    const model = this.models.get(tier);
    if (model) {
      model.status = status;
    }
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(): void {
    for (const model of this.models.values()) {
      for (const listener of this.listeners) {
        try {
          listener(model);
        } catch (error) {
          console.error('[ModelPool] Listener error:', error);
        }
      }
    }
  }
}