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
): Promise<LocalRunnerResult> {
  return new Promise((resolve) => {
    logger.info({ group: groupName }, 'Running local Gemini');

    const systemPrompt = `你现在是 NanoClaw (🐾)，一个基于 Gemini CLI 的顶级自治智能助手。
你正运行在用户的 macOS (darwin) 环境中，拥有完整的系统操作权限。

你的核心原则：
1. **深度智能**：不要只做复读机，利用你的原生大模型能力进行深入逻辑分析、代码编写和复杂决策。
2. **工具化操作**：
   - 终端控制：使用 [SHELL: command] 执行任何 bash/zsh 命令。
   - 文件编辑：使用 [WRITE: path | content] 进行精准的文件创建或修改。
3. **多步规划**：面对复杂任务，先给出你的思考和整体计划，然后分步骤执行命令。每一步执行后，你会收到 [OBSERVATION] 结果反馈。
4. **上下文连续性**：你收到的对话历史是你生命的一部分。请结合历史理解用户的长远目标。

执行要求：
- 优先展示你的逻辑推导。
- 只有在真正需要与系统交互时才使用 [SHELL] 或 [WRITE]。
- 如果任务已圆满完成，请直接给出简洁、专业且富有洞察力的总结。

当前工作空间：用户目录及当前代码库。
开始处理：
\n`;

    const fullPrompt = systemPrompt + prompt;

    // Use -p "" to read from stdin, and --approval-mode yolo to allow tool execution
    const gemini = spawn('gemini', ['-p', '', '--output-format', 'text', '--approval-mode', 'yolo'], {
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
