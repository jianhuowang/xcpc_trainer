# XCPC Trainer

一个以比赛证据为起点的个人 XCPC / ACM 训练器：真实比赛暴露问题，补题建立理解，盲重做验证保持，后端按固定规则安排下一次训练。

当前版本已经具备可用的个人训练闭环，并保持模型无关。AI 可以在未来作为解释器或客户端接入，但不能直接改写排程。

## 已完成

- 手机优先的录题、今日队列、重做回报和统计界面
- 失败、题解、提示、独立 AC 四类训练证据
- 固定复习节奏：失败 1 天、题解 2 天、提示 3 天、连续独立完成后 3/7/21/45 天
- 题解、提示和失败都会清空连续独立记录；同题重复只能进入低频保持，不能永久毕业
- 补题债务优先于普通到期复习，并统一按上海自然日进入队列
- 同题保持后可关联一道无标签迁移题；只有陌生状态下首次独立 AC 才能把原题推进到稳定
- 训练质量统计只计算盲重做与迁移尝试，不把首次录入或平台 AC 混入样本
- 已保持或已稳定题遇到新的失败、题解或提示证据会重新激活；Codeforces 同步也遵守该规则
- 正常、恢复、低能量三种每日负荷模式，分别最多安排 6/4/2 道到期题
- Cloudflare D1 持久化题目、每次尝试和训练设置
- 比赛会话：一场比赛可一次录入多道暴露题并进入 upsolve 链路
- 完整 JSON 数据导出，以及校验、预览、去重后的安全合并导入
- Codeforces 官方公开提交同步；未通过题可直接入队，AC 题必须人工确认证据
- 每日提醒任务的扫描、去重和留痕，以及 QQ Bot、企业微信、邮件统一接口
- Provider-neutral Agent API / OpenAPI 契约，默认隐藏笔记并禁止客户端指定复习日期
- 生产构建、规则单测和代码检查

## 设计原则

1. 排程由后端确定性规则决定，不由网页模型临时发挥。
2. 盲做前不显示算法标签、旧笔记或题解。
3. 记录“如何完成”而不只记录 AC；题解、提示或失败都会打断连续独立证据。
4. 有积压时先清训练债务，不用新题制造虚假的进度感。
5. 同题记忆不等于迁移能力；同题保持和真正稳定是两个不同阶段。
6. 数据可以完整导出，未来客户端和模型随时可替换。

## 技术栈

- Next.js 兼容层：Vinext
- React 19 + TypeScript
- Cloudflare Workers / D1
- Drizzle ORM 与 SQL migrations
- Tailwind CSS + vendored shadcn/ui
- Node.js 内置测试框架

## 本地开始

要求 Node.js `>=22.13.0`。

```bash
npm ci
npm run db:migrate:local
npm run dev
```

`db:migrate:local` 只把仓库中既有的 `drizzle/0000`-`0004` 应用到已忽略的 `.wrangler/state`。它不会修改托管 D1，可以安全重复执行。

常用检查：

```bash
npm run db:generate
npm test
npm run lint
```

修改 `db/schema.ts` 后必须生成并提交 Drizzle migration。不要在请求处理代码中临时建表。

## 目录

```text
app/                  页面与 HTTP API
db/                   D1 数据访问与表结构
drizzle/              可审查的 SQL migrations
lib/training/         确定性排程与训练模式
lib/notifications/    通知渠道契约
tests/                规则和界面守护测试
docs/                 架构与交接状态
```

## 当前 API

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/dashboard` | 今日队列、最近记录和统计 |
| `POST` | `/api/problems` | 录入题目与首次证据 |
| `POST` | `/api/reviews` | 回报盲重做结果并重新排期 |
| `PUT` | `/api/settings` | 切换每日训练模式 |
| `GET` | `/api/export` | 导出完整个人数据 |
| `POST` | `/api/import` | 预览或合并导入训练备份 |
| `GET/POST` | `/api/contests` | 读取或建立比赛补题会话 |
| `GET/POST` | `/api/reminders` | 预览或生成去重提醒任务 |
| `GET/POST` | `/api/integrations/codeforces` | 预览或导入公开提交记录 |
| `POST` | `/api/transfers` | 为已保持题目建立无标签迁移任务 |
| `GET` | `/api/agent/context` | 给模型读取无提示训练队列 |
| `POST` | `/api/agent/evidence` | 给模型提交规范化训练证据 |
| `GET` | `/api/openapi` | 获取 Agent API 的 OpenAPI 文档 |

## 下一阶段

- 部署定时触发器与第一个真实提醒渠道
- 牛客等更多平台的合规提交导入
- 比赛级策略复盘与基于弱点簇的自动迁移题推荐
- 基于现有 Agent API 的正式 MCP 适配器
- 公共多用户版本的身份、隔离、限流和部署文档

详细约束见 [`docs/architecture.md`](docs/architecture.md)，模型接入边界见 [`docs/agent-api.md`](docs/agent-api.md)，当前交接点见 [`docs/project-state.md`](docs/project-state.md)。

## License

MIT
