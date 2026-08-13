import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  tags: string[];
  triggers: string[];
  parameters: SkillParameter[];
  isBuiltin: boolean;
}

export interface SkillParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
}

export interface SkillCall {
  id: string;
  skillId: string;
  timestamp: number;
  parameters: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  duration?: number;
}

export interface SkillConfig {
  enableSkills: boolean;
  skillDir: string;
  maxHistory: number;
  enabledSkills: string[];
}

const DEFAULT_CONFIG: SkillConfig = {
  enableSkills: true,
  skillDir: join(tmpdir(), 'love-code', 'skills'),
  maxHistory: 200,
  enabledSkills: [],
};

const BUILTIN_SKILLS: SkillDefinition[] = [
  {
    id: 'weather',
    name: '天气查询',
    description: '查询指定城市的天气信息',
    version: '1.0.0',
    tags: ['天气', '生活'],
    triggers: ['天气', '气温', '下雨', '温度'],
    parameters: [
      { name: 'city', type: 'string', description: '城市名称', required: true },
      { name: 'days', type: 'number', description: '查询天数', required: false, default: 1 },
    ],
    isBuiltin: true,
  },
  {
    id: 'timer',
    name: '计时器',
    description: '设置倒计时或定时器提醒',
    version: '1.0.0',
    tags: ['时间', '提醒'],
    triggers: ['计时', '倒计时', '提醒', '闹钟'],
    parameters: [
      { name: 'duration', type: 'number', description: '时长(秒)', required: true },
      { name: 'message', type: 'string', description: '提醒消息', required: false, default: '时间到！' },
    ],
    isBuiltin: true,
  },
  {
    id: 'calculator',
    name: '计算器',
    description: '执行数学计算',
    version: '1.0.0',
    tags: ['计算', '数学'],
    triggers: ['计算', '算一下', '等于多少'],
    parameters: [
      { name: 'expression', type: 'string', description: '数学表达式', required: true },
    ],
    isBuiltin: true,
  },
  {
    id: 'translate',
    name: '翻译',
    description: '多语言翻译服务',
    version: '1.0.0',
    tags: ['翻译', '语言'],
    triggers: ['翻译', 'translate'],
    parameters: [
      { name: 'text', type: 'string', description: '待翻译文本', required: true },
      { name: 'targetLang', type: 'string', description: '目标语言', required: false, default: 'en' },
    ],
    isBuiltin: true,
  },
  {
    id: 'screenshot',
    name: '屏幕截图',
    description: '截取屏幕并进行 OCR 识别',
    version: '1.0.0',
    tags: ['截图', '视觉'],
    triggers: ['截图', '截屏', '看屏幕'],
    parameters: [
      { name: 'region', type: 'object', description: '截图区域', required: false },
    ],
    isBuiltin: true,
  },
];

export class SkillManager {
  private config: SkillConfig;
  private skills: Map<string, SkillDefinition>;
  private callHistory: SkillCall[];

  constructor(config: Partial<SkillConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.skills = new Map();
    this.callHistory = [];
    this.ensureDirectory();
    this.registerBuiltinSkills();
  }

  private ensureDirectory(): void {
    if (!existsSync(this.config.skillDir)) {
      mkdirSync(this.config.skillDir, { recursive: true });
    }
  }

  private registerBuiltinSkills(): void {
    for (const skill of BUILTIN_SKILLS) {
      this.skills.set(skill.id, skill);
      if (!this.config.enabledSkills.includes(skill.id)) {
        this.config.enabledSkills.push(skill.id);
      }
    }
  }

  updateConfig(config: Partial<SkillConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): SkillConfig {
    return { ...this.config };
  }

  registerSkill(skill: SkillDefinition): void {
    this.skills.set(skill.id, skill);
  }

  listSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  getSkill(id: string): SkillDefinition | undefined {
    return this.skills.get(id);
  }

  enableSkill(id: string): boolean {
    if (!this.skills.has(id)) return false;
    if (!this.config.enabledSkills.includes(id)) {
      this.config.enabledSkills.push(id);
    }
    return true;
  }

