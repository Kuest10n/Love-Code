/**
 * SQLite 数据库层
 * 提供数据库连接管理、Schema 定义与基础 CRUD 操作
 * 基于 better-sqlite3 实现，支持 WAL 模式与事务
 */

import SqliteDatabase from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseConfig } from '@shared/types/config.js';

/** 数据库表名常量 */
export const TABLES = {
  /** 会话表 */
  CONVERSATIONS: 'conversations',
  /** 消息表 */
  MESSAGES: 'messages',
  /** 记忆表 */
  MEMORIES: 'memories',
  /** 设置表 */
  SETTINGS: 'settings',
} as const;

/** 表名联合类型 */
export type TableName = (typeof TABLES)[keyof typeof TABLES];

/** Schema DDL 语句 */
const SCHEMA = {
  [TABLES.CONVERSATIONS]: `
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_message TEXT,
      is_active INTEGER DEFAULT 1
    );
  `,
  [TABLES.MESSAGES]: `
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      token_count INTEGER DEFAULT 0,
      emotion TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
  `,
  [TABLES.MEMORIES]: `
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('fact', 'preference', 'context', 'emotion', 'skill')),
      content TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      embedding BLOB,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      access_count INTEGER DEFAULT 0,
      last_accessed_at INTEGER NOT NULL,
      importance REAL DEFAULT 0.5
    );
    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
  `,
  [TABLES.SETTINGS]: `
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `,
} as const satisfies Record<TableName, string>;

/** 记忆类型 */
export type MemoryType = 'fact' | 'preference' | 'context' | 'emotion' | 'skill';

/** 消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system';

/** 会话记录接口 */
export interface Conversation {
  /** 会话唯一标识 */
  id: string;
  /** 会话标题 */
  title: string;
  /** 创建时间戳 */
  createdAt: number;
  /** 更新时间戳 */
  updatedAt: number;
  /** 最后一条消息摘要 */
  lastMessage: string;
  /** 是否活跃 */
  isActive: boolean;
}

/** 消息记录接口 */
export interface MessageRecord {
  /** 消息唯一标识 */
  id: string;
  /** 所属会话 ID */
  conversationId: string;
  /** 消息角色 */
  role: MessageRole;
  /** 消息内容 */
  content: string;
  /** Token 数量 */
  tokenCount: number;
  /** 情感标签 */
  emotion?: string;
  /** 创建时间戳 */
  createdAt: number;
}

/** 记忆记录接口 */
export interface MemoryRecord {
  /** 记忆唯一标识 */
  id: string;
  /** 记忆类型 */
  type: MemoryType;
  /** 记忆内容 */
  content: string;
  /** 元数据（JSON 字符串） */
  metadata: string;
  /** 嵌入向量（二进制） */
  embedding?: Uint8Array;
  /** 创建时间戳 */
  createdAt: number;
  /** 更新时间戳 */
  updatedAt: number;
  /** 访问次数 */
  accessCount: number;
  /** 最近访问时间戳 */
  lastAccessedAt: number;
  /** 重要性评分（0.0 ~ 1.0） */
  importance: number;
}

/** 设置项记录接口 */
export interface SettingRecord {
  /** 配置键 */
  key: string;
  /** 配置值 */
  value: string;
  /** 更新时间戳 */
  updatedAt: number;
}

/** 创建会话输入 */
export type CreateConversationInput = {
  title?: string;
};

/** 更新会话输入 */
export type UpdateConversationInput = Partial<Pick<Conversation, 'title' | 'lastMessage' | 'isActive'>>;

/** 添加消息输入 */
export type AddMessageInput = Omit<MessageRecord, 'id' | 'createdAt'> &
  Partial<Pick<MessageRecord, 'id' | 'createdAt'>>;

/** 创建记忆输入 */
export type CreateMemoryInput = Omit<MemoryRecord, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt'> &
  Partial<Pick<MemoryRecord, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt'>>;

/**
 * DatabaseManager 类
 * SQLite 数据库管理，基于 better-sqlite3
 * 提供连接管理、DDL 初始化与四表 CRUD 操作
 */
export class DatabaseManager {
  /** better-sqlite3 实例 */
  private db: SqliteDatabase.Database | null;
  /** 数据库配置 */
  private readonly config: DatabaseConfig;
  /** 是否已初始化 */
  private initialized: boolean;

  /**
   * 构造函数
   * @param config 数据库配置
   */
  constructor(config: DatabaseConfig) {
    this.config = config;
    this.db = null;
    this.initialized = false;
  }

