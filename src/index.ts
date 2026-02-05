import { exec, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import makeWASocket, {
  DisconnectReason,
  WASocket,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';

import {
  ASSISTANT_NAME,
  DATA_DIR,
  IPC_POLL_INTERVAL,
  MAIN_GROUP_FOLDER,
  POLL_INTERVAL,
  STORE_DIR,
  TIMEZONE,
  TRIGGER_PATTERN,
} from './config.js';
import {
  AvailableGroup,
  runContainerAgent,
  writeGroupsSnapshot,
  writeTasksSnapshot,
} from './container-runner.js';
import { runLocalGemini } from './local-gemini.js';
import {
  getAllChats,
  getAllTasks,
  getLastGroupSync,
  getMessagesSince,
  getNewMessages,
  getRecentMessages,
  getTaskById,
  initDatabase,
  setLastGroupSync,
  storeChatMetadata,
  storeMessage,
  updateChatName,
} from './db.js';
import { startSchedulerLoop } from './task-scheduler.js';
import { NewMessage, RegisteredGroup, Session } from './types.js';
import { loadJson, saveJson } from './utils.js';
import { logger } from './logger.js';

const GROUP_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PID_FILE = path.join(DATA_DIR, 'nanoclaw.pid');

let sock: WASocket | null = null;
let lastTimestamp = '';
let sessions: Session = {};
let registeredGroups: Record<string, RegisteredGroup> = {};
let lastAgentTimestamp: Record<string, string> = {};
// LID to phone number mapping (WhatsApp now sends LID JIDs for self-chats)
let lidToPhoneMap: Record<string, string> = {};
// Guards to prevent duplicate loops on WhatsApp reconnect
let isConnecting = false;
let messageLoopRunning = false;
let ipcWatcherRunning = false;
let groupSyncTimerStarted = false;

/**
 * Acquire a lock file to prevent multiple instances.
 */
function acquireLock(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(PID_FILE)) {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'), 10);
    try {
      // Check if process is still running
      process.kill(pid, 0);
      logger.error({ pid }, 'Another instance of NanoClaw is already running');
      process.exit(1);
    } catch (err: any) {
      if (err.code === 'EPERM') {
        logger.error({ pid }, 'Another instance of NanoClaw is already running (EPERM)');
        process.exit(1);
      }
      // Process not running, stale lock file
      logger.warn({ pid, code: err.code }, 'Removing stale lock file');
      try {
        fs.unlinkSync(PID_FILE);
      } catch (e) {
        // Ignore errors during unlink if file already gone
      }
    }
  }
  fs.writeFileSync(PID_FILE, process.pid.toString());

  // Ensure lock is released on exit
  process.on('exit', () => releaseLock());
  process.on('SIGINT', () => {
    releaseLock();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    releaseLock();
    process.exit(0);
  });
}

function releaseLock(): void {
  if (fs.existsSync(PID_FILE)) {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'), 10);
    if (pid === process.pid) {
      fs.unlinkSync(PID_FILE);
    }
  }
}

/**
 * Translate a JID from LID format to phone format if we have a mapping.
 * Returns the original JID if no mapping exists.
 */
function translateJid(jid: string): string {
  if (!jid.endsWith('@lid')) return jid;
  const lidUser = jid.split('@')[0].split(':')[0];
  const phoneJid = lidToPhoneMap[lidUser];
  if (phoneJid) {
    logger.debug({ lidJid: jid, phoneJid }, 'Translated LID to phone JID');
    return phoneJid;
  }
  return jid;
}

async function setTyping(jid: string, isTyping: boolean): Promise<void> {
  if (!sock) return;
  try {
    await sock.sendPresenceUpdate(isTyping ? 'composing' : 'paused', jid);
  } catch (err) {
    logger.debug({ jid, err }, 'Failed to update typing status');
  }
}

function loadState(): void {
  const statePath = path.join(DATA_DIR, 'router_state.json');
  const state = loadJson<{
    last_timestamp?: string;
    last_agent_timestamp?: Record<string, string>;
  }>(statePath, {});
  lastTimestamp = state.last_timestamp || '';
  lastAgentTimestamp = state.last_agent_timestamp || {};
  sessions = loadJson(path.join(DATA_DIR, 'sessions.json'), {});
  registeredGroups = loadJson(
    path.join(DATA_DIR, 'registered_groups.json'),
    {},
  );
  logger.info(
    { groupCount: Object.keys(registeredGroups).length },
    'State loaded',
  );
}

function saveState(): void {
  saveJson(path.join(DATA_DIR, 'router_state.json'), {
    last_timestamp: lastTimestamp,
    last_agent_timestamp: lastAgentTimestamp,
  });
  saveJson(path.join(DATA_DIR, 'sessions.json'), sessions);
}

function registerGroup(jid: string, group: RegisteredGroup): void {
  registeredGroups[jid] = group;
  saveJson(path.join(DATA_DIR, 'registered_groups.json'), registeredGroups);

  // Create group folder
  const groupDir = path.join(DATA_DIR, '..', 'groups', group.folder);
  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

  logger.info(
    { jid, name: group.name, folder: group.folder },
    'Group registered',
  );
}

/**
 * Sync group metadata from WhatsApp.
 * Fetches all participating groups and stores their names in the database.
 * Called on startup, daily, and on-demand via IPC.
 */
async function syncGroupMetadata(force = false): Promise<void> {
  if (!sock) return;
  // Check if we need to sync (skip if synced recently, unless forced)
  if (!force) {
    const lastSync = getLastGroupSync();
    if (lastSync) {
      const lastSyncTime = new Date(lastSync).getTime();
      const now = Date.now();
      if (now - lastSyncTime < GROUP_SYNC_INTERVAL_MS) {
        logger.debug({ lastSync }, 'Skipping group sync - synced recently');
        return;
      }
    }
  }

  try {
    logger.info('Syncing group metadata from WhatsApp...');
    const groups = await sock.groupFetchAllParticipating();

    let count = 0;
    for (const [jid, metadata] of Object.entries(groups)) {
      if (metadata.subject) {
        updateChatName(jid, metadata.subject);
        count++;
      }
    }

    setLastGroupSync();
    logger.info({ count }, 'Group metadata synced');
  } catch (err) {
    logger.error({ err }, 'Failed to sync group metadata');
  }
}

/**
 * Get available groups list for the agent.
 * Returns groups ordered by most recent activity.
 */
function getAvailableGroups(): AvailableGroup[] {
  const chats = getAllChats();
  const registeredJids = new Set(Object.keys(registeredGroups));

  return chats
    .filter((c) => c.jid !== '__group_sync__' && c.jid.endsWith('@g.us'))
    .map((c) => ({
      jid: c.jid,
      name: c.name,
      lastActivity: c.last_message_time,
      isRegistered: registeredJids.has(c.jid),
    }));
}

async function processMessage(msg: NewMessage): Promise<void> {
  const group = registeredGroups[msg.chat_jid];
  if (!group) return;

  // Only skip if it's a known bot response format to prevent loops
  // Allows processing self-sent messages for testing/debugging
  if (msg.from_me && (msg.content.startsWith('🐾') || msg.content.startsWith(`${ASSISTANT_NAME}:`))) {
    return;
  }

  const content = msg.content.trim();
  logger.info(
    { group: group.name, user: msg.sender_name, content },
    'New message received',
  );

  const isMainGroup = group.folder.toLowerCase() === MAIN_GROUP_FOLDER.toLowerCase();
  const isPrivateChat = msg.chat_jid.endsWith('@s.whatsapp.net');

  // Skip trigger requirement if it's the main group, a private chat, or the trigger is present
  if (!isMainGroup && !isPrivateChat && !TRIGGER_PATTERN.test(content)) return;

  // Use a sliding window of the last 50 messages for full context
  const recentMessages = getRecentMessages(msg.chat_jid, 50);

  const lines = recentMessages.map((m) => {
    const isBot = m.from_me || m.content.startsWith(`${ASSISTANT_NAME}:`);
    const sender = isBot ? 'ASSISTANT' : `USER(${m.sender_name})`;
    const cleanContent = isBot
      ? m.content.replace(`${ASSISTANT_NAME}:`, '').trim()
      : m.content;
    return `[${m.timestamp}] ${sender}: ${cleanContent}`;
  });

  const prompt = `--- CONVERSATION HISTORY (Last 50 messages) ---\n${lines.join('\n')}\n--- END HISTORY ---`;

  if (recentMessages.length === 0) return;

  logger.info(
    { 
      group: group.name, 
      user: msg.sender_name, 
      contextSize: recentMessages.length 
    },
    'Processing message with sliding window context',
  );

  // 1. 发送即时确认，避免用户焦虑
  await sendMessage(msg.chat_jid, `🐾 @${ASSISTANT_NAME} 正在处理您的请求...`);
  
  // 开启打字状态心跳，确保在长任务中状态不消失
  const typingInterval = setInterval(() => setTyping(msg.chat_jid, true), 5000);
  await setTyping(msg.chat_jid, true);

  const response = await runAgent(group, prompt, msg.chat_jid);
  
  clearInterval(typingInterval);
  await setTyping(msg.chat_jid, false);

  if (response) {
    lastAgentTimestamp[msg.chat_jid] = msg.timestamp;
    // 3. 增加明确的结束标识
    await sendMessage(msg.chat_jid, `${ASSISTANT_NAME}: ${response}\n\n✅ 处理完毕。`);
  }
}

async function runAgent(
  group: RegisteredGroup,
  initialPrompt: string,
  chatJid: string,
): Promise<string | null> {
  const { executeTools } = await import('./tool-executor.js');
  let currentPrompt = initialPrompt;
  let finalResponse = '';
  let iterations = 0;
  const MAX_ITERATIONS = 15; // 稍微增加上限，应对更复杂的任务

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    try {
      const result = await runLocalGemini(currentPrompt, group.name);

      if (!result.success || !result.response) {
        logger.error(
          { group: group.name, error: result.error },
          'Local Gemini error',
        );
        return null;
      }

      const responseText = result.response;
      logger.info({ iterations, responseText }, 'Gemini thinking process');
      
      // 检查是否有工具调用
      const { results, commands } = await executeTools(responseText);

      if (results.length === 0) {
        // 没有指令了，这就是最终回复
        finalResponse = responseText;
        break;
      }

      // 2. 优化中间执行过程的反馈格式
      const statusUpdate = commands.map((cmd: any) => {
        if (cmd.type === 'shell') return `⚙️ 执行命令: \`${cmd.command}\``;
        if (cmd.type === 'write') return `📝 写入文件: \`${cmd.path}\``;
        return `🛠️ 执行工具: ${cmd.type}`;
      }).join('\n');

      await sendMessage(
        chatJid,
        `⏳ [步骤 ${iterations}] 正在操作...\n${statusUpdate}`
      );

      // 组装结果反馈给 Gemini
      const observerOutput = results
        .map(
          (r, i) =>
            `[OBSERVATION ${i + 1}]\n结果: ${r.success ? 'SUCCESS' : 'FAILED'}\n输出: ${r.output.slice(0, 1000)}`,
        )
        .join('\n\n');

      currentPrompt = `${responseText}\n\n${observerOutput}\n\n请继续。`;
    } catch (err) {
      logger.error({ group: group.name, err }, 'Agent iteration error');
      return null;
    }
  }

  return finalResponse || '任务执行超时或未给出明确答复。';
}

