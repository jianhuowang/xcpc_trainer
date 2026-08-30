# 项目状态 — 2026-08-30

## 当前可用

- 手机优先、仅供所有者使用的 Dashboard
- 从 Codeforces、牛客、AtCoder、洛谷或其他平台手动录题
- 按上海自然日运行的确定性证据排程
- 失败、参考题解和提示证据都会清空连续独立记录
- 连续独立完成按 3/7/21/45 天排程
- 补题、未见迁移和盲做复习分队列处理，补题债务优先
- 同题可以进入低频保持，但不能永久毕业
- 可关联未见迁移题；只有第一次尝试独立 AC 才形成 `stable` 证据
- 已暴露迁移题后续不能重新验证迁移
- `stable` 或 `retained` 题收到非独立证据时重新激活
- `stable` 题再次独立完成只追加 attempt，不重新排期
- 训练质量统计只计算盲做和迁移尝试
- 正常、恢复、低能量三种每日上限
- 比赛会话可关联多道暴露题
- Codeforces 公开提交预览、证据确认和符合规则的重新激活
- v4 JSON 完整导出，以及 v1-v4 merge-only 导入兼容
- 设置导入不会覆盖现有 `training_settings.id=1`
- D1 schema 与五个已生成的仅追加 migrations
- 提醒任务去重与 provider-neutral 通知契约
- 带鉴权的 Agent API 和 OpenAPI 契约，包括迁移候选与创建入口
- Dashboard 与 Agent 盲做 DTO 使用精确字段白名单
- 相同优先级和到期时间的队列项使用稳定数值 ID 决胜
- `npm test`、`npm run lint`、`npm run dev` 等工作流可在原生 Windows 和 POSIX 环境启动，不要求预装 Bash

## 验证基线

- `npm test`：生产构建成功，34 个测试通过
- `npm run lint`：无错误
- `npm run db:generate`：No schema changes
- 排程反例、迁移完整性、旧备份、队列优先级与 ID 决胜、盲做精确字段、重新激活、merge-only 设置和迁移序列都有确定性测试
- 当前功能不需要模型 API key
- 当前代码和数据中不保存通知凭据

## 第一次桌面使用

1. 克隆仓库：`git clone https://github.com/jianhuowang/xcpc_trainer.git`。
2. 安装 Node.js 22 或更新版本。
3. 在 VS Code 或 Codex 中打开仓库目录。
4. 运行 `npm ci`。
5. 运行 `npm run db:migrate:local`，把既有 migrations 应用到本地 D1。
6. 运行 `npm test` 与 `npm run lint`，确认本机基线。
7. 运行 `npm run dev` 启动本地版本。
8. 修改项目前先完整阅读 `AGENTS.md`。
9. 不重写 `drizzle/` 下的既有文件；未来 schema 变化只能追加新 migration。

本地 migrations 和数据只写入已忽略的 `.wrangler/state`，与托管 Site 的 D1 相互独立。在不同环境间移动训练记录时，使用 Dashboard 的 JSON 导出与合并导入流程；已有本地设置会被保留。

## GitHub 状态

仓库远端已配置为：

```text
origin  https://github.com/jianhuowang/xcpc_trainer.git
```

当前开发在隔离分支 `codex/invariant-hardening` 中进行。本阶段只形成本地提交；未经用户明确要求，不推送、不合并、不部署。

## 下一实施顺序

1. 先实际使用当前个人闭环，并继续收集有效盲做与迁移证据；在同时满足至少 4 周和至少 30 次有效尝试前，不调整 3/7/21/45 天间隔。
2. 编写 evidence 完整性规格并实现稳定 `idempotencyKey`、持久唯一约束和最大帮助等级；只追加 migration，并明确下一版完整导出。
3. evidence 幂等完成后，再扩大远程 Agent API 联调范围。
4. 单独实现比赛四向分流、候选池和归档，先解决中立题目身份，再决定 migration 与导出版本。
5. Coach 行动层优先复用现有 Agent API；新题和微专题第一版保持会话级，不建立第二套排程器。
6. Vault 对接从用户确认的 Markdown 预览、复制或下载开始；不自动同步或反向写排程。

## 明确未做

- 没有在个人证据足够前引入 FSRS 或模型选择日期
- 没有 evidence 幂等持久键或 H1-H3 最大帮助字段
- 没有候选池、归档和正式比赛四向分流结构
- 没有自动周复盘投递和真实通知 provider 凭据
- 没有自动抓取或转发 GPT 等聊天网页 Cookie
- 没有非官方 QQ 或个人微信登录、Session 自动化
- 不会把在线评测 AC 自动视为 `independent_ac`
- 没有公开多用户写入
- 没有破坏性备份恢复
