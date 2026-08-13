# Love Code 🤖

> 本地优先的 AI 伴侣系统，让 AI 不只是工具，更是伙伴。

<p align="center">
  <img src="https://img.shields.io/badge/electron-33+-9feaf9?style=for-the-badge&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/react-18+-61dafb?style=for-the-badge&logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/typescript-5+-3178c6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/ollama-0.5+-ff6c00?style=for-the-badge&logo=ollama&logoColor=white" alt="Ollama" />
  <img src="https://img.shields.io/badge/sqlite-3+-003b57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />
</p>

## ✨ 特性

### 🎯 核心能力
- **三进程架构**：Electron 主进程 + Preload 桥接 + React 渲染层，安全稳定
- **双轨模型编排**：L0 规则路由（< 1ms）+ L1/L2 模型调度，智能分流
- **上下文压缩**：双水位自动压缩，确保对话不溢出
- **分层记忆系统**：向量检索 + 关键词降级 + 遗忘曲线

### 🛠️ 工具调用
- **内置工具**：时间查询、文件读写、代码搜索、网页获取
- **安全校验**：SSRF 防护、参数校验、超时控制
- **MCP 协议**：技能启用/禁用管理，支持扩展

### 💝 伴侣体验
- **情感计算管道**：L0 粗判 → L1 细判 → 响应映射，实时情感识别
- **人格系统**：SOHA 核心原则 + 风格片段动态注入
- **TTS 语音合成**：Edge TTS + 本地引擎双模式，情感化参数
- **主动内驱引擎**：三级心跳机制，AI 主动发起关怀

### 🎨 视觉与扩展
- **Live2D 渲染**：Cubism 4.0 模型支持，动作映射与情感驱动
- **视觉感知**：全屏/区域截图，OCR 文字识别
- **硬件监控**：CPU/GPU 状态检测，健康建议

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                     渲染进程 (React)                      │
│  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────────┐ │
│  │ 聊天界面 │ │ 设置面板  │ │ 状态指示 │ │ Live2D 渲染  │ │
│  └─────────┘ └──────────┘ └─────────┘ └──────────────┘ │
└─────────────────────────────────────────────────────────┘
                          │ IPC (contextBridge)
┌─────────────────────────────────────────────────────────┐
│                      Preload 桥接层                      │
│              安全 API 暴露，禁止 contextIsolation 关闭    │
└─────────────────────────────────────────────────────────┘
                          │ IPC 通道
┌─────────────────────────────────────────────────────────┐
│                      主进程 (AgentCore)                  │
│  ┌────────────┐ ┌────────────┐ ┌─────────┐ ┌─────────┐ │
│  │ 规则路由   │ │ 模型池     │ │ 工具系统│ │ 记忆管理│ │
│  └────────────┘ └────────────┘ └─────────┘ └─────────┘ │
│  ┌────────────┐ ┌────────────┐ ┌─────────┐ ┌─────────┐ │
│  │ 情感管道   │ │ 人格系统   │ │ TTS引擎 │ │ 主动引擎│ │
│  └────────────┘ └────────────┘ └─────────┘ └─────────┘ │
└─────────────────────────────────────────────────────────┘
                          │ HTTP API
┌─────────────────────────────────────────────────────────┐
│                     Ollama 模型服务                      │
│  L1: qwen3:4b (常驻) │ L2: qwen2.5:7b (按需)            │
└─────────────────────────────────────────────────────────┘
```

## 📦 安装

### 环境要求

- **Node.js**: ≥ 20
- **Ollama**: ≥ 0.5（[安装指南](https://ollama.com/download)）
- **操作系统**: Windows 10/11
- **显存**: ≥ 4GB（推荐 RTX 1060 6G 以上）

### 快速开始

```bash
# 1. 克隆仓库
git clone <repository-url>
cd love-code

# 2. 安装依赖
npm install

# 3. 拉取模型（首次运行前）
ollama pull qwen3:4b      # L1 轻量层（常驻）
ollama pull qwen2.5:7b    # L2 重量层（按需）
ollama pull nomic-embed-text  # 嵌入模型

# 4. 启动开发模式
npm run dev

