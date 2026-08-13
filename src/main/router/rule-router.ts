/**
 * L0 规则路由
 * 基于关键词/正则匹配的快速响应层，命中时 < 1ms 响应，不调用任何 L1/L2 模型
 */

/** 规则类型枚举 */
export const RULE_TYPE = {
  GREETING: 'greeting',
  FAREWELL: 'farewell',
  GRATITUDE: 'gratitude',
  HELP: 'help',
  ANXIETY: 'anxiety',
  SADNESS: 'sadness',
} as const;

export type RuleType = (typeof RULE_TYPE)[keyof typeof RULE_TYPE];

/** 规则匹配结果 */
export interface RuleMatch {
  /** 是否命中规则 */
  matched: boolean;
  /** 命中的规则类型 */
  ruleType?: RuleType;
  /** 预设响应文本 */
  response?: string;
  /** 响应耗时（毫秒） */
  latencyMs: number;
}

/** 规则配置项 */
interface RuleConfig {
  /** 规则类型 */
  type: RuleType;
  /** 匹配关键词数组 */
  keywords: string[];
  /** 正则表达式（可选） */
  patterns?: RegExp[];
  /** 预设响应列表 */
  responses: string[];
}

/**
 * 文本归一化
 * 去除多余空格、统一小写、移除标点
 */
