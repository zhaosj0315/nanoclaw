import Database from 'better-sqlite3';
import path from 'path';
import { DATA_DIR } from './config.js';

const dbPath = path.join(DATA_DIR, 'nanoclaw.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

export interface ChatInfo {
  jid: string;
  name: string;
  last_message_time: string;
}

export interface Task {
  id: string;
  group_folder: string;
  chat_jid: string;
  prompt: string;
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string;
  context_mode: 'group' | 'isolated';
  next_run: string | null;
  status: 'active' | 'paused';
  created_at: string;
}

export interface InteractionTask {
  id: string;
  session_id: string;
  content: string;
  status: 'PENDING' | 'RESOLVED';
  created_at: string;
  duration_ms?: number;
  token_usage?: { prompt: number; completion: number; total: number };
  attachments?: string[];
  origin_ip?: string;
  origin_location?: string;
  intent_category?: string;
  telemetry?: { pre?: number; llm?: number; post?: number };
}

export interface InteractionResponse {
  id: number;
  parent_id: string;
  type: 'Text' | 'Audio' | 'Image' | 'File' | 'Reaction';
  content: string;
  created_at: string;
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_jid TEXT,
      sender_jid TEXT,
      sender_name TEXT,
      content TEXT,
      timestamp DATETIME,
      from_me INTEGER
    );
    CREATE TABLE IF NOT EXISTS interaction_tasks (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      content TEXT,
      status TEXT,
      created_at DATETIME,
      duration_ms INTEGER,
      token_usage TEXT,
      attachments TEXT,
      origin_ip TEXT,
      origin_location TEXT,
      intent_category TEXT,
      telemetry TEXT
    );
    CREATE TABLE IF NOT EXISTS interaction_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id TEXT,
      type TEXT,
      content TEXT,
      created_at DATETIME,
      FOREIGN KEY(parent_id) REFERENCES interaction_tasks(id)
    );
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_jid TEXT,
      fact TEXT,
      category TEXT,
      created_at DATETIME
    );
  `);
}

export function storeGenericMessage(msg: { id: string, chat_jid: string, sender_jid: string, sender_name?: string, content: string, timestamp: string, from_me: boolean }) {
  db.prepare(`
    INSERT INTO messages (id, chat_jid, sender_jid, sender_name, content, timestamp, from_me)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(msg.id, msg.chat_jid, msg.sender_jid, msg.sender_name || null, msg.content, msg.timestamp, msg.from_me ? 1 : 0);
}

export function createInteractionTask(id: string, session_id: string, content: string, attachments: string[] = [], origin: { ip?: string, loc?: string } = {}) {
  const attachmentsStr = JSON.stringify(attachments);
  db.prepare(`
    INSERT INTO interaction_tasks (id, session_id, content, status, created_at, duration_ms, token_usage, attachments, origin_ip, origin_location)
    VALUES (?, ?, ?, 'PENDING', ?, NULL, NULL, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(id, session_id, content, new Date().toISOString(), attachmentsStr, origin.ip || null, origin.loc || null);
}

export function completeInteractionTask(id: string, usage?: any, telemetry?: any, intent?: string) {
  const now = new Date();
  const task = db.prepare('SELECT created_at FROM interaction_tasks WHERE id = ?').get(id) as { created_at: string };
  let duration = 0;
  if (task) duration = now.getTime() - new Date(task.created_at).getTime();

  db.prepare(`
    UPDATE interaction_tasks 
    SET status = 'RESOLVED', duration_ms = ?, token_usage = ?, telemetry = ?, intent_category = ?
    WHERE id = ?
  `).run(duration, JSON.stringify(usage), JSON.stringify(telemetry), intent || 'GENERAL', id);
}

export function addInteractionResponse(parent_id: string, type: string, content: string) {
  db.prepare(`
    INSERT INTO interaction_responses (parent_id, type, content, created_at)
    VALUES (?, ?, ?, ?)
  `).run(parent_id, type, content, new Date().toISOString());
}

export function getInteractionTask(id: string): InteractionTask | undefined {
  return db.prepare('SELECT * FROM interaction_tasks WHERE id = ?').get(id) as any;
}

export function getInteractionLog(limit = 20, offset = 0) {
  const { total } = db.prepare('SELECT COUNT(*) as total FROM interaction_tasks').get() as { total: number };
  const tasks = db.prepare(`SELECT * FROM interaction_tasks ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(limit, offset) as any[];
  
  const result = tasks.map(t => ({
    ...t,
    token_usage: t.token_usage ? JSON.parse(t.token_usage) : null,
    attachments: t.attachments ? JSON.parse(t.attachments) : [],
    telemetry: t.telemetry ? JSON.parse(t.telemetry) : null,
    responses: db.prepare(`SELECT * FROM interaction_responses WHERE parent_id = ? ORDER BY created_at ASC`).all(t.id)
  }));

  return { tasks: result, total };
}

export function getDailyStats() {
  const today = new Date().toISOString().split('T')[0];
  const stats = db.prepare(`
    SELECT COUNT(*) as total_tasks, AVG(duration_ms) as avg_duration 
    FROM interaction_tasks WHERE created_at >= ?
  `).get(today + 'T00:00:00.000Z') as any;

  return {
    total_tasks: stats.total_tasks || 0,
    avg_duration: Math.round(stats.avg_duration || 0),
    total_tokens: 0 // Will be aggregated by caller if needed
  };
}

// ... existing memory functions (storeMemory, getMemories, etc.)
export function storeMemory(chatJid: string, fact: string, category: string = 'general') {
  db.prepare(`INSERT INTO memories (chat_jid, fact, category, created_at) VALUES (?, ?, ?, ?)`).run(chatJid, fact, category, new Date().toISOString());
}
export function getMemories(chatJid: string) {
  return db.prepare(`SELECT fact, category, created_at FROM memories WHERE chat_jid = ? ORDER BY created_at DESC`).all(chatJid) as any[];
}
export function getRecentMessages(chatJid: string, limit: number) {
  return db.prepare(`SELECT * FROM (SELECT * FROM messages WHERE chat_jid = ? ORDER BY timestamp DESC LIMIT ?) ORDER BY timestamp ASC`).all(chatJid, limit) as any[];
}