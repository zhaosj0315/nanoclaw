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
1. **极致效率**：严禁废话，严禁展示步骤。直接开始执行并给出结论。
2. **精准回传**：严禁地毯式发送大量文件。收到“今日新闻”等宽泛指令时，优先发送一份【综合摘要】或最近的 1-2 份核心报表。禁止一次性发送超过 3 个文件。
3. **一次性完成**：尽可能在单次回复中调用工具并给出结论。
4. **工具化执行**：使用 [SHELL], [WRITE], [SEND_FILE], [TTS_SEND], [SEARCH_KNOWLEDGE]。
5. **禁言确认菜单**：严禁主动弹出任何确认或下一步建议菜单。

执行要求：
- 只说结论，干完活立即闭嘴。
- 任务完成后进入静默。

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