  /**
   * 初始化数据库
   * 创建目录、建立连接、启用 WAL、执行 DDL
   */
  initialize(): void {
    if (this.initialized) return;

    this.ensureDirectory();

    this.db = new SqliteDatabase(this.config.filePath);

    const db = this.db;

    if (this.config.walMode) {
      db.pragma('journal_mode = WAL');
    }

    db.pragma('foreign_keys = ON');

    for (const sql of Object.values(SCHEMA)) {
      db.exec(sql);
    }

    this.initialized = true;
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db !== null) {
      this.db.close();
      this.db = null;
    }
    this.initialized = false;
  }

  /**
   * 获取 better-sqlite3 实例
   * @returns 数据库实例
   * @throws 数据库未初始化时抛出错误
   */
  getInstance(): SqliteDatabase.Database {
    if (this.db === null) {
      throw new Error('数据库未初始化，请先调用 initialize()');
    }
    return this.db;
  }

  /**
   * 确保目录存在
   */
  private ensureDirectory(): void {
    const dir = dirname(this.config.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  // ==================== Conversation 操作 ====================

  /**
   * 创建会话
   * @param input 会话输入
   * @returns 会话记录
   */
  createConversation(input: CreateConversationInput = {}): Conversation {
    const db = this.getInstance();
    const now = Date.now();
    const id = crypto.randomUUID();
    const title = input.title ?? '新对话';

    const stmt = db.prepare(`
      INSERT INTO conversations (id, title, created_at, updated_at, last_message, is_active)
      VALUES (?, ?, ?, ?, '', 1)
    `);

    stmt.run(id, title, now, now);

    return {
      id,
      title,
      createdAt: now,
      updatedAt: now,
      lastMessage: '',
      isActive: true,
    };
  }

  /**
   * 获取会话列表
   * @param limit 返回条数上限
   * @param offset 偏移量
   * @returns 会话记录数组
   */
  listConversations(limit: number = 50, offset: number = 0): Conversation[] {
    const db = this.getInstance();
    const rows = db.prepare(`
      SELECT id, title, created_at, updated_at, last_message, is_active
      FROM conversations
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as Array<{
      id: string;
      title: string;
      created_at: number;
      updated_at: number;
      last_message: string;
      is_active: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastMessage: row.last_message,
      isActive: row.is_active === 1,
    }));
  }

  /**
   * 获取单个会话
   * @param id 会话 ID
   * @returns 会话记录或 null
   */
  getConversation(id: string): Conversation | null {
    const db = this.getInstance();
    const row = db.prepare(`
      SELECT id, title, created_at, updated_at, last_message, is_active
      FROM conversations WHERE id = ?
    `).get(id) as {
      id: string;
      title: string;
      created_at: number;
      updated_at: number;
      last_message: string;
      is_active: number;
    } | undefined;

    if (row === undefined) return null;

    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastMessage: row.last_message,
      isActive: row.is_active === 1,
    };
  }

  /**
   * 更新会话
   * @param id 会话 ID
   * @param updates 更新字段
   */
  updateConversation(id: string, updates: UpdateConversationInput): void {
    const db = this.getInstance();
    const sets: string[] = [];
    const values: unknown[] = [];

    if (updates.title !== undefined) {
      sets.push('title = ?');
      values.push(updates.title);
    }
    if (updates.lastMessage !== undefined) {
      sets.push('last_message = ?');
      values.push(updates.lastMessage);
    }
    if (updates.isActive !== undefined) {
      sets.push('is_active = ?');
      values.push(updates.isActive ? 1 : 0);
    }

    if (sets.length === 0) return;

    sets.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    db.prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  /**
   * 删除会话
   * @param id 会话 ID
   */
  deleteConversation(id: string): void {
    const db = this.getInstance();
    db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }

  // ==================== Message 操作 ====================

  /**
   * 添加消息
   * @param input 消息输入
   * @returns 消息记录
   */
  addMessage(input: AddMessageInput): MessageRecord {
    const db = this.getInstance();
    const now = Date.now();
    const id = input.id ?? crypto.randomUUID();
    const createdAt = input.createdAt ?? now;

    db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, token_count, emotion, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.conversationId,
      input.role,
      input.content,
      input.tokenCount ?? 0,
      input.emotion ?? null,
      createdAt,
    );

    return {
      id,
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      tokenCount: input.tokenCount ?? 0,
      emotion: input.emotion,
      createdAt,
    };
  }

  /**
   * 获取会话消息列表
   * @param conversationId 会话 ID
   * @param limit 返回条数上限
   * @param offset 偏移量
   * @returns 消息记录数组
   */
  listMessages(conversationId: string, limit: number = 100, offset: number = 0): MessageRecord[] {
    const db = this.getInstance();
    const rows = db.prepare(`
      SELECT id, conversation_id, role, content, token_count, emotion, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
      LIMIT ? OFFSET ?
    `).all(conversationId, limit, offset) as Array<{
      id: string;
      conversation_id: string;
      role: MessageRole;
      content: string;
      token_count: number;
      emotion: string | null;
      created_at: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      tokenCount: row.token_count,
      emotion: row.emotion ?? undefined,
      createdAt: row.created_at,
    }));
  }

  /**
   * 获取最近消息
   * @param conversationId 会话 ID
   * @param count 获取条数
   * @returns 消息记录数组
   */
  getRecentMessages(conversationId: string, count: number = 10): MessageRecord[] {
    const db = this.getInstance();
    const rows = db.prepare(`
      SELECT id, conversation_id, role, content, token_count, emotion, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(conversationId, count) as Array<{
      id: string;
      conversation_id: string;
      role: MessageRole;
      content: string;
      token_count: number;
      emotion: string | null;
      created_at: number;
    }>;

    return rows
      .map((row) => ({
        id: row.id,
        conversationId: row.conversation_id,
        role: row.role,
        content: row.content,
        tokenCount: row.token_count,
        emotion: row.emotion ?? undefined,
        createdAt: row.created_at,
      }))
      .reverse();
  }

  // ==================== Memory 操作 ====================

  /**
   * 创建记忆
   * @param input 记忆输入
   * @returns 记忆记录
   */
  createMemory(input: CreateMemoryInput): MemoryRecord {
    const db = this.getInstance();
    const now = Date.now();
    const id = input.id ?? crypto.randomUUID();
    const createdAt = input.createdAt ?? now;
    const updatedAt = input.updatedAt ?? now;
    const accessCount = input.accessCount ?? 0;
    const lastAccessedAt = input.lastAccessedAt ?? now;
    const metadata = input.metadata ?? '{}';

    db.prepare(`
      INSERT INTO memories (
        id, type, content, metadata, embedding,
        created_at, updated_at, access_count, last_accessed_at, importance
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.type,
      input.content,
      metadata,
      input.embedding ?? null,
      createdAt,
      updatedAt,
      accessCount,
      lastAccessedAt,
      input.importance ?? 0.5,
    );

    return {
      id,
      type: input.type,
      content: input.content,
      metadata,
      embedding: input.embedding,
      createdAt,
      updatedAt,
      accessCount,
      lastAccessedAt,
      importance: input.importance ?? 0.5,
    };
  }

  /**
   * 列出记忆
   * @param type 记忆类型过滤（可选）
   * @param limit 返回条数上限
   * @returns 记忆记录数组
   */
  listMemories(type?: MemoryType, limit: number = 50): MemoryRecord[] {
    const db = this.getInstance();
    const rows =
      type !== undefined
        ? (db.prepare(`
            SELECT id, type, content, metadata, embedding, created_at, updated_at, access_count, last_accessed_at, importance
            FROM memories WHERE type = ?
            ORDER BY importance DESC, updated_at DESC
            LIMIT ?
          `).all(type, limit) as Array<{
            id: string;
            type: MemoryType;
            content: string;
            metadata: string;
            embedding: Buffer | null;
            created_at: number;
            updated_at: number;
            access_count: number;
            last_accessed_at: number;
            importance: number;
          }>)
        : (db.prepare(`
            SELECT id, type, content, metadata, embedding, created_at, updated_at, access_count, last_accessed_at, importance
            FROM memories
            ORDER BY importance DESC, updated_at DESC
            LIMIT ?
          `).all(limit) as Array<{
            id: string;
            type: MemoryType;
            content: string;
            metadata: string;
            embedding: Buffer | null;
            created_at: number;
            updated_at: number;
            access_count: number;
            last_accessed_at: number;
            importance: number;
          }>);

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      content: row.content,
      metadata: row.metadata,
      embedding: row.embedding ? new Uint8Array(row.embedding) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      accessCount: row.access_count,
      lastAccessedAt: row.last_accessed_at,
      importance: row.importance,
    }));
  }

  /**
   * 记录记忆访问
   * @param id 记忆 ID
   */
  touchMemory(id: string): void {
    const db = this.getInstance();
    const now = Date.now();
    db.prepare(`
      UPDATE memories
      SET access_count = access_count + 1, last_accessed_at = ?
      WHERE id = ?
    `).run(now, id);
  }

  /**
   * 删除记忆
   * @param id 记忆 ID
   */
  deleteMemory(id: string): void {
    const db = this.getInstance();
    db.prepare('DELETE FROM memories WHERE id = ?').run(id);
  }

  // ==================== Setting 操作 ====================

  /**
   * 获取设置值
   * @param key 配置键
   * @returns 配置值或 null
   */
  getSetting(key: string): string | null {
    const db = this.getInstance();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  /**
   * 保存设置值
   * @param key 配置键
   * @param value 配置值
   */
  setSetting(key: string, value: string): void {
    const db = this.getInstance();
    const now = Date.now();
    db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value, now);
  }

  /**
   * 删除设置
   * @param key 配置键
   */
  deleteSetting(key: string): void {
    const db = this.getInstance();
    db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }
}