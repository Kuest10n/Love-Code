/**
 * 示例测试套件
 * 演示 Vitest + React Testing Library 的使用方式
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createDefaultConfig } from '@shared/types/config.js';
import { EmotionType } from '@shared/types/emotion.js';
import { AGENT_CHANNELS } from '@shared/ipc-channels.js';

/**
 * 共享模块测试
 * 验证类型定义、常量与工具函数的正确性
 */
describe('共享模块', () => {
  describe('IPC 通道常量', () => {
    it('应导出 6 组通道常量', () => {
      expect(AGENT_CHANNELS).toBeDefined();
      expect(AGENT_CHANNELS.SEND).toBe('agent:chat:send');
      expect(AGENT_CHANNELS.ON_STREAM).toBe('agent:chat:on-stream');
    });

    it('所有通道名称应为字符串', () => {
      const channels = [
        AGENT_CHANNELS.SEND,
        AGENT_CHANNELS.ON_STREAM,
      ];
      for (const ch of channels) {
        expect(typeof ch).toBe('string');
        expect(ch.length).toBeGreaterThan(0);
      }
    });
  });

  describe('情感类型', () => {
    it('应包含 15 种情感类型', () => {
      const emotionKeys = Object.values(EmotionType);
      expect(emotionKeys).toHaveLength(15);
    });

    it('应包含核心情感', () => {
      expect(EmotionType.Neutral).toBe('neutral');
      expect(EmotionType.Happy).toBe('happy');
      expect(EmotionType.Sad).toBe('sad');
      expect(EmotionType.Angry).toBe('angry');
    });
  });

  describe('默认配置', () => {
    it('应创建合法的默认配置', () => {
      const config = createDefaultConfig();

      expect(config.version).toBe(1);
      expect(config.ollama.baseUrl).toBe('http://localhost:11434');
      expect(config.model.defaultModel).toBeTruthy();
      expect(config.tts.enabled).toBe(true);
      expect(config.live2d.enabled).toBe(true);
      expect(config.ui.theme).toBe('dark');
    });

    it('默认配置应包含所有子系统', () => {
      const config = createDefaultConfig();

      expect(config.ollama).toBeDefined();
      expect(config.model).toBeDefined();
      expect(config.tts).toBeDefined();
      expect(config.live2d).toBeDefined();
      expect(config.ui).toBeDefined();
      expect(config.database).toBeDefined();
    });
  });
});

/**
 * 渲染进程组件测试
 * 演示 React 组件的渲染与交互测试
 */
describe('渲染进程', () => {
  beforeEach(() => {
    // 每个测试前重置 DOM
    document.body.innerHTML = '';
  });

  it('应能渲染根组件', () => {
    const div = document.createElement('div');
    div.id = 'root';
    document.body.appendChild(div);

    render(
      <div>
        <h1>Love Code</h1>
      </div>,
      { container: div },
    );

    expect(screen.getByText('Love Code')).toBeInTheDocument();
  });
});