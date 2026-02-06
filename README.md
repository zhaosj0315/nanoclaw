# NanoClaw (🐾)

> **High-Agency Personal Assistant: Bridging WhatsApp, Gemini, and System-Level Autonomy.**

NanoClaw 是一款专为 macOS 设计的、具备高度自治能力的个人助理系统。它不仅是一个聊天机器人，更是您的**数字第二大脑**。通过 WhatsApp 界面，您可以跨越地理限制，指挥您的 Mac 完成代码编写、系统运维、多模态分析等复杂任务。

---

## 💎 核心演进 (Core Evolutions)

### 1. 🛡️ 电子围栏安全架构 (Electronic Fence Security)
**拒绝越权，保护隐私。** 
- **Local 路径校验**：所有 `[SHELL]` 与 `[WRITE]` 指令在执行前都会经过严格审查。
- **白名单机制**：默认仅限项目根目录工作，外部目录需在 `~/.config/nanoclaw/mount-allowlist.json` 中明确授权。
- **环境隔离**：防止 AI 随意访问您的私人文档。

### 2. 🧠 数字化长期记忆 (Long-term Memory System)
**越聊越懂你。**
- **持久化存储**：基于 SQLite 的 `memories` 引擎，自动提取并持久化对话中的事实。
- **上下文注入**：每次回复前自动读取“长期记忆”与“最近 15 条历史”。
- **知识库 (RAG)**：支持通过 `[INGEST_FILE]` 摄入文档，并通过 `[SEARCH_KNOWLEDGE]` 随时调取。

### 3. 🎙️ 多模态感知 (Multimodal Intelligence)
**能看、能听。**
- **原生多模态**：自动下载并预处理 WhatsApp 语音 (OGG) 与图片。
- **预识别流水线**：集成 `ffmpeg` 探测，在 AI 思考前完成媒体元数据分析。
- **语音回复**：支持通过 `[TTS_SEND]` 发送高质量 AI 语音消息。

### 4. 🛑 紧急制动系统 (Kill Switch)
**绝对掌控权。**
- **`/stop` (🛑)** 指令：发送即刻触发！
- **秒级制动**：清空所有积压的消息队列，并强制熔断当前正在执行的 AI 思考任务。

---

## 🚀 快速启动 (Getting Started)

### 前置条件
- **macOS**: 核心运行环境 (darwin)
- **Node.js**: v20+
- **FFmpeg**: 用于多模态媒体处理 (`brew install ffmpeg`)
- **Gemini CLI**: 核心 AI 引擎

### 部署与运行
1. **构建与启动**:
   ```bash
   npm install && npm run build && npm start
   ```
2. **账号关联**:
   ```bash
   npm run auth  # 扫描二维码登录 WhatsApp
   ```
3. **安全配置 (可选)**:
   创建 `~/.config/nanoclaw/mount-allowlist.json` 以授权 AI 访问您的特定开发目录。

---

## 🛠️ 指令与工具 (Command Reference)

### 用户指令
| 指令 | 说明 |
| :--- | :--- |
| `@小助手 [指令]` | 唤醒词 (群组内必须，私聊可选) |
| `stop` 或 `🛑` | **紧急制动**，中断当前任务 |
| `[图片/语音]` | 自动触发多模态分析 |

### AI 内部工具 (Gemini Tools)
系统通过 Regex 协议调用以下能力：
- `[SHELL: command]`: 执行系统命令
- `[WRITE: path | content]`: 写入文件
- `[SEND_FILE: path]`: 发送文件给用户
- `[TTS_SEND: text]`: 发送语音消息
- `[SEARCH_KNOWLEDGE: query]`: 检索本地知识库
- `[INGEST_FILE: path]`: 摄入文件到知识库
- `[LIST_KNOWLEDGE]`: 列出知识库中的所有文件
- `[SHOW_MENU: title | options]`: 展示交互式菜单（选项以 | 分隔）

---

## 📅 系统状态 (2026-02-06)

- **系统版本**: v2.5 (High-Security & Multimodal Edition)
- **代码版本**: v1.0.0 (Base)
- **运行状态**: **Protected & Operational**
- **最新特性**: 实装了知识库 (RAG) 与交互式菜单功能。

---

## 📄 协议 (License)

本项目采用 MIT 协议。

🐾 *Empowered by NanoClaw Autonomous Agent*