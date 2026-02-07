# NanoClaw (🐾) - Tactical 3.5

> **The "Dual-Interface" Autonomous Agent: Chat-Driven Execution & Tactical Dashboard Audit.**

NanoClaw 是一款专为高阶开发者设计的**多模态自治系统**。它突破了传统 Chatbot 的黑盒限制，首创了 **“Tactical Log (战术看板)”** 审计体系，将 AI 的每一次思考、每一次文件生成、每一秒算力消耗都彻底透明化。

支持平台：**WhatsApp** | **Lark (飞书)**

---

## 🚀 核心特性 (v3.5 Tactical Edition)

### 1. 📊 战术审计看板 (Tactical Dashboard)
**地址**: `http://localhost:3000` (默认鉴权: admin/admin)
- **全链路溯源 (Traceability)**: 每一张图片、每一个文档都绑定了物理绝对路径。Question 列直接展示 AI 当时“看到”的缩略图，杜绝张冠李戴。
- **意图缺失审计 (Phantom Detection)**: 系统自动校验 `Intent` (用户想要文件) vs `Action` (AI 是否生成)。若不匹配，该行背景泛红并触发 **WARN** 警报。
- **零跳转预览 (Zero-Jump Flow)**:
    - **PDF/Markdown**: 点击侧边栏 (Drawer) 直接渲染阅读，无需下载。
    - **音频**: 内嵌 HTML5 波形播放器。
    - **图片**: 悬停缩略图，点击高清大图。
- **算力透视**: 实时显示 Token 消耗 (Prompt/Completion) 与分段耗时。

### 2. 🧠 统一多模态中枢 (Unified Multimodal Pipeline)
**One Brain, Any Interface.**
- **双端同权**: 无论是 WhatsApp 还是飞书，消息均汇入同一个 `messageLoop`。
- **全格式支持**: 自动捕获 **Image, Audio, Video, Document (PDF/Doc)**。
- **防幻觉投喂 (Manifest Anchoring)**:
    - 在 Prompt 顶部强制注入 `--- 实时附件清单 ---`。
    - 显式绑定附件 ID 与文件名，强迫模型优先分析当前附件，忽略历史噪音。

### 3. 🛡️ 电子围栏与安全
- **严格归一化**: 对所有 JID (WhatsApp/Lark) 进行 `replace(/[^\w]/g)` 级别的清洗，防止特殊字符注入。
- **文件系统白名单**: 默认仅限项目根目录操作，越权操作会被 `mount-security.ts` 拦截。

### 4. ⚡️ 操作回路 (Action Loops)
- **一键重试 (Re-Run)**: 看板内置 `↺` 按钮，可直接将历史指令重新注入推理队列，方便调试 Prompt。

---

## 🛠️ 快速启动

### 1. 环境准备
- **Node.js**: v20+
- **FFmpeg**: 用于语音转码 (`brew install ffmpeg`)
- **Gemini CLI**: 核心推理引擎

### 2. 启动服务
```bash
npm install
npm run build
npm start
```

### 3. 连接终端
- **WhatsApp**: 终端扫描二维码。
- **飞书 (Lark)**: 在 `.env` 配置 `LARK_APP_ID` 和 `LARK_APP_SECRET`，开启长连接模式。

---

## 📐 架构简述

```
[WhatsApp] ──┐                  ┌── [Tactical Dashboard]
             │                  │
             ▼                  ▼
      [Unified Message Queue (SQLite)]
             │
             ▼
    [Message Loop (Process Manager)]
             │
             ├──▶ [Media Downloader] ──▶ [Native OCR / Analysis]
             │
             ├──▶ [Prompt Engine] (Injects Manifest & Memories)
             │
             ▼
      [Gemini CLI (Multimodal Brain)]
             │
             ▼
      [Tool Executor (Shell/File)]
```

---

## 📄 协议

MIT License. 
🐾 *Built for High-Agency Developers.*