import express from 'express';
import path from 'path';
import fs from 'fs';
import basicAuth from 'basic-auth';
import { getInteractionLog } from './db.js';
import { logger } from './logger.js';
import { DATA_DIR } from './config.js';

const app = express();
const PORT = process.env.PORT || 3000;

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
        res.json(log);
    } catch (err) {
        logger.error({ err }, 'Failed to fetch interaction log');
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export function startDashboardServer() {
    app.listen(PORT, () => {
        logger.info({ port: PORT }, 'Dashboard server started');
    });
}