# 5. 或构建生产版本
npm run build
npm start
```

## 🚀 使用指南

### 基本对话

直接在输入框输入消息，AI 会自动：
- 识别情感并调整回应语气
- 根据意图选择合适的模型层级
- 在需要时调用工具扩展能力

### 设置面板

点击右上角 ⚙️ 图标打开设置：

| 标签页 | 功能 |
|--------|------|
| 🤖 模型 | 模型选择、Token 上限、温度参数、系统提示词 |
| 💕 人格 | 人格特质选择、自定义提示词、输出清洗 |
| 😊 情感 | 情感识别开关、实时情感状态显示 |
| 🔧 技能 | MCP 技能启用/禁用管理 |
| 👁️ 视觉 | 截图、OCR 配置 |
| 🎭 Live2D | 模型选择、透明度、动作间隔 |
| 🔊 语音 | TTS 引擎选择、语音参数 |
| 💓 内驱 | 主动关怀开关、自定义事件 |

### 模型层级

| 层级 | 执行者 | 适用场景 | 延迟 |
|------|--------|----------|------|
| **L0** | 规则路由 | 问候、感谢、告别 | < 1ms |
| **L1** | qwen3:4b | 日常对话、工具决策 | 500ms-3s |
| **L2** | qwen2.5:7b | 复杂推理、深度分析 | 2-5s |

## 📁 项目结构

```
src/
├── main/                     # 主进程
│   ├── agent/               # Agent 核心
│   │   ├── agent-core.ts    #   编排器
│   │   ├── ollama-client.ts #   Ollama 客户端
│   │   └── context-manager.ts # 上下文管理
│   ├── router/              # 路由系统
│   │   ├── rule-router.ts  #   L0 规则路由
│   │   └── model-pool.ts   #   模型池管理
│   ├── tools/               # 工具系统
│   │   ├── registry.ts      #   工具注册表
│   │   └── tool-registry.ts #   工具执行器
│   ├── memory/              # 记忆系统
│   │   ├── memory-manager.ts # 记忆检索
│   │   └── memory-persistence.ts # 持久化
│   ├── emotion/             # 情感计算
│   │   └── emotion-pipeline.ts # 情感管道
│   ├── personality/         # 人格系统
│   │   └── personality.ts   # SOHA 原则
│   ├── tts/                 # TTS 引擎
│   │   └── tts-engine.ts    # 双引擎实现
│   ├── active/              # 主动引擎
│   │   └── active-engine.ts # 心跳与欲望
│   ├── live2d/              # Live2D
│   │   └── live2d-manager.ts # 模型管理
│   ├── vision/              # 视觉感知
│   │   └── vision-manager.ts # 截图/OCR
│   ├── skills/              # 技能系统
│   │   └── skill-manager.ts # MCP 协议
│   ├── config/              # 配置管理
│   │   └── config.ts
│   └── database/            # 数据库
│       └── db.ts
├── preload/                 # Preload 桥接
│   └── index.ts
├── renderer/                # 渲染进程
│   ├── components/          # UI 组件
│   │   ├── ChatInput.tsx    #   输入组件
│   │   ├── ChatMessageList.tsx # 消息列表
│   │   ├── SettingsPanel.tsx # 设置面板
│   │   └── StatusBar.tsx    #   状态栏
│   ├── App.tsx              # 主应用
│   └── main.tsx             # 入口
└── shared/                  # 共享类型
    ├── types/               # 类型定义
    └── ipc-channels.ts      # IPC 通道
```

## 🛠️ 开发命令

```bash
# 开发模式（热重载）
npm run dev

# 类型检查
npm run typecheck

# 运行测试
npm run test

# 构建
npm run build

# 清理构建产物
npm run clean
```

## 📝 配置说明

配置文件保存在 `config.json`，支持热更新：

```json
{
  "ollama": {
    "baseUrl": "http://localhost:11434",
    "autoStart": true,
    "isOnline": false
  },
  "model": {
    "defaultModel": "qwen3:4b",
    "availableModels": ["qwen3:4b", "qwen2.5:7b"],
    "tokenLimit": 4096,
    "temperature": 0.7
  },
  "skills": {
    "enabled": true,
    "enabledSkills": ["time", "file_read", "file_write"]
  }
}
```

## 🔒 安全说明

- Preload 强制 `contextIsolation: true`，禁止直接访问 Node API
- 工具调用经过 SSRF 防护，拦截私网/回环地址
- 人格系统输出清洗，防止违规表达
- 配置文件本地存储，不上传云端

## 📄 许可证

本项目仅供学习和研究使用。

---

<p align="center">
  Made with ❤️ by Love Code Team
</p>