# NanoClaw Specification (Gemini Edition)

A high-agency personal assistant accessible via WhatsApp, powered by local Gemini integration and a regex-based tool execution engine.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Folder Structure](#folder-structure)
3. [Configuration](#configuration)
4. [Memory System](#memory-system)
5. [Message Flow](#message-flow)
6. [Tool System](#tool-system)
7. [Security Model](#security-model)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        HOST (macOS)                                  │
│                   (Main Node.js Process)                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐                     ┌────────────────────┐        │
│  │  WhatsApp    │────────────────────▶│   SQLite Database  │        │
│  │  (baileys)   │◀────────────────────│   (nanoclaw.db)    │        │
│  └──────────────┘   store/send        └─────────┬──────────┘        │
│                                                  │                   │
│         ┌────────────────────────────────────────┘                   │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────────┐                                               │
│  │  Message Loop    │◀─────────────────┐                            │
│  │  (polls DB)      │                  │                            │
│  └────────┬─────────┘                  │                            │
│           │                            │                            │
│           ▼                            │                            │
│  ┌──────────────────┐        ┌──────────────────┐                   │
│  │   Gemini Engine  │───────▶│   Tool Executor  │                   │
│  │ (local-gemini.ts)│        │(tool-executor.ts)│                   │
│  └──────────────────┘        └──────────────────┘                   │
│                                        │                            │
│                                        ▼                            │
│                               ┌─────────────────┐                   │
│                               │  FileSystem /   │                   │
│                               │  Shell (Host)   │                   │
│                               └─────────────────┘                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Core Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **WhatsApp Core** | `@whiskeysockets/baileys` | Connects to WhatsApp Web API. |
| **Brain** | Google Gemini (via CLI/API) | Generates responses and tool calls. |
| **Tool Executor** | Regex Parser | Extracts commands like `[SHELL:...]` from AI output and executes them. |
| **Memory** | SQLite + JSON | Stores conversation history (`messages`) and persistent facts (`memories`). |
| **Multimodal** | FFmpeg | Pre-processes voice (`.ogg`) and images for the AI. |

---

## Folder Structure

```
nanoclaw/
├── README.md                      # User documentation (System v2.5)
├── package.json                   # Dependencies (v1.0.0)
├── .env                           # Environment variables
├── src/
│   ├── index.ts                   # Main entry point & message loop
│   ├── config.ts                  # Configuration constants
│   ├── local-gemini.ts            # Interface to Gemini AI
│   ├── tool-executor.ts           # Tool parsing and execution logic
│   ├── db.ts                      # Database operations
│   ├── media-analyzer.ts          # Multimodal processing
│   ├── mount-security.ts          # Path authorization logic
│   └── logger.ts                  # Logging utility
├── data/
│   ├── nanoclaw.db                # SQLite database
│   ├── knowledge_base/            # RAG storage (text files)
│   ├── media/                     # Downloaded voice/images
│   └── router_state.json          # System state persistence
├── store/
│   └── auth/                      # WhatsApp session credentials
├── groups/                        # Legacy/Container remnants (currently unused by Gemini core)
└── logs/                          # Runtime logs
```

---

## Configuration

Configuration is managed in `src/config.ts` and `.env`.

| Constant | Default | Purpose |
|----------|---------|---------|
| `ASSISTANT_NAME` | `zhaosj的助手` | Identity used for prompts and message prefixes. |
| `POLL_INTERVAL` | `5000` (ms) | How often to check for new messages. |
| `MOUNT_ALLOWLIST_PATH` | `~/.config/nanoclaw/mount-allowlist.json` | Security whitelist for file access. |

---

## Memory System

The system uses a hybrid memory approach:

1.  **Conversation Context**: The last 15 messages are always injected into the prompt.
2.  **Long-Term Memory (Facts)**:
    *   Stored in `nanoclaw.db` (table: `memories`).
    *   AI can "extract" facts from user messages (async process).
    *   Relevant facts are injected into the system prompt.
3.  **Knowledge Base (RAG)**:
    *   Files ingested via `[INGEST_FILE]` are stored in `data/knowledge_base/`.
    *   Retrieved via `[SEARCH_KNOWLEDGE]` tool.

---

## Message Flow

1.  **Receive**: `src/index.ts` listens for `messages.upsert` from WhatsApp.
2.  **Filter**: Ignores messages unless they:
    *   Start with trigger `@zhaosj的助手` (in groups).
    *   Are in a private chat (DM).
    *   Are from the "Main" control group.
3.  **Pre-process**:
    *   Downloads images/audio.
    *   `src/media-analyzer.ts` generates text descriptions for media.
4.  **Prompt Construction**:
    *   Combines: System Prompt + Long-term Memories + Recent History (15 msgs).
5.  **Inference**:
    *   Sends prompt to `local-gemini.ts`.
6.  **Tool Execution**:
    *   If response contains `[TOOL:...]` patterns, `tool-executor.ts` runs them.
    *   Output is fed back to Gemini for a follow-up response (Loop).
7.  **Response**:
    *   Final text is sent back to WhatsApp.
    *   If `[TTS_SEND]` was used, sends audio.

---

## Tool System

The Gemini Agent uses a **Regex-based** tool protocol. The AI invokes tools by generating specific string patterns.

| Tool Syntax | Description | Security |
|-------------|-------------|----------|
| `[SHELL: command]` | Executes bash command. | **Strict**: Checked against `mount-allowlist.json`. |
| `[WRITE: path \| content]` | Writes file content. | **Strict**: Checked against `mount-allowlist.json`. |
| `[SEND_FILE: path]` | Sends a file via WhatsApp. | **Strict**: Checks file existence & permission. |
| `[TTS_SEND: text]` | Generates AI speech (macOS `say`) and sends OGG. | Safe (Output only). |
| `[SEARCH_KNOWLEDGE: query]` | Greps the `data/knowledge_base` directory. | Read-only. |
| `[LIST_KNOWLEDGE]` | Lists files in knowledge base. | Read-only. |
| `[INGEST_FILE: path]` | Reads PDF/Doc/Code and saves to KB. | Checked against allowlist. |
| `[SHOW_MENU: title \| op1 \| op2]`| Displays interactive buttons/menu. | UX only. |

**Note**: The "Claude Agent SDK" tools (WebSearch, AgentBrowser) mentioned in previous specs are **NOT** available in this version. The system relies on standard shell commands (e.g., `curl`, `grep`) for external interactions.

---

## Security Model

### 1. Electronic Fence (Mount Security)
To prevent the AI from destroying the host system, file access is restricted.
*   **Default**: Only the project root directory is accessible.
*   **Allowlist**: User must explicitly add external paths to `~/.config/nanoclaw/mount-allowlist.json`.

### 2. Identity Check
*   `process.env.HOME` is resolved to ensure absolute path checking.
*   `..` traversal attempts in paths are blocked if they exit authorized roots.

### 3. Kill Switch
*   Sending `stop` or `🛑` immediately clears the message queue and interrupts the agent loop.