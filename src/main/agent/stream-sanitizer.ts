/**
 * StreamSanitizer - 流式数据清洗器
 * 负责清洗 Ollama 流式输出的 NDJSON 数据
 * 处理：NDJSON 逐行解析、异常行跳过、不完整 chunk 缓冲拼接
 * 确保上层接收到的数据块完整且有效
 */

/**
 * 流式数据清洗结果接口
 */
export interface SanitizeResult<T> {
  /** 解析后的数据对象 */
  data: T;
  /** 是否为数据结束标记 */
  done: boolean;
}

/**
 * StreamSanitizer 类
 * 基于 NDJSON（Newline Delimited JSON）格式的流式数据解析器
 * 逐行解析 JSON、跳过格式异常的行、缓冲不完整的 chunk
 * @template T 目标数据类型
 */
export class StreamSanitizer<T extends object> {
  /** 内部缓冲区，存储未完成的 chunk 数据 */
  private buffer: string;
  /** 已跳过的异常行数 */
  private skippedCount: number;
  /** 已成功解析的行数 */
  private parsedCount: number;

  /**
   * 构造函数
   * 初始化空缓冲区
   */
  constructor() {
    this.buffer = '';
    this.skippedCount = 0;
    this.parsedCount = 0;
  }

  /**
   * 输入一批原始数据块
   * 自动按换行切分，逐行尝试 JSON 解析
   * @param chunk 原始字节数据块
   * @returns 已成功解析的数据数组
   */
  public feed(chunk: Uint8Array): SanitizeResult<T>[] {
    const decoder = new TextDecoder('utf-8');
    this.buffer += decoder.decode(chunk, { stream: true });

    const results: SanitizeResult<T>[] = [];
    const lines = this.buffer.split('\n');

    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      const parsed = this.tryParse<T>(trimmed);
      if (parsed !== null) {
        results.push(parsed);
        this.parsedCount++;
      } else {
        this.skippedCount++;
      }
    }

    return results;
  }

  /**
   * 刷新缓冲区中剩余数据
   * 在流结束时调用，确保不丢失最后一条数据
   * @returns 缓冲区中剩余数据的解析结果
   */
  public flush(): SanitizeResult<T>[] {
    const results: SanitizeResult<T>[] = [];
    const trimmed = this.buffer.trim();

    if (trimmed.length === 0) {
      this.buffer = '';
      return results;
    }

    const parsed = this.tryParse<T>(trimmed);
    if (parsed !== null) {
      results.push(parsed);
      this.parsedCount++;
    } else {
      this.skippedCount++;
    }

    this.buffer = '';
    return results;
  }

  /**
   * 重置清洗器状态
   * 清空缓冲区与计数器
   */
  public reset(): void {
    this.buffer = '';
    this.skippedCount = 0;
    this.parsedCount = 0;
  }

  /**
   * 获取统计信息
   * @returns 包含已解析数、已跳过数、缓冲区大小的统计对象
   */
  public getStats(): { parsed: number; skipped: number; bufferSize: number } {
    return {
      parsed: this.parsedCount,
      skipped: this.skippedCount,
      bufferSize: this.buffer.length,
    };
  }

  /**
   * 尝试解析单行 JSON 数据
   * 解析失败返回 null，不抛出异常
   * @param line 单行 JSON 字符串
   * @returns 解析后的结果，失败返回 null
   */
  private tryParse<U>(line: string): SanitizeResult<U> | null {
    try {
      const data = JSON.parse(line) as U;
      const done = this.isDone(data);
      return { data, done };
    } catch {
      return null;
    }
  }

  /**
   * 判断数据是否为结束标记
   * 检查对象中是否包含 done: true 字段
   * @param data 解析后的数据对象
   * @returns 是否为结束标记
   */
  private isDone(data: unknown): boolean {
    if (typeof data === 'object' && data !== null && 'done' in data) {
      return (data as { done: boolean }).done === true;
    }
    return false;
  }
}