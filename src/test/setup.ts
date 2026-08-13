/**
 * Vitest 全局 Setup 文件
 * 配置测试环境、注册全局 mock 与扩展
 */

import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

/**
 * 模拟 Electron 的 ipcRenderer
 * 供渲染进程单元测试使用
 */
const mockIpcRenderer = {
  invoke: vi.fn<(channel: string, ...args: unknown[]) => Promise<unknown>>(),
  on: vi.fn<(channel: string, callback: (...args: unknown[]) => void) => void>(),
  send: vi.fn<(channel: string, ...args: unknown[]) => void>(),
  removeListener: vi.fn<(channel: string, callback: (...args: unknown[]) => void) => void>(),
};

vi.mock('electron', () => ({
  ipcRenderer: mockIpcRenderer,
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
}));

/**
 * 模拟 window.apis（preload 暴露的 API）
 */
const mockApis = {
  agent: {
    sendMessage: vi.fn<(message: unknown) => Promise<unknown>>(),
    onStream: vi.fn<(callback: (payload: unknown) => void) => () => void>(),
  },
  agentTool: {
    invoke: vi.fn<(payload: unknown) => Promise<unknown>>(),
    onProgress: vi.fn<(callback: (payload: unknown) => void) => () => void>(),
  },
  model: {
    onDelta: vi.fn<(callback: (payload: unknown) => void) => () => void>(),
    onDone: vi.fn<(callback: (payload: unknown) => void) => () => void>(),
  },
  state: {
    onChange: vi.fn<(callback: (payload: unknown) => void) => () => void>(),
    query: vi.fn<() => Promise<unknown[]>>(),
  },
  live2d: {
    sendAction: vi.fn<(payload: unknown) => void>(),
    sendEmotion: vi.fn<(payload: unknown) => void>(),
  },
  tts: {
    synthesize: vi.fn<(text: string) => Promise<unknown>>(),
    onChunk: vi.fn<(callback: (payload: unknown) => void) => () => void>(),
    onDone: vi.fn<(callback: (payload: unknown) => void) => () => void>(),
  },
};

Object.defineProperty(window, 'apis', {
  value: mockApis,
  writable: true,
  configurable: true,
});

/**
 * 清理所有 mock 调用记录
 * 在每个测试前自动执行
 */
beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.restoreAllMocks();
});

export {};