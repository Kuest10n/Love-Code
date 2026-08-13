/**
 * 全局类型声明
 * 为 window.apis 提供 TypeScript 类型支持
 */

import type { PreloadApi } from '@shared/types/preload-api.js';

declare global {
  interface Window {
    apis: PreloadApi;
  }
}

export {};
