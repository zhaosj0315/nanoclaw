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

// Serve media files safely with fallback to root
app.use('/media/:filename', (req, res) => {
    const filename = req.params.filename;
    const mediaPath = path.join(DATA_DIR, 'media', filename);
    const rootPath = path.join(process.cwd(), filename);

    if (fs.existsSync(mediaPath)) {
        res.sendFile(mediaPath);
    } else if (fs.existsSync(rootPath)) {
        res.sendFile(rootPath);
    } else {
        res.status(404).send('File not found');
    }
});

app.get('/api/log', (req, res) => {
    try {
        const log = getInteractionLog(50);
        const stats = getDailyStats();
        
        // 捕获访问者 IP
        const visitorIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
        
        res.json({ 
            log, 
            stats: { 
                ...stats, 
                visitor_ip: visitorIp 
            } 
        });
    } catch (err) {
        logger.error({ err }, 'Failed to fetch interaction log');
        res.status(500).json({ error: 'Internal Server Error' });
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
