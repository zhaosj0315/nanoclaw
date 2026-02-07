# NanoClaw Specification (Tactical v5.0)

**Architecture Status**: Multi-View Tactical Dashboard with Unified Multimodal Ingestion.

---

## 1. System Architecture

The system provides a 360-degree audit of the autonomous agent loop across multiple interfaces.

### 1.1 Ingestion & Processing
- **Connectors**: WhatsApp (Baileys) and Lark (Lark-Connector).
- **Storage**: All events stored in `nanoclaw.db` (SQLite) before processing.
- **Core Loop**: `startMessageLoop` polls the DB, builds turn-based context, and triggers the Gemini CLI.

### 1.2 Multi-View Audit Planes (Frontend)
The dashboard (`http://localhost:3000`) is now divided into five high-isolation views:
1.  **📡 Operations**: Real-time interaction stream. Focuses on QA anchoring and physical path traceability.
2.  **🧠 Knowledge**: Structural visualization of the `memories` table.
3.  **⚙️ Automation**: Dashboard for the built-in scheduler (`tasks` and `task_runs`).
4.  **💬 Comms**: Message-level history for all nodes (chats).
5.  **🛠️ System**: Key-Value registry audit.

---

## 2. API Registry

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/log` | GET | Paginated interaction tasks with stats & intent heatmap. |
| `/api/memories`| GET | Returns all structural facts from long-term memory. |
| `/api/tasks` | GET | Returns all scheduled tasks and recent run history. |
| `/api/chats` | GET | Returns unique conversation metadata (JIDs, Names). |
| `/api/messages/:jid`| GET | Returns raw message history for a specific node. |
| `/api/kv` | GET | Returns all system registry entries. |
| `/api/fix` | POST | Injects a system correction message into the queue. |
| `/api/retry` | POST | Re-queues an existing task for reprocessing. |

---

## 3. Data Schema

### `interaction_tasks` (Core Audit)
- `id` (UUID): Primary key for task tracking.
- `telemetry` (JSON): `{pre, llm, post}` stage durations in ms.
- `intent_category` (TEXT): VLM-inferred intent (VISUAL, DOC, etc.).
- `token_usage` (JSON): `{prompt, completion, total}`.

### `memories` (Context)
- `fact` (TEXT): The learned truth or preference.
- `category` (TEXT): Classification tag (general, personal, context).

---

## 4. Telemetry & Performance

The system implements a **Waterfall Telemetry** stack:
- **System Pre-processing**: Duration of file downloads, OCR, and manifest building.
- **LLM Inference**: Raw generation time from Gemini CLI.
- **Tool Execution**: Duration of post-processing, file writes, and media generation.

**TPS Metric**: Calculated as `Completion Tokens / (Interaction Duration / 1000)`.

---

## 5. Security Model

- **Local Trust**: Authentication is disabled by default for local development speed.
- **Sandboxing**: (Ongoing) Tool execution is restricted to the project root via `mount-security.ts`.
- **Media Sanitization**: Explicit MIME headers for OGG/OPUS to ensure cross-browser audio compatibility.
