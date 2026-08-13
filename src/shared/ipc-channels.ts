/**
 * IPC 通道名称常量
 * 定义主进程、预加载层与渲染进程之间通信的 7 个通道
 */

/** 智能体聊天通道 - 传输用户消息与智能体响应 */
export const AGENT_CHANNELS = {
  /** 发送聊天请求（invoke 双向通信） */
  SEND: 'agent:chat:send',
  /** 接收聊天流（on 单向监听） */
  ON_STREAM: 'agent:chat:on-stream',
  /** 中断当前生成（send 单向发送） */
  INTERRUPT: 'agent:chat:interrupt',
} as const;

/** 智能体工具调用通道 - 传输工具执行请求与结果 */
export const AGENT_TOOL_CALL_CHANNELS = {
  /** 发起工具调用（invoke 双向通信） */
  INVOKE: 'agent:tool-call:invoke',
  /** 接收工具调用进度（on 单向监听） */
  ON_PROGRESS: 'agent:tool-call:on-progress',
} as const;

/** 模型增量输出通道 - 传输流式文本生成增量数据 */
export const MODEL_DELTA_CHANNELS = {
  /** 推送模型增量数据（on 单向监听） */
  ON_DELTA: 'model:delta:on-delta',
  /** 通知生成完成（on 单向监听） */
  ON_DONE: 'model:delta:on-done',
} as const;

/** 状态变更通道 - 传输应用状态变化事件 */
export const STATE_CHANGE_CHANNELS = {
  /** 订阅状态变更（on 单向监听） */
  ON_STATE: 'state:change:on-state',
  /** 查询当前状态（invoke 双向通信） */
  QUERY: 'state:change:query',
} as const;

/** Live2D 动作通道 - 传输虚拟形象动画与情感指令 */
export const LIVE2D_ACTION_CHANNELS = {
  /** 触发 Live2D 动作（send 单向发送） */
  SEND_ACTION: 'live2d:action:send',
  /** 设置 Live2D 情感（send 单向发送） */
  SEND_EMOTION: 'live2d:action:send-emotion',
} as const;

/** 语音合成通道 - 传输 TTS 音频流数据 */
export const TTS_CHUNK_CHANNELS = {
  /** 发送文本合成请求（invoke 双向通信） */
  SYNTHESIZE: 'tts:chunk:synthesize',
  /** 接收合成音频块（on 单向监听） */
  ON_CHUNK: 'tts:chunk:on-chunk',
  /** 通知合成完成（on 单向监听） */
  ON_DONE: 'tts:chunk:on-done',
} as const;

/** 会话管理通道 - 会话历史持久化与检索 */
export const CONVERSATION_CHANNELS = {
  /** 创建会话（invoke） */
  CREATE: 'conversation:create',
  /** 获取会话列表（invoke） */
  LIST: 'conversation:list',
  /** 获取单个会话详情（invoke） */
  GET: 'conversation:get',
  /** 更新会话（invoke） */
  UPDATE: 'conversation:update',
  /** 删除会话（invoke） */
  DELETE: 'conversation:delete',
  /** 获取会话消息列表（invoke） */
  LIST_MESSAGES: 'conversation:list-messages',
  /** 添加消息到会话（invoke） */
  ADD_MESSAGE: 'conversation:add-message',
} as const;

/** 配置管理通道 - 应用设置动态更新 */
export const CONFIG_CHANNELS = {
  /** 获取当前完整配置（invoke） */
  GET: 'config:get',
  /** 更新指定配置项（invoke） */
  UPDATE: 'config:update',
  /** 监听配置变更事件（on 单向监听） */
  ON_CHANGE: 'config:on-change',
  /** 从 Ollama 刷新可用模型列表（invoke） */
  REFRESH_MODELS: 'config:refresh-models',
  /** 检测 Ollama 服务状态（invoke） */
  CHECK_OLLAMA: 'config:check-ollama',
  /** 尝试启动 Ollama 服务（invoke） */
  START_OLLAMA: 'config:start-ollama',
} as const;

/** 上下文管理通道 - 上下文压缩与状态监控 */
export const CONTEXT_CHANNELS = {
  /** 触发上下文压缩（软水位压缩）（invoke） */
  COMPRESS: 'context:compress',
  /** 强制截断上下文（硬水位）（invoke） */
  TRUNCATE: 'context:truncate',
  /** 获取上下文使用统计（invoke） */
  STATS: 'context:stats',
} as const;

/** 记忆系统通道 - 记忆检索与管理 */
export const MEMORY_CHANNELS = {
  /** 搜索记忆（invoke） */
  SEARCH: 'memory:search',
  /** 添加记忆（invoke） */
  ADD: 'memory:add',
  /** 获取所有记忆（invoke） */
  LIST: 'memory:list',
  /** 删除记忆（invoke） */
  DELETE: 'memory:delete',
  /** 运行遗忘曲线清理（invoke） */
  FORGET: 'memory:forget',
} as const;

/**
 * 所有 IPC 通道名称的联合类型
 */
export type IpcChannelName =
  | (typeof AGENT_CHANNELS)[keyof typeof AGENT_CHANNELS]
  | (typeof AGENT_TOOL_CALL_CHANNELS)[keyof typeof AGENT_TOOL_CALL_CHANNELS]
  | (typeof MODEL_DELTA_CHANNELS)[keyof typeof MODEL_DELTA_CHANNELS]
  | (typeof STATE_CHANGE_CHANNELS)[keyof typeof STATE_CHANGE_CHANNELS]
  | (typeof LIVE2D_ACTION_CHANNELS)[keyof typeof LIVE2D_ACTION_CHANNELS]
  | (typeof TTS_CHUNK_CHANNELS)[keyof typeof TTS_CHUNK_CHANNELS]
  | (typeof CONVERSATION_CHANNELS)[keyof typeof CONVERSATION_CHANNELS]
  | (typeof CONFIG_CHANNELS)[keyof typeof CONFIG_CHANNELS]
  | (typeof CONTEXT_CHANNELS)[keyof typeof CONTEXT_CHANNELS]
  | (typeof MEMORY_CHANNELS)[keyof typeof MEMORY_CHANNELS];