export type MemoryType = 'fact' | 'preference' | 'context' | 'emotion' | 'skill';
export type MessageRole = 'user' | 'assistant' | 'system';

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastMessage: string;
  isActive: boolean;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  tokenCount: number;
  emotion?: string;
  createdAt: number;
}

export interface MemoryRecord {
  id: string;
  type: MemoryType;
  content: string;
  metadata: string;
  embedding?: Uint8Array;
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  lastAccessedAt: number;
  importance: number;
}

export interface SettingRecord {
  key: string;
  value: string;
  updatedAt: number;
}

export type CreateConversationInput = {
  title?: string;
};

export type UpdateConversationInput = Partial<Pick<Conversation, 'title' | 'lastMessage' | 'isActive'>>;

export type AddMessageInput = Omit<MessageRecord, 'id' | 'createdAt'> &
  Partial<Pick<MessageRecord, 'id' | 'createdAt'>>;

export type CreateMemoryInput = Omit<MemoryRecord, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt'> &
  Partial<Pick<MemoryRecord, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt'>>;
