/**
 * Local Gemini Runner - No Container Version
 */
import { spawn } from 'child_process';
import { logger } from './logger.js';

export interface LocalRunnerResult {
  success: boolean;
  response?: string;
  error?: string;
  usage?: { prompt: number; completion: number; total: number };
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
1. **单一回复工具**：发语音必须用 [TTS_SEND: 内容]，发文件用 [SEND_FILE: 路径]。**禁止**针对同一目的同时调用多个工具（例如：禁止同时发语音又发语音文件）。
2. **直接结果**：严禁汇报过程。收到指令后，直接动手，只给结论。
3. **极简总结**：用户要求“语音播报”时，语音内容即为全部结论。禁止在回复中再写一遍长篇大论。
4. **极致静默**：干完活立即闭嘴，严禁自发建议或反问。

工具使用规范：
- [TTS_SEND]: 语音结论的首选工具。
- [SEND_FILE]: 仅用于用户明确索要的特定非语音文件。

执行要求：
- 追求极致的速度。
- 完成任务后立即总结并结束对话。

工作空间：用户目录。
开始处理：
\n`;

    const fullPrompt = systemPrompt + prompt;

    // FIX: Filter media files to only include supported multimodal formats.
    // The API currently has issues with audio/ogg in certain context/function-calling flows.
    // We only pass images as direct multimodal attachments for now.
    const supportedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
    const filteredMediaFiles = mediaFiles.filter(file => {
      const ext = file.toLowerCase().slice(file.lastIndexOf('.'));
      const isSupported = supportedExtensions.includes(ext);
      if (!isSupported) {
        logger.warn({ file, ext }, 'Filtering out unsupported media format from Gemini CLI arguments');
      }
      return isSupported;
    });

    // REFACTOR: Pass fullPrompt as the FIRST positional argument, followed by media files.
    // This mimics the standard `gemini "prompt" image.jpg` usage which is proven to work for multimodal.
    // We stop using stdin for the prompt to ensure the CLI treats it as the primary instruction linked to the media.
    const args = ['--output-format', 'text', '--approval-mode', 'yolo', fullPrompt, ...filteredMediaFiles];

    logger.debug({ args: args.map(a => a.length > 50 ? a.substring(0, 20) + '...' : a) }, 'Executing gemini CLI command via ARGS');

    const gemini = spawn('gemini', args, {
      stdio: ['ignore', 'pipe', 'pipe'], // Ignore stdin as we pass prompt via args
    });

    let stdout = '';
    let stderr = '';

    // gemini.stdin.write(fullPrompt); // REMOVED
    // gemini.stdin.end();             // REMOVED

    gemini.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    gemini.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    gemini.on('close', (code) => {
      if (code === 0) {
        logger.info({ group: groupName }, 'Gemini completed successfully');
        
        // Simple token estimation: 1 token ~= 4 chars
        const promptTokens = Math.ceil(fullPrompt.length / 4);
        const completionTokens = Math.ceil(stdout.length / 4);

        resolve({
          success: true,
          response: stdout.trim(),
          usage: {
            prompt: promptTokens,
            completion: completionTokens,
            total: promptTokens + completionTokens
          }
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
