/**
 * 主动内驱引擎
 * 实现三级心跳机制与欲望累积，使 AI 具备主动发起对话的能力
 * 核心规则：克制、适度、以用户意愿为尊
 */

/** 心跳级别 */
export const HEARTBEAT_LEVEL = {
  /** 高频心跳：60秒一次，检测用户状态 */
  HIGH: 'high',
  /** 中频心跳：1小时一次，生成内驱想法 */
  MEDIUM: 'medium',
  /** 低频心跳：24小时一次，进行日常关怀 */
  LOW: 'low',
} as const;

export type HeartbeatLevel = (typeof HEARTBEAT_LEVEL)[keyof typeof HEARTBEAT_LEVEL];

/** 引擎状态 */
export const ACTIVE_ENGINE_STATUS = {
  /** 未启动 */
  IDLE: 'idle',
  /** 运行中 */
  RUNNING: 'running',
  /** 已暂停 */
  PAUSED: 'paused',
} as const;

export type ActiveEngineStatus = (typeof ACTIVE_ENGINE_STATUS)[keyof typeof ACTIVE_ENGINE_STATUS];

/** 用户活动状态 */
export const USER_ACTIVITY = {
  /** 用户活跃交互中 */
  ACTIVE: 'active',
  /** 用户空闲（超过5分钟无交互） */
  IDLE: 'idle',
  /** 用户离线（窗口失焦） */
  OFFLINE: 'offline',
  /** 用户正在游戏/专注模式 */
  FOCUSED: 'focused',
} as const;

export type UserActivity = (typeof USER_ACTIVITY)[keyof typeof USER_ACTIVITY];

/** 内驱想法类型 */
export const DESIRE_TYPE = {
  /** 关怀型：问候、提醒、关心 */
  CARE: 'care',
  /** 分享型：有趣的事、发现 */
  SHARE: 'share',
  /** 建议型：主动提供帮助 */
  SUGGEST: 'suggest',
  /** 提醒型：时间、日程提醒 */
  REMIND: 'remind',
  /** 闲聊型：轻松话题 */
  CHAT: 'chat',
} as const;

export type DesireType = (typeof DESIRE_TYPE)[keyof typeof DESIRE_TYPE];

/** 内驱想法 */
export interface DesireThought {
  /** 想法类型 */
  type: DesireType;
  /** 想法内容 */
  content: string;
  /** 欲望值（0.0 ~ 1.0） */
  desire: number;
  /** 生成时间戳 */
  createdAt: number;
  /** 过期时间戳 */
  expiresAt: number;
}

/** 心跳配置 */
interface HeartbeatConfig {
  /** 心跳间隔（毫秒） */
  interval: number;
  /** 上次执行时间戳 */
  lastExecuted: number;
}

/** 引擎配置 */
export interface ActiveEngineConfig {
  /** 高频心跳间隔（毫秒） */
  highInterval: number;
  /** 中频心跳间隔（毫秒） */
  mediumInterval: number;
  /** 低频心跳间隔（毫秒） */
  lowInterval: number;
  /** 用户空闲判定时间（毫秒） */
  idleThreshold: number;
  /** 欲望累积速率 */
  desireAccumulationRate: number;
  /** 欲望释放阈值 */
  desireThreshold: number;
  /** 连续未响应抑制次数 */
  suppressionThreshold: number;
}

/** 默认配置 */
const DEFAULT_CONFIG: ActiveEngineConfig = {
  highInterval: 60_000, // 60秒
  mediumInterval: 60 * 60_000, // 1小时
  lowInterval: 24 * 60 * 60_000, // 24小时
  idleThreshold: 5 * 60_000, // 5分钟
  desireAccumulationRate: 0.01,
  desireThreshold: 0.7,
  suppressionThreshold: 3,
};

/** 主动引擎事件类型 */
export const ACTIVE_EVENT = {
  /** 心跳执行 */
  HEARTBEAT: 'heartbeat',
  /** 想法生成 */
  THOUGHT_GENERATED: 'thought-generated',
  /** 欲望释放 */
  DESIRE_RELEASED: 'desire-released',
  /** 状态变更 */
  STATUS_CHANGED: 'status-changed',
  /** 用户活动变更 */
  ACTIVITY_CHANGED: 'activity-changed',
} as const;

