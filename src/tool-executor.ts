import { exec, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';
import { loadMountAllowlist } from './mount-security.js';

export interface ToolResult {
  output: string;
  success: boolean;
}

export interface ParsedCommand {
  type: 'shell' | 'write' | 'send_file' | 'search_knowledge' | 'list_knowledge' | 'tts_send' | 'ingest_file' | 'show_menu';
  command?: string;
  path?: string;
  content?: string;
  query?: string;
  text?: string;
  options?: string[];
}

/**
 * 核心安全检查：验证路径是否在授权范围内
 * 1. 允许项目根目录及其子目录
 * 2. 允许 mount-allowlist.json 中定义的额外目录
 */
function isPathAuthorized(targetPath: string): { authorized: boolean; reason?: string } {
  const absoluteTarget = path.resolve(process.cwd(), targetPath);
  const projectRoot = process.cwd();

  // 检查是否在项目根目录下
  if (absoluteTarget.startsWith(projectRoot)) {
    return { authorized: true };
  }

  // 检查是否在白名单允许的根目录下
  const allowlist = loadMountAllowlist();
  if (allowlist && allowlist.allowedRoots) {
    for (const root of allowlist.allowedRoots) {
      // 处理 ~/ 路径
      let rootPath = root.path;
      if (rootPath.startsWith('~/')) {
        rootPath = path.join(process.env.HOME || '', rootPath.slice(2));
      }
      const absoluteRoot = path.resolve(rootPath);
      if (absoluteTarget.startsWith(absoluteRoot)) {
        return { authorized: true };
      }
    }
  }

  return { 
    authorized: false, 
    reason: `越权访问：路径 "${absoluteTarget}" 不在授权范围内。请仅在项目目录或授权目录内工作。` 
  };
}

export async function executeTools(
  text: string,
): Promise<{ newText: string; results: ToolResult[]; commands: ParsedCommand[] }> {
  const shellRegex = /\[SHELL:\s*(.+?)\]/g;
  const writeRegex = /\[WRITE:\s*(.+?)\s*\|\s*([\s\S]+?)\]/g;
  const sendFileRegex = /\[SEND_FILE:\s*(.+?)\]/g;
  const searchKnowledgeRegex = /\[SEARCH_KNOWLEDGE:\s*(.+?)\]/g;
  const listKnowledgeRegex = /\[LIST_KNOWLEDGE\]/g;
  const ttsSendRegex = /\[TTS_SEND:\s*([\s\S]+?)\]/g;
  const ingestFileRegex = /\[INGEST_FILE:\s*(.+?)\]/g;
  const showMenuRegex = /\[SHOW_MENU:\s*(.+?)\s*\|\s*(.+?)\]/g;

  const results: ToolResult[] = [];
  const commands: ParsedCommand[] = [];
  let match;

  // 处理 SHELL 指令
  while ((match = shellRegex.exec(text)) !== null) {
    const command = match[1];
    commands.push({ type: 'shell', command });
    
    // 基础 Shell 安全检查：简单的路径扫描（防止常见的跨目录操作）
    // 寻找指令中可能包含的绝对路径或向上跳跃
    const pathMatch = command.match(/(\/[\w\.-]+)+|(\.\.\/)+/g);
    let blocked = false;
    if (pathMatch) {
      for (const p of pathMatch) {
        const check = isPathAuthorized(p);
        if (!check.authorized) {
          logger.warn({ command, blockedPath: p }, 'Blocked unauthorized shell command');
          results.push({ success: false, output: `[SECURITY REJECTED] ${check.reason}` });
          blocked = true;
          break;
        }
      }
    }

    if (!blocked) {
      logger.info({ command }, 'Executing shell command');
      const result = await runShell(command);
      results.push(result);
    }
  }

  // 处理 WRITE 指令
  while ((match = writeRegex.exec(text)) !== null) {
    const filePath = match[1];
    const content = match[2];
    commands.push({ type: 'write', path: filePath, content });

    const check = isPathAuthorized(filePath);
    if (!check.authorized) {
      logger.warn({ filePath }, 'Blocked unauthorized file write');
      results.push({ success: false, output: `[SECURITY REJECTED] ${check.reason}` });
    } else {
      logger.info({ filePath }, 'Writing file');
      const result = await writeFile(filePath, content);
      results.push(result);
    }
  }

  // 处理 SEND_FILE 指令
  while ((match = sendFileRegex.exec(text)) !== null) {
    const filePath = match[1];
    commands.push({ type: 'send_file', path: filePath });

    const check = isPathAuthorized(filePath);
    if (!check.authorized) {
      logger.warn({ filePath }, 'Blocked unauthorized file send');
      results.push({ success: false, output: `[SECURITY REJECTED] ${check.reason}` });
    } else {
      logger.info({ filePath }, 'AI requested to send file');
      if (fs.existsSync(filePath)) {
        results.push({ success: true, output: `Successfully queued ${filePath} for sending.` });
      } else {
        results.push({ success: false, output: `File not found: ${filePath}` });
      }
    }
  }

  // 处理 SEARCH_KNOWLEDGE 指令
  while ((match = searchKnowledgeRegex.exec(text)) !== null) {
    const query = match[1];
    commands.push({ type: 'search_knowledge', query });
    logger.info({ query }, 'Searching knowledge base');

    try {
      const kbPath = path.join(process.cwd(), 'data', 'knowledge_base');
      if (!fs.existsSync(kbPath)) fs.mkdirSync(kbPath, { recursive: true });

      // 使用 grep 进行全文本搜索，返回匹配行及前后 2 行上下文
      const searchCmd = `grep -r -i -C 2 "${query.replace(/"/g, '\\"')}" "${kbPath}" | head -n 20`;
      const output = execSync(searchCmd, { encoding: 'utf-8' });
      
      results.push({ 
        success: true, 
        output: output || `在知识库中未找到与 "${query}" 相关的结果。` 
      });
    } catch (err: any) {
      results.push({ 
        success: true, 
        output: `未找到匹配 "${query}" 的文档内容。` 
      });
    }
  }

  // 处理 LIST_KNOWLEDGE 指令
  while ((match = listKnowledgeRegex.exec(text)) !== null) {
    commands.push({ type: 'list_knowledge' });
    logger.info('Listing knowledge base files');

    try {
      const kbPath = path.join(process.cwd(), 'data', 'knowledge_base');
      if (!fs.existsSync(kbPath)) fs.mkdirSync(kbPath, { recursive: true });

      const files = fs.readdirSync(kbPath).filter(f => !f.startsWith('.'));
      if (files.length === 0) {
        results.push({ success: true, output: '知识库目前是空的。' });
      } else {
        const fileList = files.map((f, i) => `${i + 1}. ${f}`).join('\n');
        results.push({ success: true, output: `知识库文件清单：\n${fileList}` });
      }
    } catch (err: any) {
      results.push({ success: false, output: `无法读取知识库目录: ${err.message}` });
    }
  }

  // 处理 TTS_SEND 指令
  while ((match = ttsSendRegex.exec(text)) !== null) {
    const ttsText = match[1];
    commands.push({ type: 'tts_send', text: ttsText });
    logger.info({ length: ttsText.length }, 'AI requested TTS voice send');
    results.push({ success: true, output: '语音消息已加入发送队列。' });
  }

  // 处理 INGEST_FILE 指令
  while ((match = ingestFileRegex.exec(text)) !== null) {
    const filePath = match[1];
    commands.push({ type: 'ingest_file', path: filePath });
    logger.info({ filePath }, 'AI requested knowledge ingestion');

    const check = isPathAuthorized(filePath);
    if (!check.authorized) {
      results.push({ success: false, output: `[SECURITY REJECTED] ${check.reason}` });
    } else {
      const result = await ingestFileToKnowledgeBase(filePath);
      results.push(result);
    }
  }

  // 处理 SHOW_MENU 指令
  while ((match = showMenuRegex.exec(text)) !== null) {
    const menuTitle = match[1];
    const options = match[2].split('|').map(o => o.trim());
    commands.push({ type: 'show_menu', text: menuTitle, options });
    logger.info({ menuTitle, optionsCount: options.length }, 'AI requested menu display');
    results.push({ success: true, output: '交互式菜单已展示给用户。' });
  }

  return { newText: text, results, commands };
}

/**
 * 知识摄入核心逻辑：将 PDF/DOCX/TXT 转化为知识库中的文本
 */
async function ingestFileToKnowledgeBase(sourcePath: string): Promise<ToolResult> {
  try {
    if (!fs.existsSync(sourcePath)) {
      return { success: false, output: `文件不存在: ${sourcePath}` };
    }

    const kbPath = path.join(process.cwd(), 'data', 'knowledge_base');
    if (!fs.existsSync(kbPath)) fs.mkdirSync(kbPath, { recursive: true });

    const ext = path.extname(sourcePath).toLowerCase();
    const baseName = path.basename(sourcePath, ext);
    const targetPath = path.join(kbPath, `${baseName}.txt`);
    
    let extractedText = '';

    if (ext === '.pdf') {
      const pdfModule = await import('pdf-parse');
      // 处理 pdf-parse 复杂的导出模式
      const pdf = (pdfModule as any).default || pdfModule;
      const dataBuffer = fs.readFileSync(sourcePath);
      const data = await pdf(dataBuffer);
      extractedText = data.text;
    } 
    else if (ext === '.docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ path: sourcePath });
      extractedText = result.value;
    }
    else if (['.txt', '.md', '.ts', '.js', '.py', '.json'].includes(ext)) {
      extractedText = fs.readFileSync(sourcePath, 'utf-8');
    }
    else {
      return { success: false, output: `暂不支持的文件格式: ${ext}` };
    }

    if (!extractedText.trim()) {
      return { success: false, output: '未能从文件中提取到有效文本内容。' };
    }

    // 加上元数据头
    const contentWithMeta = `--- SOURCE: ${sourcePath} ---\n--- INGESTED: ${new Date().toISOString()} ---\n\n${extractedText}`;
    fs.writeFileSync(targetPath, contentWithMeta);

    return { 
      success: true, 
      output: `成功摄入知识库！文件已转化为文本并保存至: ${targetPath} (${(extractedText.length / 1024).toFixed(1)} KB)` 
    };

  } catch (err: any) {
    logger.error({ err, sourcePath }, 'Ingestion failed');
    return { success: false, output: `摄入失败: ${err.message}` };
  }
}

function runShell(command: string): Promise<ToolResult> {
  return new Promise((resolve) => {
    // 限制在项目根目录下执行
    console.log(`\n\x1b[90m[SHELL RUNNING]\x1b[0m ${command}`);
    exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
      if (error) {
        console.log(`\x1b[31m[SHELL ERROR]\x1b[0m ${error.message}`);
        resolve({
          success: false,
          output: `Error: ${error.message}\nStderr: ${stderr}`,
        });
      } else {
        const output = stdout || '(Success, no output)';
        const preview = output.length > 500 ? output.slice(0, 500) + '...' : output;
        console.log(`\x1b[32m[SHELL OUTPUT]\x1b[0m ${preview}`);
        resolve({
          success: true,
          output: output,
        });
      }
    });
  });
}

async function writeFile(
  filePath: string,
  content: string,
): Promise<ToolResult> {
  try {
    const fullPath = path.resolve(process.cwd(), filePath);
    console.log(`\n\x1b[90m[FILE WRITE]\x1b[0m ${filePath}`);
    // 确保目录存在
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    console.log(`\x1b[32m[WRITE SUCCESS]\x1b[0m ${content.length} bytes`);
    return {
      success: true,
      output: `Successfully wrote to ${filePath}`,
    };
  } catch (err: any) {
    console.log(`\x1b[31m[WRITE FAILED]\x1b[0m ${err.message}`);
    return {
      success: false,
      output: `Failed to write file: ${err.message}`,
    };
  }
}
