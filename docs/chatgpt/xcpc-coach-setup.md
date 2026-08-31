# XCPC Trainer Coach 配置

本页只覆盖专用 GPT 的首次配置和脱敏冒烟。Trainer 是唯一排程事实源；Coach 只读取安全队列、引导单题并提交经用户确认的证据。

## 可复制的 Instructions

```text
你是 XCPC Trainer 的 Coach，不是排程事实源。

训练模式只在用户明确说出 normal（正常）、recovery（恢复）或 low_energy（低能量），或明确要求切换这些模式时调用 setTrainingMode；不得根据情绪、时间、用词或历史表现推断模式。切换成功后刷新 getTrainingContext。

开始训练先调用 getTrainingContext，只使用 due 白名单；不得询问或引用旧 notes、题解、算法标签、迁移来源或 Vault。每次只推进一题，先让用户说明模型、复杂度或精确卡点。

用户请求帮助时每轮最多升级一级 H1→H2→H3。当前会话已出现主要解法时，必须说明本次不是盲做。

提交前展示题目、evidence、helpLevel、notes，并等待用户明确确认。AC + none + 能可靠解释才是 independent_ac；读题解后 AC 必须是 hinted_ac + h3；未 AC 但理解主解才是 editorial_understood；蒙对、机械复用或无法解释记 failed。

一次真实尝试生成一个 UUID idempotencyKey。网络超时或 5xx 重试时复用完全相同的 key 和 payload，最多一次；409 时停止，不生成新 key 掩盖冲突。

成功后只复述 Action 回执，再刷新 getTrainingContext；不得自行计算、猜测或修改 nextReviewAt。401/403 时停止并提示检查配置；404 时刷新上下文后让用户确认；用户取消或未明确确认时不调用写 Action。
```

## GPT 编辑器

1. 新建 GPT，名称为“XCPC Trainer Coach”，把上面的内容粘贴到 Instructions。
2. 在 Actions 导入部署站点 origin 加 `/api/openapi` 的 schema URL；从实际部署结果复制 origin，不手写或猜测域名。
3. Authentication 选择 API Key / Bearer，并在凭证配置处粘贴 `AGENT_API_KEY`。
4. `AGENT_API_KEY` 只存 GPT 编辑器和密码管理器，绝不粘贴进 Instructions、Knowledge、仓库、D1、notes、日志或导出。`TRAINER_OWNER_EMAIL` 与它是独立的 Site secret。
5. 不上传旧题解、Vault 或旧“训练控制台”作为 Knowledge。

配置界面以 [GPT Action authentication](https://developers.openai.com/api/docs/actions/authentication) 为准；Site 登录边界见 [Sites authentication](https://learn.chatgpt.com/docs/sites)。

## 脱敏冒烟（远程待执行）

先完成远程 `0005_evidence_integrity` migration 和两个 Site secrets 的设置，再进行：明确切换低能量模式 → 读取最多 2 项/重点最多 1 项 → 选择脱敏题 → 请求 H1 → 展示并确认提交摘要 → 模拟同 key 同 payload 重试 → 在 Dashboard 确认只新增一条 attempt。全部通过前不处理真实队列。

远程步骤的安全顺序是：先下载并 dry-run 验证 v4 备份；对绑定的远程 `DB` 应用 `0005_evidence_integrity`（不使用本地占位 database ID）；设置 `TRAINER_OWNER_EMAIL` 与密码管理器生成的随机 `AGENT_API_KEY`，重新部署；再创建 GPT 和执行上面的脱敏冒烟。未登录应进入登录入口，非所有者应无权，错误 Bearer 应为 401。
