# Agent Memory 使用说明

本目录用于落实 `AGENTS.md` 中的 L1/L2/L3 记忆工件，确保会话中断后可快速恢复。

## 文件职责
- `project-context.md`：长期稳定背景（L2）
- `decision-log.md`：关键决策记录（L2）
- `session-log.md`：高频会话快照（L1）
- `handoff.md`：交接摘要与交付证据（L1/L3）

## 更新节奏
- `session-log.md`：每个状态阶段结束时更新，或每 15-20 分钟更新一次。
- `handoff.md`：本轮任务结束前必须更新。
- `decision-log.md`：仅在存在关键取舍时更新。
- `project-context.md`：仅在稳定事实变化时更新。

## 恢复顺序（SOP）
1. 阅读 `AGENTS.md`、`DESIGN.md`。
2. 阅读本目录中的 `handoff.md` 与 `session-log.md` 最新条目。
3. 对照代码现状确认计划是否过时。
4. 输出 5 行恢复结论后开始执行。
