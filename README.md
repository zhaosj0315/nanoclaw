# NanoClaw (🐾) - Tactical 5.0

> **The Full-Spectrum Autonomous Agent Terminal: Multi-View Dashboard & Deep Interaction Audit.**

NanoClaw 是一款专为高阶开发者设计的**多模态自治系统**。它突破了传统 Chatbot 的黑盒限制，首创了 **“Tactical 5.0”** 多维审计体系，将 AI 的每一次思考、记忆、任务执行与系统配置彻底透明化。

支持平台：**WhatsApp** | **Lark (飞书)**

---

## 🚀 核心特性 (v5.0 Tactical Edition)

### 1. 📊 多维战术看板 (Multi-View Tactical Dashboard)
**地址**: `http://localhost:3000` (本地审计模式，免登录)
- **📡 Operations (审计流)**: 100% 沉浸式全屏审计。展示每一秒的算力消耗、Token 比例条（输入 vs 输出）及带延迟偏移的响应流。
- **🧠 Knowledge (记忆库)**: 可视化展示系统学习到的结构化事实 (Facts)，直观感知 AI 的长期上下文。
- **⚙️ Automation (任务网格)**: 实时监控 Cron 自动化任务的配置、下次运行倒计时及详细的执行成功/失败历史。
- **💬 Unified Comms (全域通讯)**: 双栏式消息浏览器，可追溯 AI 触发前的原始聊天上下文。
- **🛠️ System (系统注册表)**: 实时查看并审计 `kv_store` 中的全局配置与系统状态。

### 2. ⚡️ 深度性能遥测 (Deep Telemetry)
- **性能瀑布图**: 精准拆解“系统预处理”、“LLM 推理”、“工具执行”三个阶段的耗时。
- **实时 TPS 监控**: 动态计算模型每秒生成的 Token 速率。
- **任务审查器 (Task Inspector)**: 点击任务 ID 即可开启全息视图，查看原始 Request 负载与精确到个位的 Token 账单。

### 3. 🧠 统一多模态中枢 (Unified Multimodal Pipeline)
- **全格式自动捕获**: 自动路由 **Image, Audio, Video, Document (PDF/Doc)**。
- **防幻觉投喂 (Manifest Anchoring)**: 在 Prompt 顶部强制注入附件物理路径清单，确保视觉分析的准确性。

### 4. 🛡️ 安全与审计
- **零验证便捷访问**: 针对本地安全环境优化的免登录策略。
- **文件系统白名单**: 基于 `mount-security.ts` 的路径越权防护。

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

---

## 📐 架构简述

```
[User Input] ──▶ [SQLite Queue] ──▶ [Unified Processor] 
                                          │
      ┌───────────────────────────────────┴──────────────────────────────────┐
      ▼                                   ▼                                  ▼
[Prompt Engine] ──▶ [Gemini CLI (Brain)] ──▶ [Tool Executor] ──▶ [Outbound / Dashboard]
      ▲                                   ▲                                  ▲
      └─ [Memories]                       └─ [Shell/Files]                   └─ [Real-time Audit]
```

---

## 📄 协议

MIT License. 🐾 *Built for High-Agency Developers.*