async function sendMessage(jid: string, text: string): Promise<void> {
  if (!sock) {
    logger.warn({ jid }, 'Cannot send message: WhatsApp socket not connected');
    return;
  }
  try {
    await sock.sendMessage(jid, { text });
    logger.info({ jid, length: text.length }, 'Message sent');
  } catch (err) {
    logger.error({ jid, err }, 'Failed to send message');
  }
}

function startIpcWatcher(): void {
  if (ipcWatcherRunning) {
    logger.debug('IPC watcher already running, skipping duplicate start');
    return;
  }
  ipcWatcherRunning = true;

  const ipcBaseDir = path.join(DATA_DIR, 'ipc');
  fs.mkdirSync(ipcBaseDir, { recursive: true });

  const processIpcFiles = async () => {
    // Scan all group IPC directories (identity determined by directory)
    let groupFolders: string[];
    try {
      groupFolders = fs.readdirSync(ipcBaseDir).filter((f) => {
        const stat = fs.statSync(path.join(ipcBaseDir, f));
        return stat.isDirectory() && f !== 'errors';
      });
    } catch (err) {
      logger.error({ err }, 'Error reading IPC base directory');
      setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
      return;
    }

    for (const sourceGroup of groupFolders) {
      const isMain = sourceGroup === MAIN_GROUP_FOLDER;
      const messagesDir = path.join(ipcBaseDir, sourceGroup, 'messages');
      const tasksDir = path.join(ipcBaseDir, sourceGroup, 'tasks');

      // Process messages from this group's IPC directory
      try {
        if (fs.existsSync(messagesDir)) {
          const messageFiles = fs
            .readdirSync(messagesDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of messageFiles) {
            const filePath = path.join(messagesDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              if (data.type === 'message' && data.chatJid && data.text) {
                // Authorization: verify this group can send to this chatJid
                const targetGroup = registeredGroups[data.chatJid];
                if (
                  isMain ||
                  (targetGroup && targetGroup.folder === sourceGroup)
                ) {
                  await sendMessage(
                    data.chatJid,
                    `${ASSISTANT_NAME}: ${data.text}`,
                  );
                  logger.info(
                    { chatJid: data.chatJid, sourceGroup },
                    'IPC message sent',
                  );
                } else {
                  logger.warn(
                    { chatJid: data.chatJid, sourceGroup },
                    'Unauthorized IPC message attempt blocked',
                  );
                }
              }
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC message',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error(
          { err, sourceGroup },
          'Error reading IPC messages directory',
        );
      }

      // Process tasks from this group's IPC directory
      try {
        if (fs.existsSync(tasksDir)) {
          const taskFiles = fs
            .readdirSync(tasksDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of taskFiles) {
            const filePath = path.join(tasksDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              // Pass source group identity to processTaskIpc for authorization
              await processTaskIpc(data, sourceGroup, isMain);
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC task',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error({ err, sourceGroup }, 'Error reading IPC tasks directory');
      }
    }

    setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
  };

  processIpcFiles();
  logger.info('IPC watcher started (per-group namespaces)');
}

async function processTaskIpc(
  data: {
    type: string;
    taskId?: string;
    prompt?: string;
    schedule_type?: string;
    schedule_value?: string;
    context_mode?: string;
    groupFolder?: string;
    chatJid?: string;
    // For register_group
    jid?: string;
    name?: string;
    folder?: string;
    trigger?: string;
    containerConfig?: RegisteredGroup['containerConfig'];
  },
  sourceGroup: string, // Verified identity from IPC directory
  isMain: boolean, // Verified from directory path
): Promise<void> {
  // Import db functions dynamically to avoid circular deps
  const {
    createTask,
    updateTask,
    deleteTask,
    getTaskById: getTask,
  } = await import('./db.js');
  const { CronExpressionParser } = await import('cron-parser');

  switch (data.type) {
    case 'schedule_task':
      if (
        data.prompt &&
        data.schedule_type &&
        data.schedule_value &&
        data.groupFolder
      ) {
        // Authorization: non-main groups can only schedule for themselves
        const targetGroup = data.groupFolder;
        if (!isMain && targetGroup !== sourceGroup) {
          logger.warn(
            { sourceGroup, targetGroup },
            'Unauthorized schedule_task attempt blocked',
          );
          break;
        }

        // Resolve the correct JID for the target group (don't trust IPC payload)
        const targetJid = Object.entries(registeredGroups).find(
          ([, group]) => group.folder === targetGroup,
        )?.[0];

        if (!targetJid) {
          logger.warn(
            { targetGroup },
            'Cannot schedule task: target group not registered',
          );
          break;
        }

        const scheduleType = data.schedule_type as 'cron' | 'interval' | 'once';

        let nextRun: string | null = null;
        if (scheduleType === 'cron') {
          try {
            const interval = CronExpressionParser.parse(data.schedule_value, {
              tz: TIMEZONE,
            });
            nextRun = interval.next().toISOString();
          } catch {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid cron expression',
            );
            break;
          }
        } else if (scheduleType === 'interval') {
          const ms = parseInt(data.schedule_value, 10);
          if (isNaN(ms) || ms <= 0) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid interval',
            );
            break;
          }
          nextRun = new Date(Date.now() + ms).toISOString();
        } else if (scheduleType === 'once') {
          const scheduled = new Date(data.schedule_value);
          if (isNaN(scheduled.getTime())) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid timestamp',
            );
            break;
          }
          nextRun = scheduled.toISOString();
        }

        const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const contextMode =
          data.context_mode === 'group' || data.context_mode === 'isolated'
            ? data.context_mode
            : 'isolated';
        createTask({
          id: taskId,
          group_folder: targetGroup,
          chat_jid: targetJid,
          prompt: data.prompt,
          schedule_type: scheduleType,
          schedule_value: data.schedule_value,
          context_mode: contextMode,
          next_run: nextRun,
          status: 'active',
          created_at: new Date().toISOString(),
        });
        logger.info(
          { taskId, sourceGroup, targetGroup, contextMode },
          'Task created via IPC',
        );
      }
      break;

    case 'pause_task':
      if (data.taskId) {
        const task = getTask(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          updateTask(data.taskId, { status: 'paused' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task paused via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task pause attempt',
          );
        }
      }
      break;

    case 'resume_task':
      if (data.taskId) {
        const task = getTask(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          updateTask(data.taskId, { status: 'active' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task resumed via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task resume attempt',
          );
        }
      }
      break;

    case 'cancel_task':
      if (data.taskId) {
        const task = getTask(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          deleteTask(data.taskId);
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task cancelled via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task cancel attempt',
          );
        }
      }
      break;

    case 'refresh_groups':
      // Only main group can request a refresh
      if (isMain) {
        logger.info(
          { sourceGroup },
          'Group metadata refresh requested via IPC',
        );
        await syncGroupMetadata(true);
        // Write updated snapshot immediately
        const availableGroups = getAvailableGroups();
        const { writeGroupsSnapshot: writeGroups } =
          await import('./container-runner.js');
        writeGroups(
          sourceGroup,
          true,
          availableGroups,
          new Set(Object.keys(registeredGroups)),
        );
      } else {
        logger.warn(
          { sourceGroup },
          'Unauthorized refresh_groups attempt blocked',
        );
      }
      break;

    case 'register_group':
      // Only main group can register new groups
      if (!isMain) {
        logger.warn(
          { sourceGroup },
          'Unauthorized register_group attempt blocked',
        );
        break;
      }
      if (data.jid && data.name && data.folder && data.trigger) {
        registerGroup(data.jid, {
          name: data.name,
          folder: data.folder,
          trigger: data.trigger,
          added_at: new Date().toISOString(),
          containerConfig: data.containerConfig,
        });
      } else {
        logger.warn(
          { data },
          'Invalid register_group request - missing required fields',
        );
      }
      break;

    default:
      logger.warn({ type: data.type }, 'Unknown IPC task type');
  }
}

async function connectWhatsApp(): Promise<void> {
  if (isConnecting) {
    logger.debug('WhatsApp connection attempt already in progress, skipping...');
    return;
  }
  isConnecting = true;

  const authDir = path.join(STORE_DIR, 'auth');
  fs.mkdirSync(authDir, { recursive: true });

  // Close existing socket if any
  if (sock) {
    logger.info('Closing existing WhatsApp socket before reconnecting');
    try {
      sock.ev.removeAllListeners('connection.update');
      sock.ev.removeAllListeners('creds.update');
      sock.ev.removeAllListeners('messages.upsert');
      sock.end(undefined);
    } catch (err) {
      logger.debug({ err }, 'Error closing existing socket');
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const currentSock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    logger,
    browser: ['NanoClaw', 'Chrome', '1.0.0'],
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    retryRequestDelayMs: 1000,
  });

  sock = currentSock;

  currentSock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      isConnecting = false;
      const msg =
        'WhatsApp authentication required. Run /setup in Claude Code.';
      logger.error(msg);
      exec(
        `osascript -e 'display notification "${msg}" with title "NanoClaw" sound name "Basso"'`,
      );
      setTimeout(() => process.exit(1), 1000);
    }

    if (connection === 'close') {
      isConnecting = false;
      const reason = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = reason !== DisconnectReason.loggedOut;
      logger.info({ reason, shouldReconnect }, 'Connection closed');

      if (shouldReconnect) {
        const statusCode = Number(reason);
        if (statusCode === DisconnectReason.connectionReplaced || statusCode === 440) {
          logger.warn(
            'Connection conflict detected. Waiting 15s before reconnecting to let other instances settle...',
          );
          setTimeout(() => connectWhatsApp(), 15000);
        } else {
          logger.info('Reconnecting...');
          setTimeout(() => connectWhatsApp(), 2000);
        }
      } else {
        logger.info('Logged out. Run /setup to re-authenticate.');
        process.exit(0);
      }
    } else if (connection === 'open') {
      isConnecting = false;
      logger.info('Connected to WhatsApp');

      // Build LID to phone mapping from auth state for self-chat translation
      if (currentSock.user) {
        const phoneUser = currentSock.user.id.split(':')[0];
        const lidUser = currentSock.user.lid?.split(':')[0];
        if (lidUser && phoneUser) {
          lidToPhoneMap[lidUser] = `${phoneUser}@s.whatsapp.net`;
          logger.debug({ lidUser, phoneUser }, 'LID to phone mapping set');
        }
      }

      // Sync group metadata on startup (respects 24h cache)
      syncGroupMetadata().catch((err) =>
        logger.error({ err }, 'Initial group sync failed'),
      );
      // Set up daily sync timer (only once)
      if (!groupSyncTimerStarted) {
        groupSyncTimerStarted = true;
        setInterval(() => {
          syncGroupMetadata().catch((err) =>
            logger.error({ err }, 'Periodic group sync failed'),
          );
        }, GROUP_SYNC_INTERVAL_MS);
      }
      startSchedulerLoop({
        sendMessage,
        registeredGroups: () => registeredGroups,
        getSessions: () => sessions,
      });
      startIpcWatcher();
      startMessageLoop();
    }
  });

  currentSock.ev.on('creds.update', saveCreds);

  currentSock.ev.on('messages.upsert', ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message) continue;
      const rawJid = msg.key.remoteJid;
      if (!rawJid || rawJid === 'status@broadcast') continue;

      // Translate LID JID to phone JID if applicable
      const chatJid = translateJid(rawJid);

      const timestamp = new Date(
        Number(msg.messageTimestamp) * 1000,
      ).toISOString();

      // Always store chat metadata for group discovery
      storeChatMetadata(chatJid, timestamp);

      // Only store full message content for registered groups
      if (registeredGroups[chatJid]) {
        storeMessage(
          msg,
          chatJid,
          msg.key.fromMe || false,
          msg.pushName || undefined,
        );
      }
    }
  });
}

