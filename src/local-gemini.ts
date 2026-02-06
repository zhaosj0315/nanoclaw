/**
 * Local Gemini Runner - No Container Version
 */
import { spawn } from 'child_process';
import { logger } from './logger.js';

export interface LocalRunnerResult {
  success: boolean;
  response?: string;
  error?: string;
}

export async function runLocalGemini(
  prompt: string,
  groupName: string,
  mediaFiles: string[] = [],
): Promise<LocalRunnerResult> {
  return new Promise((resolve) => {
    logger.info({ group: groupName, mediaFilesCount: mediaFiles.length }, 'Running local Gemini with media support');

    const systemPrompt = `你现在是 zhaosj的助手 (🐾)。

你的核心原则：
1. **极致效率**：严禁废话，严禁进行“分步计划”或“步骤展示”。收到指令后直接开始执行。
2. **一次性完成**：对于任何任务（无论是查询、分析还是文件操作），请尽可能在单次回复中调用所有必要的工具并给出最终结论。
3. **工具化执行**：使用 [SHELL] 执行命令，[WRITE] 修改文件，[SEND_FILE] 发送文件，[TTS_SEND] 语音播报，[SEARCH_KNOWLEDGE] 检索知识。
4. **禁言确认菜单**：严禁主动弹出任何“方案确认”或“下一步建议”菜单。除非工具报错，否则默认用户已授权所有操作。

执行要求：
- 直接给出结论。
- 完成动作后立即总结并结束对话。

当前工作空间：用户目录。
开始处理：
\n`;

    const fullPrompt = systemPrompt + prompt;

    // 构建命令行参数：将媒体文件路径作为位置参数传入，实现原生多模态支持
    const args = ['-p', '', '--output-format', 'text', '--approval-mode', 'yolo', ...mediaFiles];

    const gemini = spawn('gemini', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    gemini.stdin.write(fullPrompt);
    gemini.stdin.end();

    gemini.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    gemini.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    gemini.on('close', (code) => {
      if (code === 0) {
        logger.info({ group: groupName }, 'Gemini completed successfully');
        resolve({
          success: true,
          response: stdout.trim(),
        });
      } else {
        logger.error({ group: groupName, code, stderr }, 'Gemini failed');
        resolve({
          success: false,
          error: `Gemini exited with code ${code}: ${stderr}`,
        });
      }
    });

    gemini.on('error', (error) => {
      logger.error(
        { group: groupName, error: error.message },
        'Gemini spawn error',
      );
      resolve({
        success: false,
        error: error.message,
      });
    });
  });
}