/**
 * IPC 通道名称常量
 * 定义主进程、预加载层与渲染进程之间通信的 6 个通道
 */

/** 智能体聊天通道 - 传输用户消息与智能体响应 */
export const AGENT_CHANNELS = {
  /** 发送聊天请求（invoke 双向通信） */
  SEND: 'agent:chat:send',
  /** 接收聊天流（on 单向监听） */
  ON_STREAM: 'agent:chat:on-stream',
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

/**
 * 所有 IPC 通道名称的联合类型
 */
export type IpcChannelName =
  | (typeof AGENT_CHANNELS)[keyof typeof AGENT_CHANNELS]
  | (typeof AGENT_TOOL_CALL_CHANNELS)[keyof typeof AGENT_TOOL_CALL_CHANNELS]
  | (typeof MODEL_DELTA_CHANNELS)[keyof typeof MODEL_DELTA_CHANNELS]
  | (typeof STATE_CHANGE_CHANNELS)[keyof typeof STATE_CHANGE_CHANNELS]
  | (typeof LIVE2D_ACTION_CHANNELS)[keyof typeof LIVE2D_ACTION_CHANNELS]
  | (typeof TTS_CHUNK_CHANNELS)[keyof typeof TTS_CHUNK_CHANNELS];