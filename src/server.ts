import express from 'express';
import path from 'path';
import fs from 'fs';
import { 
    getInteractionLog, 
    getDailyStats, 
    getInteractionTask, 
    storeGenericMessage, 
    getAllMemories, 
    getAllTasks, 
    getAllTaskRuns, 
    getAllChats, 
    getRecentMessages, 
    getAllKV 
} from './db.js';
import { logger } from './logger.js';
import { DATA_DIR } from './config.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const auth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  next();
};

app.use(auth);

app.use(express.static(path.join(process.cwd(), 'public')));

app.get('/media/:filename', (req, res) => {
    const filename = req.params.filename;
    const mediaPath = path.join(DATA_DIR, 'media', filename);
    const ttsPath = path.join(DATA_DIR, 'tts', filename);
    const rootPath = path.join(process.cwd(), filename);
    
    let targetPath = null;
    if (fs.existsSync(mediaPath)) targetPath = mediaPath;
    else if (fs.existsSync(ttsPath)) targetPath = ttsPath;
    else if (fs.existsSync(rootPath)) targetPath = rootPath;

    if (!targetPath) return res.status(404).send('File not found');

    const ext = path.extname(filename).toLowerCase();
    if (ext === '.ogg' || ext === '.opus') res.setHeader('Content-Type', 'audio/ogg; codecs=opus');
    else if (ext === '.mp3') res.setHeader('Content-Type', 'audio/mpeg');
    else if (ext === '.wav') res.setHeader('Content-Type', 'audio/wav');
    else if (ext === '.pdf') res.setHeader('Content-Type', 'application/pdf');

    res.sendFile(targetPath);
});

app.get('/api/memories', (req, res) => res.json(getAllMemories()));
app.get('/api/tasks', (req, res) => res.json({ tasks: getAllTasks(), runs: getAllTaskRuns() }));
app.get('/api/chats', (req, res) => res.json(getAllChats()));
app.get('/api/messages/:jid', (req, res) => res.json(getRecentMessages(req.params.jid, parseInt(req.query.limit as string) || 50)));
app.get('/api/kv', (req, res) => res.json(getAllKV()));

app.get('/api/log', (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;
        const { tasks, total } = getInteractionLog(limit, offset);
        const stats = getDailyStats() || { total_tasks: 0, total_tokens: 0, avg_duration: 0 };
        const categoryStats = tasks.reduce((acc: any, t: any) => {
            const cat = t.intent_category || 'GENERAL';
            acc[cat] = (acc[cat] || 0) + 1;
            return acc;
        }, {});
        let visitorIp = '127.0.0.1';
        try {
            visitorIp = (req.headers['x-forwarded-for'] as string) || req.ip || req.socket.remoteAddress || '127.0.0.1';
            if (visitorIp.includes('::ffff:')) visitorIp = visitorIp.replace('::ffff:', '');
        } catch (ipErr) {}
        res.json({ log: tasks, total, page, limit, stats: { ...stats, visitor_ip: visitorIp, categories: categoryStats } });
    } catch (err) {
        logger.error({ err }, 'Critical failure in /api/log');
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
});

app.post('/api/fix', (req, res) => {
    const { id } = req.body;
    const task = getInteractionTask(id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    try {
        const newId = `fix-${Date.now()}`;
        storeGenericMessage({ id: newId, chat_jid: task.session_id, sender_jid: task.session_id, content: `[SYSTEM_FIX] 用户反馈缺失必要附件。请核对指令 "${task.content}" 并补发。`, timestamp: new Date().toISOString(), from_me: false });
        res.json({ success: true, newId });
    } catch (err) { res.status(500).json({ error: 'Fix initiation failed' }); }
});

app.post('/api/retry', (req, res) => {
    const { id } = req.body;
    const task = getInteractionTask(id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    try {
        const newId = `retry-${Date.now()}`;
        storeGenericMessage({ id: newId, chat_jid: task.session_id, sender_jid: task.session_id, content: task.content, timestamp: new Date().toISOString(), from_me: false });
        res.json({ success: true, newId });
    } catch (err) { res.status(500).json({ error: 'Retry failed' }); }
});

app.get('/api/sys-resources', (req, res) => {
    // Basic fallback for sys metrics
    res.json({ mem: { percent: 0 }, cpu: { usage: '0%' } });
});

export function startDashboardServer() {
    app.listen(PORT, () => {
        logger.info({ port: PORT }, 'Dashboard server started');
    });
}