# NanoClaw Developer Context

This project is a **WhatsApp-based AI Agent** running on macOS, powered by **Gemini**.

## System Architecture
- **Runtime**: Node.js v20+
- **Core**: `src/index.ts` (WhatsApp connection, Message Loop)
- **AI Engine**: `src/local-gemini.ts` (Gemini API/CLI wrapper)
- **Tools**: `src/tool-executor.ts` (Regex-based tool parsing)
- **Database**: SQLite (`data/nanoclaw.db`)

## Key Commands
- **Start**: `npm start`
- **Dev**: `npm run dev` (Hot reload)
- **Auth**: `npm run auth` (Link WhatsApp)
- **Build**: `npm run build`

## Tool Protocol
The AI controls the system by outputting specific tags:
- `[SHELL: command]` - Execute system command
- `[WRITE: path | content]` - Write content to file
- `[SEND_FILE: path]` - Send file to user via WhatsApp
- `[TTS_SEND: text]` - Generate and send AI voice message
- `[SEARCH_KNOWLEDGE: query]` - Search local knowledge base
- `[LIST_KNOWLEDGE]` - List files in knowledge base
- `[INGEST_FILE: path]` - Ingest file (PDF/Docx/Text) into knowledge base
- `[SHOW_MENU: title | options]` - Display interactive menu (options separated by |)

## Security
- **Path Validation**: All file operations are checked against `~/.config/nanoclaw/mount-allowlist.json`.
- **Emergency Stop**: The `/stop` command flushes queues and interrupts execution.

## Development Rules
1. **No Code Changes** (unless explicitly requested): This file describes the *existing* system.
2. **Logs**: Check `logs/nanoclaw.log` for runtime details.
3. **State**: `data/router_state.json` holds the last processed message timestamp.