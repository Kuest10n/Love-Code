/**
 * ToolRegistry - 工具注册中心
 * 实现工具的注册、调度与执行管理
 * 支持基于 zod 的参数校验、超时控制与错误边界
 * 内置 SSRF 防护机制，拦截 web_fetch 工具对私网/回环地址的请求
 */

import { z, type ZodSchema } from 'zod';

/**
 * 工具定义接口
 * 每个工具包含名称、描述、参数 Schema 与执行函数
 */
export interface Tool {
  /** 工具名称（唯一标识） */
  name: string;
  /** 工具描述（用于 LLM 工具选择） */
  description: string;
  /** 参数校验 Schema（基于 Zod） */
  parameters: ZodSchema;
  /** 执行函数 */
  execute: (args: Record<string, unknown>) => Promise<unknown>;
  /** 执行超时时间（毫秒） */
  timeout: number;
}

/**
 * 工具执行结果接口
 */
export interface ToolExecutionResult {
  /** 是否执行成功 */
  success: boolean;
  /** 工具名称 */
  toolName: string;
  /** 执行结果数据 */
  result: unknown;
  /** 错误信息（失败时） */
  error?: string;
  /** 执行耗时（毫秒） */
  duration: number;
}

/**
 * Web Fetch 工具参数接口
 */
const WebFetchParamsSchema = z.object({
  /** 目标 URL */
  url: z.string().url(),
  /** 请求方法 */
  method: z.enum(['GET', 'POST']).default('GET'),
  /** 请求头 */
  headers: z.record(z.string(), z.string()).optional(),
  /** 请求体（POST 时） */
  body: z.string().optional(),
});

/**
 * 内置 Echo 工具参数接口
 */
const EchoParamsSchema = z.object({
  /** 回声文本 */
  message: z.string().describe('需要回声的文本'),
  /** 重复次数 */
  times: z.number().int().min(1).max(10).default(1),
});

/**
 * 内置时间查询工具参数接口
 */
const TimeParamsSchema = z.object({
  /** 时区标识 */
  timezone: z.string().default('local'),
});

/**
 * SSRF 防护：私网与回环地址检测
 * 拦截对内网地址的请求，防止服务器端请求伪造攻击
 * @param url 目标 URL
 * @returns 是否为安全地址
 */
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    const blockedPatterns: ReadonlyArray<RegExp> = [
      /^localhost$/,
      /^\d+\.\d+\.\d+\.\d+$/,
      /^127\.\d+\.\d+\.\d+$/,
      /^10\.\d+\.\d+\.\d+$/,
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
      /^192\.168\.\d+\.\d+$/,
      /^0\.0\.0\.0$/,
      /^\[::1\]$/,
      /^::ffff:/,
      /^0x7f/,
      /^0x0/,
      /\.local$/,
      /\.internal$/,
      /^metadata\.google/,
      /^169\.254\./,
    ];

    return !blockedPatterns.some((pattern) => pattern.test(hostname));
  } catch {
    return false;
  }
}

/**
 * ToolRegistry 类
 * 工具注册中心，统一管理所有可用工具的生命周期
 * 提供注册、查询、执行与防护能力
 */
export class ToolRegistry {
  /** 已注册工具映射表 */
  private readonly tools: Map<string, Tool>;
  /** 默认执行超时时间 */
  private readonly defaultTimeout: number;