  disableSkill(id: string): boolean {
    const index = this.config.enabledSkills.indexOf(id);
    if (index >= 0) {
      this.config.enabledSkills.splice(index, 1);
      return true;
    }
    return false;
  }

  isSkillEnabled(id: string): boolean {
    return this.config.enabledSkills.includes(id);
  }

  matchSkills(text: string): SkillDefinition[] {
    const matched: SkillDefinition[] = [];
    const lowerText = text.toLowerCase();

    for (const [, skill] of this.skills) {
      if (!this.isSkillEnabled(skill.id)) continue;

      for (const trigger of skill.triggers) {
        if (lowerText.includes(trigger.toLowerCase())) {
          matched.push(skill);
          break;
        }
      }
    }

    return matched;
  }

  async executeSkill(skillId: string, parameters: Record<string, unknown>): Promise<SkillCall> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error(`技能不存在: ${skillId}`);
    }

    const callId = this.generateId(`call_${Date.now()}`);
    const call: SkillCall = {
      id: callId,
      skillId,
      timestamp: Date.now(),
      parameters,
      status: 'running',
    };

    const startTime = Date.now();

    try {
      const result = await this.executeBuiltinSkill(skill, parameters);
      call.status = 'completed';
      call.result = result;
      call.duration = Date.now() - startTime;
    } catch (error) {
      call.status = 'failed';
      call.error = error instanceof Error ? error.message : String(error);
      call.duration = Date.now() - startTime;
    }

    this.addToHistory(call);
    return call;
  }

  private async executeBuiltinSkill(skill: SkillDefinition, parameters: Record<string, unknown>): Promise<unknown> {
    switch (skill.id) {
      case 'weather':
        return this.simulateWeatherQuery(parameters);
      case 'timer':
        return this.simulateTimer(parameters);
      case 'calculator':
        return this.simulateCalculation(parameters);
      case 'translate':
        return this.simulateTranslate(parameters);
      case 'screenshot':
        return { success: true, message: '截图已触发' };
      default:
        return { message: `${skill.name} 已执行`, parameters };
    }
  }

  private simulateWeatherQuery(params: Record<string, unknown>): unknown {
    const city = String(params.city ?? '');
    return {
      city,
      temperature: Math.floor(Math.random() * 30) + 15,
      condition: '晴朗',
      humidity: Math.floor(Math.random() * 40) + 40,
      queryTime: new Date().toISOString(),
    };
  }

  private async simulateTimer(params: Record<string, unknown>): Promise<unknown> {
    const duration = Number(params.duration ?? 60);
    const message = String(params.message ?? '时间到！');
    return {
      message: `计时器已设置: ${duration}秒后提醒 "${message}"`,
      duration,
    };
  }

  private simulateCalculation(params: Record<string, unknown>): unknown {
    const expression = String(params.expression ?? '0');
    try {
      const result = Function(`"use strict"; return (${expression});`)();
      return { expression, result };
    } catch {
      return { expression, result: null, error: '表达式无效' };
    }
  }

  private simulateTranslate(params: Record<string, unknown>): unknown {
    const text = String(params.text ?? '');
    const targetLang = String(params.targetLang ?? 'en');
    return {
      source: text,
      targetLang,
      translatedText: `[${targetLang}] ${text}`,
    };
  }

  getCallHistory(limit?: number): SkillCall[] {
    return limit ? this.callHistory.slice(-limit) : [...this.callHistory];
  }

  getEnabledSkills(): SkillDefinition[] {
    return this.listSkills().filter((s) => this.isSkillEnabled(s.id));
  }

  private generateId(prefix: string): string {
    const random = createHash('md5').update(`${prefix}_${Math.random()}`).digest('hex').slice(0, 8);
    return `${prefix}_${random}`;
  }

  private addToHistory(call: SkillCall): void {
    this.callHistory.push(call);
    if (this.callHistory.length > this.config.maxHistory) {
      this.callHistory.shift();
    }
  }
}
