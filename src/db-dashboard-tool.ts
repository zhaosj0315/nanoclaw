import { generateDashboard } from './db-dashboard.js';
async function run() {
    try {
        const path = await generateDashboard();
        console.log('DASHBOARD_PATH:' + path);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
