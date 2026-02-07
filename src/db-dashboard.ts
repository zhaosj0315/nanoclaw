import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { DATA_DIR } from './config.js';

const dbPath = path.join(DATA_DIR, 'nanoclaw.db');

export async function generateDashboard(): Promise<string> {
  const db = new Database(dbPath, { readonly: true });
  const stats = db.prepare('SELECT (SELECT COUNT(*) FROM messages) as total_messages, (SELECT COUNT(*) FROM memories) as total_memories, (SELECT COUNT(*) FROM tasks) as total_tasks, (SELECT COUNT(*) FROM chats) as total_chats').get() as any;
  const messages = db.prepare('SELECT timestamp, chat_jid, sender_name, content, from_me FROM messages ORDER BY timestamp DESC LIMIT 100').all() as any[];
  const memories = db.prepare('SELECT fact, category, created_at FROM memories ORDER BY created_at DESC').all() as any[];
  const tasks = db.prepare('SELECT id, prompt, schedule_type, status, next_run FROM tasks').all() as any[];
  const channelStats = db.prepare("SELECT SUM(CASE WHEN chat_jid LIKE 'lark@%' THEN 1 ELSE 0 END) as lark_count, SUM(CASE WHEN chat_jid NOT LIKE 'lark@%' THEN 1 ELSE 0 END) as wa_count FROM messages").get() as any;
  db.close();

  const html = '<!DOCTYPE html><html class="dark"><head><meta charset="UTF-8"><meta http-equiv="refresh" content="30"><title>看板</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-slate-900 text-white p-8 font-sans"><h1 class="text-3xl mb-8">🐾 NanoClaw 看板</h1><div class="grid grid-cols-4 gap-4 mb-8"><div class="bg-slate-800 p-4 rounded">消息: ' + stats.total_messages + '</div><div class="bg-slate-800 p-4 rounded">记忆: ' + stats.total_memories + '</div><div class="bg-slate-800 p-4 rounded">任务: ' + stats.total_tasks + '</div><div class="bg-slate-800 p-4 rounded">会话: ' + stats.total_chats + '</div></div><div class="bg-slate-800 p-6 rounded mb-8"><h2 class="text-xl mb-4">🧠 记忆库</h2><table class="w-full text-sm"><thead><tr class="text-left border-b border-slate-700"><th>事实</th><th>分类</th><th>时间</th></tr></thead><tbody>' + memories.map(m => '<tr class="border-b border-slate-700"><td class="py-2">' + m.fact + '</td><td>' + m.category + '</td><td class="font-mono">' + m.created_at + '</td></tr>').join('') + '</tbody></table></div><div class="bg-slate-800 p-6 rounded"><h2 class="text-xl mb-4">💬 消息流</h2><table class="w-full text-sm"><thead><tr class="text-left border-b border-slate-700"><th>时间</th><th>方向</th><th>内容</th></tr></thead><tbody>' + messages.map(m => '<tr class="border-b border-slate-700"><td class="py-2 font-mono">' + m.timestamp + '</td><td>' + (m.from_me ? 'OUT' : 'IN') + '</td><td class="italic">' + m.content + '</td></tr>').join('') + '</tbody></table></div></body></html>';

  const reportPath = path.join(DATA_DIR, 'db_dashboard.html');
  fs.writeFileSync(reportPath, html);
  return reportPath;
}
