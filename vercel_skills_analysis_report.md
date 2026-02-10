# vercel-labs/skills 跨 Agent 兼容性实现原理分析报告

## 核心设计理念：基于协议的去中心化能力扩展

`vercel-labs/skills` 的核心设计目标是让 AI Agent（如 Claude Code, Cursor, GitHub Copilot 等）能够通过统一的“技能（Skill）”协议来获取并执行特定的领域知识或任务逻辑。其跨 Agent 兼容性主要通过以下几个维度的标准化实现：

### 1. 统一的技能定义协议 (`SKILL.md`)
每个技能都以 `SKILL.md` 作为入口。
- **标准化元数据**：使用 YAML Frontmatter 定义技能名称、描述、触发词（Triggers）和许可。这使得任何能够解析 Markdown 的 Agent 都能快速理解该技能的用途。
- **触发式激活**：`description` 字段被精心设计为包含触发短语（如 "Review my UI", "Check accessibility"），方便 Agent 在识别到用户意图时主动激活技能。
- **操作指南**：明确规定了技能的工作流程、使用方式（通常是命令行调用）和输出格式。

### 2. 渐进式上下文加载 (Progressive Disclosure)
为了应对不同 Agent 的上下文窗口（Context Window）限制，该系统采用了分层加载策略：
- **核心索引**：初始加载仅包含技能名和简短描述。
- **规则解耦**：将复杂的规则或指令拆分为独立的 Markdown 文件（如 `rules/*.md`）。Agent 只有在确定需要某条规则时，才会去读取对应的文件。
- **代理优化文档 (`AGENTS.md`)**：技能目录中通常包含专门为 LLM 优化的 `AGENTS.md`。它摒弃了冗长的解释，采用“正确 vs 错误”的代码对比示例，这在 Few-shot 学习中对 Agent 极其有效。

### 3. 环境无关的执行层 (Agnostic Scripting)
对于涉及实际操作的技能（如部署、日志查询），它不依赖于特定 Agent 的私有 API，而是使用 **标准 Bash 脚本**：
- **通用性**：Bash 是类 Unix 系统（Agent 运行的最常见环境）的通用语言。
- **解耦逻辑**：复杂的逻辑（如框架检测、打包、API 通讯）封装在脚本中，Agent 只负责按约定的参数调用脚本。
- **机器可读输出**：脚本将人类可读的进度输出到 `stderr`，而将机器可读的 JSON 结果输出到 `stdout`，方便 Agent 解析并进行下一步决策。

### 4. 目录结构与路径标准化
技能遵循严格的目录结构：
- `SKILL.md` (入口)
- `scripts/` (可执行脚本)
- `rules/` (领域规则)
这种一致性使得不同 Agent 可以编写通用的解析逻辑来发现和安装技能。

### 5. 跨 Agent 适配示例
- **针对 Claude Code**：提供 `AGENTS.md` 作为系统提示词的补充。
- **针对 claude.ai**：建议将 `SKILL.md` 内容直接粘贴或加入项目知识库。
- **针对 Cursor/Copilot**：通过标准的文件引用机制读取 `.md` 规则。

## 总结
`vercel-labs/skills` 成功的关键在于它**不试图为每个 Agent 编写不同的逻辑**，而是定义了一套基于 **Markdown + Bash + YAML** 的开放式协议。这套协议利用了所有主流 LLM 对文档理解和基础 Shell 操作的共性，实现了“一次编写，处处运行”的技能扩展模式。
