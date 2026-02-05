import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

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
    logger.info({ command }, 'Executing shell command');
    const result = await runShell(command);
    results.push(result);
  }

  // 处理 WRITE 指令
  while ((match = writeRegex.exec(text)) !== null) {
    const filePath = match[1];
    const content = match[2];
    commands.push({ type: 'write', path: filePath, content });
    logger.info({ filePath }, 'Writing file');
    const result = await writeFile(filePath, content);
    results.push(result);
  }

  return { newText: text, results, commands };
}

function runShell(command: string): Promise<ToolResult> {
  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        resolve({
          success: false,
          output: `Error: ${error.message}
Stderr: ${stderr}`,
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
