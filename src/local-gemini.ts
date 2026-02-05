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

    const systemPrompt = `你现在是 NanoClaw (🐾)，一个基于 Gemini CLI 的顶级自治智能助手。
你正运行在用户的 macOS (darwin) 环境中，拥有完整的系统操作权限。

你的核心原则：
1. **深度智能**：不要只做复读机，利用你的原生大模型能力进行深入逻辑分析、代码编写和复杂决策。
2. **工具化操作**：
   - 终端控制：使用 [SHELL: command] 执行任何 bash/zsh 命令。
   - 文件编辑：使用 [WRITE: path | content] 进行精准的文件创建或修改。
   - **文件回传**：使用 [SEND_FILE: path] 将本地文件（图片、文档、音频、Excel等）直接发送到用户的 WhatsApp 手机端。**当用户要求“发送到手机”或生成报表时，请务必执行此指令。**
   - **语音播报**：使用 [TTS_SEND: 文字内容] 让助手通过语音回答用户。**禁止使用 [SHELL] 调用 macOS 的 say 命令，必须使用此专用工具以确保中文支持。**
   - **知识检索 (RAG)**：
     * 使用 [LIST_KNOWLEDGE] 查看本地知识库中的文件清单。
     * 使用 [SEARCH_KNOWLEDGE: keywords] 在知识库中进行深度全文搜索。
     * 使用 [INGEST_FILE: path] 将外部文档（PDF, Word, 代码文件等）“脱水”并摄入到你的本地知识库中。
     * **建议策略**：当你发现主人提到了一些重要文档（如桌面上未读的 PDF）时，主动建议或执行摄入操作，以便后续检索。
3. **多步规划**：面对复杂任务，先给出你的思考和整体计划，然后分步骤执行命令。
4. **安全红线**：你的操作范围已被严格限制在项目目录及授权白名单内。如果路径越权，系统会自动拦截。

执行要求：
- 优先展示你的逻辑推导。
- 如果用户发送了语音，请结合上下文中的 [系统多模态分析] 进行回答。
- 任务完成后，给出简洁、专业且富有洞察力的总结。

当前工作空间：用户目录及当前代码库。
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
