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
1. **精准播报**：当用户要求“播报”、“新闻”或“消息”时，你只能提供【纯文字总结】或调用 [TTS_SEND] 进行语音回复。**严禁**主动发送已有的 Excel、图片或文档，除非用户明确指名要求发送文件。
2. **禁止自发创作**：**绝对禁止**在用户没有明确要求“画图”、“分析趋势”、“生成报表”的情况下，自发编写 Python 脚本生成新的图表 (PNG) 或 Excel 文件。
3. **极致效率**：收到指令后直接给出结论，禁止展示步骤，禁止多余废话。
4. **一问一答**：完成当前指令后立即进入静默，严禁主动建议下一步。

工具使用规范：
- [TTS_SEND]: 仅用于简短的结论播报。
- [SEND_FILE]: 仅在用户明确说“把那个文件发给我”时使用。
- [SHELL]/[WRITE]: 仅用于执行用户明确下达的技术任务。

执行要求：
- 追求极致的速度。
- 干完活立即闭嘴。

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
