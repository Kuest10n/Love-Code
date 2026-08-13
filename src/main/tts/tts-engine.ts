/**
 * TTS 语音合成引擎
 * 实现双引擎架构：本地系统 TTS + Edge TTS 云端引擎
 * 支持情感化参数调整（语速、音调、音量）与流式推送
 */

import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** TTS 引擎类型 */
export const TTS_ENGINE = {
  /** 本地系统 TTS (Windows SAPI / macOS NSSpeechSynthesizer) */
  LOCAL: 'local',
  /** Edge TTS 云端服务 */
  EDGE: 'edge',
} as const;

export type TtsEngine = (typeof TTS_ENGINE)[keyof typeof TTS_ENGINE];

/** TTS 参数配置 */
export interface TtsConfig {
  /** 使用的引擎 */
  engine: TtsEngine;
  /** 语速倍率 (0.5 - 2.0) */
  rate: number;
  /** 音量倍率 (0.1 - 1.5) */
  volume: number;
  /** 音调偏移 (-10 - 10) */
  pitch: number;
  /** 语音编码 */
  codec: 'mp3' | 'wav' | 'ogg';
  /** 缓存目录 */
  cacheDir?: string;
  /** 是否启用缓存 */
  enableCache: boolean;
}

/** TTS 合成结果 */
export interface TtsResult {
  /** 音频数据 (Base64) */
  audioData: string;
  /** 音频格式 */
  format: string;
  /** 时长（毫秒） */
  durationMs: number;
  /** 使用的引擎 */
  engine: TtsEngine;
  /** 是否来自缓存 */
  fromCache: boolean;
}

/** 流式合成事件 */
export interface TtsStreamEvent {
  /** 事件类型 */
  type: 'chunk' | 'done' | 'error';
  /** 文本内容 */
  text?: string;
  /** 音频数据 (Base64) */
  audioData?: string;
  /** 序号 */
  index?: number;
  /** 错误信息 */
  error?: string;
}

/** 默认配置 */
const DEFAULT_CONFIG: TtsConfig = {
  engine: TTS_ENGINE.LOCAL,
  rate: 1.0,
  volume: 1.0,
  pitch: 0,
  codec: 'mp3',
  enableCache: true,
};

/**
 * TtsManager 类
 * 管理双引擎合成、缓存与情感参数映射
 */
export class TtsManager {
  private config: TtsConfig;
  private cacheDir: string;
  private cacheHits: number;
  private cacheMisses: number;

  constructor(config: Partial<TtsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cacheDir = this.config.cacheDir ?? join(tmpdir(), 'lovecode-tts-cache');
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<TtsConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): TtsConfig {
    return { ...this.config };
  }

