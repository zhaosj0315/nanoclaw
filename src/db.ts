import Database from 'better-sqlite3';
import path from 'path';
import { DATA_DIR } from './config.js';

const dbPath = path.join(DATA_DIR, 'nanoclaw.db');
const db = new Database(dbPath);

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
  `);
}

export function storeMessage(msg: any, chatJid: string, fromMe: boolean, senderName?: string) {
  const id = msg.key.id;
  const senderJid = msg.key.participant || msg.key.remoteJid;
  const content = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
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
  db.prepare(`
    INSERT INTO tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(task.id, task.group_folder, task.chat_jid, task.prompt, task.schedule_type, task.schedule_value, task.context_mode, task.next_run, task.status, task.created_at);
}

export function updateTask(id: string, updates: Partial<Task>) {
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = Object.values(updates);
  db.prepare(`UPDATE tasks SET ${fields} WHERE id = ?`).run(...values, id);
}

export function deleteTask(id: string) {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
}

export function logTaskRun(run: any) {
  db.prepare(`
    INSERT INTO task_runs (task_id, run_at, duration_ms, status, result, error)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(run.task_id, run.run_at, run.duration_ms, run.status, run.result, run.error);
}

export function setLastGroupSync() {
  db.prepare("INSERT INTO kv_store (key, value) VALUES ('last_group_sync', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(new Date().toISOString());
}

export function getLastGroupSync(): string | undefined {
  const res = db.prepare("SELECT value FROM kv_store WHERE key = 'last_group_sync'").get() as any;
  return res?.value;
}
