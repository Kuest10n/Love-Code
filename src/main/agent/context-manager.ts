/**
 * 上下文管理器
 * 实现双水位压缩机制：软水位触发异步压缩，硬水位强制截断
 * 硬上限 4096 tokens，软水位 70%（2867），硬水位 95%（3891）
 */

/** 上下文水位 */
export const CONTEXT_LEVEL = {
  /** 初始状态，无需压缩 */
  NORMAL: 'normal',
  /** 软水位，触发异步压缩 */
  SOFT_LIMIT: 'soft-limit',
  /** 硬水位，强制截断 */
  HARD_LIMIT: 'hard-limit',
} as const;

export type ContextLevel = (typeof CONTEXT_LEVEL)[keyof typeof CONTEXT_LEVEL];

/** 预算配置 */
export interface BudgetConfig {
  /** 硬上限 token 数 */
  hardLimit: number;
  /** 软水位比例（0-1） */
  softRatio: number;
  /** 硬水位比例（0-1） */
  hardRatio: number;
}

/** 上下文消息 */
export interface ContextMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** 估算 token 数 */
  tokenEstimate: number;
  timestamp: number;
}

/** 压缩结果 */
export interface CompressionResult {
  /** 压缩后的消息列表 */
  messages: ContextMessage[];
  /** 压缩摘要（可选） */
  summary?: string;
  /** 节省的 token 数 */
  savedTokens: number;
  /** 压缩耗时（毫秒） */
  latencyMs: number;
}

/** 默认预算配置 */
const DEFAULT_BUDGET: BudgetConfig = {
  hardLimit: 4096,
  softRatio: 0.7,
  hardRatio: 0.95,
};

/**
 * ContextManager 类
 * 管理会话历史、预算检查、压缩触发
 */
export class ContextManager {
  private config: BudgetConfig;
  private messages: ContextMessage[];

  constructor(config: Partial<BudgetConfig> = {}) {
    this.config = { ...DEFAULT_BUDGET, ...config };
    this.messages = [];
  }

  /**
   * 获取当前软水位 token 数
   */
  get softLimit(): number {
    return Math.floor(this.config.hardLimit * this.config.softRatio);
  }

  /**
   * 获取当前硬水位 token 数
   */
  get hardLimit(): number {
    return Math.floor(this.config.hardLimit * this.config.hardRatio);
  }

  /**
   * 获取当前总 token 数
   */
  getTotalTokens(): number {
    return this.messages.reduce((sum, msg) => sum + msg.tokenEstimate, 0);
  }

  /**
   * 添加消息
   * @returns 当前水位级别
   */
  addMessage(role: ContextMessage['role'], content: string): ContextLevel {
    const estimated = this.estimateTokens(content);
    const message: ContextMessage = {
      id: crypto.randomUUID(),
      role,
      content,
      tokenEstimate: estimated,
      timestamp: Date.now(),
    };

    this.messages.push(message);
    return this.checkLevel();
  }

  /**
   * 添加预设消息（带 token 估算）
   */
  addRawMessage(message: ContextMessage): ContextLevel {
    this.messages.push(message);
    return this.checkLevel();
  }

  /**
   * 获取所有消息
   */
  getMessages(): ContextMessage[] {
    return [...this.messages];
  }

  /**
   * 获取 API 格式消息（不含 tokenEstimate）
   */
  getApiMessages(): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
    return this.messages.map(({ role, content }) => ({ role, content }));
  }

  /**
   * 清空消息
   */
  clear(): void {
    this.messages = [];
  }

  /**
   * 检查水位（公开接口）
   */
  getLevel(): ContextLevel {
    return this.checkLevel();
  }

  /**
   * 检查水位（内部实现）
   */
  private checkLevel(): ContextLevel {
    const total = this.getTotalTokens();

    if (total >= this.hardLimit) {
      return CONTEXT_LEVEL.HARD_LIMIT;
    }
    if (total >= this.softLimit) {
      return CONTEXT_LEVEL.SOFT_LIMIT;
    }
    return CONTEXT_LEVEL.NORMAL;
  }

  /**
   * 异步压缩（软水位触发）
   * 保留最近 4 轮对话，其余压缩为摘要
   */
  async compress(): Promise<CompressionResult> {
    const startTime = performance.now();
    const currentTotal = this.getTotalTokens();

    const recentCount = 8;
    const oldMessages = this.messages.slice(0, -recentCount);
    const recentMessages = this.messages.slice(-recentCount);

    if (oldMessages.length === 0) {
      return {
        messages: [...this.messages],
        savedTokens: 0,
        latencyMs: performance.now() - startTime,
      };
    }

    const summary = this.generateSummary(oldMessages);

    const summaryMessage: ContextMessage = {
      id: crypto.randomUUID(),
      role: 'system',
      content: `[历史摘要] ${summary}`,
      tokenEstimate: this.estimateTokens(summary),
      timestamp: Date.now(),
    };

    this.messages = [summaryMessage, ...recentMessages];
    const newTotal = this.getTotalTokens();

    return {
      messages: [...this.messages],
      summary,
      savedTokens: currentTotal - newTotal,
      latencyMs: performance.now() - startTime,
    };
  }

  /**
   * 强制截断（硬水位触发）
   * 只保留最近 2 条用户消息和对应的助手回复
   */
  forceTruncate(): CompressionResult {
    const startTime = performance.now();
    const currentTotal = this.getTotalTokens();

    let lastUserIndex = -1;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex >= 0) {
      this.messages = this.messages.slice(lastUserIndex);
    }

    while (this.getTotalTokens() > this.softLimit && this.messages.length > 2) {
      this.messages.shift();
    }

    const newTotal = this.getTotalTokens();

    return {
      messages: [...this.messages],
      savedTokens: currentTotal - newTotal,
      latencyMs: performance.now() - startTime,
    };
  }

  /**
   * 生成历史摘要
   */
  private generateSummary(messages: ContextMessage[]): string {
    const parts: string[] = [];
    for (const msg of messages) {
      const prefix = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? '助手' : '系统';
      parts.push(`${prefix}：${msg.content.slice(0, 100)}`);
    }
    return parts.join('；');
  }

  /**
   * 估算 token 数
   * 近似算法：中文按 1.5 token/字，英文按 0.25 token/字
   */
  estimateTokens(text: string): number {
    let count = 0;
    for (const char of text) {
      if (/[\u4e00-\u9fff]/.test(char)) {
        count += 1.5;
      } else {
        count += 0.25;
      }
    }
    return Math.ceil(count);
  }
}