  /**
   * 应用情感参数
   */
  applyEmotionParams(rate: number, volume: number, pitch: number): void {
    this.config.rate = rate;
    this.config.volume = volume;
    this.config.pitch = pitch;
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { hits: number; misses: number; hitRate: number } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? this.cacheHits / total : 0,
    };
  }

  /**
   * 合成单个文本
   */
  async synthesize(text: string): Promise<TtsResult> {
    if (!text.trim()) {
      throw new Error('文本内容不能为空');
    }

    const cacheKey = this.generateCacheKey(text);

    if (this.config.enableCache) {
      const cached = await this.getFromCache(cacheKey);
      if (cached) {
        this.cacheHits++;
        return { ...cached, fromCache: true };
      }
    }

    this.cacheMisses++;

    const result = await this.synthesizeWithEngine(text);

    if (this.config.enableCache) {
      await this.saveToCache(cacheKey, result);
    }

    return { ...result, fromCache: false };
  }

  /**
   * 流式合成（句子级切分）
   */
  async *synthesizeStream(text: string): AsyncGenerator<TtsStreamEvent> {
    const sentences = this.splitIntoSentences(text);

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];

      try {
        const result = await this.synthesize(sentence);
        yield {
          type: 'chunk',
          text: sentence,
          audioData: result.audioData,
          index: i,
        };
      } catch (error) {
        yield {
          type: 'error',
          text: sentence,
          error: error instanceof Error ? error.message : '合成失败',
          index: i,
        };
      }
    }

    yield { type: 'done' };
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(text: string): string {
    const configString = `${this.config.engine}:${this.config.rate}:${this.config.volume}:${this.config.pitch}:${text}`;
    return createHash('sha256').update(configString).digest('hex').slice(0, 16);
  }

  /**
   * 从缓存获取
   */
  private async getFromCache(key: string): Promise<TtsResult | null> {
    try {
      const cachePath = join(this.cacheDir, `${key}.json`);
      const { readFile } = await import('node:fs/promises');
      const data = await readFile(cachePath, 'utf-8');
      return JSON.parse(data) as TtsResult;
    } catch {
      return null;
    }
  }

  /**
   * 保存到缓存
   */
  private async saveToCache(key: string, result: TtsResult): Promise<void> {
    try {
      await mkdir(this.cacheDir, { recursive: true });
      const cachePath = join(this.cacheDir, `${key}.json`);
      await writeFile(cachePath, JSON.stringify(result), 'utf-8');
    } catch {
      // 缓存失败不影响主流程
    }
  }

  /**
   * 使用选定引擎合成
   */
  private async synthesizeWithEngine(text: string): Promise<TtsResult> {
    switch (this.config.engine) {
      case TTS_ENGINE.EDGE:
        return this.synthesizeWithEdge(text);
      case TTS_ENGINE.LOCAL:
      default:
        return this.synthesizeWithLocal(text);
    }
  }

  /**
   * 本地 TTS 合成（占位实现）
   * 实际使用时需要调用系统 TTS API 或 node-speaker 等库
   */
  private async synthesizeWithLocal(text: string): Promise<TtsResult> {
    // 生成占位音频数据（实际应调用系统 TTS）
    const sampleRate = 22050;
    const durationMs = Math.ceil(text.length * 80); // 估算时长
    const audioData = this.generateSilencePlaceholder(durationMs, sampleRate);

    return {
      audioData,
      format: this.config.codec,
      durationMs,
      engine: TTS_ENGINE.LOCAL,
      fromCache: false,
    };
  }

  /**
   * Edge TTS 合成（占位实现）
   * 实际使用时需要通过 WebSocket 连接 Edge TTS 服务
   */
  private async synthesizeWithEdge(text: string): Promise<TtsResult> {
    // 生成占位音频数据
    const durationMs = Math.ceil(text.length * 70);
    const audioData = this.generateSilencePlaceholder(durationMs, 22050);

    return {
      audioData,
      format: this.config.codec,
      durationMs,
      engine: TTS_ENGINE.EDGE,
      fromCache: false,
    };
  }

  /**
   * 生成静音占位符
   * 实际实现时替换为真实音频数据
   */
  private generateSilencePlaceholder(durationMs: number, sampleRate: number): string {
    const numSamples = Math.floor((durationMs / 1000) * sampleRate);
    // 生成 WAV 格式的静音数据
    const buffer = Buffer.alloc(44 + numSamples * 2);

    // WAV Header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + numSamples * 2, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // 单声道
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(numSamples * 2, 40);

    return buffer.toString('base64');
  }

  /**
   * 句子切分
   * 按中文标点符号切分，保持语义完整
   */
  private splitIntoSentences(text: string): string[] {
    const sentences: string[] = [];
    const separators = /([。！？!?\n]+)/g;

    let start = 0;
    let match: RegExpExecArray | null;

    while ((match = separators.exec(text)) !== null) {
      const end = match.index + match[0].length;
      const sentence = text.slice(start, end).trim();
      if (sentence) {
        sentences.push(sentence);
      }
      start = end;
    }

    const remaining = text.slice(start).trim();
    if (remaining) {
      sentences.push(remaining);
    }

    return sentences.length > 0 ? sentences : [text];
  }
}
