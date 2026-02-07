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
    CREATE TABLE IF NOT EXISTS chats (
      jid TEXT PRIMARY KEY,
      name TEXT,
      last_message_time DATETIME
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      group_folder TEXT,
      chat_jid TEXT,
      prompt TEXT,
      schedule_type TEXT,
      schedule_value TEXT,
      context_mode TEXT,
      next_run DATETIME,
      status TEXT,
      created_at DATETIME
    );
    CREATE TABLE IF NOT EXISTS task_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT,
      run_at DATETIME,
      duration_ms INTEGER,
      status TEXT,
      result TEXT,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT
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

export function storeMemory(chatJid: string, fact: string, category: string = 'general') {
  db.prepare(`
    INSERT INTO memories (chat_jid, fact, category, created_at)
    VALUES (?, ?, ?, ?)
  `).run(chatJid, fact, category, new Date().toISOString());
}

export function getMemories(chatJid: string) {
  return db.prepare(`
    SELECT fact, category, created_at FROM memories 
    WHERE chat_jid = ? 
    ORDER BY created_at DESC
  `).all(chatJid) as { fact: string; category: string; created_at: string }[];
}

export function deleteMemory(id: number) {
  db.prepare('DELETE FROM memories WHERE id = ?').run(id);
}

export function storeGenericMessage(msg: { id: string, chat_jid: string, sender_jid: string, sender_name?: string, content: string, timestamp: string, from_me: boolean }) {
  db.prepare(`
    INSERT INTO messages (id, chat_jid, sender_jid, sender_name, content, timestamp, from_me)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(msg.id, msg.chat_jid, msg.sender_jid, msg.sender_name || null, msg.content, msg.timestamp, msg.from_me ? 1 : 0);
}

export function storeMessage(msg: any, chatJid: string, fromMe: boolean, senderName?: string) {
  const id = msg.key.id;
  const senderJid = msg.key.participant || msg.key.remoteJid;
  
  const message = msg.message;
  let content = '';

  if (message) {
    content = 
      message.conversation || 
      message.extendedTextMessage?.text || 
      message.imageMessage?.caption || 
      message.videoMessage?.caption || 
      message.documentMessage?.caption || 
      message.viewOnceMessageV2?.message?.imageMessage?.caption ||
      message.viewOnceMessageV2?.message?.videoMessage?.caption ||
      '';

    if (!content) {
      if (message.imageMessage || message.viewOnceMessageV2?.message?.imageMessage) content = '🐾 [IMAGE]';
      else if (message.videoMessage || message.viewOnceMessageV2?.message?.videoMessage) content = '🐾 [VIDEO]';
      else if (message.documentMessage) content = `🐾 [DOCUMENT: ${message.documentMessage.fileName || 'unknown'}]`;
      else if (message.audioMessage) content = '🐾 [AUDIO]';
      else if (message.stickerMessage) content = '🐾 [STICKER]';
    }
  }

  const timestamp = new Date(Number(msg.messageTimestamp) * 1000).toISOString();

  db.prepare(`
    INSERT INTO messages (id, chat_jid, sender_jid, sender_name, content, timestamp, from_me)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(id, chatJid, senderJid, senderName || null, content, timestamp, fromMe ? 1 : 0);
}

export function getNewMessages(jids: string[], lastTimestamp: string, assistantName: string) {
  const placeholders = jids.map(() => '?').join(',');
  const messages = db.prepare(`
    SELECT * FROM messages 
    WHERE chat_jid IN (${placeholders}) 
    AND timestamp > ? 
    AND content NOT LIKE ?
    AND content NOT LIKE '🐾%'
    AND content NOT LIKE '📦%'
    ORDER BY timestamp ASC
  `).all(...jids, lastTimestamp, `${assistantName}:%`) as any[];

  return { messages };
}

export function getRecentMessages(chatJid: string, limit: number) {
  return db.prepare(`
    SELECT * FROM (
      SELECT * FROM messages 
      WHERE chat_jid = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    ) ORDER BY timestamp ASC
  `).all(chatJid, limit) as any[];
}

export function storeChatMetadata(chatJid: string, timestamp: string) {
  db.prepare(`
    INSERT INTO chats (jid, last_message_time) VALUES (?, ?)
    ON CONFLICT(jid) DO UPDATE SET 
        last_message_time = MAX(last_message_time, excluded.last_message_time)
  `).run(chatJid, timestamp);
}

export function updateChatName(chatJid: string, name: string) {
  db.prepare(`
    INSERT INTO chats (jid, name, last_message_time) VALUES (?, ?, ?)
    ON CONFLICT(jid) DO UPDATE SET name = excluded.name
  `).run(chatJid, name, new Date().toISOString());
}

export function getAllChats(): ChatInfo[] {
  return db.prepare('SELECT * FROM chats ORDER BY last_message_time DESC').all() as ChatInfo[];
}

export function getMessagesSince(chatJid: string, timestamp: string) {
  return db.prepare('SELECT * FROM messages WHERE chat_jid = ? AND timestamp > ? ORDER BY timestamp ASC')
    .all(chatJid, timestamp) as any[];
}

export function getAllTasks(): Task[] {
  return db.prepare('SELECT * FROM tasks').all() as Task[];
}

export function getTaskById(id: string): Task | undefined {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
}

export function createTask(task: Task) {
  try {
    db.prepare(`
      INSERT INTO tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(task.id, task.group_folder, task.chat_jid, task.prompt, task.schedule_type, task.schedule_value, task.context_mode, task.next_run, task.status, task.created_at);
  } catch (error) {
    console.error('Error creating task:', error);
  }
}

const ALLOWED_TASK_FIELDS = ['group_folder', 'prompt', 'schedule_type', 'schedule_value', 'context_mode', 'next_run', 'status'];

export function updateTask(id: string, updates: Partial<Task>) {
  try {
    const fieldsToUpdate = Object.keys(updates).filter(k => ALLOWED_TASK_FIELDS.includes(k));
    if (fieldsToUpdate.length === 0) return;

    const fields = fieldsToUpdate.map(k => `${k} = ?`).join(', ');
    const values = fieldsToUpdate.map(k => (updates as any)[k]);
    db.prepare(`UPDATE tasks SET ${fields} WHERE id = ?`).run(...values, id);
  } catch (error) {
    console.error('Error updating task:', error);
  }
}

export function deleteTask(id: string) {
  try {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  } catch (error) {
    console.error('Error deleting task:', error);
  }
}

export function logTaskRun(run: any) {
  try {
    db.prepare(`
      INSERT INTO task_runs (task_id, run_at, duration_ms, status, result, error)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(run.task_id, run.run_at, run.duration_ms, run.status, run.result, run.error);
  } catch (error) {
    console.error('Error logging task run:', error);
  }
}

export function setLastGroupSync() {
  db.prepare("INSERT INTO kv_store (key, value) VALUES ('last_group_sync', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(new Date().toISOString());
}

export function getLastGroupSync(): string | undefined {
  const res = db.prepare("SELECT value FROM kv_store WHERE key = 'last_group_sync'").get() as any;
  return res?.value;
}

// --- Interaction Log (Q&A Physics Binding) ---

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

export function getAllMemories() {
  return db.prepare('SELECT * FROM memories ORDER BY created_at DESC').all() as any[];
}

export function getAllTaskRuns(limit = 50) {
  return db.prepare('SELECT * FROM task_runs ORDER BY run_at DESC LIMIT ?').all(limit) as any[];
}

export function getAllKV() {
  return db.prepare('SELECT * FROM kv_store').all() as { key: string; value: string }[];
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
    total_tokens: 0 
  };
}
