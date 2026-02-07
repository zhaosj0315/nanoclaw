# NanoClaw Specification (Tactical v3.5)

**Architecture Status**: Unified Pipeline (Lark/WhatsApp) with Web-based Tactical Dashboard.

---

## 1. System Architecture

The system has evolved from a simple WhatsApp bot to a dual-interface autonomous agent platform.

```mermaid
graph TD
    User_WA[WhatsApp User] -->|Baileys| WA_Connector
    User_Lark[Lark User] -->|WS Client| Lark_Connector
    
    subgraph "Ingestion Layer"
        WA_Connector -->|Store Msg + DL Media| DB[(SQLite: messages)]
        Lark_Connector -->|Store Msg + DL Media| DB
    end
    
    subgraph "Core Loop (The Brain)"
        DB -->|Poll 5s| Scheduler[Task Scheduler]
        Scheduler -->|New Msg| Processor[Message Processor]
        
        Processor -->|1. Build Context| History[Recent Msgs (Limit 1)]
        Processor -->|2. Build Manifest| Manifest[Media Manifest]
        
        Manifest -->|3. Construct Prompt| Gemini[Gemini CLI]
        Gemini -->|4. Tool Calls| Tools[Tool Executor]
        
        Tools -->|Files/Shell| FileSystem
        Tools -->|Reply| Outbound[Unified Sender]
    end
    
    subgraph "Audit Layer (Tactical Dashboard)"
        DB -->|Sync| InteractionLog[Interaction Tables]
        InteractionLog -->|API| WebUI[Dashboard 3.5]
        WebUI -->|Action: Retry| API_Retry[Retry Endpoint]
        API_Retry -->|Inject| DB
    end
```

### 1.1 Unified Pipeline Principle
- **Normalization**: All JIDs are sanitized (`replace(/[^\w]/g, '')`) before storage.
- **Storage-First**: Connectors DO NOT trigger logic. They only dump data into `messages` and `data/media`.
- **Central Loop**: A single `startMessageLoop` consumes from the DB, ensuring consistent behavior across platforms.

---

## 2. Tactical Dashboard (Audit System)

A React-less, high-performance HTML/JS dashboard serving at `http://localhost:3000`.

### 2.1 Core Features
- **Visual Traceability**: 
  - `Question` column renders thumbnails (`[IMG]`) and absolute paths.
  - `Answer` column renders interactive media badges.
- **Zero-Jump Preview**:
  - **Drawer**: Slide-out panel for Markdown rendering and PDF embedding.
  - **Audio**: Inline HTML5 player.
  - **Image**: Hover preview + Modal full-view.
- **Phantom Action Detection**:
  - Compares User Intent (regex: "file", "image") vs. Agent Output.
  - Flags mismatches with **RED TINT** and `WARN` badge.
- **Metrics**:
  - Real-time Token Usage (Prompt/Completion).
  - Duration breakdown.

---

## 3. Multimodal Strategy (Anti-Hallucination)

To prevent the model from analyzing historical images instead of new ones:

### 3.1 Media Manifest
Before every inference, the system generates a manifest block:
```text
【当前交互焦点：全新上传文件】
用户刚刚上传了以下文件，请务必针对这些文件进行分析：
- [附件 1] image_3B...jpg (/Users/.../data/media/...)
```

### 3.2 Physical Anchoring
- **New Logic**: Only attachments from the *current* turn are passed to the CLI physical arguments.
- **History Logic**: Attachments in history (past 3 turns) are converted to text-only tags (`[历史图片: xxx]`) so the model knows context but cannot "see" (and confuse) them.

---

## 4. Tool System

Regex-based execution engine (`src/tool-executor.ts`).

| Tool | Signature | Notes |
| :--- | :--- | :--- |
| **Shell** | `[SHELL: cmd]` | Restricted by `mount-security.ts`. |
| **Write** | `[WRITE: path \| content]` | Overwrites files. |
| **Send File** | `[SEND_FILE: path]` | Supports auto-detection of media type. |
| **TTS** | `[TTS_SEND: text]` | Generates local `.aiff` -> `.ogg` conversion. |
| **Knowledge** | `[SEARCH_KNOWLEDGE]` | (Legacy/Low Priority) |

---

## 5. Data Schema Changes

### `interaction_tasks`
- **New Fields**:
  - `duration_ms` (INT): Processing time.
  - `token_usage` (JSON): `{prompt, completion, total}`.
  - `attachments` (JSON Array): List of absolute paths for traceability.

### `messages`
- **Standardization**: 
  - `chat_jid` is strictly formatted (e.g., `lark@oc_12345`, `8617...@s.whatsapp.net`).

---

## 6. Security

- **Basic Auth**: Dashboard protected by `admin/admin` (configurable).
- **Path Traversal**: Middleware blocks access to files outside `PROJECT_ROOT` unless allowed.
- **Content Sanitization**: Lark JSON payloads are parsed with a "Nuclear Fallback" to ensure no message is dropped due to formatting errors.