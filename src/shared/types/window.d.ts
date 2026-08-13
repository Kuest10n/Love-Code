/**
 * 全局窗口类型声明
 * 扩展 Window 接口以包含 preload 暴露的 apis
 */

import type { PreloadApi } from '@shared/types/preload-api.js';

declare global {
  interface Window {
    /** Preload 脚本暴露的类型化 IPC API */
    apis: PreloadApi;
  }
}

export {};