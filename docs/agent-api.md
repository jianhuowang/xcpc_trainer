# Agent API and MCP boundary

XCPC Trainer 在 `/api/openapi` 提供仅供 Coach 使用的三个 Actions；它们比内部网页 API 小，Trainer 始终是排程事实源。

| Action | HTTP operation | 允许的写字段 |
|---|---|---|
| `getTrainingContext` | `GET /api/agent/context` | 无 |
| `setTrainingMode` | `PUT /api/agent/mode` | `mode`：仅用户明确选择的 `normal`、`recovery` 或 `low_energy` |
| `submitTrainingEvidence` | `POST /api/agent/evidence` | `problemId`、`evidence`、`helpLevel`、`notes`、`idempotencyKey` |

`getTrainingContext` 只返回盲做安全的 due 白名单，不含 notes、算法标签、题解、历史解法或迁移来源。证据请求仅接受上表五个字段（`notes` 可省略）；客户端不能提交 `nextReviewAt`、间隔、阶段、连续次数、状态或迁移完整性。

`submitTrainingEvidence` 的回执严格限于 `recorded`、`replayed`、`attemptId`、`problemId`、`evidence`、`helpLevel`、`nextStage`、`scheduledAt`、`scheduleReason`。同一 `idempotencyKey` 携带相同规范化 payload 返回 `replayed=true`；不同 payload 返回 409。

## Authentication

普通浏览器 API 需要精确匹配 `TRAINER_OWNER_EMAIL` 的所有者会话。三个 Coach Actions 接受该所有者会话或 `Authorization: Bearer <AGENT_API_KEY>`；Bearer key 不授予 Dashboard、导入或导出权限。

只将 key 保存在部署环境变量和 GPT 编辑器凭证中，不写入 D1、导出、源代码、Instructions、notes 或日志。保持凭证和 HTTP transport 在客户端适配层，调度器和数据库不引入模型提供商代码。