async function startMessageLoop(): Promise<void> {
  if (messageLoopRunning) {
    logger.debug('Message loop already running, skipping duplicate start');
    return;
  }
  messageLoopRunning = true;
  logger.info(`NanoClaw running (trigger: @${ASSISTANT_NAME})`);

  while (true) {
    try {
      const jids = Object.keys(registeredGroups);
      const { messages } = getNewMessages(jids, lastTimestamp, ASSISTANT_NAME);

      if (messages.length > 0)
        logger.info({ count: messages.length }, 'New messages');
      for (const msg of messages) {
        try {
          await processMessage(msg);
        } catch (err) {
          logger.error(
            { err, msg: msg.id },
            'Error processing message',
          );
        }
        // Always advance timestamp to prevent getting stuck on a failing message
        lastTimestamp = msg.timestamp;
        saveState();
      }
    } catch (err) {
      logger.error({ err }, 'Error in message loop');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

function ensureContainerSystemRunning(): void {
  try {
    execSync('container system status', { stdio: 'pipe' });
    logger.debug('Apple Container system already running');
  } catch {
    logger.info('Starting Apple Container system...');
    try {
      execSync('container system start', { stdio: 'pipe', timeout: 30000 });
      logger.info('Apple Container system started');
    } catch (err) {
      logger.error({ err }, 'Failed to start Apple Container system');
      console.error(
        '\n╔════════════════════════════════════════════════════════════════╗',
      );
      console.error(
        '║  FATAL: Apple Container system failed to start                 ║',
      );
      console.error(
        '║                                                                ║',
      );
      console.error(
        '║  Agents cannot run without Apple Container. To fix:           ║',
      );
      console.error(
        '║  1. Install from: https://github.com/apple/container/releases ║',
      );
      console.error(
        '║  2. Run: container system start                               ║',
      );
      console.error(
        '║  3. Restart NanoClaw                                          ║',
      );
      console.error(
        '╚════════════════════════════════════════════════════════════════╝\n',
      );
      throw new Error('Apple Container system is required but failed to start');
    }
  }
}

async function main(): Promise<void> {
  acquireLock();
  ensureContainerSystemRunning();
  initDatabase();
  logger.info('Database initialized');
  loadState();
  await connectWhatsApp();
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start NanoClaw');
  process.exit(1);
});