export type ActiveEvent = (typeof ACTIVE_EVENT)[keyof typeof ACTIVE_EVENT];

/** 事件回调 */
export type ActiveEventListener = (event: ActiveEvent, data: unknown) => void;

/**
 * ActiveEngine 类
 * 主动内驱引擎，让 AI 具备主动关怀能力
 */
export class ActiveEngine {
  private config: ActiveEngineConfig;
  private status: ActiveEngineStatus;
  private heartbeats: Map<HeartbeatLevel, HeartbeatConfig>;
  private desires: DesireThought[];
  private currentDesire: number;
  private suppressedCount: number;
  private lastUserInteraction: number;
  private userActivity: UserActivity;
  private timers: Map<HeartbeatLevel, NodeJS.Timeout>;
  private listeners: Set<ActiveEventListener>;

  constructor(config: Partial<ActiveEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.status = ACTIVE_ENGINE_STATUS.IDLE;
    this.heartbeats = new Map();
    this.desires = [];
    this.currentDesire = 0;
    this.suppressedCount = 0;
    this.lastUserInteraction = Date.now();
    this.userActivity = USER_ACTIVITY.ACTIVE;
    this.timers = new Map();
    this.listeners = new Set();

    this.initHeartbeats();
  }

  /**
   * 添加事件监听器
   */
  addListener(callback: ActiveEventListener): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * 发射事件
   */
  private emit(event: ActiveEvent, data: unknown): void {
    for (const listener of this.listeners) {
      try {
        listener(event, data);
      } catch (error) {
        console.error('[ActiveEngine] Listener error:', error);
      }
    }
  }

  /**
   * 初始化心跳配置
   */
  private initHeartbeats(): void {
    const now = Date.now();
    this.heartbeats.set(HEARTBEAT_LEVEL.HIGH, {
      interval: this.config.highInterval,
      lastExecuted: now,
    });
    this.heartbeats.set(HEARTBEAT_LEVEL.MEDIUM, {
      interval: this.config.mediumInterval,
      lastExecuted: now,
    });
    this.heartbeats.set(HEARTBEAT_LEVEL.LOW, {
      interval: this.config.lowInterval,
      lastExecuted: now,
    });
  }

  /**
   * 启动引擎
   */
  start(): void {
    if (this.status === ACTIVE_ENGINE_STATUS.RUNNING) return;

    this.status = ACTIVE_ENGINE_STATUS.RUNNING;
    this.startHeartbeat(HEARTBEAT_LEVEL.HIGH, this.config.highInterval);
    this.startHeartbeat(HEARTBEAT_LEVEL.MEDIUM, this.config.mediumInterval);
    this.startHeartbeat(HEARTBEAT_LEVEL.LOW, this.config.lowInterval);
    this.emit(ACTIVE_EVENT.STATUS_CHANGED, { status: this.status });
  }

  /**
   * 暂停引擎
   */
  pause(): void {
    if (this.status !== ACTIVE_ENGINE_STATUS.RUNNING) return;

    this.status = ACTIVE_ENGINE_STATUS.PAUSED;
    this.stopAllHeartbeats();
    this.emit(ACTIVE_EVENT.STATUS_CHANGED, { status: this.status });
  }

  /**
   * 恢复引擎
   */
  resume(): void {
    if (this.status !== ACTIVE_ENGINE_STATUS.PAUSED) return;
    this.start();
  }

  /**
   * 停止引擎
   */
  stop(): void {
    this.status = ACTIVE_ENGINE_STATUS.IDLE;
    this.stopAllHeartbeats();
    this.emit(ACTIVE_EVENT.STATUS_CHANGED, { status: this.status });
  }

  /**
   * 获取引擎状态
   */
  getStatus(): ActiveEngineStatus {
    return this.status;
  }