export function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, ' ')
    .replace(/[，。！？、；：""''（）\[\]【】]/g, '')
    .replace(/[!?.,;:'"()\[\]]/g, '')
    .trim();
}

/**
 * L0 规则路由类
 * 提供规则注册、匹配、响应生成能力
 */
export class RuleRouter {
  private rules: Map<RuleType, RuleConfig>;

  constructor() {
    this.rules = new Map();
    this.initDefaultRules();
  }

  /**
   * 初始化默认规则集
   */
  private initDefaultRules(): void {
    this.registerRule({
      type: RULE_TYPE.GREETING,
      keywords: ['你好', '您好', 'hi', 'hello', 'hey', '嗨', '早上好', '下午好', '晚上好'],
      patterns: [/^(你好|您好|hi|hello|hey|嗨)/i],
      responses: [
        '你好呀！有什么我可以帮忙的吗？',
        '嗨！很高兴见到你，今天过得怎么样？',
        '你好！我是 Love Code，随时准备为你服务～',
      ],
    });

    this.registerRule({
      type: RULE_TYPE.FAREWELL,
      keywords: ['再见', '拜拜', 'bye', 'goodbye', '晚安', '88'],
      patterns: [/(再见|拜拜|bye|goodbye|晚安|88)$/i],
      responses: [
        '再见啦，期待下次和你聊天～',
        '晚安，做个好梦！',
        '下次见！祝你有美好的一天。',
      ],
    });

    this.registerRule({
      type: RULE_TYPE.GRATITUDE,
      keywords: ['谢谢', '多谢', '感谢', 'thanks', 'thank you', 'thx'],
      patterns: [/(谢谢|多谢|感谢|thanks|thank|thx)/i],
      responses: [
        '不客气！能帮到你我很开心～',
        '不用谢，随时为你服务！',
        '很高兴能帮上忙！',
      ],
    });

    this.registerRule({
      type: RULE_TYPE.HELP,
      keywords: ['帮助', 'help', '怎么用', '使用说明', '指令'],
      patterns: [/(帮助|help|怎么用|使用说明|指令|命令)/i],
      responses: [
        '我可以帮你：\n1. 回答问题\n2. 分析文件\n3. 搜索信息\n4. 编写代码\n\n请告诉我你需要什么帮助？',
        '需要帮助吗？我可以执行各种任务，包括文件操作、信息检索、代码编写等。',
      ],
    });

    this.registerRule({
      type: RULE_TYPE.ANXIETY,
      keywords: ['焦虑', '紧张', '担心', '压力', 'anxious', 'stress', 'worried'],
      patterns: [/(焦虑|紧张|担心|压力|anxious|stress|worried)/i],
      responses: [
        '深呼吸～ 想和我聊聊是什么让你感到焦虑吗？',
        '感到焦虑是很正常的，试着放松一下。需要我帮你做点什么吗？',
      ],
    });

    this.registerRule({
      type: RULE_TYPE.SADNESS,
      keywords: ['难过', '伤心', '沮丧', '哭', 'sad', 'unhappy', 'depressed'],
      patterns: [/(难过|伤心|沮丧|哭|sad|unhappy|depressed)/i],
      responses: [
        '听到你难过我很心疼，想聊聊发生了什么吗？',
        '伤心的时候不要一个人扛着，我在这里陪着你。',
      ],
    });
  }

  /**
   * 注册一条规则
   */
  registerRule(config: RuleConfig): void {
    this.rules.set(config.type, config);
  }

  /**
   * 执行规则匹配
   * @param input 用户输入文本
   * @returns 匹配结果
   */
  match(input: string): RuleMatch {
    const startTime = performance.now();
    const normalized = normalizeText(input);

    for (const [type, config] of this.rules) {
      for (const keyword of config.keywords) {
        if (normalized.includes(keyword.toLowerCase())) {
          const response = this.pickResponse(config.responses);
          return {
            matched: true,
            ruleType: type,
            response,
            latencyMs: performance.now() - startTime,
          };
        }
      }

      if (config.patterns) {
        for (const pattern of config.patterns) {
          if (pattern.test(input)) {
            const response = this.pickResponse(config.responses);
            return {
              matched: true,
              ruleType: type,
              response,
              latencyMs: performance.now() - startTime,
            };
          }
        }
      }
    }

    return {
      matched: false,
      latencyMs: performance.now() - startTime,
    };
  }

  /**
   * 随机选择一条响应
   */
  private pickResponse(responses: string[]): string {
    const index = Math.floor(Math.random() * responses.length);
    return responses[index] ?? responses[0] ?? '嗯...';
  }

  /**
   * 运行黄金集测试
   * @returns 测试结果
   */
  runGoldenTest(): { total: number; passed: number; failed: number } {
    const goldenSet = this.getGoldenSet();
    let passed = 0;

    for (const testCase of goldenSet) {
      const result = this.match(testCase.input);
      if (result.matched === testCase.expected) {
        passed++;
      }
    }

    return {
      total: goldenSet.length,
      passed,
      failed: goldenSet.length - passed,
    };
  }

  /**
   * 获取黄金集测试数据
   */
  private getGoldenSet(): Array<{ input: string; expected: boolean }> {
    return [
      { input: '你好', expected: true },
      { input: '您好呀', expected: true },
      { input: 'hi there', expected: true },
      { input: 'hello world', expected: true },
      { input: '早上好', expected: true },
      { input: '下午好', expected: true },
      { input: '晚上好', expected: true },
      { input: '再见', expected: true },
      { input: '拜拜～', expected: true },
      { input: '晚安了', expected: true },
      { input: 'bye bye', expected: true },
      { input: 'goodbye', expected: true },
      { input: '谢谢你的帮助', expected: true },
      { input: '非常感谢', expected: true },
      { input: '多谢了', expected: true },
      { input: 'thanks a lot', expected: true },
      { input: 'thank you very much', expected: true },
      { input: '你能做什么', expected: true },
      { input: '怎么使用', expected: true },
      { input: 'help me', expected: true },
      { input: '需要帮助', expected: true },
      { input: '我最近很焦虑', expected: true },
      { input: '感到压力很大', expected: true },
      { input: 'I feel anxious', expected: true },
      { input: '太紧张了', expected: true },
      { input: '我好难过', expected: true },
      { input: '今天很伤心', expected: true },
      { input: 'I feel sad', expected: true },
      { input: '心情很沮丧', expected: true },
      { input: '帮我写一段代码', expected: false },
      { input: '分析一下这个文件', expected: false },
      { input: '搜索一下最新的新闻', expected: false },
      { input: '计算一下这道题', expected: false },
    ];
  }
}