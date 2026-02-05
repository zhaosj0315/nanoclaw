import { exec, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import makeWASocket, {
  DisconnectReason,
  WASocket,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  downloadMediaMessage,
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
  getMemories,
  getMessagesSince,
  getNewMessages,
  getRecentMessages,
  getTaskById,
  initDatabase,
  setLastGroupSync,
  storeChatMetadata,
  storeMemory,
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
let globalInterruptTimestamp = 0;

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

/**
 * 利用 macOS 原生 'say' 命令生成 AI 语音并转码
 */
async function generateTts(text: string): Promise<string | null> {
  const ttsDir = path.join(DATA_DIR, 'tts');
  if (!fs.existsSync(ttsDir)) fs.mkdirSync(ttsDir, { recursive: true });
  
  const tempAiff = path.join(ttsDir, `tts_${Date.now()}.aiff`);
  const finalOgg = path.join(ttsDir, `tts_${Date.now()}.ogg`);
  
  try {
    // 1. 使用 macOS say 生成高质量 AI 语音
    // 去掉一些特殊字符以防命令注入
    const safeText = text.replace(/[`"'$]/g, '').slice(0, 500); 
    execSync(`say -v Ting-Ting "${safeText}" -o "${tempAiff}"`);
    
    // 2. 使用 ffmpeg 转码为 WhatsApp 兼容的 opus/ogg 格式
    execSync(`ffmpeg -i "${tempAiff}" -c:a libopus -b:a 32k -v error -y "${finalOgg}"`);
    
    if (fs.existsSync(tempAiff)) fs.unlinkSync(tempAiff);
    return finalOgg;
  } catch (err) {
    logger.error({ err }, 'TTS generation failed');
    return null;
  }
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
  
  // --- 关键修复：重启即终止 ---
  // 用户反馈重启后仍在处理历史消息。强制将 lastTimestamp 重置为当前时间，
  // 忽略所有积压的历史消息，确保“重启”等于“清空状态”。
  lastTimestamp = new Date().toISOString();
  
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

import { analyzeMedia } from './media-analyzer.js';

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

  // --- 关键修复：空消息过滤 ---
  // 如果内容为空且没有媒体文件，直接忽略，防止 WhatsApp 系统消息或同步空消息触发重复回复。
  const mediaDir = path.join(DATA_DIR, 'media');
  const hasVoice = fs.existsSync(path.join(mediaDir, `voice_${msg.id}.ogg`));
  const hasImage = fs.existsSync(path.join(mediaDir, `image_${msg.id}.jpg`));
  
  if (!content && !hasVoice && !hasImage) {
    logger.debug({ msgId: msg.id }, 'Ignoring empty message with no media');
    return;
  }

  const isMainGroup = group.folder.toLowerCase() === MAIN_GROUP_FOLDER.toLowerCase();
  const isPrivateChat = msg.chat_jid.endsWith('@s.whatsapp.net');

  // Skip trigger requirement if it's the main group, a private chat, or the trigger is present
  if (!isMainGroup && !isPrivateChat && !TRIGGER_PATTERN.test(content)) return;

  // --- [UX 升级] 表情回应机制：已阅 ---
  const msgKey = {
    remoteJid: msg.chat_jid,
    fromMe: msg.from_me,
    id: msg.id,
    participant: msg.sender
  };

  // 关键修复：时效性检查
  // 如果消息时间早于当前时间 2 分钟以上（且不是重启瞬间的新消息），则视为过期历史，不再自动回复。
  const msgTimestamp = new Date(msg.timestamp).getTime();
  const now = Date.now();
  if (now - msgTimestamp > 2 * 60 * 1000) {
    logger.info({ msgId: msg.id, diff: now - msgTimestamp }, 'Skipping expired message (older than 2 mins)');
    return;
  }

  await sendReaction(msg.chat_jid, msgKey, '👀');

  // 关键优化：减少上下文深度，仅保留最近 15 条，防止 AI 纠缠历史话题
  const recentMessages = getRecentMessages(msg.chat_jid, 15);
  const memories = getMemories(msg.chat_jid);

  const memoryContext = memories.length > 0 
    ? `--- LONG-TERM MEMORY (Facts/Materials) ---\n${memories.map(m => `- [${m.category}] ${m.fact}`).join('\n')}\n`
    : '';

  // --- 预处理多模态上下文 ---
  let hasUserAudio = false;
  const activeMediaFiles: string[] = []; // 存储将要发给 Gemini 的文件路径

  const enhancedHistory = await Promise.all(recentMessages.map(async (m) => {
    const isBot = m.from_me || m.content.startsWith(`${ASSISTANT_NAME}:`);
    const sender = isBot ? 'ASSISTANT' : `USER(${m.sender_name})`;
    let cleanContent = isBot
      ? m.content.replace(`${ASSISTANT_NAME}:`, '').trim()
      : m.content;

    // 检查是否有对应的多模态文件并进行分析
    const mediaDir = path.join(DATA_DIR, 'media');
    const voicePath = path.join(mediaDir, `voice_${m.id}.ogg`);
    const imagePath = path.join(mediaDir, `image_${m.id}.jpg`);
    const analysisCachePath = path.join(mediaDir, `analysis_${m.id}.json`);
    
    // 语音处理
    if (fs.existsSync(voicePath)) {
      if (!isBot) {
        hasUserAudio = true;
        activeMediaFiles.push(voicePath);
      }
      
      let analysis;
      if (fs.existsSync(analysisCachePath)) {
        // 读取缓存，避免重复分析
        analysis = loadJson<any>(analysisCachePath, null);
      } else {
        // 仅对最近 10 分钟内的消息进行实时分析，避免重启后对历史记录进行风暴式分析
        const msgTime = new Date(m.timestamp).getTime();
        const now = Date.now();
        if (now - msgTime < 10 * 60 * 1000) {
          analysis = await analyzeMedia(voicePath);
          if (analysis) saveJson(analysisCachePath, analysis);
        }
      }

      if (analysis) {
        cleanContent += `\n[系统多模态分析: ${analysis.description}]`;
      }
    }

    // 图片处理
    if (fs.existsSync(imagePath)) {
      if (!isBot) activeMediaFiles.push(imagePath);

      let analysis;
      if (fs.existsSync(analysisCachePath)) {
        analysis = loadJson<any>(analysisCachePath, null);
      } else {
        // 仅对最近 10 分钟内的消息进行实时分析
        const msgTime = new Date(m.timestamp).getTime();
        const now = Date.now();
        if (now - msgTime < 10 * 60 * 1000) {
          analysis = await analyzeMedia(imagePath);
          if (analysis) saveJson(analysisCachePath, analysis);
        }
      }

      if (analysis) {
        cleanContent += `\n[系统视觉扫描: ${analysis.description}]`;
      }
    }

    return `[${m.timestamp}] ${sender}: ${cleanContent}`;
  }));

  // 限制媒体文件数量，避免 API 负载过重（仅取最近的 3 个）
  const finalMediaFiles = activeMediaFiles.slice(-3);

  const historyContext = enhancedHistory.join('\n');

  const prompt = `${memoryContext}\n--- CONVERSATION HISTORY (Last 15 messages) ---\n${historyContext}\n--- END HISTORY ---\n\n请根据以上长期记忆和对话历史，回答用户当前的问题。如果历史记录中包含图片或音频路径，系统已通过多模态接口将其原生加载。请务必仔细分析这些视觉/听觉内容，并在回复中具体描述你所看到的内容或听到的指令。如果用户提到了新的材料或需要记住的事实，请在回复中体现。`;

  if (recentMessages.length === 0) return;

  logger.info(
    { 
      group: group.name, 
      user: msg.sender_name, 
      mediaCount: finalMediaFiles.length
    },
    'Processing message with native multimodal support',
  );

  // --- [UX 升级] 表情回应机制：处理中 ---
  await sendReaction(msg.chat_jid, msgKey, '⏳');
  
  // 构造引用对象 (用于后续所有回复)
  const quotedMsg = {
    key: msgKey,
    message: { conversation: msg.content } // 这里的构造有助于界面显示被引用的文字
  };

  // 开启打字状态心跳
  const typingInterval = setInterval(() => setTyping(msg.chat_jid, true), 5000);
  await setTyping(msg.chat_jid, true);

  const response = await runAgent(group, prompt, msg.chat_jid, finalMediaFiles, quotedMsg);
  
  clearInterval(typingInterval);
  await setTyping(msg.chat_jid, false);

  if (response) {
    lastAgentTimestamp[msg.chat_jid] = msg.timestamp;
    
    // --- [UX 升级] 任务完成反馈 ---
    if (response.includes('🛑')) {
      await sendReaction(msg.chat_jid, msgKey, '🛑');
    } else {
      await sendReaction(msg.chat_jid, msgKey, '✅');
    }

    // 统一使用引用的方式回复，并移除硬编码的“处理完毕”后缀，由 AI 自然结束
    if (hasUserAudio && response.length < 500) {
      const ttsPath = await generateTts(response);
      if (ttsPath) {
        await sendMessage(msg.chat_jid, response, { filePath: ttsPath, ptt: true, quoted: quotedMsg });
      } else {
        await sendMessage(msg.chat_jid, `${ASSISTANT_NAME}: ${response}`, { quoted: quotedMsg });
      }
    } else {
      await sendMessage(msg.chat_jid, `${ASSISTANT_NAME}: ${response}`, { quoted: quotedMsg });
    }

    // --- 异步记忆提炼 (不阻塞回复) ---
    (async () => {
      try {
        const memoryPrompt = `以下是最近的一段对话和已有的长期记忆。请判断本次对话是否产生了值得记录的新"材料"、"事实"或"偏好"。
        如果有，请简洁地列出这些事实（每条一行）。如果没有，请回复"NONE"。
        
        对话内容：
        ${historyContext}
        
        现有记忆：
        ${memories.map(m => m.fact).join('\n')}
        
        仅输出新事实或"NONE"。`;
        
        const result = await runLocalGemini(memoryPrompt, 'MemoryEngine');
        if (result.success && result.response && result.response.trim() !== 'NONE') {
          const facts = result.response.split('\n').filter(f => f.trim().length > 5);
          for (const fact of facts) {
            storeMemory(msg.chat_jid, fact.trim(), 'extracted');
            logger.info({ chat_jid: msg.chat_jid, fact }, 'New memory extracted and stored');
          }
        }
      } catch (err) {
        logger.error({ err }, 'Memory extraction failed');
      }
    })();
  }
}

async function runAgent(
  group: RegisteredGroup,
  initialPrompt: string,
  chatJid: string,
  mediaFiles: string[] = [],
  quotedMsg?: any,
): Promise<string | null> {
  const { executeTools } = await import('./tool-executor.js');
  let currentPrompt = initialPrompt;
  let finalResponse = '';
  let iterations = 0;
  const MAX_ITERATIONS = 30; // 增加上限以应对复杂任务
  const taskStartTime = Date.now(); // 记录任务开始时间

  while (iterations < MAX_ITERATIONS) {
    // 检查是否有在此任务开始之后发出的中断指令
    if (globalInterruptTimestamp > taskStartTime) {
      logger.warn({ chatJid, iterations }, 'Agent execution aborted due to global interrupt');
      return '🛑 任务已被手动终止。';
    }

    iterations++;
    try {
      const result = await runLocalGemini(currentPrompt, group.name, mediaFiles);

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

      // --- 关键增强：处理中间指令 (特别是 SEND_FILE, TTS_SEND, SHOW_MENU) ---
      let menuShown = false;
      for (const cmd of commands) {
        if (cmd.type === 'send_file' && cmd.path) {
          await sendMessage(chatJid, '📦 正在为您回传文件...', { filePath: cmd.path, quoted: quotedMsg });
        } else if (cmd.type === 'tts_send' && cmd.text) {
          const ttsPath = await generateTts(cmd.text);
          if (ttsPath) {
            await sendMessage(chatJid, '', { filePath: ttsPath, ptt: true, quoted: quotedMsg });
          }
        } else if (cmd.type === 'show_menu' && cmd.text && cmd.options) {
          await sendMessage(chatJid, cmd.text, { buttons: cmd.options, quoted: quotedMsg });
          menuShown = true;
        }
      }

      if (results.length === 0 || menuShown) {
        // 没有指令了，或者已经展示了菜单（交回控制权），直接结束
        if (menuShown) logger.info({ iterations }, 'Menu shown, stopping agent loop');
        finalResponse = menuShown ? '' : responseText; // 菜单本身就是回复，不需要额外文本
        break;
      }

      // 2. 极致视觉优化：动态进度条与指令截断
      const filledChar = '⬤'; 
      const emptyChar = '◯';
      const barLength = 10;
      
      // 动态进度计算：根据步数阶梯式增长，给用户稳定的预期
      let displayPercent = 0;
      if (iterations <= 3) displayPercent = iterations * 15; // 15%, 30%, 45%
      else if (iterations <= 8) displayPercent = 45 + (iterations - 3) * 7; // 52% - 80%
      else displayPercent = Math.min(80 + (iterations - 8) * 2, 98); // 82% -> 98%

      const progressBlocks = Math.min(Math.floor((displayPercent / 100) * barLength), barLength);
      const progressBar = filledChar.repeat(progressBlocks) + emptyChar.repeat(barLength - progressBlocks);
      
      const statusUpdate = commands.map((cmd: any) => {
        let label = '';
        let detail = '';
        if (cmd.type === 'shell') { label = '🐚 执行'; detail = cmd.command; }
        else if (cmd.type === 'write') { label = '📝 写入'; detail = cmd.path; }
        else if (cmd.type === 'send_file') { label = '📦 回传'; detail = cmd.path; }
        else if (cmd.type === 'search_knowledge') { label = '🔍 检索'; detail = cmd.query; }
        else if (cmd.type === 'list_knowledge') { label = '📚 查阅'; detail = '知识库目录'; }
        else { label = '🛠️ 工具'; detail = cmd.type; }

        // 关键点：指令截断，防止刷屏
        const shortDetail = detail.length > 30 ? detail.slice(0, 27) + '...' : detail;
        return `> ${label}: \`${shortDetail}\``;
      }).slice(-1).join('\n'); // 仅显示当前最新的动作

      await sendMessage(
        chatJid,
        `🐾 *NanoClaw 任务执行中...*\n\n` +
        `进度: ${progressBar}  ${displayPercent}%\n` +
        `步骤: ${iterations} (执行上限已提升)\n` +
        `──────────────────\n` +
        `${statusUpdate}\n` +
        `──────────────────\n` +
        `_正在思考下一步动作..._`,
        { quoted: quotedMsg }
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

/**
 * 发送消息表情回应 (Reaction)
 */
async function sendReaction(jid: string, messageKey: any, emoji: string): Promise<void> {
  if (!sock) return;
  try {
    await sock.sendMessage(jid, {
      react: {
        text: emoji,
        key: messageKey
      }
    });
  } catch (err) {
    logger.debug({ emoji, err }, 'Failed to send reaction');
  }
}

async function sendMessage(jid: string, text: string, options: { filePath?: string, ptt?: boolean, buttons?: string[], quoted?: any } = {}): Promise<void> {
  if (!sock) {
    logger.warn({ jid }, 'Cannot send message: WhatsApp socket not connected');
    return;
  }
  try {
    const sendOptions = options.quoted ? { quoted: options.quoted } : {};

    if (options.filePath && fs.existsSync(options.filePath)) {
      // 多媒体发送逻辑
      const ext = path.extname(options.filePath).toLowerCase();
      const fileName = path.basename(options.filePath);

      if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
        await sock.sendMessage(jid, { image: { url: options.filePath }, caption: text }, sendOptions);
      } else if (options.ptt || ext === '.ogg' || ext === '.mp3') {
        await sock.sendMessage(jid, { audio: { url: options.filePath }, ptt: true }, sendOptions);
        if (text && !text.includes(ASSISTANT_NAME)) {
          await sock.sendMessage(jid, { text }, sendOptions);
        }
      } else {
        await sock.sendMessage(jid, { document: { url: options.filePath }, fileName, caption: text, mimetype: 'application/octet-stream' }, sendOptions);
      }
      logger.info({ jid, filePath: options.filePath }, 'Media message sent');
    } 
    else if (options.buttons && options.buttons.length > 0) {
      const buttonText = options.buttons.map((b, i) => `[${i + 1}] ${b}`).join('\n');
      const footer = '\n\n提示：直接回复编号或点击按钮（如适用）';
      await sock.sendMessage(jid, { text: `${text}\n\n${buttonText}${footer}` }, sendOptions);
      logger.info({ jid, buttonsCount: options.buttons.length }, 'Button message sent');
    }
    else {
      await sock.sendMessage(jid, { text }, sendOptions);
      logger.info({ jid, length: text.length }, 'Text message sent');
    }
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
                    { filePath: data.filePath }
                  );
                  logger.info(
                    { chatJid: data.chatJid, sourceGroup, filePath: data.filePath },
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
        'WhatsApp authentication required. Please scan the QR code in the terminal or use the setup tool.';
      logger.error(msg);
      exec(
        `osascript -e 'display notification "${msg}" with title "NanoClaw 🐾" sound name "Basso"'`,
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
        logger.info('Logged out. Please re-authenticate to continue using NanoClaw.');
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

  currentSock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message) continue;
      const rawJid = msg.key.remoteJid;
      if (!rawJid || rawJid === 'status@broadcast') continue;

      // Translate LID JID to phone JID if applicable
      const chatJid = translateJid(rawJid);

      // --- 紧急制动逻辑 (STOP Command) ---
      const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
      const cleanCmd = messageContent.trim().toLowerCase();
      if (cleanCmd === 'stop' || cleanCmd === '/stop' || cleanCmd === '🛑') {
        logger.warn({ chatJid }, '🛑 EMERGENCY STOP RECEIVED - Clearing Queue');
        globalInterruptTimestamp = Date.now();
        
        // 立即将处理指针跳转到当前消息的时间，从而跳过所有积压的消息
        const msgTs = new Date(Number(msg.messageTimestamp) * 1000).toISOString();
        if (msgTs > lastTimestamp) {
          lastTimestamp = msgTs;
          saveState(); // 立即持久化状态
        }

        await sendMessage(chatJid, '🛑 **紧急制动已触发**：\n1. 历史待处理任务已清空。\n2. 正在执行的任务已被标记为中断。\n\n系统已就绪，等待您的新指令。');
        continue; // 终止当前消息的后续存储和处理
      }

      const timestamp = new Date(
        Number(msg.messageTimestamp) * 1000,
      ).toISOString();

      // Always store chat metadata for group discovery
      storeChatMetadata(chatJid, timestamp);

      // 增强型：多模态支持 - 自动下载多媒体消息 (语音和图片)
      if (registeredGroups[chatJid] && (msg.message?.audioMessage || msg.message?.imageMessage)) {
        try {
          const isAudio = !!msg.message?.audioMessage;
          const mediaType = isAudio ? 'AUDIO' : 'IMAGE';
          logger.info({ chatJid, mediaType }, `Downloading ${mediaType} attachment...`);

          const buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            { 
              logger: logger as any,
              reuploadRequest: currentSock.updateMediaMessage 
            }
          );
          
          const mediaDir = path.join(DATA_DIR, 'media');
          if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
          
          const ext = isAudio ? 'ogg' : 'jpg';
          const fileName = `${isAudio ? 'voice' : 'image'}_${msg.key.id}.${ext}`;
          const filePath = path.join(mediaDir, fileName);
          fs.writeFileSync(filePath, buffer as Buffer);
          
          logger.info({ filePath, size: (buffer as Buffer).length }, `${mediaType} download complete`);
        } catch (err) {
          logger.error({ err, msgId: msg.key.id }, 'Failed to download media attachment');
        }
      }

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
