/**
 * 工具注册中心
 * 提供工具注册、参数校验、SSRF 防护与执行调度
 */

/** 工具定义 */
export interface ToolDefinition {
  /** 工具名称（唯一标识） */
  name: string;
  /** 工具描述（供模型使用） */
  description: string;
  /** 参数定义（JSON Schema 格式） */
  parameters: ToolParameterDef;
  /** 执行函数 */
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
  /** 是否启用 SSRF 防护 */
  ssrfProtection?: boolean;
}

/** 参数定义 */
export interface ToolParameterDef {
  type: 'object';
  properties: Record<string, ToolPropertyDef>;
  required?: string[];
}

/** 属性定义 */
export interface ToolPropertyDef {
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  enum?: string[];
  minLength?: number;
  maxLength?: number;
  minItems?: number;
}

/** 工具执行结果 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  executionTimeMs: number;
}

/** SSRF 防护配置 */
export interface SsrfProtectionConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 允许的主机名模式（正则） */
  allowHosts: RegExp[];
  /** 禁止的 IP 网段 */
  blockHosts: RegExp[];
  /** 最大请求大小（字节） */
  maxSize: number;
  /** 请求超时（毫秒） */
  timeout: number;
}

/** 默认 SSRF 配置 */
const DEFAULT_SSRF: SsrfProtectionConfig = {
  enabled: true,
  allowHosts: [/^https?:\/\/(?!localhost|127\.0\.0\.1|10\.\d+|172\.\d+|192\.168\.)/,],
  blockHosts: [
    /localhost/,
    /127\.0\.0\.1/,
    /10\.\d+\.\d+\.\d+/,
    /172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/,
    /192\.168\.\d+\.\d+/,
    /0\.0\.0\.0/,
  ],
  maxSize: 10 * 1024 * 1024,
  timeout: 15000,
};

/**
 * ToolRegistry 类
 * 工具注册中心
 */
export class ToolRegistry {
  private tools: Map<string, ToolDefinition>;
  private ssrfConfig: SsrfProtectionConfig;

  constructor(ssrfConfig: Partial<SsrfProtectionConfig> = {}) {
    this.tools = new Map();
    this.ssrfConfig = { ...DEFAULT_SSRF, ...ssrfConfig };
    this.registerBuiltinTools();
  }

  /**
   * 注册工具
   */
  register(definition: ToolDefinition): void {
    if (this.tools.has(definition.name)) {
      console.warn(`[ToolRegistry] Tool "${definition.name}" already registered, overwriting.`);
    }
    this.tools.set(definition.name, definition);
  }

  /**
   * 注销工具
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * 获取工具
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * 列出所有工具
   */
  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取工具描述列表（供模型使用）
   */
  getToolDescriptions(): Array<{ name: string; description: string; parameters: ToolParameterDef }> {
    return this.list().map(({ name, description, parameters }) => ({
      name,
      description,
      parameters,
    }));
  }

  /**
   * 执行工具
   */
  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool "${name}" not found`,
        executionTimeMs: 0,
      };
    }

    if (tool.ssrfProtection && this.ssrfConfig.enabled) {
      const ssrfCheck = this.validateSsrf(args);
      if (!ssrfCheck.valid) {
        return {
          success: false,
          error: `SSRF protection: ${ssrfCheck.reason}`,
          executionTimeMs: 0,
        };
      }
    }

    const validationError = this.validateParameters(tool, args);
    if (validationError) {
      return {
        success: false,
        error: validationError,
        executionTimeMs: 0,
      };
    }

    const startTime = performance.now();
    try {
      const result = await tool.execute(args);
      return {
        ...result,
        executionTimeMs: performance.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTimeMs: performance.now() - startTime,
      };
    }
  }

  /**
   * 参数校验
   */
  private validateParameters(tool: ToolDefinition, args: Record<string, unknown>): string | null {
    const { parameters } = tool;

    if (parameters.required) {
      for (const field of parameters.required) {
        if (!(field in args)) {
          return `Missing required parameter: ${field}`;
        }
      }
    }

    for (const [key, value] of Object.entries(args)) {
      const propDef = parameters.properties[key];
      if (!propDef) continue;

      if (!this.validateType(value, propDef)) {
        return `Invalid type for "${key}": expected ${propDef.type}`;
      }

      if (propDef.enum && typeof value === 'string') {
        if (!propDef.enum.includes(value)) {
          return `Invalid value for "${key}": must be one of ${propDef.enum.join(', ')}`;
        }
      }

      if (typeof value === 'string' && propDef.minLength !== undefined) {
        if (value.length < propDef.minLength) {
          return `"${key}" must be at least ${propDef.minLength} characters`;
        }
      }
      if (typeof value === 'string' && propDef.maxLength !== undefined) {
        if (value.length > propDef.maxLength) {
          return `"${key}" must be at most ${propDef.maxLength} characters`;
        }
      }
    }

    return null;
  }

  /**
   * 类型校验辅助
   */
  private validateType(value: unknown, def: ToolPropertyDef): boolean {
    switch (def.type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      default:
        return true;
    }
  }

  /**
   * SSRF 校验
   */
  private validateSsrf(args: Record<string, unknown>): { valid: boolean; reason?: string } {
    const urlField = args.url;
    if (typeof urlField !== 'string') {
      return { valid: true };
    }

    try {
      const url = new URL(urlField);

      for (const pattern of this.ssrfConfig.blockHosts) {
        if (pattern.test(url.hostname)) {
          return { valid: false, reason: 'Access to internal network addresses is blocked' };
        }
      }

      let allowed = false;
      for (const pattern of this.ssrfConfig.allowHosts) {
        if (pattern.test(url.href)) {
          allowed = true;
          break;
        }
      }

      if (!allowed) {
        return { valid: false, reason: 'URL does not match allowed hosts' };
      }

      return { valid: true };
    } catch {
      return { valid: false, reason: 'Invalid URL format' };
    }
  }

  /**
   * 注册内置工具
   */
  private registerBuiltinTools(): void {
    this.register({
      name: 'web_fetch',
      description: '获取指定 URL 的网页内容，返回纯文本',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '目标网页 URL',
          },
        },
        required: ['url'],
      },
      ssrfProtection: true,
      execute: async (args) => {
        const url = args.url as string;
        const response = await fetch(url, {
          signal: AbortSignal.timeout(this.ssrfConfig.timeout),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const text = await response.text();
        return { success: true, data: { content: text.slice(0, 50000) }, executionTimeMs: 0 };
      },
    });

    this.register({
      name: 'file_search',
      description: '在指定目录中搜索文件',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词',
          },
          path: {
            type: 'string',
            description: '搜索路径',
          },
        },
        required: ['query'],
      },
      execute: async (args) => {
        const query = args.query as string;
        return {
          success: true,
          data: {
            results: [
              { path: 'demo.txt', relevance: 0.95 },
              { path: 'example.md', relevance: 0.82 },
            ],
            query,
          },
          executionTimeMs: 0,
        };
      },
    });

    this.register({
      name: 'code_search',
      description: '在代码库中搜索指定模式',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: '搜索模式或关键词',
          },
          language: {
            type: 'string',
            description: '编程语言过滤',
            enum: ['typescript', 'javascript', 'python', 'rust', 'go'],
          },
        },
        required: ['pattern'],
      },
      execute: async (args) => {
        const pattern = args.pattern as string;
        return {
          success: true,
          data: {
            matches: [
              { file: 'src/index.ts', line: 1, content: `// Found: ${pattern}` },
            ],
            totalMatches: 1,
          },
          executionTimeMs: 0,
        };
      },
    });
  }
}