  /**
   * 获取用户活动状态
   */
  getUserActivity(): UserActivity {
    return this.userActivity;
  }

  /**
   * 获取当前欲望值
   */
  getCurrentDesire(): number {
    return this.currentDesire;
  }

  /**
   * 获取待释放的想法列表
   */
  getPendingDesires(): DesireThought[] {
    return this.desires.filter((d) => d.expiresAt > Date.now());
  }

  /**
   * 记录用户交互
   */
  recordUserInteraction(): void {
    this.lastUserInteraction = Date.now();
    this.userActivity = USER_ACTIVITY.ACTIVE;
    this.suppressedCount = 0;
    this.currentDesire = Math.max(0, this.currentDesire - 0.3);
  }

  /**
   * 设置用户活动状态
   */
  setUserActivity(activity: UserActivity): void {
    const oldActivity = this.userActivity;
    this.userActivity = activity;
    if (activity === USER_ACTIVITY.ACTIVE) {
      this.suppressedCount = 0;
    }
    if (oldActivity !== activity) {
      this.emit(ACTIVE_EVENT.ACTIVITY_CHANGED, { from: oldActivity, to: activity });
    }
  }

  /**
   * 检查并执行心跳
   */
  private executeHeartbeat(level: HeartbeatLevel): void {
    const config = this.heartbeats.get(level);
    if (!config) return;

    const now = Date.now();
    if (now - config.lastExecuted < config.interval) return;

    config.lastExecuted = now;
    this.processHeartbeat(level);
  }

  /**
   * 处理心跳逻辑
   */
  private processHeartbeat(level: HeartbeatLevel): void {
    this.updateUserActivity();
    this.emit(ACTIVE_EVENT.HEARTBEAT, { level, desire: this.currentDesire });

    switch (level) {
      case HEARTBEAT_LEVEL.HIGH:
        this.processHighHeartbeat();
        break;
      case HEARTBEAT_LEVEL.MEDIUM:
        this.processMediumHeartbeat();
        break;
      case HEARTBEAT_LEVEL.LOW:
        this.processLowHeartbeat();
        break;
    }
  }

  /**
   * 高频心跳处理：检测用户状态
   */
  private processHighHeartbeat(): void {
    // 如果用户在专注模式，降低活跃度判定
    if (this.userActivity === USER_ACTIVITY.FOCUSED) {
      return;
    }
  }

  /**
   * 中频心跳处理：生成内驱想法
   */
  private processMediumHeartbeat(): void {
    if (this.userActivity === USER_ACTIVITY.ACTIVE) {
      return;
    }

    // 累积欲望
    this.accumulateDesire();

    // 检查是否达到释放阈值
    if (this.currentDesire >= this.config.desireThreshold) {
      this.triggerDesireRelease();
    }
  }

  /**
   * 低频心跳处理：日常关怀
   */
  private processLowHeartbeat(): void {
    const now = Date.now();
    const hour = new Date(now).getHours();

    // 只在合适时段进行关怀（早8点到晚22点）
    if (hour < 8 || hour > 22) {
      return;
    }

    // 生成日常关怀想法
    const careThought = this.generateCareThought();
    if (careThought) {
      this.desires.push(careThought);
    }
  }

  /**
   * 更新用户活动状态
   */
  private updateUserActivity(): void {
    const now = Date.now();
    const elapsed = now - this.lastUserInteraction;

    if (this.userActivity === USER_ACTIVITY.OFFLINE) {
      return;
    }

    if (elapsed >= this.config.idleThreshold * 6) {
      this.userActivity = USER_ACTIVITY.OFFLINE;
    } else if (elapsed >= this.config.idleThreshold) {
      this.userActivity = USER_ACTIVITY.IDLE;
    }
  }

  /**
   * 累积欲望值
   */
  private accumulateDesire(): void {
    if (this.userActivity === USER_ACTIVITY.ACTIVE) {
      return;
    }

    // 连续未响应时加速累积
    const acceleratedRate = this.suppressedCount >= this.config.suppressionThreshold
      ? this.config.desireAccumulationRate * 2
      : this.config.desireAccumulationRate;

    this.currentDesire = Math.min(1.0, this.currentDesire + acceleratedRate);
  }

