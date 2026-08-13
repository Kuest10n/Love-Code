import { useState, useCallback, useEffect, type ReactElement } from 'react';
import type { AppConfig, EmotionConfig, PersonalityConfig, SkillsConfig, VisionConfig, Live2DConfig, TtsConfig, ActiveConfig } from '@shared/types/config.js';
import type { EmotionType } from '@shared/types/emotion.js';

interface SettingsPanelProps {
  config: AppConfig | null;
  onUpdate: (path: string, value: unknown) => void;
  onRefreshModels: () => Promise<{ success: boolean; models?: string[]; message?: string }>;
  onCheckOllama: () => Promise<boolean>;
  onStartOllama: () => Promise<boolean>;
  onClose: () => void;
  onSaveStatus: string;
  currentEmotion?: EmotionType;
}

const EMOTION_LIST = [
  { key: 'neutral', emoji: '😐', label: '平静', intensity: 0.5 },
  { key: 'happy', emoji: '😊', label: '开心', intensity: 0.7 },
  { key: 'excited', emoji: '🤩', label: '兴奋', intensity: 0.9 },
  { key: 'sad', emoji: '😢', label: '伤心', intensity: 0.6 },
  { key: 'angry', emoji: '😠', label: '生气', intensity: 0.8 },
  { key: 'anxious', emoji: '😰', label: '焦虑', intensity: 0.6 },
  { key: 'surprised', emoji: '😲', label: '惊讶', intensity: 0.5 },
  { key: 'sleepy', emoji: '😴', label: '困倦', intensity: 0.3 },
  { key: 'curious', emoji: '🤔', label: '好奇', intensity: 0.5 },
];

const SKILL_LIST = [
  { id: 'time', name: '时间查询', icon: '⏰', description: '获取当前时间，支持指定时区' },
  { id: 'file_read', name: '文件读取', icon: '📂', description: '读取指定文件的内容，支持多种编码' },
  { id: 'file_write', name: '文件写入', icon: '📝', description: '将内容写入指定文件' },
  { id: 'web_fetch', name: '网页获取', icon: '🌐', description: '获取指定 URL 的网页内容，支持 SSRF 防护' },
  { id: 'search', name: '代码搜索', icon: '🔍', description: '在代码库中搜索符合模式的内容' },
  { id: 'echo', name: '回声测试', icon: '🔊', description: '回声工具，用于测试工具调用链路' },
];

