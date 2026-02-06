import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'nanoclaw.db');
const db = new Database(dbPath);

const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

// Check for recent messages
const recentMsgCount = db.prepare("SELECT COUNT(*) as count FROM messages WHERE timestamp > ?").get().count;

// Check for polluted memories
const pollutedMemCount = db.prepare("SELECT COUNT(*) as count FROM memories WHERE fact LIKE '%NanoClaw%' OR fact LIKE '%10.0.0.5%'").get().count;

console.log(`Verification:`);
console.log(`- Messages in the last hour: ${recentMsgCount}`);
console.log(`- Remaining polluted memories: ${pollutedMemCount}`);
