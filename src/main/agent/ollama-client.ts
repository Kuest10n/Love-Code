/**
 * Ollama HTTP 客户端
 * 封装与本地 Ollama 服务的通信，支持流式生成与中断
 */

import type { OllamaConfig } from '@shared/types/config.js';

/** 流式生成回调 */
export type StreamCallback = (chunk: string, done: boolean) => void;

/** 生成请求参数 */
export interface GenerateParams {
  /** 模型名称 */
  model: string;
  /** 提示词（使用 messages 时可选） */
  prompt?: string;
  /** 系统提示词 */
  system?: string;
  /** 温度 */
  temperature?: number;
  /** 最大 token 数 */
  maxTokens?: number;
  /** 是否流式 */
  stream?: boolean;
  /** 上下文历史 */
  messages?: ChatMessage[];
}

/** 聊天消息 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** Ollama 客户端类 */
export class OllamaClient {
  private config: OllamaConfig;

  constructor(config: OllamaConfig) {
    this.config = config;
  }

  /**
   * 检查 Ollama 服务是否可用
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      console.log('[OllamaClient] healthCheck:', response.ok, response.status);
      return response.ok;
    } catch (err) {
      console.error('[OllamaClient] healthCheck failed:', err);
      return false;
    }
  }

  /**
   * 获取可用模型列表
   */
  async listModels(): Promise<string[]> {
    const response = await fetch(`${this.config.baseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = (await response.json()) as { models: Array<{ name: string }> };
    return data.models.map((m) => m.name);
  }

  /**
   * 生成文本（非流式）
   */
  async generate(params: GenerateParams): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.model,
        prompt: params.prompt ?? '',
        system: params.system,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new Error(`Ollama generate error: ${response.status}`);
    }

    const data = (await response.json()) as { response: string };
    return data.response;
  }

  /**
   * 流式生成文本
   */
  async generateStream(
    params: GenerateParams,
    onChunk: StreamCallback,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await fetch(`${this.config.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.model,
        prompt: params.prompt,
        system: params.system,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama stream error: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          onChunk('', true);
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const chunk = JSON.parse(line) as { response: string; done: boolean };
            onChunk(chunk.response, chunk.done);
          } catch {
            // 忽略解析错误的行
          }
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      throw error;
    }
  }

  /**
   * 聊天完成（非流式）
   */
  async chat(params: GenerateParams): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages ?? [{ role: 'user', content: params.prompt }],
        system: params.system,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new Error(`Ollama chat error: ${response.status}`);
    }

    const data = (await response.json()) as { message: { content: string } };
    return data.message.content;
  }

  /**
   * 流式聊天
   */
  async chatStream(
    params: GenerateParams,
    onChunk: StreamCallback,
    signal?: AbortSignal,
  ): Promise<void> {
    const url = `${this.config.baseUrl}/api/chat`;
    console.log('[OllamaClient] chatStream request:', { model: params.model, messagesCount: params.messages?.length ?? 0 });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages ?? [{ role: 'user', content: params.prompt }],
        system: params.system,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens,
        stream: true,
      }),
      signal,
    });

    console.log('[OllamaClient] chatStream response:', { status: response.status, ok: response.ok });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Ollama chat stream error: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let chunkCount = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log('[OllamaClient] chatStream reader done, chunks:', chunkCount);
          onChunk('', true);
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const chunk = JSON.parse(line) as { message: { content: string }; done: boolean };
            chunkCount++;
            if (chunk.message?.content) {
              onChunk(chunk.message.content, chunk.done);
            }
            if (chunk.done) {
              break;
            }
          } catch {
            // 忽略解析错误的行
          }
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.log('[OllamaClient] chatStream aborted');
        return;
      }
      console.error('[OllamaClient] chatStream error:', error);
      throw error;
    }
  }

  /**
   * 获取嵌入向量
   */
  async embed(text: string, model: string = 'nomic-embed-text'): Promise<number[]> {
    const response = await fetch(`${this.config.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Ollama embed error: ${response.status}`);
    }

    const data = (await response.json()) as { embedding: number[] };
    return data.embedding;
  }
}