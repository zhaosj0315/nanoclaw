# Project Summary
NanoClaw 是一个集成 WhatsApp 与 Gemini CLI 的智能助手系统。

**Last Updated**: 2026-02-06

## 当前状态
- **已注册群组**: 1 个 (Main)
- **活动会话**: 0 个
- **主要配置**: 
  - 手机号: 8617600663150
  - 存储目录: `/Users/zhaosj/Desktop/nanoclaw`

## 核心功能
- **WhatsApp 自动化**: 基于 Baileys 协议的实时消息收发。
- **Gemini 驱动**: 本地调用 Gemini 模型进行逻辑推理。
- **多模态支持**: 图片视觉分析与语音转文字/文字转语音。
- **安全沙箱**: 基于白名单的文件系统访问控制。

## 研究与仿真 (Research & Simulation)
项目根目录包含大量用于特定任务的数据分析脚本：
- **北京科技 (Beijing Tech)**: `generate_beijing_report.py` 等。
- **普拉特县 (Platte County)**: `simulate_rejection_extremes.py`, `simulate_funding_vs_delay.py` 等。
- **系统监控**: `generate_system_stats.py` 等。
这些脚本由 AI 根据业务需求动态生成，用于生成报表和图表。