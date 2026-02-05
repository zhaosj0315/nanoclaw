import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';
import { loadMountAllowlist } from './mount-security.js';

export interface ToolResult {
  output: string;
  success: boolean;
}

export interface ParsedCommand {
  type: 'shell' | 'write';
  command?: string;
  path?: string;
  content?: string;
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

  return { newText: text, results, commands };
}

function runShell(command: string): Promise<ToolResult> {
  return new Promise((resolve) => {
    // 限制在项目根目录下执行
    exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
      if (error) {
        resolve({
          success: false,
          output: `Error: ${error.message}\nStderr: ${stderr}`,
        });
      } else {
        resolve({
          success: true,
          output: stdout || '(Success, no output)',
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
    // 确保目录存在
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    return {
      success: true,
      output: `Successfully wrote to ${filePath}`,
    };
  } catch (err: any) {
    return {
      success: false,
      output: `Failed to write file: ${err.message}`,
    };
  }
}
