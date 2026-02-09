# NanoClaw Requirements (Tactical 5.0 Edition)

---

## 1. Philosophy: Small, Physical, Transparent

### Full Auditability
The entire codebase must be readable within 15 minutes. One Node.js process. Dedicated SQLite persistence. No microservices.

### Physical Agency (Hard Shell-First)
The agent is an operator, not a chatbot. It **must** perform physical observations ([SHELL]) before making claims about the environment.

### Guardian-Mediated Security
High-risk actions (file deletion, service management) are intercepted by a **Guardian Stub**. Execution is suspended until a manual "Approve" signal is received from zhaosj's authorized device.

---

## 2. Core Components

- **Bridge Engine**: A Node.js core that manages WhatsApp/Lark links and task scheduling.
- **Gemini CLI (Inference Only)**: Used as a pure reasoning engine without internal autonomous execution authority.
- **Tactical Dashboard**: 5-View terminal for real-time telemetry and task inspection.
- **Persistent memory**: Per-conversation structural storage in SQLite.

---

## 3. Architecture Decisions

### Progress Isolation
Intermediate "thinking" logs ([PROGRESS]) are intercepted by the Bridge and routed exclusively to the Dashboard, keeping the primary communication channel (WhatsApp) clean and results-oriented.

### Waterfall Telemetry
Every task must track timing across three specific stages:
1. **Pre-processing** (Data manifest & Ingestion)
2. **LLM Inference** (Thinking time)
3. **Post-processing** (Tool execution & Output)

---

## 4. Setup Requirements

- **Node.js**: v20.x
- **Platform**: macOS (Apple Silicon Optimized)
- **Engine**: Gemini CLI installed and globally available.
- **Dependencies**: FFmpeg (for audio), SQLite3.