import express from 'express';
import path from 'path';
import fs from 'fs';
import { 
    getInteractionLog, 
    getDailyStats, 
    getInteractionTask, 
    storeGenericMessage, 
    getAllMemories, 
    updateMemory,
    deleteMemory,
    storeMemory,
    incrementMemoryRefCount,
    getAllTasks, 
    createTask,
    updateTask,
    deleteTask,
    getAllTaskRuns, 
    getAllChats, 
    getRecentMessages, 
    getAllKV,
    setKV 
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

app.post('/api/memories', (req, res) => {
    const { fact, category, chat_jid } = req.body;
    storeMemory(chat_jid || 'system', fact, category || 'general');
    res.json({ success: true });
});

app.put('/api/memories/:id', (req, res) => {
    const { id } = req.params;
    const { fact, category, is_pinned } = req.body;
    updateMemory(parseInt(id), fact, category, !!is_pinned);
    res.json({ success: true });
});

app.delete('/api/memories/:id', (req, res) => {
    deleteMemory(parseInt(req.params.id));
    res.json({ success: true });
});

app.get('/api/tasks', (req, res) => res.json({ tasks: getAllTasks(), runs: getAllTaskRuns() }));

app.post('/api/tasks', (req, res) => {
    const { id, prompt, schedule_type, schedule_value, context_mode } = req.body;
    createTask({
        id: id || `task-${Date.now()}`,
        group_folder: 'main',
        chat_jid: '8617600663150@s.whatsapp.net',
        prompt,
        schedule_type,
        schedule_value,
        context_mode: context_mode || 'group',
        next_run: new Date().toISOString(),
        status: 'active',
        created_at: new Date().toISOString()
    });
    res.json({ success: true });
});

app.put('/api/tasks/:id', (req, res) => {
    updateTask(req.params.id, req.body);
    res.json({ success: true });
});

app.delete('/api/tasks/:id', (req, res) => {
    deleteTask(req.params.id);
    res.json({ success: true });
});

app.get('/api/chats', (req, res) => res.json(getAllChats()));
app.get('/api/messages/:jid', (req, res) => res.json(getRecentMessages(req.params.jid, parseInt(req.query.limit as string) || 500)));
app.get('/api/kv', (req, res) => res.json(getAllKV()));

app.put('/api/kv/:key', (req, res) => {
    const { key } = req.params;
    const { value } = req.body;
    // 使用 db.js 中已有的 setLastGroupSync 逻辑类似的 KV 存储逻辑
    // 这里我直接在 server.ts 引用 db 对象不太优雅，我先在 db.ts 增加一个通用的 setKV
    setKV(key, value);
    res.json({ success: true });
});

app.get('/api/log', (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const search = req.query.search as string;
        const offset = (page - 1) * limit;
        const { tasks, total } = getInteractionLog(limit, offset, search);
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
        // 构造高优先级意图补全指令
        const recoveryPrompt = `[CRITICAL_RECOVERY] 你在之前的交互中产生了动作幻觉。指令「${task.content}」要求执行特定动作，但你仅作了文本回复。请立即调用对应的工具（文件/图片/语音）完成任务，禁止输出任何解释性文字。`;
        storeGenericMessage({ 
            id: newId, 
            chat_jid: task.session_id, 
            sender_jid: task.session_id, 
            content: recoveryPrompt, 
            timestamp: new Date().toISOString(), 
            from_me: false 
        });
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