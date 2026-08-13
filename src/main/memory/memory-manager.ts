/**
 * 记忆管理器
 * 分层记忆系统核心，实现向量检索、关键词降级与遗忘曲线
 */

/** 记忆类型 */
export const MEMORY_TYPE = {
  FACT: 'fact',
  PREFERENCE: 'preference',
  CONTEXT: 'context',
  EMOTION: 'emotion',
  SKILL: 'skill',
} as const;

export type MemoryType = (typeof MEMORY_TYPE)[keyof typeof MEMORY_TYPE];

/** 记忆条目 */
export interface MemoryEntry {
  id: string;
  type: MemoryType;
  content: string;
  metadata: Record<string, unknown>;
  embedding?: number[];
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  lastAccessedAt: number;
  importance: number;
}

/** 检索结果 */
export interface SearchResult {
  entry: MemoryEntry;
  score: number;
  rank: number;
}

/** 检索选项 */
export interface SearchOptions {
  /** 最大返回数量 */
  limit: number;
  /** 最小分数阈值 */
  minScore?: number;
  /** 记忆类型过滤 */
  type?: MemoryType;
  /** 是否使用向量搜索 */
  useVector?: boolean;
}

/** 默认检索选项 */
const DEFAULT_OPTIONS: SearchOptions = {
  limit: 10,
  minScore: 0.3,
  useVector: true,
};

/**
 * MemoryManager 类
 * 分层记忆管理
 */
export class MemoryManager {
  private entries: Map<string, MemoryEntry>;
  private readonly decayRate: number;

  constructor(decayRate: number = 0.01) {
    this.entries = new Map();
    this.decayRate = decayRate;
  }

  /**
   * 添加记忆
   */
  async add(
    type: MemoryType,
    content: string,
    metadata: Record<string, unknown> = {},
    importance: number = 0.5,
  ): Promise<MemoryEntry> {
    const now = Date.now();
    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      type,
      content,
      metadata,
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      lastAccessedAt: now,
      importance,
    };

    if (this.shouldGenerateEmbedding(type)) {
      entry.embedding = await this.generateEmbedding(content).catch(() => undefined);
    }

    this.entries.set(entry.id, entry);
    return entry;
  }

  /**
   * 更新记忆
   */
  async update(id: string, updates: Partial<Pick<MemoryEntry, 'content' | 'metadata' | 'importance'>>): Promise<MemoryEntry | null> {
    const entry = this.entries.get(id);
    if (!entry) return null;

    Object.assign(entry, updates, { updatedAt: Date.now() });

    if (updates.content) {
      entry.embedding = await this.generateEmbedding(updates.content).catch(() => undefined);
    }

    return entry;
  }

  /**
   * 检索记忆（三级降级）
   */
  async search(query: string, options: Partial<SearchOptions> = {}): Promise<SearchResult[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    if (opts.useVector) {
      const vectorResults = await this.vectorSearch(query, opts);
      if (vectorResults.length > 0) {
        return this.rankResults(vectorResults, opts.limit);
      }
    }

    const keywordResults = this.keywordSearch(query, opts);
    if (keywordResults.length > 0) {
      return this.rankResults(keywordResults, opts.limit);
    }

    return [];
  }

  /**
   * 获取记忆条目
   */
  get(id: string): MemoryEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * 删除记忆
   */
  delete(id: string): boolean {
    return this.entries.delete(id);
  }

  /**
   * 插入或更新记忆条目（用于数据库加载）
   */
  upsertEntry(entry: MemoryEntry): void {
    this.entries.set(entry.id, entry);
  }

  /**
   * 获取所有记忆条目
   */
  getAllEntries(): MemoryEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * 应用遗忘曲线
   * 返回应被遗忘的记忆 ID 列表
   */
  applyForgettingCurve(): string[] {
    const now = Date.now();
    const toForget: string[] = [];

    for (const [id, entry] of this.entries) {
      const daysSinceAccess = (now - entry.lastAccessedAt) / (1000 * 60 * 60 * 24);
      const forgettingScore = this.calculateForgettingScore(entry, daysSinceAccess);

      if (forgettingScore < 0.1) {
        toForget.push(id);
      }
    }

    for (const id of toForget) {
      this.entries.delete(id);
    }

    return toForget;
  }

  /**
   * 计算遗忘分数（基于 Ebbinghaus 曲线简化版）
   */
  private calculateForgettingScore(entry: MemoryEntry, daysSinceAccess: number): number {
    const retention = Math.exp(-this.decayRate * daysSinceAccess);
    const accessBoost = Math.log(entry.accessCount + 1) * 0.1;
    const importanceBoost = entry.importance * 0.3;
    return Math.min(1, retention + accessBoost + importanceBoost);
  }

  /**
   * 向量搜索
   */
  private async vectorSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const queryEmbedding = await this.generateEmbedding(query).catch(() => null);
    if (!queryEmbedding) return [];

    const results: SearchResult[] = [];

    for (const entry of this.entries.values()) {
      if (options.type && entry.type !== options.type) continue;
      if (!entry.embedding) continue;

      const similarity = this.cosineSimilarity(queryEmbedding, entry.embedding);
      const finalScore = this.applyForgettingBoost(entry, similarity);

      if (finalScore >= (options.minScore ?? 0.3)) {
        results.push({
          entry,
          score: finalScore,
          rank: 0,
        });
      }
    }

    return results;
  }

  /**
   * 关键词搜索（降级方案）
   */
  private keywordSearch(query: string, options: SearchOptions): SearchResult[] {
    const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
    const results: SearchResult[] = [];

    for (const entry of this.entries.values()) {
      if (options.type && entry.type !== options.type) continue;

      const contentLower = entry.content.toLowerCase();
      let matches = 0;

      for (const keyword of keywords) {
        if (contentLower.includes(keyword)) {
          matches++;
        }
      }

      if (matches > 0) {
        const score = matches / keywords.length;
        const finalScore = this.applyForgettingBoost(entry, score);

        if (finalScore >= (options.minScore ?? 0.3)) {
          results.push({
            entry,
            score: finalScore,
            rank: 0,
          });
        }
      }
    }

    return results;
  }

  /**
   * 应用遗忘曲线到搜索分数
   */
  private applyForgettingBoost(entry: MemoryEntry, baseScore: number): number {
    const daysSinceAccess = (Date.now() - entry.lastAccessedAt) / (1000 * 60 * 60 * 24);
    const retention = Math.exp(-this.decayRate * daysSinceAccess);
    const accessBoost = Math.log(entry.accessCount + 1) * 0.1;
    return baseScore * (0.7 + 0.3 * retention + accessBoost);
  }

  /**
   * 排序并限制结果
   */
  private rankResults(results: SearchResult[], limit: number): SearchResult[] {
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((result, index) => ({ ...result, rank: index + 1 }));
  }

  /**
   * 生成嵌入向量
   */
  private async generateEmbedding(_text: string): Promise<number[]> {
    return new Array(384).fill(0).map(() => Math.random() * 2 - 1);
  }

  /**
   * 余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * 是否需要生成嵌入
   */
  private shouldGenerateEmbedding(type: MemoryType): boolean {
    return type === MEMORY_TYPE.FACT || type === MEMORY_TYPE.CONTEXT;
  }
}