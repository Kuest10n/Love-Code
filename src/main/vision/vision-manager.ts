import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureResult {
  id: string;
  timestamp: number;
  imagePath: string;
  width: number;
  height: number;
  size: number;
  region?: CaptureRegion;
}

export interface OcrResult {
  id: string;
  timestamp: number;
  text: string;
  confidence: number;
  blocks: OcrBlock[];
  language: string;
}

export interface OcrBlock {
  text: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
}

export interface VisionConfig {
  enableCapture: boolean;
  enableOcr: boolean;
  defaultLanguage: string;
  captureDir: string;
  ocrCacheDir: string;
  maxHistory: number;
  autoCaptureInterval: number;
}

const DEFAULT_CONFIG: VisionConfig = {
  enableCapture: true,
  enableOcr: true,
  defaultLanguage: 'zh-CN',
  captureDir: join(tmpdir(), 'love-code', 'captures'),
  ocrCacheDir: join(tmpdir(), 'love-code', 'ocr-cache'),
  maxHistory: 100,
  autoCaptureInterval: 0,
};

export class VisionManager {
  private config: VisionConfig;
  private captureHistory: CaptureResult[];
  private ocrHistory: OcrResult[];

  constructor(config: Partial<VisionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.captureHistory = [];
    this.ocrHistory = [];
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!existsSync(this.config.captureDir)) {
      mkdirSync(this.config.captureDir, { recursive: true });
    }
    if (!existsSync(this.config.ocrCacheDir)) {
      mkdirSync(this.config.ocrCacheDir, { recursive: true });
    }
  }

  updateConfig(config: Partial<VisionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): VisionConfig {
    return { ...this.config };
  }

  async captureScreen(region?: CaptureRegion): Promise<CaptureResult> {
    if (!this.config.enableCapture) throw new Error('截图功能未启用');
    const timestamp = Date.now();
    const id = this.generateId(`capture_${timestamp}`);
    const imagePath = join(this.config.captureDir, `${id}.png`);
    const placeholderPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    writeFileSync(imagePath, placeholderPng);
    const result: CaptureResult = { id, timestamp, imagePath, width: region?.width ?? 1920, height: region?.height ?? 1080, size: placeholderPng.length, region };
    this.addToCaptureHistory(result);
    return result;
  }

  async recognizeText(_imagePath: string, language?: string): Promise<OcrResult> {
    if (!this.config.enableOcr) throw new Error('OCR 功能未启用');
    const targetLanguage = language ?? this.config.defaultLanguage;
    const timestamp = Date.now();
    const id = this.generateId(`ocr_${timestamp}`);
    const result: OcrResult = { id, timestamp, text: '', confidence: 0, blocks: [], language: targetLanguage };
    this.addToOcrHistory(result);
    return result;
  }

  getCaptureHistory(limit?: number): CaptureResult[] {
    return limit ? this.captureHistory.slice(-limit) : [...this.captureHistory];
  }

  getOcrHistory(limit?: number): OcrResult[] {
    return limit ? this.ocrHistory.slice(-limit) : [...this.ocrHistory];
  }

  private generateId(prefix: string): string {
    const random = createHash('md5').update(`${prefix}_${Math.random()}`).digest('hex').slice(0, 8);
    return `${prefix}_${random}`;
  }

  private addToCaptureHistory(result: CaptureResult): void {
    this.captureHistory.push(result);
    if (this.captureHistory.length > this.config.maxHistory) this.captureHistory.shift();
  }

  private addToOcrHistory(result: OcrResult): void {
    this.ocrHistory.push(result);
    if (this.ocrHistory.length > this.config.maxHistory) this.ocrHistory.shift();
  }
}
