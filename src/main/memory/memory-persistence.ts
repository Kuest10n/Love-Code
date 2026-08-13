/**
 * 记忆持久化层
 * 桥接 MemoryManager（内存操作）与 DatabaseManager（持久化存储）
 * 实现记忆的异步写入、加载与遗忘曲线清理
 */

import type { DatabaseManager } from '../database/db.js';
import {
  MemoryManager,
  type MemoryEntry,
  type MemoryType,
  type SearchOptions,
  type SearchResult,
} from './memory-manager.js';

/**
 * 记忆持久化服务
 */
export class MemoryPersistence {
  private memoryManager: MemoryManager;
  private db: DatabaseManager | null;
  private initPromise: Promise<void> | null;

  constructor(memoryManager: MemoryManager, db: DatabaseManager | null = null) {
    this.memoryManager = memoryManager;
    this.db = db;
    this.initPromise = null;
  }

  /**
   * 从数据库加载记忆到内存
   * 只执行一次，防重入锁
   */
  async loadFromDatabase(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      if (!this.db) return;

      try {
        const records = this.db.listMemories(undefined, 200);

        for (const record of records) {
          const entry: MemoryEntry = {
            id: record.id,
            type: record.type,
            content: record.content,
            metadata: JSON.parse(record.metadata),
            embedding: record.embedding ? Array.from(record.embedding).map((b) => b / 255) : undefined,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            accessCount: record.accessCount,
            lastAccessedAt: record.lastAccessedAt,
            importance: record.importance,
          };

          this.memoryManager.upsertEntry(entry);
        }

        console.log(`[MemoryPersistence] Loaded ${records.length} memories from database`);

        const forgotten = this.memoryManager.applyForgettingCurve();
        if (forgotten.length > 0) {
          console.log(`[MemoryPersistence] Forgetting ${forgotten.length} expired memories`);
          for (const id of forgotten) {
            try {
              this.db.deleteMemory(id);
            } catch {}
          }
        }
      } catch (error) {
        console.error('[MemoryPersistence] Load from database failed:', error);
      }
    })();

    return this.initPromise;
  }

  /**
   * 添加记忆并持久化
   */
  async add(
    type: MemoryType,
    content: string,
    metadata: Record<string, unknown> = {},
    importance: number = 0.5,
  ): Promise<MemoryEntry> {
    const entry = await this.memoryManager.add(type, content, metadata, importance);

    if (this.db) {
      try {
        this.db.createMemory({
          type: entry.type,
          content: entry.content,
          metadata: JSON.stringify(entry.metadata),
          embedding: entry.embedding ? new Uint8Array(entry.embedding.map((v) => Math.round(v * 255))) : undefined,
          importance: entry.importance,
          accessCount: entry.accessCount,
          lastAccessedAt: entry.lastAccessedAt,
        });
      } catch (error) {
        console.warn('[MemoryPersistence] Persist memory failed:', error);
      }
    }

    return entry;
  }

  /**
   * 搜索记忆（先内存，后数据库降级）
   */
  async search(query: string, options: Partial<SearchOptions> = {}): Promise<SearchResult[]> {
    const results = await this.memoryManager.search(query, options);

    if (results.length > 0) {
      for (const r of results) {
        if (this.db) {
          try {
            this.db.touchMemory(r.entry.id);
          } catch {}
        }
      }
      return results;
    }

    if (this.db && options.useVector !== false) {
      try {
        const keywordResults = this.searchDatabaseByKeyword(query, options);
        return keywordResults;
      } catch {}
    }

    return [];
  }

  /**
   * 数据库关键词搜索降级
   */
  private searchDatabaseByKeyword(query: string, options: Partial<SearchOptions>): SearchResult[] {
    if (!this.db) return [];

    const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
    const allMemories = this.db.listMemories(options.type, options.limit ?? 10);
    const results: SearchResult[] = [];

    for (const record of allMemories) {
      const contentLower = record.content.toLowerCase();
      let matches = 0;
      for (const keyword of keywords) {
        if (contentLower.includes(keyword)) {
          matches++;
        }
      }

      if (matches > 0) {
        const score = matches / keywords.length;
        results.push({
          entry: {
            id: record.id,
            type: record.type,
            content: record.content,
            metadata: JSON.parse(record.metadata),
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            accessCount: record.accessCount,
            lastAccessedAt: record.lastAccessedAt,
            importance: record.importance,
          },
          score,
          rank: 0,
        });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit ?? 10)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  /**
   * 批量同步内存到数据库
   * 用于定期持久化
   */
  async syncToDatabase(): Promise<number> {
    if (!this.db) return 0;

    let syncCount = 0;
    const allEntries = this.memoryManager.getAllEntries();

    for (const entry of allEntries) {
      try {
        const existing = this.db.getSetting?.(entry.id);
        if (!existing) {
          this.db.createMemory({
            type: entry.type,
            content: entry.content,
            metadata: JSON.stringify(entry.metadata),
            embedding: entry.embedding ? new Uint8Array(entry.embedding.map((v) => Math.round(v * 255))) : undefined,
            importance: entry.importance,
            accessCount: entry.accessCount,
            lastAccessedAt: entry.lastAccessedAt,
          });
          syncCount++;
        }
      } catch {}
    }

    return syncCount;
  }

  /**
   * 执行遗忘曲线清理
   */
  async runForgettingCurve(): Promise<number> {
    const forgotten = this.memoryManager.applyForgettingCurve();

    if (this.db && forgotten.length > 0) {
      for (const id of forgotten) {
        try {
          this.db.deleteMemory(id);
        } catch {}
      }
    }

    return forgotten.length;
  }

  /**
   * 获取内存中的所有条目
   */
  getAllMemoryEntries(): MemoryEntry[] {
    return this.memoryManager.getAllEntries();
  }
}
