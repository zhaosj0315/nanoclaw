import fs from 'fs';
import path from 'path';
import { CronExpressionParser } from 'cron-parser';
import {
  DATA_DIR,
  GROUPS_DIR,
  MAIN_GROUP_FOLDER,
  POLL_INTERVAL,
  TIMEZONE,
} from './config.js';
import {
  getAllTasks,
  getTaskById,
  logTaskRun,
  updateTask,
} from './db.js';
import { RegisteredGroup, Session } from './types.js';
import { writeTasksSnapshot } from './container-runner.js';
import { runLocalGemini } from './local-gemini.js';
import { logger } from './logger.js';

export interface SchedulerDependencies {
  sendMessage: (jid: string, text: string) => Promise<void>;
  registeredGroups: () => Record<string, RegisteredGroup>;
  getSessions: () => Session;
}

async function runTask(
  task: any,
  deps: SchedulerDependencies,
): Promise<void> {
  const startTime = Date.now();
  const groupDir = path.join(GROUPS_DIR, task.group_folder);
  fs.mkdirSync(groupDir, { recursive: true });

  logger.info(
    { taskId: task.id, group: task.group_folder },
    'Running scheduled task',
  );

  const groups = deps.registeredGroups();
  const group = Object.values(groups).find(
    (g) => g.folder === task.group_folder,
  );

  if (!group) {
    logger.error(
      { taskId: task.id, groupFolder: task.group_folder },
      'Group not found for task',
    );
    logTaskRun({
      task_id: task.id,
      run_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      status: 'error',
      result: null,
      error: `Group not found: ${task.group_folder}`,
    });
    return;
  }

  // Update tasks snapshot for container to read
  const isMain = task.group_folder === MAIN_GROUP_FOLDER;
  const tasks = getAllTasks();
  writeTasksSnapshot(
    task.group_folder,
    isMain,
    tasks.map((t) => ({
      id: t.id,
      groupFolder: t.group_folder,
      prompt: t.prompt,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  let result: string | null = null;
  let error: string | null = null;

  try {
    const geminiRes = await runLocalGemini(task.prompt, group.name);
    if (geminiRes.success && geminiRes.response) {
      result = geminiRes.response;
      await deps.sendMessage(task.chat_jid, `[定时任务] ${group.name}:\n${result}`);
    } else {
      error = geminiRes.error || 'Unknown Gemini error';
    }
  } catch (err: any) {
    error = err.message;
  }

  logTaskRun({
    task_id: task.id,
    run_at: new Date().toISOString(),
    duration_ms: Date.now() - startTime,
    status: error ? 'error' : 'success',
    result,
    error,
  });

  // Calculate next run
  let nextRun: string | null = null;
  if (task.schedule_type === 'cron') {
    const interval = CronExpressionParser.parse(task.schedule_value, { tz: TIMEZONE });
    nextRun = interval.next().toISOString();
  } else if (task.schedule_type === 'interval') {
    nextRun = new Date(Date.now() + parseInt(task.schedule_value, 10)).toISOString();
  } else {
    // 'once' tasks are done
    updateTask(task.id, { status: 'paused', next_run: null });
    return;
  }

  updateTask(task.id, { next_run: nextRun });
}

export function startSchedulerLoop(deps: SchedulerDependencies) {
  setInterval(async () => {
    const tasks = getAllTasks();
    const now = new Date().toISOString();

    for (const task of tasks) {
      if (task.status === 'active' && task.next_run && task.next_run <= now) {
        await runTask(task, deps);
      }
    }
  }, POLL_INTERVAL);
  
  logger.info('Scheduler loop started');
}