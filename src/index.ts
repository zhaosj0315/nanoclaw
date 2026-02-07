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
  storeGenericMessage,
  createInteractionTask,
  completeInteractionTask,
  addInteractionResponse,
} from './db.js';
import { startSchedulerLoop } from './task-scheduler.js';
import { NewMessage, RegisteredGroup, Session } from './types.js';
import { loadJson, saveJson } from './utils.js';
import { logger } from './logger.js';
import { LarkConnector } from './lark-connector.js';
import { generateDashboard } from './db-dashboard.js';
import { startDashboardServer } from './server.js';

const GROUP_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PID_FILE = path.join(DATA_DIR, 'nanoclaw.pid');

let sock: WASocket | null = null;
let larkConnector: LarkConnector | null = null;
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

// --- 交互式菜单状态管理 ---
interface MenuState {
  title: string;
  options: string[];
  timestamp: number;
}
let chatMenuState: Record<string, MenuState> = {};

/**
 * Acquire a lock file to prevent multiple instances.
 * 使用原子性操作和多重检查确保系统单实例运行。
 */
function acquireLock(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  
  const tryAcquire = () => {
    try {
      // wx 标志确保原子性：如果文件已存在则抛出异常
      fs.writeFileSync(PID_FILE, process.pid.toString(), { flag: 'wx' });
      return true;
    } catch (err: any) {
      if (err.code === 'EEXIST') {
        const existingPid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'), 10);
        try {
          process.kill(existingPid, 0); // 检查进程是否真的还活着
          logger.error({ existingPid }, 'FATAL: Another instance of NanoClaw is already running.');
          console.error(`\n[CRITICAL LOCK ERROR] Instance detected (PID ${existingPid}).`);
          console.error(`If you are sure it's not running, delete: ${PID_FILE}\n`);
          process.exit(1);
        } catch (e) {
          // 进程已死，但锁文件残留
          logger.warn({ existingPid }, 'Removing stale PID lock file');
          try { fs.unlinkSync(PID_FILE); } catch (u) {}
          return false; // 重试
        }
      }
      throw err;
    }
  };

  // 尝试获取锁，如果是陈旧的锁则自动重试一次
  if (!tryAcquire()) tryAcquire();

  // 注册全局清理钩子
  const cleanup = () => {
    try {
      if (fs.existsSync(PID_FILE)) {
        const current = fs.readFileSync(PID_FILE, 'utf-8');
        if (current === process.pid.toString()) {
          fs.unlinkSync(PID_FILE);
          logger.info('System lock released gracefully');
        }
      }
    } catch (e) {}
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', () => {
    try {
      if (fs.existsSync(PID_FILE) && fs.readFileSync(PID_FILE, 'utf-8') === process.pid.toString()) {
        fs.unlinkSync(PID_FILE);
      }
    } catch (e) {}
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

let systemNodeIp = '127.0.0.1';

async function fetchSystemIp() {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json() as any;
    systemNodeIp = data.ip;
    logger.info({ systemNodeIp }, 'System Node IP identified');
  } catch (err) {
    logger.debug('Failed to fetch public IP, using local fallback');
  }
}

async function processMessage(msg: any): Promise<void> {
  // 核心防御：彻底移除所有不可见字符和非标空格
  const rawJid = msg.chat_jid || '';
  const chatJid = rawJid.replace(/[^\w@.-]/g, '');
  
  logger.info({ id: msg.id, chatJid, content: msg.content }, '--- UNIFIED_PIPELINE_ENTRY ---');

  const group = registeredGroups[chatJid];
  
  if (!group) {
    logger.warn({ chatJid, registeredCount: Object.keys(registeredGroups).length }, 'PIPELINE_BLOCKED: JID_NOT_REGISTERED');
    return;
  }

  const mediaDir = path.join(DATA_DIR, 'media');

  // 关键修复：允许处理 from_me 消息（支持私聊），但严格排除助手发出的内容
  if (msg.from_me && (msg.content.startsWith('🐾') || msg.content.startsWith('📦') || msg.content.startsWith(`${ASSISTANT_NAME}:`))) {
    return;
  }

  const content = (msg.content || '').trim();

  // --- 关键修复：空消息过滤 ---
  let hasAttachments = false;
  if (fs.existsSync(mediaDir)) {
    hasAttachments = fs.readdirSync(mediaDir).some(f => f.includes(`_${msg.id}.`));
  }
  
  if (!content && !hasAttachments) {
    logger.warn({ msgId: msg.id, content: msg.content }, 'PIPELINE_SKIPPED: EMPTY_CONTENT_AND_NO_MEDIA');
    return;
  }

  const isMainGroup = group.folder.toLowerCase() === MAIN_GROUP_FOLDER.toLowerCase();
  const isPrivateChat = chatJid.endsWith('@s.whatsapp.net') || chatJid.startsWith('lark@');

  // Skip trigger requirement if it's the main group, a private chat, or the trigger is present
  const hasTrigger = TRIGGER_PATTERN.test(content);
  if (!isMainGroup && !isPrivateChat && !hasTrigger) {
    logger.debug({ chatJid, isPrivateChat, hasTrigger }, 'PIPELINE_SKIPPED: MISSING_TRIGGER');
    return;
  }

  // --- [UX 升级] 表情回应机制：已阅 ---
  // 修正：数据库字段名为 sender_jid
  const msgKey = {
    remoteJid: chatJid,
    fromMe: msg.from_me === 1 || msg.from_me === true,
    id: msg.id,
    participant: msg.sender_jid || msg.sender
  };

  if (!chatJid.startsWith('lark@')) {
    await sendReaction(chatJid, msgKey, '👀');
  }

  // 关键修复：时效性检查 (增加 30s 宽限期防止重启瞬间丢包)
  const msgTimestamp = new Date(msg.timestamp).getTime();
  const now = Date.now();
  const GRACE_PERIOD = 30 * 1000;
  
  if (now - msgTimestamp > (2 * 60 * 1000) + GRACE_PERIOD) {
    logger.info({ msgId: msg.id, diff: now - msgTimestamp }, 'PIPELINE_SKIPPED: EXPIRED');
    return;
  }

  // --- Log Interaction Start ---
  let logContent = content;
  const currentAttachments: string[] = [];
  
  if (fs.existsSync(mediaDir)) {
    // 动态搜索所有以当前 msg.id 结尾的文件（兼容不同前缀和后缀）
    const files = fs.readdirSync(mediaDir);
    const msgFiles = files.filter(f => f.includes(`_${msg.id}.`));
    
    for (const file of msgFiles) {
      const fullPath = path.join(mediaDir, file);
      const ext = path.extname(file).toLowerCase();
      let typeLabel = 'FILE';
      
      if (['.jpg', '.jpeg', '.png'].includes(ext)) typeLabel = 'IMAGE';
      else if (['.ogg', '.mp3', '.wav'].includes(ext)) typeLabel = 'AUDIO';
      else if (['.mp4', '.mov'].includes(ext)) typeLabel = 'VIDEO';
      else if (['.pdf', '.doc', '.docx', '.txt'].includes(ext)) typeLabel = 'DOC';

      logContent = (logContent || '') + ` [${typeLabel}: ${file}]`;
      currentAttachments.push(fullPath);
    }
  }

  createInteractionTask(msg.id, msg.chat_jid, logContent || '[Media Message]', currentAttachments, { ip: systemNodeIp });

  // 极致优化：彻底移除自动历史，仅发送当前请求，确保模型 100% 聚焦当前任务
  // 如需参考历史，用户会在指令中明确说明。
  const recentMessages = getRecentMessages(msg.chat_jid, 1);
  const memories = getMemories(msg.chat_jid);

  const memoryContext = memories.length > 0 
    ? `--- LONG-TERM MEMORY (Facts/Materials) ---\n${memories.map(m => `- [${m.category}] ${m.fact}`).join('\n')}\n`
    : '';

  // --- 预处理多模态上下文 ---
  let hasUserAudio = false;
  const activeMediaFiles: string[] = []; // 存储将要发给 Gemini 的文件路径

  const enhancedHistory = await Promise.all(recentMessages.map(async (m) => {
    // 判定是否为助手发出的消息：包含爪印或助手名开头
    const isBotResponse = m.from_me && (m.content.startsWith('🐾') || m.content.startsWith(`${ASSISTANT_NAME}:`));
    
    const sender = isBotResponse ? 'ASSISTANT' : `USER(${m.sender_name})`;
    let cleanContent = isBotResponse
      ? m.content.replace(`${ASSISTANT_NAME}:`, '').trim()
      : m.content;

    // 检查是否有对应的多模态文件并进行分析
    const mediaDir = path.join(DATA_DIR, 'media');
    const voicePath = path.join(mediaDir, `voice_${m.id}.ogg`);
    const imagePath = path.join(mediaDir, `image_${m.id}.jpg`);
    const analysisCachePath = path.join(mediaDir, `analysis_${m.id}.json`);
    
    // 处理消息关联的所有附件 (历史记录展现)
    if (fs.existsSync(mediaDir)) {
      const msgFiles = fs.readdirSync(mediaDir).filter(f => f.includes(`_${m.id}.`));
      for (const file of msgFiles) {
        const ext = path.extname(file).toLowerCase();
        let label = '附件';
        if (['.jpg', '.jpeg', '.png'].includes(ext)) label = '图片附件';
        else if (['.ogg', '.mp3', '.wav'].includes(ext)) label = '语音附件';
        else if (['.mp4', '.mov'].includes(ext)) label = '视频附件';
        else if (['.pdf', '.doc', '.docx', '.txt'].includes(ext)) label = '文档附件';

        const analysisCachePath = path.join(mediaDir, `analysis_${m.id}.json`);
        let analysis;
        if (fs.existsSync(analysisCachePath)) {
          analysis = loadJson<any>(analysisCachePath, null);
        } else if (m.id === msg.id && (label === '图片附件' || label === '语音附件')) {
          // 仅对当前消息的图文进行实时分析
          analysis = await analyzeMedia(path.join(mediaDir, file));
          if (analysis) saveJson(analysisCachePath, analysis);
        }

        const tag = `\n[${label}: ${file}]`;
        cleanContent += analysis ? `${tag}\n(系统预分析: ${analysis.description})` : tag;
      }
    }

    return `[${m.timestamp}] ${sender}: ${cleanContent}`;
  }));

  // 限制媒体文件数量，避免 API 负载过重（仅取最近的 3 个）
  // 关键修正：为了彻底解决“幻觉”问题，我们不再向 CLI 传递任何历史媒体文件。
  // 只有当前这条消息包含的附件（currentAttachments）才会被物理传给 Gemini。
  // 历史图片仅在 Prompt 文本中保留引用标记。
  const finalMediaFiles = currentAttachments; 

  const historyContext = enhancedHistory.join('\n');

  const prompt = `${memoryContext}\n【当前任务指令】\n${enhancedHistory.join('\n')}\n\n请根据以上指令和长期记忆，回答用户当前的问题。系统已通过多模态接口载入了对应附件，请务必仔细分析视觉/听觉内容并在回复中体现。`;

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
  if (!msg.chat_jid.startsWith('lark@')) {
    await sendReaction(msg.chat_jid, msgKey, '⏳');
  }
  
  // 构造引用对象 (用于后续所有回复)
  const quotedMsg = {
    key: msgKey,
    message: { conversation: msg.content } // 这里的构造有助于界面显示被引用的文字
  };

  // 开启打字状态心跳 (WhatsApp 体验优化)
  // 加快刷新频率至 3秒，确保状态不断连，并增加错误捕获
  let typingInterval: NodeJS.Timeout | null = null;
  
  if (!msg.chat_jid.startsWith('lark@')) {
    await setTyping(msg.chat_jid, true);
    typingInterval = setInterval(async () => {
        try {
            await setTyping(msg.chat_jid, true);
        } catch (e) { /* ignore */ }
    }, 3000);
  }

  const response = await runAgent(group, prompt, msg.chat_jid, finalMediaFiles, quotedMsg, msg.id, currentAttachments);
  
  if (typingInterval) clearInterval(typingInterval);
  if (!msg.chat_jid.startsWith('lark@')) {
    await setTyping(msg.chat_jid, false);
  }

  if (response) {
    lastAgentTimestamp[msg.chat_jid] = msg.timestamp;
    
    // --- [UX 升级] 任务完成反馈 ---
    if (!msg.chat_jid.startsWith('lark@')) {
      if (response.includes('🛑')) {
        await sendReaction(msg.chat_jid, msgKey, '🛑');
      } else {
        await sendReaction(msg.chat_jid, msgKey, '✅');
      }
    }

    // 关键熔断：如果是菜单执行模式，强制拦截所有文本回复
    // AI 在执行完发文件等工具后，往往会忍不住总结汇报。这里直接掐断，实现“干完活就闭嘴”。
    if (msg.isMenuExecution) {
      logger.info('Menu execution mode: Suppressing final text response.');
    } else {
      // 统一使用引用的方式回复
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
    }

    // --- 异步记忆提炼 (不阻塞回复) ---
    (async () => {
      try {
        // 关键优化：只把【用户】说的话发给记忆引擎，彻底杜绝助手“自学废话”
        const userOnlyHistory = recentMessages
          .filter(m => !m.from_me && !m.content.startsWith(`${ASSISTANT_NAME}:`))
          .map(m => `USER: ${m.content}`)
          .join('\n');

        if (!userOnlyHistory) return; // 如果没有用户新信息，直接不跑记忆引擎

        const memoryPrompt = `以下是用户最新提供的指令或信息。请判断其中是否包含值得长期记住的【硬事实】或【明确材料】。
        
        【硬性红线】：
        1. 严禁记录任何关于助手(ASSISTANT)的回复或动作。
        2. 不要记录沟通方式（语音/文字）。
        3. 不要记录日期/时间。
        
        用户内容：
        ${userOnlyHistory}
        
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
  parentId?: string,
  currentAttachments: string[] = [],
): Promise<string | null> {
  const { executeTools } = await import('./tool-executor.js');
  let currentPrompt = initialPrompt;
  let finalResponse = '';
  let iterations = 0;
  const MAX_ITERATIONS = 30; // 增加上限以应对复杂任务
  const taskStartTime = Date.now(); // 记录任务开始时间

  let totalUsage = { prompt: 0, completion: 0, total: 0 };
  let telemetry = { pre: 0, llm: 0, post: 0 };
  
  // 意图预识别
  let intentCategory = 'GENERAL';
  const lowerPrompt = initialPrompt.toLowerCase();
  if (lowerPrompt.includes('画') || lowerPrompt.includes('image')) intentCategory = 'VISUAL_GEN';
  else if (lowerPrompt.includes('分析') || lowerPrompt.includes('分析图')) intentCategory = 'DATA_ANALYSIS';
  else if (lowerPrompt.includes('语音') || lowerPrompt.includes('voice')) intentCategory = 'VOICE_GEN';
  else if (lowerPrompt.includes('总结') || lowerPrompt.includes('read')) intentCategory = 'DOC_SUMMARY';

  while (iterations < MAX_ITERATIONS) {
    // 检查是否有在此任务开始之后发出的中断指令
    if (globalInterruptTimestamp > taskStartTime) {
      logger.warn({ chatJid, iterations }, 'Agent execution aborted due to global interrupt');
      if (parentId) addInteractionResponse(parentId, 'Reaction', '🛑 任务已被手动终止。');
      return '🛑 任务已被手动终止。';
    }

    iterations++;
    try {
      const preStart = Date.now();
      // 构造媒体文件清单，帮助模型建立视觉/听觉数据与文件名的 1:1 映射
      const mediaManifest = mediaFiles.map((f, i) => `[附件 ${i + 1}] 名称: ${path.basename(f)} (绝对路径: ${f})`).join('\n');
      
      // 构造“当前任务焦点”，明确告诉 AI 哪张图是刚才发的，必须优先处理
      const currentFocus = currentAttachments.length > 0
        ? `【当前交互焦点：全新上传文件】\n用户刚刚上传了以下文件，请务必针对这些文件进行分析：\n${currentAttachments.map(f => `- ${path.basename(f)} (${f})`).join('\n')}\n注意：如果这些文件的内容与之前的对话历史（如系统报告）存在冲突，请以这些文件的实时视觉内容为准！`
        : '';

      const multimodalSystemInstruction = mediaFiles.length > 0 
        ? `【全链路附件清单】\n你当前载入了 ${mediaFiles.length} 个媒体文件作为背景上下文：\n${mediaManifest}\n\n${currentFocus}\n\n请结合清单中的文件名与视觉数据，根据下方的用户指令进行处理。`
        : '';

      const finalPrompt = multimodalSystemInstruction 
        ? `${multimodalSystemInstruction}\n\n${currentPrompt}`
        : currentPrompt;
      telemetry.pre += (Date.now() - preStart);

      const llmStart = Date.now();
      const result = await runLocalGemini(finalPrompt, group.name, mediaFiles);
      telemetry.llm += (Date.now() - llmStart);

      if (!result.success || !result.response) {
        logger.error(
          { group: group.name, error: result.error },
          'Local Gemini error',
        );
        return null;
      }

      if (result.usage) {
        totalUsage.prompt += result.usage.prompt;
        totalUsage.completion += result.usage.completion;
        totalUsage.total += result.usage.total;
      }

      const responseText = result.response;
      logger.info({ iterations, responseText }, 'Gemini thinking process');
      
      const postStart = Date.now();
      // 检查是否有工具调用
      const { results, commands } = await executeTools(responseText);

      // --- 关键增强：处理中间指令 (特别是 SEND_FILE, TTS_SEND, SHOW_MENU) ---
      let menuShown = false;
      let actionExecuted = false; // 动作执行标记
      let filesSentCount = 0;
      for (const cmd of commands) {
        if (cmd.type === 'send_file' && cmd.path) {
          if (filesSentCount < 3) {
            await sendMessage(chatJid, '📦 正在为您回传文件...', { filePath: cmd.path, quoted: quotedMsg });
            if (parentId) addInteractionResponse(parentId, 'File', cmd.path);
            filesSentCount++;
            actionExecuted = true;
          } else if (filesSentCount === 3) {
            logger.warn('File limit reached, suppressing further attachments');
            filesSentCount++; 
          }
        } else if (cmd.type === 'tts_send' && cmd.text) {
          const ttsPath = await generateTts(cmd.text);
          if (ttsPath) {
            await sendMessage(chatJid, '', { filePath: ttsPath, ptt: true, quoted: quotedMsg });
            if (parentId) addInteractionResponse(parentId, 'Audio', path.basename(ttsPath));
            actionExecuted = true;
          }
        } else if (cmd.type === 'show_menu' && cmd.text && cmd.options && !menuShown) {
          // 仅展示第一个菜单，防止 AI 话多连弹
          await sendMessage(chatJid, cmd.text, { buttons: cmd.options, quoted: quotedMsg });
          if (parentId) addInteractionResponse(parentId, 'Text', `[MENU] ${cmd.text}`);
          menuShown = true;
          // Store menu state for next user interaction
          chatMenuState[chatJid] = {
            title: cmd.text,
            options: cmd.options,
            timestamp: Date.now()
          };
        }
      }
      telemetry.post += (Date.now() - postStart);

      if (results.length === 0 || menuShown || actionExecuted) {
        // 关键逻辑：如果是菜单展示或已执行了关键动作（发语音/发文件），直接熔断退出，严禁进入下一轮思考
        if (menuShown) {
          logger.info({ iterations }, 'Menu shown, stopping agent loop');
          finalResponse = '__MENU_SHOWN__'; 
        } else if (actionExecuted) {
          logger.info({ iterations }, 'Action executed, enforcing silent completion');
          finalResponse = '__SILENT_FINISH__';
        } else {
          finalResponse = responseText;
          if (parentId) addInteractionResponse(parentId, 'Text', responseText);
        }
        break;
      }

      // 2. 极致极简 UI：移除进度条和步数
      const statusUpdate = commands.map((cmd: any) => {
        let label = '';
        let detail = '';
        if (cmd.type === 'shell') { label = '🐚 执行'; detail = cmd.command; }
        else if (cmd.type === 'write') { label = '📝 写入'; detail = cmd.path; }
        else if (cmd.type === 'send_file') { label = '📦 回传'; detail = cmd.path; }
        else if (cmd.type === 'search_knowledge') { label = '🔍 检索'; detail = cmd.query; }
        else if (cmd.type === 'list_knowledge') { label = '📚 查阅'; detail = '知识库目录'; }
        else { label = '🛠️ 工具'; detail = cmd.type; }

        const shortDetail = detail.length > 30 ? detail.slice(0, 27) + '...' : detail;
        return `> ${label}: \`${shortDetail}\``;
      }).slice(-1).join('\n');

      await sendMessage(
        chatJid,
        `🐾 *${ASSISTANT_NAME} 正在执行指令...*\n` +
        `──────────────────\n` +
        `${statusUpdate}\n` +
        `──────────────────`,
        { quoted: quotedMsg }
      );
      if (parentId) addInteractionResponse(parentId, 'Text', `[Status] ${statusUpdate}`);

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

  if (parentId) completeInteractionTask(parentId, totalUsage, telemetry, intentCategory);
  if (finalResponse === '__MENU_SHOWN__' || finalResponse === '__SILENT_FINISH__') return '';
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
  if (jid.startsWith('lark@')) {
    if (larkConnector) {
      await larkConnector.sendMessage(jid, text, options);
    } else {
      logger.warn({ jid }, 'Lark connector not initialized');
    }
    return;
  }

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

  // --- 极致静默：拦截底层 stdout/stderr 打印 ---
  const filter = (chunk: any) => {
    const str = chunk.toString();
    return str.includes('SessionEntry') || str.includes('Closing session') || str.includes('currentRatchet') || str.includes('_chains');
  };

  const originalWrite = process.stdout.write.bind(process.stdout);
  // @ts-ignore
  process.stdout.write = (chunk, encoding, callback) => {
    if (filter(chunk)) return true;
    return originalWrite(chunk, encoding, callback);
  };

  const originalErrWrite = process.stderr.write.bind(process.stderr);
  // @ts-ignore
  process.stderr.write = (chunk, encoding, callback) => {
    if (filter(chunk)) return true;
    return originalErrWrite(chunk, encoding, callback);
  };

  const currentSock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger.child({ level: 'silent' }) as any),
    },
    printQRInTerminal: false,
    logger: logger.child({ level: 'silent' }) as any,
    browser: ['zhaosj的助手', 'Chrome', '1.0.0'],
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
        `osascript -e 'display notification "${msg}" with title "zhaosj的助手 🐾" sound name "Basso"'`,
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

      // 增强型：多模态支持 - 自动下载多媒体消息 (语音、图片、视频、文档)
      const mediaMsg = msg.message?.audioMessage || msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.documentMessage;
      if (registeredGroups[chatJid] && mediaMsg) {
        try {
          const isAudio = !!msg.message?.audioMessage;
          const isImage = !!msg.message?.imageMessage;
          const isVideo = !!msg.message?.videoMessage;
          const isDoc = !!msg.message?.documentMessage;

          let mediaType: any = isAudio ? 'AUDIO' : (isImage ? 'IMAGE' : (isVideo ? 'VIDEO' : 'DOCUMENT'));
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
          
          let ext = 'bin';
          if (isAudio) ext = 'ogg';
          else if (isImage) ext = 'jpg';
          else if (isVideo) ext = 'mp4';
          else if (isDoc) {
            const fileName = msg.message?.documentMessage?.fileName || '';
            ext = fileName.split('.').pop() || 'pdf';
          }

          const prefix = isAudio ? 'voice' : (isImage ? 'image' : (isVideo ? 'video' : 'doc'));
          const fileName = `${prefix}_${msg.key.id}.${ext}`;
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
  logger.info(`${ASSISTANT_NAME} running (trigger: @${ASSISTANT_NAME})`);

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

      // --- 自动更新看板 ---
      // 每一轮消息处理结束后，静默更新一次 HTML 看板，确保数据准实时
      if (messages.length > 0) {
        generateDashboard().catch(err => logger.error({ err }, 'Auto dashboard update failed'));
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
  
  // 异步获取 IP，不阻塞主流程启动
  fetchSystemIp().catch(() => {});

  // Initialize Lark Connector
  larkConnector = new LarkConnector(async (msg) => {
    // 统一逻辑：连接器只负责“写入数据库”和“下载附件”
    // 处理逻辑由中央 messageLoop 统一调度，实现多端功能完全同步
    const chatJid = msg.chat_jid.trim();
    logger.info({ id: msg.id, chat: chatJid }, 'Lark message received and queuing for processing');
    
    storeGenericMessage({
      id: msg.id,
      chat_jid: chatJid,
      sender_jid: msg.sender,
      sender_name: msg.sender_name,
      content: msg.content,
      timestamp: msg.timestamp,
      from_me: msg.from_me
    });

    // 自动将飞书会话注册到处理清单
    if (!registeredGroups[chatJid]) {
        registeredGroups[chatJid] = {
            name: 'Lark Chat',
            folder: MAIN_GROUP_FOLDER,
            trigger: `@${ASSISTANT_NAME}`,
            added_at: new Date().toISOString()
        };
        // 关键：立即持久化注册状态，确保 Loop 能读取到新的 JID
        saveJson(path.join(DATA_DIR, 'registered_groups.json'), registeredGroups);
    }
  });
  larkConnector.start().catch(err => logger.error({ err }, 'Failed to start Lark connector'));

  await connectWhatsApp();
  startDashboardServer();
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start NanoClaw');
  process.exit(1);
});