  /**
   * 触发欲望释放
   */
  private triggerDesireRelease(): void {
    if (this.suppressedCount >= this.config.suppressionThreshold) {
      return;
    }

    // 生成内驱想法
    const thought = this.generateDesireThought();
    if (thought) {
      this.desires.push(thought);
      this.currentDesire = 0;
      this.emit(ACTIVE_EVENT.DESIRE_RELEASED, thought);
      this.emit(ACTIVE_EVENT.THOUGHT_GENERATED, thought);
    }
  }

  /**
   * 生成内驱想法
   */
  private generateDesireThought(): DesireThought | null {
    const types: DesireType[] = [DESIRE_TYPE.CARE, DESIRE_TYPE.SHARE, DESIRE_TYPE.CHAT];
    const type = types[Math.floor(Math.random() * types.length)];

    const content = this.getTemplateContent(type);
    if (!content) return null;

    return {
      type,
      content,
      desire: this.currentDesire,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 60_000, // 30分钟后过期
    };
  }

  /**
   * 生成关怀想法
   */
  private generateCareThought(): DesireThought | null {
    const hour = new Date().getHours();
    let content = '';

    if (hour >= 12 && hour < 14) {
      content = '该吃午饭了，别忘了好好吃饭哦～';
    } else if (hour >= 17 && hour < 19) {
      content = '快到晚饭时间了，今天过得怎么样？';
    } else if (hour >= 22 || hour < 2) {
      content = '时间不早了，早点休息对身体好～';
    } else if (hour >= 8 && hour < 10) {
      content = '早上好，今天有什么计划吗？';
    } else {
      const templates = ['在忙什么呢？需要帮忙吗？', '休息一下吧，别太辛苦了～', '我在呢，有什么想聊的吗？'];
      content = templates[Math.floor(Math.random() * templates.length)];
    }

    return {
      type: DESIRE_TYPE.CARE,
      content,
      desire: 0.6,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60 * 60_000, // 1小时后过期
    };
  }

  /**
   * 获取模板内容
   */
  private getTemplateContent(type: DesireType): string {
    const templates: Record<DesireType, string[]> = {
      [DESIRE_TYPE.CARE]: ['我在呢，有什么想聊的吗？', '休息一下吧，喝口水～', '需要帮忙吗？'],
      [DESIRE_TYPE.SHARE]: ['发现了一个有趣的事情，想和你分享～', '有个想法想听听你的意见'],
      [DESIRE_TYPE.SUGGEST]: ['需要帮忙做什么吗？', '我可以帮你处理一些事情'],
      [DESIRE_TYPE.REMIND]: ['时间过得好快呀', '今天有什么安排吗？'],
      [DESIRE_TYPE.CHAT]: ['在做什么呢？', '聊聊吧，放松一下～'],
    };

    const list = templates[type];
    return list[Math.floor(Math.random() * list.length)];
  }

  /**
   * 启动单个心跳定时器
   */
  private startHeartbeat(level: HeartbeatLevel, interval: number): void {
    const timer = setInterval(() => {
      if (this.status !== ACTIVE_ENGINE_STATUS.RUNNING) return;
      this.executeHeartbeat(level);
    }, interval);

    this.timers.set(level, timer);
  }

  /**
   * 停止所有心跳定时器
   */
  private stopAllHeartbeats(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
  }

  /**
   * 标记想法已传递
   */
  markDelivered(thoughtId: string): void {
    const index = this.desires.findIndex((d) => d.content === thoughtId);
    if (index >= 0) {
      this.desires.splice(index, 1);
    }
  }

  /**
   * 标记想法被忽略
   */
  markIgnored(): void {
    this.suppressedCount++;
    this.currentDesire = Math.min(1.0, this.currentDesire + 0.1);
  }

  /**
   * 清理过期想法
   */
  cleanupExpired(): void {
    const now = Date.now();
    this.desires = this.desires.filter((d) => d.expiresAt > now);
  }
}
