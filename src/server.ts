import express from 'express';
import path from 'path';
import { getInteractionLog } from './db.js';
import { logger } from './logger.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from 'public' directory
app.use(express.static(path.join(process.cwd(), 'public')));

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
