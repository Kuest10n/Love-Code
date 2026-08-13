/**
 * 渲染进程入口
 * 初始化 React 应用并挂载到 #root 节点
 */

import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from './App.js';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('根元素 #root 未找到');
}

const root: Root = createRoot(rootElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * 开发模式下的 HMR 支持
 */
if (import.meta.hot) {
  import.meta.hot.accept();
}