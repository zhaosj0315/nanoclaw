# NanoClaw (🐾)

> **High-Agency Personal Assistant: Bridging WhatsApp, Gemini, and System-Level Autonomy.**

NanoClaw 是一款专为 macOS 设计的、具备高度自治能力的个人助理系统。它不仅是一个聊天机器人，更是您的**数字第二大脑**。通过 WhatsApp 界面，您可以跨越地理限制，指挥您的 Mac 完成代码编写、系统运维、多模态分析等复杂任务。

---

## 💎 核心演进 (Core Evolutions - v2.0+)

### 1. 🛡️ 电子围栏安全架构 (Electronic Fence Security)
**拒绝越权，保护隐私。** 
- **Local 路径校验**：所有 [SHELL] 与 [WRITE] 指令在执行前都会经过“政审”。
- **白名单机制**：默认仅限项目根目录工作，外部目录需在 `~/.config/nanoclaw/mount-allowlist.json` 中明确授权。
- **环境隔离**：核心操作强制锁定在 Workspace 领地，防止 AI 窥探您的私人文档。

### 2. 🧠 数字化长期记忆 (Long-term Memory System)
**越聊越懂你。**
- **持久化存储**：基于 SQLite 的 `memories` 引擎，自动提取并持久化对话中的事实、偏好与材料。
- **上下文注入**：每次回复前自动读取“长期记忆”与“最近 50 条历史”，确保逻辑的一致性。
- **异步学习**：后台静默执行记忆提取任务，不增加用户等待回复的时间。

### 3. 🎙️ 多模态感知 (Multimodal Intelligence)
**能看、能听。**
- **原生多模态**：自动下载并预处理 WhatsApp 语音 (OGG) 与图片。
- **预识别流水线**：集成 `ffmpeg` 探测，在 AI 思考前完成媒体元数据分析，规避 API 限制。
- **过程透明化**：日志实时展示 `[MEDIA ANALYSIS]` 过程，确保 AI 的每一个结论都有据可查。

### 4. 🛑 紧急制动系统 (Kill Switch)
**绝对掌控权。**
- **`/stop` (🛑)** 指令：发送即刻触发！
- **秒级制动**：清空所有积压的消息队列，并强制熔断当前正在执行的 AI 思考任务，防止“刷屏”或错误操作蔓延。

---

## 🚀 快速启动 (Getting Started)

### 前置条件
- **macOS**: 核心运行环境 (darwin)
- **Node.js**: v20+
- **FFmpeg**: 用于多模态媒体处理 (`brew install ffmpeg`)
- **Gemini CLI**: 已完成授权 (`gemini login`)

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

## 🛠️ 指令手册 (Command Reference)

| 指令 | 说明 | 效果 |
| :--- | :--- | :--- |
| `@小助手 [指令]` | 唤醒词 | 触发 AI 进行思考与工具执行 |
| `stop` 或 `🛑` | **紧急制动** | 清空队列并中断当前任务 (支持 /stop) |
| `[图片/语音]` | 多模态输入 | 自动触发分析流水线 |

---

## 🏗️ 目录结构 (Project Architecture)

- `src/index.ts`: 系统中枢，处理消息路由与中断逻辑。
- `src/db.ts`: 数字化记忆与历史消息的守护者。
- `src/media-analyzer.ts`: 多模态文件的预识别引擎。
- `src/tool-executor.ts`: 带有安全围栏的工具执行器。
- `data/nanoclaw.db`: 存储所有的事实与足迹。

---

## 📅 系统状态 (2026-02-05)

- **当前版本**: v2.5 (High-Security & Multimodal Edition)
- **运行状态**: **Protected & Operational**
- **核心更新**: 实装了 `/stop` 熔断机制、FFmpeg 音频探测及严格路径校验。

---

## 📄 协议 (License)

本项目采用 MIT 协议。

🐾 *Empowered by NanoClaw Autonomous Agent*