export function SettingsPanel({ config, onUpdate, onRefreshModels, onCheckOllama, onStartOllama, onClose, onSaveStatus, currentEmotion }: SettingsPanelProps): ReactElement {
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [activeTab, setActiveTab] = useState<'model' | 'personality' | 'emotion' | 'skills' | 'vision' | 'live2d' | 'tts' | 'active' | 'advanced'>('model');
  const [customEventName, setCustomEventName] = useState('');
  const [customEventInterval, setCustomEventInterval] = useState('60');

  const checkOllama = useCallback(async (): Promise<void> => {
    setOllamaStatus('checking');
    try {
      const online = await onCheckOllama();
      setOllamaStatus(online ? 'online' : 'offline');
    } catch {
      setOllamaStatus('offline');
    }
  }, [onCheckOllama]);

  useEffect(() => {
    void checkOllama();
  }, [checkOllama]);

  const handleOllamaStart = useCallback(async (): Promise<void> => {
    setOllamaStatus('checking');
    try {
      const success = await onStartOllama();
      setOllamaStatus(success ? 'online' : 'offline');
      if (success) {
        onUpdate('ollama.isOnline', true);
      }
    } catch {
      setOllamaStatus('offline');
    }
  }, [onStartOllama, onUpdate]);

  const handleToggleSkill = useCallback((skillId: string): void => {
    if (!config) return;
    const current = config.skills.enabledSkills;
    const next = current.includes(skillId)
      ? current.filter((id) => id !== skillId)
      : [...current, skillId];
    onUpdate('skills.enabledSkills', next);
  }, [config, onUpdate]);

  const handleAddCustomEvent = useCallback((): void => {
    if (!config || !customEventName.trim()) return;
    const newEvent = {
      id: crypto.randomUUID(),
      name: customEventName.trim(),
      interval: parseInt(customEventInterval) || 60,
      enabled: true,
    };
    const current = config.active.customEvents;
    onUpdate('active.customEvents', [...current, newEvent]);
    setCustomEventName('');
    setCustomEventInterval('60');
  }, [config, customEventName, customEventInterval, onUpdate]);

  const handleRemoveCustomEvent = useCallback((id: string): void => {
    if (!config) return;
    const current = config.active.customEvents;
    onUpdate('active.customEvents', current.filter((e) => e.id !== id));
  }, [config, onUpdate]);

  const handleToggleCustomEvent = useCallback((id: string): void => {
    if (!config) return;
    const current = config.active.customEvents;
    const next = current.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e));
    onUpdate('active.customEvents', next);
  }, [config, onUpdate]);

  if (!config) {
    return (
      <div style={styles.modalOverlay} onClick={onClose}>
        <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div style={styles.modalHeader}>
            <h2 style={styles.modalTitle}>⚙️ 设置</h2>
            <button style={styles.closeButton} onClick={onClose}>✕</button>
          </div>
          <div style={styles.modalBody}>
            <p style={styles.emptyHint}>加载配置中...</p>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { key: 'model', label: '🤖 模型' },
    { key: 'personality', label: '💕 人格' },
    { key: 'emotion', label: '😊 情感' },
    { key: 'skills', label: '🔧 技能' },
    { key: 'vision', label: '👁️ 视觉' },
    { key: 'live2d', label: '🎭 Live2D' },
    { key: 'tts', label: '🔊 语音' },
    { key: 'active', label: '💓 内驱' },
    { key: 'advanced', label: '⚡ 高级' },
  ] as const;

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={{ ...styles.modal, width: '720px' }} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>⚙️ 设置</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {onSaveStatus && <span style={styles.saveStatusText}>{onSaveStatus}</span>}
            <button style={styles.closeButton} onClick={onClose}>✕</button>
          </div>
        </div>
        <div style={styles.modalBody}>
          <div style={styles.tabsContainer}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                style={{
                  ...styles.tabButton,
                  ...(activeTab === tab.key ? styles.tabButtonActive : {}),
                }}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div style={styles.tabContent}>
            {activeTab === 'model' && (
              <ModelSettings
                config={config}
                ollamaStatus={ollamaStatus}
                onOllamaCheck={() => void checkOllama()}
                onOllamaStart={() => void handleOllamaStart()}
                onRefreshModels={() => void onRefreshModels()}
                onUpdate={onUpdate}
              />
            )}
            {activeTab === 'personality' && (
              <PersonalitySettings config={config.personality} onUpdate={onUpdate} />
            )}
            {activeTab === 'emotion' && (
              <EmotionSettings
                config={config.emotion}
                onUpdate={onUpdate}
                liveEmotion={currentEmotion}
              />
            )}
            {activeTab === 'skills' && (
              <SkillsSettings config={config.skills} onUpdate={onUpdate} onToggleSkill={handleToggleSkill} />
            )}
            {activeTab === 'vision' && (
              <VisionSettings config={config.vision} onUpdate={onUpdate} />
            )}
            {activeTab === 'live2d' && (
              <Live2DSettings config={config.live2d} onUpdate={onUpdate} />
            )}
            {activeTab === 'tts' && (
              <TtsSettings config={config.tts} onUpdate={onUpdate} />
            )}
            {activeTab === 'active' && (
              <ActiveSettings
                config={config.active}
                onUpdate={onUpdate}
                customEventName={customEventName}
                setCustomEventName={setCustomEventName}
                customEventInterval={customEventInterval}
                setCustomEventInterval={setCustomEventInterval}
                onAddCustomEvent={handleAddCustomEvent}
                onRemoveCustomEvent={handleRemoveCustomEvent}
                onToggleCustomEvent={handleToggleCustomEvent}
              />
            )}
            {activeTab === 'advanced' && (
              <AdvancedSettings config={config} onUpdate={onUpdate} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ModelSettingsProps {
  config: AppConfig;
  ollamaStatus: 'checking' | 'online' | 'offline';
  onOllamaCheck: () => void;
  onOllamaStart: () => void;
  onRefreshModels: () => void;
  onUpdate: (path: string, value: unknown) => void;
}

function ModelSettings({ config, ollamaStatus, onOllamaCheck, onOllamaStart, onRefreshModels, onUpdate }: ModelSettingsProps): ReactElement {
  const handleAddModel = useCallback((newModel: string): void => {
    const trimmed = newModel.trim();
    if (!trimmed || config.model.availableModels.includes(trimmed)) return;
    onUpdate('model.availableModels', [...config.model.availableModels, trimmed]);
  }, [config, onUpdate]);

  const [newModelName, setNewModelName] = useState('');

  return (
    <div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Ollama 状态</h3>
        <div style={styles.card}>
          <div style={styles.statusRow}>
            <span style={styles.statusLabel}>服务状态</span>
            <div style={styles.statusValue}>
              <span style={{
                ...styles.statusDot,
                background: ollamaStatus === 'online' ? '#4caf50' : ollamaStatus === 'checking' ? '#ff9800' : '#f44336',
              }} />
              <span style={{
                ...styles.statusText,
                color: ollamaStatus === 'online' ? '#4caf50' : ollamaStatus === 'checking' ? '#ff9800' : '#f44336',
              }}>
                {ollamaStatus === 'online' ? '已连接' : ollamaStatus === 'checking' ? '检测中...' : '离线'}
              </span>
            </div>
          </div>
          <div style={styles.statusRow}>
            <span style={styles.statusLabel}>服务地址</span>
            <span style={styles.statusValue}>{config.ollama.baseUrl}</span>
          </div>
          <div style={styles.buttonRow}>
            <button style={styles.actionButton} onClick={onOllamaCheck}>
              🔍 检测连接
            </button>
            <button
              style={{
                ...styles.actionButton,
                background: ollamaStatus === 'online' ? 'rgba(76, 175, 80, 0.15)' : 'rgba(255, 152, 0, 0.15)',
                borderColor: ollamaStatus === 'online' ? 'rgba(76, 175, 80, 0.4)' : 'rgba(255, 152, 0, 0.4)',
                color: ollamaStatus === 'online' ? '#4caf50' : '#ff9800',
              }}
              onClick={onOllamaStart}
              disabled={ollamaStatus === 'online'}
            >
              {ollamaStatus === 'online' ? '✓ 已启动' : '🚀 启动 Ollama'}
            </button>
          </div>
          <div style={styles.switchRow}>
            <span style={styles.switchLabel}>应用启动时自动尝试启动 Ollama</span>
            <label style={styles.switch}>
              <input
                type="checkbox"
                checked={config.ollama.autoStart}
                onChange={(e) => onUpdate('ollama.autoStart', e.target.checked)}
              />
              <span style={styles.switchSlider} />
            </label>
          </div>
        </div>
      </div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>模型配置</h3>
        <div style={styles.card}>
          <div style={styles.row}>
            <span style={styles.rowLabel}>默认模型</span>
            <div style={styles.rowControl}>
              <select
                value={config.model.defaultModel}
                onChange={(e) => onUpdate('model.defaultModel', e.target.value)}
                style={{ ...styles.select, minWidth: '220px' }}
              >
                {config.model.availableModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <button style={styles.iconButtonSmall} onClick={onRefreshModels} title="从 Ollama 刷新模型列表">
                🔄
              </button>
            </div>
          </div>
          <div style={styles.row}>
            <span style={styles.rowLabel}>添加自定义模型</span>
            <div style={styles.rowControl}>
              <input
                type="text"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                placeholder="例如: qwen2.5-coder:7b"
                style={{ ...styles.input, width: '180px' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newModelName.trim()) {
                    handleAddModel(newModelName);
                    setNewModelName('');
                  }
                }}
              />
              <button
                style={styles.iconButtonSmall}
                onClick={() => {
                  handleAddModel(newModelName);
                  setNewModelName('');
                }}
                disabled={!newModelName.trim()}
              >
                ➕
              </button>
            </div>
          </div>
          <div style={styles.row}>
            <span style={styles.rowLabel}>Token 上限</span>
            <div style={styles.rowControl}>
              <input
                type="number"
                value={config.model.tokenLimit}
                onChange={(e) => onUpdate('model.tokenLimit', parseInt(e.target.value) || 4096)}
                style={{ ...styles.input, width: '100px' }}
                min="1024"
                max="128000"
                step="1024"
              />
              <span style={styles.unitLabel}>tokens (模型输入上限)</span>
            </div>
          </div>
          <div style={styles.row}>
            <span style={styles.rowLabel}>上下文窗口</span>
            <input
              type="number"
              value={config.model.contextWindow}
              onChange={(e) => onUpdate('model.contextWindow', parseInt(e.target.value) || 8192)}
              style={styles.input}
              min="2048"
              max="128000"
              step="2048"
            />
          </div>
          <div style={styles.row}>
            <span style={styles.rowLabel}>最大生成</span>
            <input
              type="number"
              value={config.model.maxTokens}
              onChange={(e) => onUpdate('model.maxTokens', parseInt(e.target.value) || 2048)}
              style={styles.input}
              min="256"
              max="32768"
              step="256"
            />
          </div>
          <div style={styles.row}>
            <span style={styles.rowLabel}>温度</span>
            <input
              type="number"
              value={config.model.temperature}
              onChange={(e) => onUpdate('model.temperature', parseFloat(e.target.value) || 0.7)}
              style={styles.input}
              min="0"
              max="2"
              step="0.1"
            />
          </div>
          <div style={styles.row}>
            <span style={styles.rowLabel}>Top-P</span>
            <input
              type="number"
              value={config.model.topP}
              onChange={(e) => onUpdate('model.topP', parseFloat(e.target.value) || 0.9)}
              style={styles.input}
              min="0"
              max="1"
              step="0.1"
            />
          </div>
        </div>
      </div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>系统提示词</h3>
        <div style={styles.card}>
          <textarea
            value={config.model.systemPrompt}
            onChange={(e) => onUpdate('model.systemPrompt', e.target.value)}
            style={{ ...styles.textarea, minHeight: '80px' }}
            rows={5}
            placeholder="输入自定义系统提示词，决定 AI 的核心行为和人格特征..."
          />
          <div style={styles.hintText}>
            系统提示词决定 AI 的核心行为和人格特征。你可以自定义 AI 的说话风格、行为准则等。
          </div>
        </div>
      </div>
    </div>
  );
}

function PersonalitySettings({ config, onUpdate }: { config: PersonalityConfig; onUpdate: (path: string, value: unknown) => void }): ReactElement {
  return (
    <div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>人格系统</h3>
        <div style={styles.card}>
          <div style={styles.switchRow}>
            <span style={styles.switchLabel}>启用人格系统</span>
            <label style={styles.switch}>
              <input type="checkbox" checked={config.enabled} onChange={(e) => onUpdate('personality.enabled', e.target.checked)} />
              <span style={styles.switchSlider} />
            </label>
          </div>
          <div style={styles.switchRow}>
            <span style={styles.switchLabel}>输出清洗（防止违规表达）</span>
            <label style={styles.switch}>
              <input type="checkbox" checked={config.sanitizeOutput} onChange={(e) => onUpdate('personality.sanitizeOutput', e.target.checked)} />
              <span style={styles.switchSlider} />
            </label>
          </div>
        </div>
      </div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>人格特质</h3>
        <div style={styles.card}>
          <div style={styles.tagsContainer}>
            {['温柔', '真诚', '耐心', '体贴', '幽默', '热情', '冷静', '理性'].map((trait) => (
              <button
                key={trait}
                style={{
                  ...styles.tagButton,
                  ...(config.traits.includes(trait) ? styles.tagButtonActive : {}),
                }}
                onClick={() => {
                  const next = config.traits.includes(trait)
                    ? config.traits.filter((t) => t !== trait)
                    : [...config.traits, trait];
                  onUpdate('personality.traits', next);
                }}
              >
                {trait}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>自定义提示词</h3>
        <div style={styles.card}>
          <textarea
            value={config.customSystemPrompt}
            onChange={(e) => onUpdate('personality.customSystemPrompt', e.target.value)}
            style={styles.textarea}
            rows={4}
            placeholder="描述你的 AI 伴侣的性格和特点..."
          />
        </div>
      </div>
    </div>
  );
}

function EmotionSettings({
  config,
  onUpdate,
  liveEmotion,
}: {
  config: EmotionConfig;
  onUpdate: (path: string, value: unknown) => void;
  liveEmotion?: EmotionType;
}): ReactElement {
  const activeEmotion = liveEmotion ?? config.currentEmotion;
  const emotionInfo = EMOTION_LIST.find((e) => e.key === activeEmotion) ?? EMOTION_LIST[0];
  const currentIntensity = emotionInfo.intensity;
  const intensityPercent = Math.round(currentIntensity * 100);
  const intensityLabel = currentIntensity >= 0.7 ? '高强度' : currentIntensity >= 0.5 ? '中等强度' : '低强度';

  return (
    <div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>情感系统</h3>
        <div style={styles.card}>
          <div style={styles.switchRow}>
            <span style={styles.switchLabel}>启用情感识别</span>
            <label style={styles.switch}>
              <input type="checkbox" checked={config.enabled} onChange={(e) => onUpdate('emotion.enabled', e.target.checked)} />
              <span style={styles.switchSlider} />
            </label>
          </div>
          <div style={styles.switchRow}>
            <span style={styles.switchLabel}>情感分析管道</span>
            <label style={styles.switch}>
              <input type="checkbox" checked={config.pipelineEnabled} onChange={(e) => onUpdate('emotion.pipelineEnabled', e.target.checked)} />
              <span style={styles.switchSlider} />
            </label>
          </div>
        </div>
      </div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>当前情感状态 {liveEmotion ? '（实时）' : ''}</h3>
        <div style={styles.card}>
          <div style={styles.emotionDisplay}>
            <div style={styles.emotionEmoji}>{emotionInfo.emoji}</div>
            <div style={styles.emotionInfo}>
              <div style={styles.emotionLabel}>{emotionInfo.label}</div>
              <div style={styles.progressBarContainer}>
                <div
                  style={{
                    ...styles.progressBarFill,
                    width: `${intensityPercent}%`,
                    background: `linear-gradient(90deg, ${getIntensityColor(currentIntensity)}, ${getIntensityColor(currentIntensity * 0.85)})`,
                  }}
                />
              </div>
              <div style={styles.hintText}>
                情感强度：{intensityLabel} · {intensityPercent}%
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>可选情感</h3>
        <div style={styles.card}>
          <div style={styles.emotionGrid}>
            {EMOTION_LIST.map((emotion) => (
              <div
                key={emotion.key}
                style={{
                  ...styles.emotionItem,
                  ...(activeEmotion === emotion.key ? styles.emotionItemActive : {}),
                }}
              >
                <span style={styles.emotionItemEmoji}>{emotion.emoji}</span>
                <span style={styles.emotionItemLabel}>{emotion.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function getIntensityColor(intensity: number): string {
  if (intensity >= 0.8) return '#f44336';
  if (intensity >= 0.6) return '#ff9800';
  if (intensity >= 0.4) return '#ffc107';
  return '#4caf50';
}

function SkillsSettings({ config, onUpdate, onToggleSkill }: { config: SkillsConfig; onUpdate: (path: string, value: unknown) => void; onToggleSkill: (id: string) => void }): ReactElement {
  return (
    <div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>MCP 技能协议框架</h3>
        <div style={styles.card}>
          <div style={styles.switchRow}>
            <span style={styles.switchLabel}>启用技能系统</span>
            <label style={styles.switch}>
              <input type="checkbox" checked={config.enabled} onChange={(e) => onUpdate('skills.enabled', e.target.checked)} />
              <span style={styles.switchSlider} />
            </label>
          </div>
          <div style={styles.hintText}>
            启用后，AI 可以在对话中调用以下工具来扩展能力。关闭后 AI 将直接回答，不调用任何工具。
          </div>
        </div>
      </div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>已注册技能（{config.enabledSkills.length} / {SKILL_LIST.length}）</h3>
        <div style={styles.card}>
          {SKILL_LIST.map((skill) => {
            const enabled = config.enabledSkills.includes(skill.id);
            return (
              <div key={skill.id} style={{
                ...styles.skillItem,
                ...(enabled ? styles.skillItemActive : {}),
              }}>
                <div style={styles.skillInfo}>
                  <span style={styles.skillIcon}>{skill.icon}</span>
                  <div>
                    <span style={styles.skillName}>{skill.name}</span>
                    <div style={styles.skillDescription}>{skill.description}</div>
                  </div>
                </div>
                <label style={styles.switch}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => onToggleSkill(skill.id)}
                  />
                  <span style={styles.switchSlider} />
                </label>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function VisionSettings({ config, onUpdate }: { config: VisionConfig; onUpdate: (path: string, value: unknown) => void }): ReactElement {
  return (
    <div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>视觉感知系统</h3>
        <div style={styles.card}>
          <div style={styles.switchRow}>
            <span style={styles.switchLabel}>启用视觉感知</span>
            <label style={styles.switch}>
              <input type="checkbox" checked={config.enabled} onChange={(e) => onUpdate('vision.enabled', e.target.checked)} />
              <span style={styles.switchSlider} />
            </label>
          </div>
          <div style={styles.switchRow}>
            <span style={styles.switchLabel}>屏幕截图</span>
            <label style={styles.switch}>
              <input type="checkbox" checked={config.captureEnabled} onChange={(e) => onUpdate('vision.captureEnabled', e.target.checked)} />
              <span style={styles.switchSlider} />
            </label>
          </div>
          <div style={styles.switchRow}>
            <span style={styles.switchLabel}>OCR 文字识别</span>
            <label style={styles.switch}>
              <input type="checkbox" checked={config.ocrEnabled} onChange={(e) => onUpdate('vision.ocrEnabled', e.target.checked)} />
              <span style={styles.switchSlider} />
            </label>
          </div>
        </div>
      </div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>截图设置</h3>
        <div style={styles.card}>
          <div style={styles.row}>
            <span style={styles.rowLabel}>OCR 语言</span>
            <select
              value={config.defaultLanguage}
              onChange={(e) => onUpdate('vision.defaultLanguage', e.target.value)}
              style={styles.select}
            >
              <option value="zh-CN">中文简体</option>
              <option value="en-US">English</option>
              <option value="ja-JP">日本語</option>
              <option value="ko-KR">한국어</option>
            </select>
          </div>
          <div style={styles.row}>
            <span style={styles.rowLabel}>自动截图间隔</span>
            <div style={styles.rowControl}>
              <input
                type="number"
                value={config.autoCaptureInterval}
                onChange={(e) => onUpdate('vision.autoCaptureInterval', parseInt(e.target.value) || 0)}
                style={{ ...styles.input, width: '100px' }}
                min="0"
                step="60"
              />
              <span style={styles.unitLabel}>秒 (0=禁用)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Live2DSettings({ config, onUpdate }: { config: Live2DConfig; onUpdate: (path: string, value: unknown) => void }): ReactElement {
  return (
    <div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Live2D 渲染系统</h3>
        <div style={styles.card}>
          <div style={styles.switchRow}>
            <span style={styles.switchLabel}>启用 Live2D</span>
            <label style={styles.switch}>
              <input type="checkbox" checked={config.enabled} onChange={(e) => onUpdate('live2d.enabled', e.target.checked)} />
              <span style={styles.switchSlider} />
            </label>
          </div>
          <div style={styles.switchRow}>
            <span style={styles.switchLabel}>窗口置顶</span>
            <label style={styles.switch}>
              <input type="checkbox" checked={config.alwaysOnTop} onChange={(e) => onUpdate('live2d.alwaysOnTop', e.target.checked)} />
              <span style={styles.switchSlider} />
            </label>
          </div>
          <div style={styles.switchRow}>
            <span style={styles.switchLabel}>自动眨眼</span>
            <label style={styles.switch}>
              <input type="checkbox" checked={config.autoBlink} onChange={(e) => onUpdate('live2d.autoBlink', e.target.checked)} />
              <span style={styles.switchSlider} />
            </label>
          </div>
          <div style={styles.switchRow}>
            <span style={styles.switchLabel}>跟随鼠标</span>
            <label style={styles.switch}>
              <input type="checkbox" checked={config.followMouse} onChange={(e) => onUpdate('live2d.followMouse', e.target.checked)} />
              <span style={styles.switchSlider} />
            </label>
          </div>
        </div>
      </div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>模型选择</h3>
        <div style={styles.card}>
          <div style={styles.row}>
            <span style={styles.rowLabel}>默认模型</span>
            <select
              value={config.defaultModel}
              onChange={(e) => onUpdate('live2d.defaultModel', e.target.value)}
              style={styles.select}
            >
              {config.availableModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div style={styles.row}>
            <span style={styles.rowLabel}>透明度</span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={config.opacity}
              onChange={(e) => onUpdate('live2d.opacity', parseFloat(e.target.value))}
              style={{ width: '150px' }}
            />
            <span style={styles.unitLabel}>{Math.round(config.opacity * 100)}%</span>
          </div>
          <div style={styles.row}>
            <span style={styles.rowLabel}>待机动作间隔</span>
            <div style={styles.rowControl}>
              <input
                type="number"
                value={Math.floor(config.idleActionInterval / 1000)}
                onChange={(e) => onUpdate('live2d.idleActionInterval', (parseInt(e.target.value) || 15) * 1000)}
                style={{ ...styles.input, width: '80px' }}
                min="5"
                max="60"
              />
              <span style={styles.unitLabel}>秒</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TtsSettings({ config, onUpdate }: { config: TtsConfig; onUpdate: (path: string, value: unknown) => void }): ReactElement {
  return (
    <div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>TTS 语音合成</h3>
        <div style={styles.card}>
          <div style={styles.switchRow}>
            <span style={styles.switchLabel}>启用语音合成</span>
            <label style={styles.switch}>
              <input type="checkbox" checked={config.enabled} onChange={(e) => onUpdate('tts.enabled', e.target.checked)} />
              <span style={styles.switchSlider} />
            </label>
          </div>
        </div>
      </div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>引擎与模型</h3>
        <div style={styles.card}>
          <div style={styles.row}>
            <span style={styles.rowLabel}>引擎类型</span>
            <select
              value={config.engine}
              onChange={(e) => onUpdate('tts.engine', e.target.value as 'local' | 'edge')}
              style={styles.select}
            >
              <option value="edge">Edge TTS (云端高质量)</option>
              <option value="local">本地系统 TTS (隐私保护)</option>
            </select>
          </div>
          <div style={styles.row}>
            <span style={styles.rowLabel}>语音模型</span>
            <select
              value={config.defaultVoice}
              onChange={(e) => onUpdate('tts.defaultVoice', e.target.value)}
              style={styles.select}
            >
              {config.availableVoices.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>语音参数</h3>
        <div style={styles.card}>
          <div style={styles.row}>
            <span style={styles.rowLabel}>语速</span>
            <div style={styles.rowControl}>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={config.rate}
                onChange={(e) => onUpdate('tts.rate', parseFloat(e.target.value))}
                style={{ width: '120px' }}
              />
              <span style={styles.unitLabel}>{config.rate.toFixed(1)}x</span>
            </div>
          </div>
          <div style={styles.row}>
            <span style={styles.rowLabel}>音量</span>
            <div style={styles.rowControl}>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={config.volume}
                onChange={(e) => onUpdate('tts.volume', parseFloat(e.target.value))}
                style={{ width: '120px' }}
              />
              <span style={styles.unitLabel}>{Math.round(config.volume * 100)}%</span>
            </div>
          </div>
          <div style={styles.row}>
            <span style={styles.rowLabel}>音调</span>
            <div style={styles.rowControl}>
              <input
                type="range"
                min="-10"
                max="10"
                step="1"
                value={config.pitch}
                onChange={(e) => onUpdate('tts.pitch', parseInt(e.target.value))}
                style={{ width: '120px' }}
              />
              <span style={styles.unitLabel}>{config.pitch}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ActiveSettingsProps {
  config: ActiveConfig;
  onUpdate: (path: string, value: unknown) => void;
  customEventName: string;
  setCustomEventName: (v: string) => void;
  customEventInterval: string;
  setCustomEventInterval: (v: string) => void;
  onAddCustomEvent: () => void;
  onRemoveCustomEvent: (id: string) => void;
  onToggleCustomEvent: (id: string) => void;
}

function ActiveSettings({ config, onUpdate, customEventName, setCustomEventName, customEventInterval, setCustomEventInterval, onAddCustomEvent, onRemoveCustomEvent, onToggleCustomEvent }: ActiveSettingsProps): ReactElement {
  return (
    <div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>主动内驱引擎</h3>
        <div style={styles.card}>
          <div style={styles.switchRow}>
            <span style={styles.switchLabel}>启用主动关怀</span>
            <label style={styles.switch}>
              <input type="checkbox" checked={config.enabled} onChange={(e) => onUpdate('active.enabled', e.target.checked)} />
              <span style={styles.switchSlider} />
            </label>
          </div>
        </div>
      </div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>心跳间隔</h3>
        <div style={styles.card}>
          <div style={styles.row}>
            <span style={styles.rowLabel}>高频心跳（用户检测）</span>
            <div style={styles.rowControl}>
              <input
                type="number"
                value={config.highInterval}
                onChange={(e) => onUpdate('active.highInterval', parseInt(e.target.value) || 60)}
                style={{ ...styles.input, width: '80px' }}
                min="10"
                max="600"
              />
              <span style={styles.unitLabel}>秒</span>
            </div>
          </div>
          <div style={styles.row}>
            <span style={styles.rowLabel}>中频心跳（想法生成）</span>
            <div style={styles.rowControl}>
              <input
                type="number"
                value={Math.floor(config.mediumInterval / 60)}
                onChange={(e) => onUpdate('active.mediumInterval', (parseInt(e.target.value) || 60) * 60)}
                style={{ ...styles.input, width: '80px' }}
                min="5"
                max="720"
              />
              <span style={styles.unitLabel}>分钟</span>
            </div>
          </div>
          <div style={styles.row}>
            <span style={styles.rowLabel}>低频心跳（日常关怀）</span>
            <div style={styles.rowControl}>
              <input
                type="number"
                value={Math.floor(config.lowInterval / 3600)}
                onChange={(e) => onUpdate('active.lowInterval', (parseInt(e.target.value) || 24) * 3600)}
                style={{ ...styles.input, width: '80px' }}
                min="1"
                max="168"
              />
              <span style={styles.unitLabel}>小时</span>
            </div>
          </div>
        </div>
      </div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>欲望参数</h3>
        <div style={styles.card}>
          <div style={styles.row}>
            <span style={styles.rowLabel}>触发阈值</span>
            <div style={styles.rowControl}>
              <input
                type="number"
                value={config.desireThreshold}
                onChange={(e) => onUpdate('active.desireThreshold', parseFloat(e.target.value) || 0.7)}
                style={{ ...styles.input, width: '80px' }}
                min="0.1"
                max="1"
                step="0.05"
              />
              <span style={styles.unitLabel}>(0.1-1.0)</span>
            </div>
          </div>
          <div style={styles.row}>
            <span style={styles.rowLabel}>克制次数</span>
            <div style={styles.rowControl}>
              <input
                type="number"
                value={config.suppressionThreshold}
                onChange={(e) => onUpdate('active.suppressionThreshold', parseInt(e.target.value) || 3)}
                style={{ ...styles.input, width: '80px' }}
                min="1"
                max="10"
              />
              <span style={styles.unitLabel}>次</span>
            </div>
          </div>
        </div>
      </div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>自定义事件</h3>
        <div style={styles.card}>
          <div style={styles.addEventRow}>
            <input
              type="text"
              value={customEventName}
              onChange={(e) => setCustomEventName(e.target.value)}
              placeholder="事件名称"
              style={{ ...styles.input, flex: 1 }}
            />
            <input
              type="number"
              value={customEventInterval}
              onChange={(e) => setCustomEventInterval(e.target.value)}
              placeholder="间隔(秒)"
              style={{ ...styles.input, width: '100px' }}
              min="10"
            />
            <button style={styles.actionButton} onClick={onAddCustomEvent}>
              ➕ 添加
            </button>
          </div>
          {config.customEvents.length > 0 && (
            <div style={styles.eventList}>
              {config.customEvents.map((event) => (
                <div key={event.id} style={styles.eventItem}>
                  <div style={styles.eventInfo}>
                    <span style={styles.eventName}>{event.name}</span>
                    <span style={styles.eventInterval}>{event.interval}s</span>
                  </div>
                  <div style={styles.eventActions}>
                    <label style={styles.switch}>
                      <input
                        type="checkbox"
                        checked={event.enabled}
                        onChange={() => onToggleCustomEvent(event.id)}
                      />
                      <span style={styles.switchSlider} />
                    </label>
                    <button style={styles.iconButtonSmall} onClick={() => onRemoveCustomEvent(event.id)}>
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {config.customEvents.length === 0 && (
            <div style={styles.hintText}>暂无自定义事件</div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdvancedSettings({ config, onUpdate }: { config: AppConfig; onUpdate: (path: string, value: unknown) => void }): ReactElement {
  return (
    <div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>存储设置</h3>
        <div style={styles.card}>
          <div style={styles.row}>
            <span style={styles.rowLabel}>数据库路径</span>
            <input
              type="text"
              value={config.database.filePath}
              onChange={(e) => onUpdate('database.filePath', e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={styles.switchRow}>
            <span style={styles.switchLabel}>WAL 模式（提升并发性能）</span>
            <label style={styles.switch}>
              <input type="checkbox" checked={config.database.walMode} onChange={(e) => onUpdate('database.walMode', e.target.checked)} />
              <span style={styles.switchSlider} />
            </label>
          </div>
        </div>
      </div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>界面设置</h3>
        <div style={styles.card}>
          <div style={styles.row}>
            <span style={styles.rowLabel}>主题</span>
            <select
              value={config.ui.theme}
              onChange={(e) => onUpdate('ui.theme', e.target.value)}
              style={styles.select}
            >
              <option value="dark">深色</option>
              <option value="light">浅色</option>
              <option value="auto">自动</option>
            </select>
          </div>
          <div style={styles.row}>
            <span style={styles.rowLabel}>界面语言</span>
            <select
              value={config.ui.language}
              onChange={(e) => onUpdate('ui.language', e.target.value)}
              style={styles.select}
            >
              <option value="zh-CN">简体中文</option>
              <option value="en-US">English</option>
            </select>
          </div>
          <div style={styles.row}>
            <span style={styles.rowLabel}>字体大小</span>
            <div style={styles.rowControl}>
              <input
                type="number"
                value={config.ui.fontSize}
                onChange={(e) => onUpdate('ui.fontSize', parseInt(e.target.value) || 14)}
                style={{ ...styles.input, width: '80px' }}
                min="12"
                max="20"
              />
              <span style={styles.unitLabel}>px</span>
            </div>
          </div>
        </div>
      </div>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>关于</h3>
        <div style={styles.card}>
          <div style={styles.aboutInfo}>
            <div style={styles.aboutLogo}>💕</div>
            <div>
              <div style={styles.aboutName}>Love Code</div>
              <div style={styles.aboutVersion}>版本 {config.version}.0.0</div>
              <div style={styles.aboutDesc}>本地优先 AI 伴侣系统</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    maxHeight: '85vh',
    background: '#1e1e32',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '12px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(26, 26, 46, 0.8)',
  },
  modalTitle: {
    margin: 0,
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#fff',
  },
  closeButton: {
    background: 'transparent',
    border: 'none',
    color: '#aaa',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  modalBody: {
    padding: '16px 20px',
    overflowY: 'auto',
    flex: 1,
  },
  tabsContainer: {
    display: 'flex',
    gap: '4px',
    marginBottom: '16px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    paddingBottom: '8px',
    flexWrap: 'wrap',
  },
  tabButton: {
    padding: '6px 12px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '6px',
    color: '#aaa',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  tabButtonActive: {
    background: 'rgba(102, 126, 234, 0.2)',
    borderColor: 'rgba(102, 126, 234, 0.5)',
    color: '#667eea',
  },
  tabContent: {
    minHeight: '300px',
  },
  section: {
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#888',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  card: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    padding: '12px',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    gap: '12px',
  },
  rowLabel: {
    color: '#aaa',
    fontSize: '13px',
    flexShrink: 0,
  },
  rowControl: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  statusLabel: {
    color: '#aaa',
    fontSize: '13px',
  },
  statusValue: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  statusText: {
    fontSize: '13px',
    fontWeight: 500,
  },
  switchRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  switchLabel: {
    color: '#ccc',
    fontSize: '13px',
  },
  switch: {
    position: 'relative',
    display: 'inline-block',
    width: '44px',
    height: '24px',
  },
  switchSlider: {
    position: 'absolute',
    cursor: 'pointer',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(255,255,255,0.1)',
    borderRadius: '24px',
    transition: '0.3s',
  },
  buttonRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '12px',
  },
  actionButton: {
    flex: 1,
    padding: '8px 12px',
    background: 'rgba(102, 126, 234, 0.15)',
    border: '1px solid rgba(102, 126, 234, 0.4)',
    borderRadius: '6px',
    color: '#667eea',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  iconButtonSmall: {
    background: 'rgba(102, 126, 234, 0.15)',
    border: '1px solid rgba(102, 126, 234, 0.4)',
    borderRadius: '6px',
    padding: '4px 8px',
    color: '#667eea',
    fontSize: '13px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  select: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '6px',
    padding: '6px 10px',
    color: '#fff',
    fontSize: '13px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    minWidth: '180px',
  },
  input: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '6px',
    padding: '6px 10px',
    color: '#fff',
    fontSize: '13px',
    fontFamily: 'inherit',
    outline: 'none',
  },
  textarea: {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '6px',
    padding: '10px',
    color: '#fff',
    fontSize: '13px',
    fontFamily: 'inherit',
    resize: 'vertical',
    outline: 'none',
  },
  unitLabel: {
    color: '#666',
    fontSize: '12px',
  },
  hintText: {
    color: '#666',
    fontSize: '12px',
    marginTop: '8px',
  },
  saveStatusText: {
    color: '#4caf50',
    fontSize: '12px',
    fontWeight: 500,
    marginRight: '8px',
  },
  tagsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  tagButton: {
    padding: '6px 14px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '20px',
    color: '#aaa',
    fontSize: '13px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  tagButtonActive: {
    background: 'rgba(102, 126, 234, 0.25)',
    borderColor: 'rgba(102, 126, 234, 0.6)',
    color: '#667eea',
  },
  emotionDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  emotionEmoji: {
    fontSize: '48px',
    lineHeight: 1,
  },
  emotionInfo: {
    flex: 1,
  },
  emotionLabel: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
    marginBottom: '8px',
  },
  progressBarContainer: {
    width: '100%',
    height: '8px',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '4px',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s ease, background 0.3s ease',
  },
  emotionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
  },
  emotionItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 10px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.05)',
  },
  emotionItemActive: {
    background: 'rgba(102, 126, 234, 0.15)',
    borderColor: 'rgba(102, 126, 234, 0.4)',
  },
  emotionItemEmoji: {
    fontSize: '18px',
  },
  emotionItemLabel: {
    fontSize: '13px',
    color: '#ccc',
  },
  skillItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    borderRadius: '6px',
    transition: 'background 0.15s',
  },
  skillItemActive: {
    background: 'rgba(102, 126, 234, 0.1)',
  },
  skillDescription: {
    color: '#888',
    fontSize: '12px',
    marginTop: '2px',
  },
  skillInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  skillIcon: {
    fontSize: '20px',
  },
  skillName: {
    color: '#eee',
    fontSize: '13px',
  },
  addEventRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
  },
  eventList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  eventItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.05)',
  },
  eventInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  eventName: {
    color: '#eee',
    fontSize: '13px',
    fontWeight: 500,
  },
  eventInterval: {
    color: '#888',
    fontSize: '12px',
  },
  eventActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  aboutInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  aboutLogo: {
    fontSize: '48px',
  },
  aboutName: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#fff',
  },
  aboutVersion: {
    fontSize: '13px',
    color: '#888',
  },
  aboutDesc: {
    fontSize: '13px',
    color: '#aaa',
    marginTop: '4px',
  },
  emptyHint: {
    color: '#888',
    fontSize: '13px',
    textAlign: 'center',
    padding: '20px',
    margin: 0,
  },
};