  /**
   * 构造函数
   * @param defaultTimeout 默认执行超时（毫秒）
   */
  constructor(defaultTimeout: number = 30000) {
    this.tools = new Map();
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * 注册单个工具
   * @param tool 工具定义
   * @throws 当工具名称重复时抛出错误
   */
  public register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`工具 "${tool.name}" 已注册`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * 批量注册工具
   * @param tools 工具定义数组
   */
  public registerMany(tools: ReadonlyArray<Tool>): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * 根据名称获取工具
   * @param name 工具名称
   * @returns 工具定义，未找到返回 null
   */
  public getTool(name: string): Tool | null {
    return this.tools.get(name) ?? null;
  }

  /**
   * 获取所有已注册工具列表
   * @returns 工具定义数组
   */
  public getAllTools(): ReadonlyArray<Tool> {
    return Array.from(this.tools.values());
  }

  /**
   * 获取工具列表摘要
   * 用于 LLM 选择工具时的上下文注入
   * @returns 工具摘要数组
   */
  public getToolSummaries(): ReadonlyArray<{
    name: string;
    description: string;
    parameters: string;
  }> {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters.description ?? '无参数说明',
    }));
  }

  /**
   * 执行指定工具
   * 内置参数校验、超时控制、错误边界与 SSRF 防护
   * @param toolName 工具名称
   * @param rawArgs 原始参数
   * @returns 执行结果
   */
  public async execute(
    toolName: string,
    rawArgs: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(toolName);
    const startTime = Date.now();

    if (!tool) {
      return {
        success: false,
        toolName,
        result: null,
        error: `工具 "${toolName}" 未注册`,
        duration: Date.now() - startTime,
      };
    }

    try {
      const validated = this.validateArgs(tool, rawArgs);

      if (toolName === 'web_fetch') {
        this.checkSsrf(validated);
      }

      const result = await this.executeWithTimeout(tool, validated);

      return {
        success: true,
        toolName,
        result,
        duration: Date.now() - startTime,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        toolName,
        result: null,
        error: message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 使用 Zod Schema 校验工具参数
   * @param tool 工具定义
   * @param rawArgs 原始参数
   * @returns 校验后的参数
   * @throws 校验失败时抛出错误
   */
  private validateArgs(tool: Tool, rawArgs: Record<string, unknown>): Record<string, unknown> {
    const result = tool.parameters.safeParse(rawArgs);
    if (!result.success) {
      const errors = result.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
      throw new Error(`参数校验失败: ${errors}`);
    }
    return result.data as Record<string, unknown>;
  }

  /**
   * 检查 SSRF 防护
   * 拦截 web_fetch 对私网/回环地址的请求
   * @param args 校验后的参数
   * @throws 当目标地址不安全时抛出错误
   */
  private checkSsrf(args: Record<string, unknown>): void {
    const url = args.url as string | undefined;
    if (url === undefined || !isSafeUrl(url)) {
      throw new Error('SSRF 防护：禁止请求内网或回环地址');
    }
  }

  /**
   * 带超时的工具执行
   * @param tool 工具定义
   * @param args 校验后的参数
   * @returns 执行结果
   */
  private async executeWithTimeout(
    tool: Tool,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const timeoutMs = tool.timeout || this.defaultTimeout;

    return await new Promise<unknown>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`工具 "${tool.name}" 执行超时（${timeoutMs}ms）`));
      }, timeoutMs);

      tool
        .execute(args)
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((err: unknown) => {
          clearTimeout(timeoutId);
          reject(err instanceof Error ? err : new Error(String(err)));
        });
    });
  }
}

/**
 * 注册内置工具集合
 * 提供 web_fetch、echo、time 等基础工具
 * @param registry 工具注册中心实例
 */
export function registerBuiltinTools(registry: ToolRegistry): void {
  registry.register({
    name: 'web_fetch',
    description: '获取指定 URL 的网页内容，返回纯文本。支持 SSRF 防护，禁止访问内网地址。',
    parameters: WebFetchParamsSchema.describe('web_fetch 工具参数'),
    timeout: 10000,
    execute: async (args: Record<string, unknown>) => {
      const url = args.url as string;
      const method = (args.method as 'GET' | 'POST') ?? 'GET';
      const headers = (args.headers as Record<string, string>) ?? {};
      const body = args.body as string | undefined;

      const response = await fetch(url, {
        method,
        headers,
        body,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    },
  });

  registry.register({
    name: 'echo',
    description: '回声工具，将输入文本按指定次数重复输出',
    parameters: EchoParamsSchema.describe('echo 工具参数'),
    timeout: 1000,
    execute: async (args: Record<string, unknown>) => {
      const message = args.message as string;
      const times = args.times as number;
      return Array.from({ length: times }, () => message).join('\n');
    },
  });

  registry.register({
    name: 'time',
    description: '获取当前时间，支持指定时区',
    parameters: TimeParamsSchema.describe('time 工具参数'),
    timeout: 500,
    execute: async (args: Record<string, unknown>) => {
      const timezone = args.timezone as string;
      const now = new Date();
      return {
        timestamp: now.toISOString(),
        local: now.toLocaleString('zh-CN', { timeZone: timezone }),
        unix: Math.floor(now.getTime() / 1000),
      };
    },
  });
}