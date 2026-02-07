import express from 'express';
import path from 'path';
import fs from 'fs';
import basicAuth from 'basic-auth';
import { getInteractionLog, getDailyStats, getInteractionTask, storeGenericMessage } from './db.js';
import { logger } from './logger.js';
import { DATA_DIR } from './config.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const USERNAME = process.env.DASHBOARD_USER || 'admin';
const PASSWORD = process.env.DASHBOARD_PASS || 'admin';

const auth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const user = basicAuth(req);
  if (!user || user.name !== USERNAME || user.pass !== PASSWORD) {
    res.set('WWW-Authenticate', 'Basic realm="NanoClaw Dashboard"');
    return res.status(401).send('Authentication required.');
  }
  next();
};

app.use(auth);

// Serve static files from 'public' directory
app.use(express.static(path.join(process.cwd(), 'public')));

// Serve media files with correct MIME types and fallback
app.get('/media/:filename', (req, res) => {
    const filename = req.params.filename;
    const mediaPath = path.join(DATA_DIR, 'media', filename);
    const ttsPath = path.join(DATA_DIR, 'tts', filename);
    const rootPath = path.join(process.cwd(), filename);
    
    // 按优先级搜索目录
    let targetPath = null;
    if (fs.existsSync(mediaPath)) targetPath = mediaPath;
    else if (fs.existsSync(ttsPath)) targetPath = ttsPath;
    else if (fs.existsSync(rootPath)) targetPath = rootPath;

    if (!targetPath) {
        return res.status(404).send('File not found');
    }

    const ext = path.extname(filename).toLowerCase();
    
    // 关键修复：显式设置音频 MIME 类型，解决 Safari/macOS 兼容性问题
    if (ext === '.ogg' || ext === '.opus') {
        res.setHeader('Content-Type', 'audio/ogg; codecs=opus');
    } else if (ext === '.mp3') {
        res.setHeader('Content-Type', 'audio/mpeg');
    } else if (ext === '.wav') {
        res.setHeader('Content-Type', 'audio/wav');
    } else if (ext === '.pdf') {
        res.setHeader('Content-Type', 'application/pdf');
    }

    res.sendFile(targetPath);
});

app.get('/api/log', (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        const { tasks, total } = getInteractionLog(limit, offset);
        const stats = getDailyStats() || { total_tasks: 0, total_tokens: 0, avg_duration: 0 };
        
        // 计算意图分类热图
        const categoryStats = tasks.reduce((acc: any, t: any) => {
            const cat = t.intent_category || 'GENERAL';
            acc[cat] = (acc[cat] || 0) + 1;
            return acc;
        }, {});

        // 捕获访问者 IP
        let visitorIp = '127.0.0.1';
        try {
            visitorIp = (req.headers['x-forwarded-for'] as string) || req.ip || req.socket.remoteAddress || '127.0.0.1';
            if (visitorIp.includes('::ffff:')) visitorIp = visitorIp.replace('::ffff:', '');
        } catch (ipErr) {}
        
        res.json({ 
            log: tasks, 
            total,
            page,
            limit,
            stats: { 
                ...stats, 
                visitor_ip: visitorIp,
                categories: categoryStats
            } 
        });
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
        storeGenericMessage({
            id: newId,
            chat_jid: task.session_id,
            sender_jid: task.session_id,
            content: `[SYSTEM_FIX] 用户反馈你刚才的回复中缺失了必要的附件或操作。请核对指令 "${task.content}"，并立即补发缺失的文件、图片或音频。不要重复文字说明，直接调用工具。`,
            timestamp: new Date().toISOString(),
            from_me: false
        });
        res.json({ success: true, newId });
    } catch (err) {
        res.status(500).json({ error: 'Fix initiation failed' });
    }
});

app.post('/api/retry', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing task ID' });

    const task = getInteractionTask(id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    try {
        // Create a new message to trigger reprocessing
        const newId = `retry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        storeGenericMessage({
            id: newId,
            chat_jid: task.session_id,
            sender_jid: task.session_id, // Assuming session_id is chat_jid/sender
            content: task.content,
            timestamp: new Date().toISOString(),
            from_me: false // Treat as user message to trigger processing
        });
        
        logger.info({ originalId: id, newId }, 'Task retry initiated');
        res.json({ success: true, newId });
    } catch (err) {
        logger.error({ err, id }, 'Failed to retry task');
        res.status(500).json({ error: 'Retry failed' });
    }
});

export function startDashboardServer() {
    app.listen(PORT, () => {
        logger.info({ port: PORT }, 'Dashboard server started');
    });
}
