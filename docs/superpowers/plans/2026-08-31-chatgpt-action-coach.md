# XCPC Trainer × ChatGPT Action Coach 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可在 ChatGPT 网页端直接读取安全训练队列、显式切换模式、幂等提交真实证据的专用 Coach，并把旧“训练控制台”记录一次性、安全地迁移到 Trainer。

**Architecture:** 保留 XCPC Trainer 为唯一事实源，在现有 Agent API 上收窄为三个 Actions。先用 `0005` 和 v5 备份完成证据完整性，再增加所有者鉴权、OpenAPI 与专用 GPT 指令；旧训练卡通过一次性 Node 转换器生成标准 v5 备份，继续复用 Dashboard dry-run/import，不建设第二套迁移 API 或同步服务。

**Tech Stack:** Node.js 22、TypeScript、React 19、Vinext/Next Route Handlers、Cloudflare D1、Drizzle ORM、ChatGPT Custom GPT Actions、Node 内置测试框架、ESLint。

## 全局约束

- Trainer 是排程、当前状态、attempts 和训练模式的唯一事实源。
- `training_settings.id=1` 是权威模式；只接受 `normal | recovery | low_energy`，Coach 不推断模式。
- 正常、恢复、低能量到期上限保持 6/4/2，建议重点保持 3/2/1。
- 排程间隔保持失败 1 天、题解理解 2 天、提示 AC 3 天、连续独立完成 3/7/21/45 天。
- 所有日界固定为 `Asia/Shanghai` 00:00，客户端不得提交排程日期或排程状态。
- Agent `due` 题目精确白名单保持 `id,title,url,platform,origin,reviewStage,queueType,dueAt`。
- 写请求不得包含日期、状态、阶段、连续次数、lapse、排程理由或迁移完整性。
- attempt 仅追加；提交后不提供编辑或删除入口。
- 新 migration 只能是 `0005`；不得修改或重写 `0000`-`0004`。
- 完整导出升级为 v5；导入支持 v1-v5，旧 v4 备份必须继续可用。
- 生产环境缺少 `TRAINER_OWNER_EMAIL` 时失败关闭；Custom GPT 使用独立 `AGENT_API_KEY`。
- 不新增 npm 依赖，不建设 MCP/OAuth、代理层、永久历史同步或第二套队列。
- 文档与用户界面以中文为主，必要字段名和 OpenAI/HTTP 术语保留英文。
- 每个生产行为先写失败测试，再写最小实现；每个 Task 独立提交。

## 文件结构

- `db/schema.ts`、`drizzle/0005_evidence_integrity.sql`：只定义证据幂等与帮助等级持久化。
- `lib/training/evidence.ts`：证据请求校验、重复内容比较和安全回执投影；不访问数据库。
- `app/api/reviews/route.ts`：唯一证据写入核心；浏览器和 Agent wrapper 共用。
- `lib/auth/access.ts`、`lib/agent/auth.ts`：纯鉴权决策与 Cloudflare env 适配。
- `lib/agent/openapi.ts`：三个 Actions 的可测试 OpenAPI 文档。
- `scripts/legacy-training-cards.mjs`：一次性把 `[TRAINING_CARD]` 文本转换为 v5 备份。
- `lib/data/import-plan.ts`：把已校验备份和现有身份映射为单批次导入计划。
- `docs/chatgpt/xcpc-coach-setup.md`：专用 GPT 指令、Action 设置、密钥与冒烟步骤。

---

## 里程碑一：先让专用 GPT 可用

### Task 1：`0005` 与 v5 数据可移植性

**Files:**
- Modify: `db/schema.ts`
- Create: `drizzle/0005_evidence_integrity.sql`（由 Drizzle 生成）
- Create: `drizzle/meta/0005_snapshot.json`（由 Drizzle 生成）
- Modify: `drizzle/meta/_journal.json`（仅由 Drizzle 追加）
- Modify: `lib/data/import.ts`
- Modify: `app/api/export/route.ts`
- Modify: `app/api/import/route.ts`
- Modify: `tests/data-portability.test.mjs`

**Interfaces:**
- Consumes: v1-v5 `xcpc-trainer-export` envelope。
- Produces: `HelpLevel = "none" | "h1" | "h2" | "h3" | "unknown"`；`ImportedAttempt.helpLevel` 与 `ImportedAttempt.idempotencyKey`；v5 完整导出。

- [ ] **Step 1：把现有可移植性守卫改成预期 v5，先得到 RED**

在 `tests/data-portability.test.mjs` 中扩展 v1 断言并增加 v5 fixture：

```js
test("v1 attempt 补齐未知帮助等级和空幂等键", () => {
  const parsed = parseImportBundle(BASE_BACKUP);
  assert.equal(parsed.attempts[0].helpLevel, "unknown");
  assert.equal(parsed.attempts[0].idempotencyKey, null);
});

test("v5 attempt 保留结构化帮助等级和幂等键", () => {
  const backup = structuredClone(BASE_BACKUP);
  backup.version = 5;
  backup.attempts[0].helpLevel = "h1";
  backup.attempts[0].idempotencyKey = "018f0f66-7a28-7e31-8a4d-a70b93879a11";
  const parsed = parseImportBundle(backup);
  assert.equal(parsed.attempts[0].helpLevel, "h1");
  assert.equal(
    parsed.attempts[0].idempotencyKey,
    "018f0f66-7a28-7e31-8a4d-a70b93879a11",
  );
});

test("v5 拒绝非法帮助等级和过短幂等键", () => {
  const backup = structuredClone(BASE_BACKUP);
  backup.version = 5;
  backup.attempts[0].helpLevel = "H9";
  backup.attempts[0].idempotencyKey = "short";
  assert.throws(() => parseImportBundle(backup), /帮助等级|幂等键/);
});

test("迁移历史只追加 0005 evidence integrity", async () => {
  const journal = JSON.parse(
    await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(journal.entries.map((entry) => entry.tag), [
    "0000_chunky_moon_knight",
    "0001_mighty_bushwacker",
    "0002_curly_selene",
    "0003_warm_liz_osborn",
    "0004_mean_blue_blade",
    "0005_evidence_integrity",
  ]);
});

test("完整导出版本升级为 v5", async () => {
  const source = await readFile(
    new URL("../app/api/export/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /version:\s*5/);
});
```

- [ ] **Step 2：运行测试并确认 RED**

Run: `node --test tests/data-portability.test.mjs`

Expected: FAIL，当前 parser 不支持 v5，attempt 没有两个新字段，journal 也没有 `0005`。

- [ ] **Step 3：修改 schema 并让 Drizzle 生成唯一的追加 migration**

在 `attempts` 表增加：

```ts
helpLevel: text("help_level").notNull().default("unknown"),
idempotencyKey: text("idempotency_key"),
```

把 attempts 的索引列表改为：

```ts
(table) => [
  index("attempts_problem_idx").on(table.problemId),
  uniqueIndex("attempts_idempotency_key_unique").on(table.idempotencyKey),
]
```

Run: `npm run db:generate -- --name evidence_integrity`

Expected: 只生成 `drizzle/0005_evidence_integrity.sql` 和 `drizzle/meta/0005_snapshot.json`，SQL 等价于：

```sql
ALTER TABLE `attempts` ADD `help_level` text DEFAULT 'unknown' NOT NULL;
ALTER TABLE `attempts` ADD `idempotency_key` text;
CREATE UNIQUE INDEX `attempts_idempotency_key_unique`
  ON `attempts` (`idempotency_key`);
```

Run: `git diff --name-only -- drizzle/0000_chunky_moon_knight.sql drizzle/0001_mighty_bushwacker.sql drizzle/0002_curly_selene.sql drizzle/0003_warm_liz_osborn.sql drizzle/0004_mean_blue_blade.sql`

Expected: 无输出。

- [ ] **Step 4：把导入 parser 升级为 v1-v5**

在 `lib/data/import.ts` 增加并导出：

```ts
export const HELP_LEVELS = ["none", "h1", "h2", "h3", "unknown"] as const;
export type HelpLevel = (typeof HELP_LEVELS)[number];

const HELP_LEVEL_SET = new Set<string>(HELP_LEVELS);
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,128}$/;

function helpLevelValue(value: unknown, version: number): HelpLevel {
  if (version < 5) return "unknown";
  if (typeof value !== "string" || !HELP_LEVEL_SET.has(value)) {
    throw new Error("尝试记录的帮助等级无效。");
  }
  return value as HelpLevel;
}

function idempotencyKeyValue(value: unknown, version: number) {
  if (version < 5 || value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !IDEMPOTENCY_KEY.test(value)) {
    throw new Error("尝试记录的幂等键无效。");
  }
  return value;
}
```

把 `ImportBundle.version` 扩展为 `1 | 2 | 3 | 4 | 5`，`ImportedAttempt` 增加：

```ts
helpLevel: HelpLevel;
idempotencyKey: string | null;
```

解析 attempt 时写入：

```ts
helpLevel: helpLevelValue(row.helpLevel, version),
idempotencyKey: idempotencyKeyValue(row.idempotencyKey, version),
```

在 parser 返回前验证备份内所有非空 key 唯一：

```ts
const keys = attempts
  .map((attempt) => attempt.idempotencyKey)
  .filter((key): key is string => key !== null);
if (new Set(keys).size !== keys.length) {
  throw new Error("备份内存在重复幂等键。");
}
```

- [ ] **Step 5：升级导出和现有导入插入字段**

`app/api/export/route.ts` 把 `version: 4` 改为 `version: 5`。Drizzle 查询会自动返回两个新字段，不手写第二份 attempt DTO。

`app/api/import/route.ts` 现有 attempt insert 增加：

```ts
helpLevel: attempt.helpLevel,
idempotencyKey: attempt.idempotencyKey,
```

此 Task 暂时保持“v1-v4 只为新题导入 attempts”的既有行为；v5 对已存在题追加历史的安全计划在 Task 6 一次完成。

- [ ] **Step 6：验证 GREEN 和 migration 可重复应用**

Run: `node --test tests/data-portability.test.mjs`

Expected: 全部通过。

Run: `npm run db:migrate:local`

Expected: `0005_evidence_integrity` 应用成功。

Run: `npm run db:migrate:local`

Expected: 无待应用 migration，exit 0。

Run: `npm test`

Expected: build 成功，全部 Node tests 通过。

- [ ] **Step 7：提交**

```powershell
git add -- db/schema.ts drizzle/0005_evidence_integrity.sql drizzle/meta/0005_snapshot.json drizzle/meta/_journal.json lib/data/import.ts app/api/export/route.ts app/api/import/route.ts tests/data-portability.test.mjs
git commit -m "feat: add idempotent evidence fields"
```

---

### Task 2：共享幂等证据写入与浏览器帮助等级

**Files:**
- Create: `lib/training/evidence.ts`
- Create: `tests/evidence.test.mjs`
- Modify: `app/api/reviews/route.ts`
- Modify: `app/api/agent/evidence/route.ts`
- Modify: `app/page.tsx`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: `{ problemId, evidence, helpLevel, notes, idempotencyKey }`。
- Produces: `parseEvidenceSubmission(body)`、`sameEvidenceSubmission(existing,input)`、`toEvidenceReceipt(attempt,replayed)`；`recordEvidence(request)` 是浏览器与 Agent 共用的唯一数据库写入核心。

- [ ] **Step 1：写证据真值表、幂等比较和安全回执测试**

创建 `tests/evidence.test.mjs`：

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  parseEvidenceSubmission,
  sameEvidenceSubmission,
  toEvidenceReceipt,
} from "../lib/training/evidence.ts";

const KEY = "018f0f66-7a28-7e31-8a4d-a70b93879a11";

test("独立 AC 只能携带 none", () => {
  assert.equal(parseEvidenceSubmission({
    problemId: 7,
    evidence: "independent_ac",
    helpLevel: "none",
    notes: "可解释模型与复杂度",
    idempotencyKey: KEY,
  }).ok, true);
  assert.match(parseEvidenceSubmission({
    problemId: 7,
    evidence: "independent_ac",
    helpLevel: "h1",
    notes: "",
    idempotencyKey: KEY,
  }).error, /帮助等级/);
});

test("提示 AC 和题解理解不能伪装成 none", () => {
  for (const evidence of ["hinted_ac", "editorial_understood"]) {
    assert.match(parseEvidenceSubmission({
      problemId: 7,
      evidence,
      helpLevel: "none",
      notes: "",
      idempotencyKey: KEY,
    }).error, /帮助等级/);
  }
});

test("同 key 只在规范化 payload 完全相同时视为重试", () => {
  const input = parseEvidenceSubmission({
    problemId: 7,
    evidence: "hinted_ac",
    helpLevel: "h1",
    notes: "  卡在状态定义  ",
    idempotencyKey: KEY,
  }).value;
  assert.equal(sameEvidenceSubmission({
    problemId: 7,
    evidence: "hinted_ac",
    helpLevel: "h1",
    notes: "卡在状态定义",
  }, input), true);
  assert.equal(sameEvidenceSubmission({
    problemId: 7,
    evidence: "hinted_ac",
    helpLevel: "h2",
    notes: "卡在状态定义",
  }, input), false);
});

test("Action 回执使用精确白名单", () => {
  const receipt = toEvidenceReceipt({
    id: 9,
    problemId: 7,
    evidence: "hinted_ac",
    helpLevel: "h1",
    nextStage: 0,
    scheduledAt: "2026-09-03T16:00:00.000Z",
    scheduleReason: "提示后完成：3 天后盲做。",
    notes: "secret",
  }, false);
  assert.deepEqual(Object.keys(receipt).sort(), [
    "attemptId", "evidence", "helpLevel", "nextStage", "problemId",
    "recorded", "replayed", "scheduleReason", "scheduledAt",
  ].sort());
  assert.equal("notes" in receipt, false);
});
```

- [ ] **Step 2：运行测试并确认 RED**

Run: `node --test tests/evidence.test.mjs`

Expected: FAIL，`lib/training/evidence.ts` 不存在。

- [ ] **Step 3：实现最小纯证据契约**

创建 `lib/training/evidence.ts`，导出以下类型与函数：

```ts
import { HELP_LEVELS, type HelpLevel } from "../data/import.ts";
import { isSolveEvidence, type SolveEvidence } from "./scheduler.ts";

export type EvidenceSubmission = {
  problemId: number;
  evidence: SolveEvidence;
  helpLevel: HelpLevel;
  notes: string;
  idempotencyKey: string;
};

type ParseResult =
  | { ok: true; value: EvidenceSubmission }
  | { ok: false; error: string };

const KEY = /^[A-Za-z0-9._:-]{16,128}$/;
const FIELDS = new Set(["problemId", "evidence", "helpLevel", "notes", "idempotencyKey"]);

export function parseEvidenceSubmission(body: Record<string, unknown>): ParseResult {
  if (Object.keys(body).some((key) => !FIELDS.has(key))) {
    return { ok: false, error: "证据请求包含不支持的字段。" };
  }
  const problemId = Number(body.problemId);
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const helpLevel = typeof body.helpLevel === "string" ? body.helpLevel : "";
  const idempotencyKey =
    typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (!Number.isInteger(problemId) || problemId <= 0) {
    return { ok: false, error: "无效的题目编号。" };
  }
  if (!isSolveEvidence(body.evidence)) {
    return { ok: false, error: "请选择有效的重做结果。" };
  }
  if (!HELP_LEVELS.includes(helpLevel as HelpLevel)) {
    return { ok: false, error: "请选择有效的帮助等级。" };
  }
  if (notes.length > 4000) return { ok: false, error: "记录不能超过 4000 字符。" };
  if (!KEY.test(idempotencyKey)) return { ok: false, error: "缺少有效的幂等键。" };
  if (body.evidence === "independent_ac" && helpLevel !== "none") {
    return { ok: false, error: "独立完成的帮助等级只能是 none。" };
  }
  if (
    (body.evidence === "hinted_ac" || body.evidence === "editorial_understood") &&
    helpLevel === "none"
  ) {
    return { ok: false, error: "该证据必须记录实际帮助等级。" };
  }
  return {
    ok: true,
    value: { problemId, evidence: body.evidence, helpLevel: helpLevel as HelpLevel, notes, idempotencyKey },
  };
}

export function sameEvidenceSubmission(
  existing: Pick<EvidenceSubmission, "problemId" | "evidence" | "helpLevel" | "notes">,
  input: EvidenceSubmission,
) {
  return existing.problemId === input.problemId &&
    existing.evidence === input.evidence &&
    existing.helpLevel === input.helpLevel &&
    existing.notes.trim() === input.notes;
}

export function toEvidenceReceipt(attempt: {
  id: number;
  problemId: number;
  evidence: string;
  helpLevel: string;
  nextStage: number;
  scheduledAt: string | null;
  scheduleReason: string;
}, replayed: boolean) {
  return {
    recorded: true,
    replayed,
    attemptId: attempt.id,
    problemId: attempt.problemId,
    evidence: attempt.evidence,
    helpLevel: attempt.helpLevel,
    nextStage: attempt.nextStage,
    scheduledAt: attempt.scheduledAt,
    scheduleReason: attempt.scheduleReason,
  };
}
```

测试同时增加：

```js
test("服务端拒绝客户端排程字段", () => {
  const parsed = parseEvidenceSubmission({
    problemId: 7,
    evidence: "failed",
    helpLevel: "none",
    notes: "",
    idempotencyKey: KEY,
    nextReviewAt: "2030-01-01T00:00:00.000Z",
  });
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /不支持的字段/);
});
```

- [ ] **Step 4：把 reviews 路由改为唯一幂等写入核心**

在 `app/api/reviews/route.ts`：

1. 导出 `recordEvidence(request)`，暂时让 `POST` 直接调用它；Task 3 再给浏览器 wrapper 加 owner auth。
2. 先解析 body，再按 `idempotencyKey` 查询 attempt。
3. 已存在且 payload 相同返回 `toEvidenceReceipt(existing, true)`；不同返回 409。
4. 首次写入时让 `insertAttempt.returning()` 成为 `db.batch` 第一项，再执行 problem/source 更新。
5. insert 增加 `helpLevel`、`idempotencyKey`。
6. 响应只返回 `toEvidenceReceipt(inserted, false)`。

重复查询和冲突响应使用同一个局部函数：

```ts
async function replayResponse(input: EvidenceSubmission) {
  const [existing] = await getDb()
    .select()
    .from(attempts)
    .where(eq(attempts.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (!existing) return null;
  if (!sameEvidenceSubmission(existing, input)) {
    return Response.json({ error: "相同幂等键携带了不同证据。" }, { status: 409 });
  }
  return Response.json(toEvidenceReceipt(existing, true));
}
```

在首次查询后仍可能发生并发唯一冲突；catch 只对包含 `attempts.idempotency_key` 的唯一约束错误再次调用 `replayResponse(input)`，其他错误继续返回 500。由于 insert 与投影更新在同一 D1 batch 中，唯一冲突会回滚整个 batch。

`app/api/agent/evidence/route.ts` 改为导入并调用命名导出：

```ts
import { recordEvidence } from "@/app/api/reviews/route";
```

- [ ] **Step 5：给浏览器表单增加帮助等级与稳定 key**

在 `app/page.tsx` 增加：

```ts
type HelpLevel = "none" | "h1" | "h2" | "h3" | "unknown";
const [reviewHelpLevel, setReviewHelpLevel] = useState<HelpLevel>("none");
const [reviewAttemptKey, setReviewAttemptKey] = useState("");

function beginReview(problem: Problem) {
  setReviewing(problem);
  setReviewEvidence("independent_ac");
  setReviewHelpLevel("none");
  setReviewNotes("");
  setReviewAttemptKey(crypto.randomUUID());
}
```

所有原 `setReviewing(problem)` 的开始入口改为 `beginReview(problem)`。提交 body 增加：

```ts
helpLevel: reviewHelpLevel,
idempotencyKey: reviewAttemptKey,
```

请求失败时保留 `reviewAttemptKey`，成功或用户关闭弹窗时才清空。证据切换时使用最小默认值：

```ts
function changeReviewEvidence(evidence: Evidence) {
  setReviewEvidence(evidence);
  if (evidence === "independent_ac") setReviewHelpLevel("none");
  if (evidence === "hinted_ac") setReviewHelpLevel("h1");
  if (evidence === "editorial_understood") setReviewHelpLevel("h3");
}
```

在现有 review Dialog 中加入一个原生项目 `Select`，选项固定为 `none/H1/H2/H3/unknown`。成功提示只读取 `result.scheduleReason`，不再依赖已删除的完整 `problem`、`decision` 或 `transferValidation`。

在 `tests/rendered-html.test.mjs` 增加源码契约：

```js
test("浏览器证据提交包含帮助等级和稳定幂等键", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /helpLevel:\s*reviewHelpLevel/);
  assert.match(source, /idempotencyKey:\s*reviewAttemptKey/);
});
```

- [ ] **Step 6：验证纯逻辑与浏览器契约 GREEN**

Run: `node --test tests/evidence.test.mjs tests/rendered-html.test.mjs`

Expected: 全部通过。

Run: `npm test`

Expected: build 成功，全部测试通过。

- [ ] **Step 7：用本地 D1 验证真实重试和 409**

先运行 `npm run dev`。另一个 PowerShell：

```powershell
$trainerUrl = 'http://localhost:5173'
$problem = Invoke-RestMethod -Method Post -Uri "$trainerUrl/api/problems" -ContentType 'application/json' -Body (@{
  title = 'Idempotency smoke'
  url = 'https://example.com/idempotency-smoke'
  platform = 'other'
  origin = 'practice'
  evidence = 'failed'
  notes = ''
} | ConvertTo-Json)
$key = [guid]::NewGuid().ToString()
$payload = @{
  problemId = $problem.problem.id
  evidence = 'hinted_ac'
  helpLevel = 'h1'
  notes = 'retry smoke'
  idempotencyKey = $key
} | ConvertTo-Json
$first = Invoke-RestMethod -Method Post -Uri "$trainerUrl/api/reviews" -ContentType 'application/json' -Body $payload
$second = Invoke-RestMethod -Method Post -Uri "$trainerUrl/api/reviews" -ContentType 'application/json' -Body $payload
$backup = Invoke-RestMethod -Uri "$trainerUrl/api/export"
@($backup.attempts | Where-Object idempotencyKey -eq $key).Count
$first.replayed
$second.replayed
```

Expected: `1`、`False`、`True`。

再把同一 key 的 notes 改为 `different` 并提交；捕获的 HTTP status 必须为 409，导出中仍只有一条该 key attempt。

- [ ] **Step 8：提交**

```powershell
git add -- lib/training/evidence.ts tests/evidence.test.mjs app/api/reviews/route.ts app/api/agent/evidence/route.ts app/page.tsx tests/rendered-html.test.mjs
git commit -m "feat: make evidence submissions idempotent"
```

---

### Task 3：Site 所有者鉴权与失败关闭

**Files:**
- Create: `lib/auth/access.ts`
- Create: `tests/auth.test.mjs`
- Modify: `lib/agent/auth.ts`
- Modify: `app/chatgpt-auth.ts`
- Modify: `app/layout.tsx`
- Modify: `app/api/dashboard/route.ts`
- Modify: `app/api/problems/route.ts`
- Modify: `app/api/reviews/route.ts`
- Modify: `app/api/settings/route.ts`
- Modify: `app/api/contests/route.ts`
- Modify: `app/api/transfers/route.ts`
- Modify: `app/api/reminders/route.ts`
- Modify: `app/api/integrations/codeforces/route.ts`
- Modify: `app/api/import/route.ts`
- Modify: `app/api/export/route.ts`

**Interfaces:**
- Consumes: platform identity header、`TRAINER_OWNER_EMAIL`、`AGENT_API_KEY`、请求 URL。
- Produces: `authorizeOwnerRequest(request,config)` 与 `authorizeAgentRequest(request,config)`；普通 API 只接受 owner，Agent API 接受 owner 或 Bearer。

- [ ] **Step 1：写完整鉴权矩阵测试**

创建 `tests/auth.test.mjs`，用 Node 原生 `Request/Response` 覆盖：

```js
import assert from "node:assert/strict";
import test from "node:test";
import { authorizeAgentRequest, authorizeOwnerRequest } from "../lib/auth/access.ts";

const config = { ownerEmail: "owner@example.com", agentApiKey: "agent-secret" };
const request = (url, headers = {}) => new Request(url, { headers });

test("loopback 缺少 secrets 时只允许本地开发", () => {
  assert.equal(authorizeOwnerRequest(request("http://localhost:5173/api/dashboard"), {}), null);
  assert.equal(
    authorizeOwnerRequest(request("https://trainer.example/api/dashboard"), {}).status,
    503,
  );
});

test("owner API 区分未登录、非所有者和所有者", () => {
  assert.equal(authorizeOwnerRequest(request("https://trainer.example/api/dashboard"), config).status, 401);
  assert.equal(authorizeOwnerRequest(request("https://trainer.example/api/dashboard", {
    "oai-authenticated-user-email": "other@example.com",
  }), config).status, 403);
  assert.equal(authorizeOwnerRequest(request("https://trainer.example/api/dashboard", {
    "oai-authenticated-user-email": " Owner@Example.com ",
  }), config), null);
});

test("Agent API 接受 owner 或正确 Bearer，拒绝其他身份", () => {
  assert.equal(authorizeAgentRequest(request("https://trainer.example/api/agent/context", {
    authorization: "Bearer agent-secret",
  }), config), null);
  assert.equal(authorizeAgentRequest(request("https://trainer.example/api/agent/context", {
    "oai-authenticated-user-email": "owner@example.com",
  }), config), null);
  assert.equal(authorizeAgentRequest(request("https://trainer.example/api/agent/context", {
    "oai-authenticated-user-email": "other@example.com",
  }), config).status, 403);
  assert.equal(authorizeAgentRequest(request("https://trainer.example/api/agent/context", {
    authorization: "Bearer wrong",
  }), config).status, 401);
  assert.equal(authorizeAgentRequest(request("https://trainer.example/api/agent/context", {
    authorization: "Bearer agent-secret",
  }), { agentApiKey: "agent-secret" }).status, 503);
});
```

- [ ] **Step 2：运行测试并确认 RED**

Run: `node --test tests/auth.test.mjs`

Expected: FAIL，`lib/auth/access.ts` 不存在。

- [ ] **Step 3：实现无环境依赖的纯鉴权决策**

创建 `lib/auth/access.ts`：

```ts
export type AccessConfig = { ownerEmail?: string; agentApiKey?: string };

export const normalizeEmail = (value?: string) => value?.trim().toLowerCase() ?? "";
const jsonError = (status: number, error: string, bearer = false) =>
  Response.json({ error }, {
    status,
    headers: bearer ? { "WWW-Authenticate": "Bearer" } : undefined,
  });

export function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function authorizeOwnerRequest(request: Request, config: AccessConfig) {
  const ownerEmail = normalizeEmail(config.ownerEmail);
  if (!ownerEmail) {
    return isLoopbackHost(new URL(request.url).hostname)
      ? null
      : jsonError(503, "站点尚未配置 TRAINER_OWNER_EMAIL。");
  }
  const actual = normalizeEmail(
    request.headers.get("oai-authenticated-user-email") ?? undefined,
  );
  if (!actual) return jsonError(401, "请先使用 ChatGPT 登录。");
  return actual === ownerEmail ? null : jsonError(403, "当前账号不是 Trainer 所有者。");
}

export function authorizeAgentRequest(request: Request, config: AccessConfig) {
  if (
    !normalizeEmail(config.ownerEmail) &&
    !isLoopbackHost(new URL(request.url).hostname)
  ) {
    return jsonError(503, "站点尚未配置 TRAINER_OWNER_EMAIL。");
  }
  const owner = authorizeOwnerRequest(request, config);
  if (owner === null) return null;
  const key = config.agentApiKey?.trim() ?? "";
  if (key && request.headers.get("authorization") === `Bearer ${key}`) return null;
  if (request.headers.get("oai-authenticated-user-email")) return owner;
  return jsonError(401, "Agent API 需要有效 Bearer 凭证。", true);
}
```

- [ ] **Step 4：让 Cloudflare env 适配器复用纯函数**

`lib/agent/auth.ts` 只保留环境读取和两个 wrapper：

```ts
import { env } from "cloudflare:workers";
import { authorizeAgentRequest, authorizeOwnerRequest } from "@/lib/auth/access";

function config() {
  const values = env as unknown as {
    TRAINER_OWNER_EMAIL?: string;
    AGENT_API_KEY?: string;
  };
  return {
    ownerEmail: values.TRAINER_OWNER_EMAIL,
    agentApiKey: values.AGENT_API_KEY,
  };
}

export const requireOwnerAccess = (request: Request) =>
  authorizeOwnerRequest(request, config());
export const requireAgentAccess = (request: Request) =>
  authorizeAgentRequest(request, config());
```

- [ ] **Step 5：保护所有普通数据 API，保留 OpenAPI 公开**

为以下 handler 的第一行加入 `requireOwnerAccess(request)`，并给无参数 GET 增加 `request: Request`：

```ts
const unauthorized = requireOwnerAccess(request);
if (unauthorized) return unauthorized;
```

适用范围：dashboard、problems、reviews、settings、contests GET/POST、transfers、reminders GET/POST、Codeforces GET/POST、import、export。

`app/api/reviews/route.ts` 结构固定为：

```ts
export async function POST(request: Request) {
  const unauthorized = requireOwnerAccess(request);
  return unauthorized ?? recordEvidence(request);
}
```

`app/api/openapi/route.ts` 不加 owner auth。`app/api/agent/*` 继续使用 `requireAgentAccess`。

- [ ] **Step 6：给页面本身加登录/所有者门，不移动客户端页面**

在 `app/chatgpt-auth.ts` 增加环境 import 和完整页面决策：

```ts
import { env } from "cloudflare:workers";
import { isLoopbackHost, normalizeEmail } from "@/lib/auth/access";

export type TrainerPageAccess =
  | { kind: "allowed" }
  | { kind: "forbidden" }
  | { kind: "misconfigured" };

export async function trainerPageAccess(): Promise<TrainerPageAccess> {
  const requestHeaders = await headers();
  const configured = normalizeEmail(
    (env as unknown as { TRAINER_OWNER_EMAIL?: string }).TRAINER_OWNER_EMAIL,
  );
  const host = requestHeaders.get("host") ?? "";
  let hostname = "";
  try {
    hostname = new URL(`http://${host}`).hostname;
  } catch {
    hostname = "";
  }
  if (!configured && isLoopbackHost(hostname)) return { kind: "allowed" };

  const user = await getChatGPTUser();
  if (!user) redirect(chatGPTSignInPath("/"));
  if (!configured) return { kind: "misconfigured" };
  return normalizeEmail(user.email) === configured
    ? { kind: "allowed" }
    : { kind: "forbidden" };
}
```

把 `app/layout.tsx` 改成 async，并在渲染 children 前处理：

```tsx
const access = await trainerPageAccess();
if (access.kind !== "allowed") {
  const misconfigured = access.kind === "misconfigured";
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <main className="mx-auto max-w-xl p-8">
          <h1 className="text-xl font-semibold">
            {misconfigured ? "XCPC Trainer 尚未完成配置" : "无权访问 XCPC Trainer"}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {misconfigured
              ? "请先在 Site 设置 TRAINER_OWNER_EMAIL。"
              : "当前 ChatGPT 账号不是此 Trainer 的所有者。"}
          </p>
        </main>
      </body>
    </html>
  );
}
```

`RootLayout` 本身改为 `export default async function RootLayout(...)`；任何非 allowed 分支都不渲染客户端 Dashboard。

- [ ] **Step 7：验证鉴权 GREEN 和路由覆盖**

Run: `node --test tests/auth.test.mjs`

Expected: 全部通过。

Run: `rg -L "requireOwnerAccess|requireAgentAccess" app/api -g route.ts`

Expected: 只有 `app/api/openapi/route.ts` 未命中鉴权 helper。

Run: `npm test`

Expected: build 和全部测试通过。

- [ ] **Step 8：提交**

```powershell
git add -- lib/auth/access.ts tests/auth.test.mjs lib/agent/auth.ts app/chatgpt-auth.ts app/layout.tsx app/api/dashboard/route.ts app/api/problems/route.ts app/api/reviews/route.ts app/api/settings/route.ts app/api/contests/route.ts app/api/transfers/route.ts app/api/reminders/route.ts app/api/integrations/codeforces/route.ts app/api/import/route.ts app/api/export/route.ts
git commit -m "feat: restrict Trainer data to its owner"
```

---

### Task 4：三个 Actions 与精确 OpenAPI 契约

**Files:**
- Create: `lib/agent/openapi.ts`
- Create: `app/api/agent/mode/route.ts`
- Create: `tests/agent-api.test.mjs`
- Modify: `lib/training/modes.ts`
- Modify: `app/api/agent/context/route.ts`
- Modify: `app/api/agent/evidence/route.ts`
- Modify: `app/api/settings/route.ts`
- Modify: `app/api/openapi/route.ts`

**Interfaces:**
- Consumes: Trainer 权威模式、确定性 queue、Task 2 的安全证据回执。
- Produces: `getTrainingContext`、`setTrainingMode`、`submitTrainingEvidence` 三个 operation；无 mode query override。

- [ ] **Step 1：写精确 Actions 契约测试**

创建 `tests/agent-api.test.mjs`：

```js
import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentOpenApi } from "../lib/agent/openapi.ts";
import { MODE_CONFIG } from "../lib/training/modes.ts";

test("三个模式固定使用 6/4/2 与 3/2/1", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(MODE_CONFIG).map(([key, value]) => [
      key, [value.dailyLimit, value.focusLimit],
    ])),
    { normal: [6, 3], recovery: [4, 2], low_energy: [2, 1] },
  );
});

test("公开 OpenAPI 只暴露三个 Coach operations", () => {
  const api = buildAgentOpenApi("https://trainer.example");
  assert.deepEqual(Object.keys(api.paths).sort(), [
    "/api/agent/context",
    "/api/agent/evidence",
    "/api/agent/mode",
  ]);
  assert.deepEqual(Object.values(api.paths).flatMap((path) =>
    Object.values(path).map((operation) => operation.operationId)
  ).sort(), ["getTrainingContext", "setTrainingMode", "submitTrainingEvidence"]);
});

test("证据 Action 只接受证据字段，不接受排程字段", () => {
  const api = buildAgentOpenApi("https://trainer.example");
  const schema = api.paths["/api/agent/evidence"].post.requestBody
    .content["application/json"].schema;
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties).sort(), [
    "evidence", "helpLevel", "idempotencyKey", "notes", "problemId",
  ]);
  for (const forbidden of ["nextReviewAt", "status", "reviewStage", "cleanStreak", "lapseCount"]) {
    assert.equal(forbidden in schema.properties, false);
  }
});
```

- [ ] **Step 2：运行测试并确认 RED**

Run: `node --test tests/agent-api.test.mjs`

Expected: FAIL，OpenAPI builder 不存在，`focusLimit` 不存在。

- [ ] **Step 3：把建议重点固定在模式配置中**

扩展 `MODE_CONFIG` value type和三个值：

```ts
{ label: string; dailyLimit: number; focusLimit: number; description: string }

normal: { label: "正常", dailyLimit: 6, focusLimit: 3, description: "每天最多安排 6 道到期题。" },
recovery: { label: "恢复", dailyLimit: 4, focusLimit: 2, description: "压缩到 4 道，只处理已有训练债务。" },
low_energy: { label: "低能量", dailyLimit: 2, focusLimit: 1, description: "保留 2 道关键任务，避免彻底中断。" },
```

`app/api/agent/context/route.ts` 增加：

```ts
focusLimit: MODE_CONFIG[mode].focusLimit,
acceptedHelpLevels: ["none", "h1", "h2", "h3", "unknown"],
```

删除 `transferCandidates` 及其专用查询；Action 首版不创建迁移题。保留现有 due 精确投影、policy 和 `clientMaySetReviewDate: false`。

- [ ] **Step 4：抽出可由 owner 与 Agent wrapper 共用的模式写核心**

在 `app/api/settings/route.ts` 把现有数据库逻辑命名导出为：

```ts
export async function updateTrainingMode(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (!isTrainingMode(body.mode)) {
      return Response.json({ error: "无效的训练模式。" }, { status: 400 });
    }
    const db = getDb();
    const now = new Date().toISOString();
    await db.insert(trainingSettings).values({
      id: 1,
      mode: body.mode,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: trainingSettings.id,
      set: { mode: body.mode, updatedAt: now },
    });
    return Response.json({
      mode: body.mode,
      dailyLimit: MODE_CONFIG[body.mode].dailyLimit,
      focusLimit: MODE_CONFIG[body.mode].focusLimit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "设置保存失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
```

owner 路由保持：

```ts
export async function PUT(request: Request) {
  const unauthorized = requireOwnerAccess(request);
  return unauthorized ?? updateTrainingMode(request);
}
```

创建 `app/api/agent/mode/route.ts`：

```ts
import { updateTrainingMode } from "@/app/api/settings/route";
import { requireAgentAccess } from "@/lib/agent/auth";

export async function PUT(request: Request) {
  const unauthorized = requireAgentAccess(request);
  return unauthorized ?? updateTrainingMode(request);
}
```

- [ ] **Step 5：创建纯 OpenAPI builder 并让公开路由复用**

创建 `lib/agent/openapi.ts`，固定：

- `security: [{ bearerAuth: [] }]`
- 三个 paths/operationId
- mode enum `normal|recovery|low_energy`
- evidence/helpLevel enum
- evidence required fields `problemId,evidence,helpLevel,idempotencyKey`
- 所有写 schema `additionalProperties: false`
- 401、403、404、409、500 响应说明
- 证据成功响应只声明 Task 2 的九个白名单字段

导出：

```ts
const modeSchema = { type: "string", enum: ["normal", "recovery", "low_energy"] } as const;
const evidenceSchema = {
  type: "string",
  enum: ["failed", "editorial_understood", "hinted_ac", "independent_ac"],
} as const;
const helpLevelSchema = {
  type: "string",
  enum: ["none", "h1", "h2", "h3", "unknown"],
} as const;
const receiptSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "recorded", "replayed", "attemptId", "problemId", "evidence",
    "helpLevel", "nextStage", "scheduledAt", "scheduleReason",
  ],
  properties: {
    recorded: { type: "boolean" },
    replayed: { type: "boolean" },
    attemptId: { type: "integer" },
    problemId: { type: "integer" },
    evidence: evidenceSchema,
    helpLevel: helpLevelSchema,
    nextStage: { type: "integer" },
    scheduledAt: { type: ["string", "null"] },
    scheduleReason: { type: "string" },
  },
} as const;

export function buildAgentOpenApi(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "XCPC Trainer Coach API",
      version: "0.5.0",
      description: "读取盲做安全队列、显式切换模式并提交服务端排程证据。",
    },
    servers: [{ url: origin }],
    security: [{ bearerAuth: [] }],
    paths: {
      "/api/agent/context": {
        get: {
          operationId: "getTrainingContext",
          summary: "读取当前盲做安全队列",
          responses: {
            "200": { description: "当前模式、队列上限和安全到期题" },
            "401": { description: "缺少或错误的 Bearer" },
            "403": { description: "登录账号不是所有者" },
            "500": { description: "Trainer 读取失败" },
          },
        },
      },
      "/api/agent/mode": {
        put: {
          operationId: "setTrainingMode",
          summary: "持久化用户明确选择的训练模式",
          requestBody: {
            required: true,
            content: { "application/json": { schema: {
              type: "object",
              required: ["mode"],
              additionalProperties: false,
              properties: { mode: modeSchema },
            } } },
          },
          responses: {
            "200": { description: "模式、到期上限和建议重点上限" },
            "400": { description: "无效模式" },
            "401": { description: "缺少或错误的 Bearer" },
            "403": { description: "登录账号不是所有者" },
            "500": { description: "Trainer 写入失败" },
          },
        },
      },
      "/api/agent/evidence": {
        post: {
          operationId: "submitTrainingEvidence",
          summary: "幂等提交一次用户已确认的真实尝试",
          requestBody: {
            required: true,
            content: { "application/json": { schema: {
              type: "object",
              required: ["problemId", "evidence", "helpLevel", "idempotencyKey"],
              additionalProperties: false,
              properties: {
                problemId: { type: "integer", minimum: 1 },
                evidence: evidenceSchema,
                helpLevel: helpLevelSchema,
                notes: { type: "string", maxLength: 4000 },
                idempotencyKey: {
                  type: "string",
                  minLength: 16,
                  maxLength: 128,
                  pattern: "^[A-Za-z0-9._:-]+$",
                },
              },
            } } },
          },
          responses: {
            "200": {
              description: "安全 attempt 回执；重试时 replayed=true",
              content: { "application/json": { schema: receiptSchema } },
            },
            "400": { description: "无效证据或帮助等级" },
            "401": { description: "缺少或错误的 Bearer" },
            "403": { description: "登录账号不是所有者" },
            "404": { description: "题目不存在" },
            "409": { description: "相同 key 携带不同 payload" },
            "500": { description: "Trainer 写入失败" },
          },
        },
      },
    },
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
    },
  } as const;
}
```

`app/api/openapi/route.ts` 收敛为：

```ts
import { buildAgentOpenApi } from "@/lib/agent/openapi";

export async function GET(request: Request) {
  return Response.json(buildAgentOpenApi(new URL(request.url).origin));
}
```

- [ ] **Step 6：验证 Actions 契约 GREEN**

Run: `node --test tests/agent-api.test.mjs tests/projection.test.mjs tests/evidence.test.mjs`

Expected: 全部通过。

Run: `npm test`

Expected: build 成功，全部测试通过。

- [ ] **Step 7：提交**

```powershell
git add -- lib/agent/openapi.ts app/api/agent/mode/route.ts tests/agent-api.test.mjs lib/training/modes.ts app/api/agent/context/route.ts app/api/agent/evidence/route.ts app/api/settings/route.ts app/api/openapi/route.ts
git commit -m "feat: expose three Coach actions"
```

---

### Task 5：专用 GPT 指令、部署与首条真实闭环

**Files:**
- Create: `docs/chatgpt/xcpc-coach-setup.md`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/project-state.md`

**Interfaces:**
- Consumes: 生产 Site URL、`TRAINER_OWNER_EMAIL`、`AGENT_API_KEY`、`GET /api/openapi`。
- Produces: 可复制到 Custom GPT 的中文 Coach 指令、Action 配置和可复现冒烟步骤。

- [ ] **Step 1：写专用 GPT 的完整行为指令**

创建 `docs/chatgpt/xcpc-coach-setup.md`，指令必须逐条包含：

```text
你是 XCPC Trainer 的 Coach，不是排程事实源。
训练模式只在用户明确说出 normal/recovery/low_energy 或中文对应模式时调用 setTrainingMode；不得推断模式。
开始训练先调用 getTrainingContext，只使用 due 白名单；不得询问或引用旧 notes、题解、算法标签、迁移来源或 Vault。
每次只推进一题，先让用户说明模型、复杂度或精确卡点；用户请求帮助时每轮最多升级一级 H1→H2→H3。
当前会话已出现主要解法时，必须说明本次不是盲做。
提交前展示题目、evidence、helpLevel、notes，并等待用户明确确认。
AC + none + 能可靠解释才是 independent_ac；读题解后 AC 必须是 hinted_ac+h3；未 AC 但理解主解才是 editorial_understood；蒙对或无法解释记 failed。
一次真实尝试生成一个 UUID idempotencyKey；网络重试复用完全相同 key 和 payload，最多一次。409 时停止，不生成新 key 掩盖冲突。
成功后只复述 Action 回执，再刷新 getTrainingContext；不得自行计算 nextReviewAt。
401/403 停止并提示检查配置；404 刷新上下文；用户取消时不调用写 Action。
```

同一文档写明 GPT 编辑器配置：Authentication 选择 API Key/Bearer，schema URL 使用部署站点的 `/api/openapi`，不把 key 粘贴进 Instructions。

- [ ] **Step 2：更新项目使用与架构文档**

README 增加“ChatGPT 网页 Coach”最短流程：

```text
部署并应用 0005 → 设置两个 secrets → 导入 /api/openapi → 粘贴 Coach 指令 → 先做脱敏冒烟
```

`docs/architecture.md` 记录 Trainer/Coach 单向边界、三个 Actions 和 owner/Bearer 两种鉴权；`docs/project-state.md` 把导出基线更新为 v5、导入更新为 v1-v5、migration 更新为 `0000`-`0005`。不得写入真实 email、key、Site URL 或旧训练内容。

- [ ] **Step 3：运行部署前完整验证**

Run: `npm test`

Expected: build 成功，全部测试通过。

Run: `npm run lint`

Expected: exit 0。

Run: `npm run db:migrate:local`

Expected: 无待应用 migration。

Run: `git diff --check`

Expected: exit 0。

- [ ] **Step 4：先备份远程数据，再应用远程 `0005`**

在现有 Site 的所有者会话下载 v4 JSON 备份并确认文件可被本分支 dry-run。然后使用 Site/Cloudflare 的项目 migration 入口对绑定 `DB` 应用 `0005_evidence_integrity`；不得用 `wrangler.local.jsonc` 的占位 database ID 操作远程库。

验证远程 migration journal 只比原来多 `0005_evidence_integrity`，旧 `0000`-`0004` checksum 不变。

- [ ] **Step 5：在 Site 设置两个 secret，不在终端输出 key**

`TRAINER_OWNER_EMAIL` 使用当前 ChatGPT 登录账号的精确 email。`AGENT_API_KEY` 使用密码学随机 32 bytes 生成并直接存入密码管理器和 GPT Action 配置；不写入 `.env`、Git、D1、notes、对话 Instructions 或命令历史。

Site 设置完成后重新部署。用所有者账号访问 Dashboard 应成功；未登录应进入 Sign in with ChatGPT；另一登录账号应看到 403/无权页。

- [ ] **Step 6：创建专用 GPT 并完成脱敏冒烟**

在 ChatGPT GPT 编辑器：

1. 名称使用“XCPC Trainer Coach”。
2. Instructions 使用本 Task 文档中的完整指令。
3. 从 Site 部署结果复制站点 origin，在其后追加 `/api/openapi` 后导入 Action；不手写或猜测域名。
4. Authentication 选择 Bearer API Key，并从密码管理器粘贴 `AGENT_API_KEY`。
5. 不上传旧题解、Vault 或旧“训练控制台”作为 Knowledge。

手工流程：明确切换低能量模式 → 读取最多 2 项/重点最多 1 项 → 选择脱敏题 → 请求 H1 → 确认证据 → 模拟同 key 重试 → Dashboard 验证只新增一条 attempt。全部通过后才处理真实队列。

- [ ] **Step 7：提交文档**

```powershell
git add -- docs/chatgpt/xcpc-coach-setup.md README.md docs/architecture.md docs/project-state.md
git commit -m "docs: add ChatGPT Coach setup"
```

此提交是“初版可用”检查点；Task 6 的历史迁移不阻塞日常训练。

---

## 里程碑二：融合旧训练档案

### Task 6：旧训练卡转换与单批次 v5 导入

**Files:**
- Create: `scripts/legacy-training-cards.mjs`
- Create: `tests/legacy-training-cards.test.mjs`
- Create: `lib/data/import-plan.ts`
- Modify: `lib/data/import.ts`
- Modify: `app/api/import/route.ts`
- Modify: `tests/data-portability.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: 含 `[TRAINING_CARD]...[/TRAINING_CARD]` 的 UTF-8 Markdown；已校验 v5 bundle；现有 contest/problem/attempt identities。
- Produces: `parseTrainingCards(markdown)`、`buildLegacyBackup(cards,options)`、`buildImportPlan(bundle,existing)`；一个可由现有 Dashboard dry-run/import 的 v5 JSON。

- [ ] **Step 1：写旧训练卡解析、映射、去重和温和激活测试**

创建 `tests/legacy-training-cards.test.mjs`，fixture 至少包含同题两次尝试、H0、H2、旧 `nextReview` 和一条无 URL 记录：

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLegacyBackup,
  parseTrainingCards,
} from "../scripts/legacy-training-cards.mjs";

const SOURCE = `
[TRAINING_CARD]
recordable: 是
date: 2026-08-21
problem: Twin Permutations
platform: Codeforces
url: https://codeforces.com/problemset/problem/1831/A
source: 比赛
result: 提示后AC
hintLevel: H1
blocker: 建模
trigger: 先尝试构造更强条件
nextReview: 2026-08-24
fullNote: 否
evidence: H1 后独立推出构造并 AC。
inference: 无
[/TRAINING_CARD]
[TRAINING_CARD]
recordable: 是
date: 2026-08-25
problem: Twin Permutations
platform: Codeforces
url: https://codeforces.com/problemset/problem/1831/A/
source: 到期复习
result: 独立AC
hintLevel: H0
blocker: 无
trigger: 构造互补排列
nextReview: 不安排
fullNote: 否
evidence: 未使用提示并能解释正确性。
inference: 无
[/TRAINING_CARD]`;

test("同 URL 的多张卡合并为一题和多条仅追加 attempts", () => {
  const backup = buildLegacyBackup(parseTrainingCards(SOURCE), {
    sourceId: "training-console",
    importDate: "2026-08-31",
  });
  assert.equal(backup.version, 5);
  assert.equal(backup.problems.length, 1);
  assert.equal(backup.attempts.length, 2);
  assert.deepEqual(backup.attempts.map((item) => [item.evidence, item.helpLevel]), [
    ["hinted_ac", "h1"],
    ["independent_ac", "none"],
  ]);
  assert.equal(new Set(backup.attempts.map((item) => item.idempotencyKey)).size, 2);
  assert.equal(backup.problems[0].nextReviewAt, "2026-08-30T16:00:00.000Z");
  assert.doesNotMatch(JSON.stringify(backup), /2026-08-24/);
});

test("无 URL 或同 URL 题名冲突进入报告且不自动导入", () => {
  const cards = parseTrainingCards(SOURCE + SOURCE.replace(
    "https://codeforces.com/problemset/problem/1831/A",
    "",
  ));
  const backup = buildLegacyBackup(cards, {
    sourceId: "training-console",
    importDate: "2026-08-31",
  });
  assert.ok(backup.legacyImportReport.reviewRequired.length >= 1);
});
```

再增加四题 fixture，断言首次日期顺序为：最新 `failed` → `editorial_understood` → `hinted_ac` → `independent_ac`，且每个上海自然日最多一题；同结果按 H3→H2→H1→none→unknown、旧日期、URL/平台/题名决胜。

- [ ] **Step 2：写“已有题只追加缺失 v5 attempts”的导入计划测试**

在 `tests/data-portability.test.mjs` 增加：

```js
import { buildImportPlan } from "../lib/data/import-plan.ts";

function v5Backup() {
  const backup = structuredClone(BASE_BACKUP);
  backup.version = 5;
  backup.attempts[0].helpLevel = "h1";
  backup.attempts[0].idempotencyKey =
    "018f0f66-7a28-7e31-8a4d-a70b93879a11";
  return backup;
}

test("v5 已有题保留当前投影并只追加缺失的幂等 attempt", () => {
  const bundle = parseImportBundle(v5Backup());
  const plan = buildImportPlan(bundle, {
    contests: [],
    problems: [{
      id: 42,
      title: bundle.problems[0].title,
      url: bundle.problems[0].url,
      platform: bundle.problems[0].platform,
    }],
    attempts: [],
    hasSettings: true,
    maxContestId: 0,
    maxProblemId: 42,
  });
  assert.equal(plan.problems.length, 0);
  assert.equal(plan.attempts.length, bundle.attempts.length);
  assert.ok(plan.attempts.every((attempt) => attempt.problemId === 42));
  assert.deepEqual(plan.settings, []);
});

test("同 key 同 payload 跳过，不同 payload 冲突", () => {
  const bundle = parseImportBundle(v5Backup());
  const problem = bundle.problems[0];
  const attempt = bundle.attempts[0];
  const existing = {
    contests: [],
    problems: [{
      id: 42,
      title: problem.title,
      url: problem.url,
      platform: problem.platform,
    }],
    attempts: [{
      problemId: 42,
      evidence: attempt.evidence,
      helpLevel: attempt.helpLevel,
      notes: attempt.notes,
      idempotencyKey: attempt.idempotencyKey,
    }],
    hasSettings: true,
    maxContestId: 0,
    maxProblemId: 42,
  };
  const same = buildImportPlan(bundle, existing);
  assert.equal(same.attempts.length, 0);
  assert.equal(same.preview.attempts.skip, 1);

  const conflicting = structuredClone(existing);
  conflicting.attempts[0].helpLevel = "h2";
  assert.throws(
    () => buildImportPlan(bundle, conflicting),
    /幂等键冲突/,
  );
});
```

- [ ] **Step 3：运行两个测试文件并确认 RED**

Run: `node --test tests/legacy-training-cards.test.mjs tests/data-portability.test.mjs`

Expected: FAIL，转换器和 `buildImportPlan` 尚不存在。

- [ ] **Step 4：实现无依赖的训练卡转换器**

创建 `scripts/legacy-training-cards.mjs`，只使用 Node 标准库和现有 `afterShanghaiDays`：

```js
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterShanghaiDays } from "../lib/training/scheduler.ts";

const BLOCK = /\[TRAINING_CARD\]([\s\S]*?)\[\/TRAINING_CARD\]/g;
const EVIDENCE_PRIORITY = {
  failed: 0,
  editorial_understood: 1,
  hinted_ac: 2,
  independent_ac: 3,
};
const HELP_PRIORITY = { h3: 0, h2: 1, h1: 2, none: 3, unknown: 4 };

export function parseTrainingCards(markdown) {
  return [...markdown.matchAll(BLOCK)].map((match, index) => {
    const fields = {};
    for (const line of match[1].split(/\r?\n/)) {
      const colon = line.indexOf(":");
      if (colon > 0) fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
    return { index, ...fields };
  }).filter((card) => card.recordable === "是");
}

function normalizedUrl(value) {
  return (value ?? "").trim().replace(/\/$/, "").toLowerCase();
}

function normalizedTitle(value) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function platform(value) {
  const text = value ?? "";
  if (/codeforces/i.test(text)) return "codeforces";
  if (/牛客|nowcoder/i.test(text)) return "nowcoder";
  if (/atcoder/i.test(text)) return "atcoder";
  if (/洛谷|luogu/i.test(text)) return "luogu";
  return "other";
}

function mapAttempt(card) {
  const helpLevel = ({ H0: "none", H1: "h1", H2: "h2", H3: "h3" })[card.hintLevel]
    ?? "unknown";
  const evidence = card.result === "独立AC" && helpLevel === "none"
    ? "independent_ac"
    : card.result === "提示后AC"
      ? "hinted_ac"
      : card.result === "看懂未独立完成"
        ? "editorial_understood"
        : "failed";
  const notes = [
    ["source", card.source],
    ["blocker", card.blocker],
    ["trigger", card.trigger],
    ["evidence", card.evidence],
    ["inference", card.inference],
  ].filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join("\n");
  return { evidence, helpLevel, notes };
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function shanghaiInstant(date, hour = "12") {
  const instant = new Date(`${date}T${hour}:00:00+08:00`);
  if (Number.isNaN(instant.getTime())) throw new Error(`无效训练日期：${date}`);
  return instant.toISOString();
}

export function buildLegacyBackup(cards, { sourceId, importDate }) {
  if (!sourceId?.trim()) throw new Error("缺少 sourceId。");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(importDate)) throw new Error("importDate 必须为 YYYY-MM-DD。");

  const reviewRequired = [];
  const groups = new Map();
  for (const card of cards) {
    const url = normalizedUrl(card.url);
    if (!url || !card.problem?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(card.date ?? "")) {
      reviewRequired.push({ index: card.index, reason: "缺少 URL、题名或有效日期" });
      continue;
    }
    const list = groups.get(url) ?? [];
    list.push(card);
    groups.set(url, list);
  }

  const accepted = [];
  for (const [url, group] of groups) {
    const titles = new Set(group.map((card) => normalizedTitle(card.problem)));
    if (titles.size !== 1) {
      reviewRequired.push({
        indexes: group.map((card) => card.index),
        reason: "同 URL 出现冲突题名",
        url,
      });
      continue;
    }
    const mapped = group
      .map((card) => ({ card, ...mapAttempt(card) }))
      .sort((left, right) => left.card.date.localeCompare(right.card.date) ||
        left.card.index - right.card.index);
    accepted.push({ url, cards: mapped, latest: mapped.at(-1) });
  }

  accepted.sort((left, right) =>
    EVIDENCE_PRIORITY[left.latest.evidence] - EVIDENCE_PRIORITY[right.latest.evidence] ||
    HELP_PRIORITY[left.latest.helpLevel] - HELP_PRIORITY[right.latest.helpLevel] ||
    left.cards[0].card.date.localeCompare(right.cards[0].card.date) ||
    left.url.localeCompare(right.url) ||
    platform(left.cards[0].card.platform).localeCompare(platform(right.cards[0].card.platform)) ||
    normalizedTitle(left.cards[0].card.problem).localeCompare(
      normalizedTitle(right.cards[0].card.problem),
    )
  );

  const importedAt = new Date(`${importDate}T00:00:00+08:00`);
  const problems = [];
  const attempts = [];
  for (const [rank, group] of accepted.entries()) {
    const sourceProblemId = rank + 1;
    const first = group.cards[0].card;
    const latest = group.latest;
    const occurrences = new Map();
    problems.push({
      id: sourceProblemId,
      contestId: null,
      title: first.problem.trim(),
      url: group.url,
      platform: platform(first.platform),
      origin: first.source === "比赛" ? "contest" : "practice",
      status: "review",
      reviewStage: 0,
      cleanStreak: 0,
      lapseCount: 0,
      trainingRole: "core",
      validatesProblemId: null,
      transferIntegrity: "not_applicable",
      nextReviewAt: afterShanghaiDays(importedAt, rank),
      lastEvidence: latest.evidence,
      notes: "旧训练控制台一次性导入；旧排程已忽略。",
      createdAt: shanghaiInstant(group.cards[0].card.date),
      updatedAt: shanghaiInstant(latest.card.date),
    });
    for (const item of group.cards) {
      const canonical = [
        sourceId,
        group.url,
        item.card.date,
        item.evidence,
        item.helpLevel,
        item.notes,
      ].join("\n");
      const occurrence = occurrences.get(canonical) ?? 0;
      occurrences.set(canonical, occurrence + 1);
      attempts.push({
        problemId: sourceProblemId,
        context: "legacy_chat_import",
        evidence: item.evidence,
        helpLevel: item.helpLevel,
        idempotencyKey: sha256(`${canonical}\n${occurrence}`),
        previousStage: 0,
        nextStage: 0,
        scheduledAt: null,
        scheduleReason: "历史档案导入，不重放旧排程。",
        notes: item.notes,
        attemptedAt: shanghaiInstant(item.card.date),
      });
    }
  }

  return {
    format: "xcpc-trainer-export",
    version: 5,
    exportedAt: new Date().toISOString(),
    settings: {
      mode: "normal",
      timezone: "Asia/Shanghai",
      reminderTime: "20:30",
    },
    contests: [],
    problems,
    attempts,
    legacyImportReport: {
      cardCount: cards.length,
      acceptedProblems: problems.length,
      acceptedAttempts: attempts.length,
      reviewRequired,
    },
  };
}

function options(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    result[argv[index]?.replace(/^--/, "")] = argv[index + 1];
  }
  return result;
}

async function main() {
  const args = options(process.argv.slice(2));
  if (!args.source || !args.out || !args["source-id"] || !args["import-date"]) {
    throw new Error("需要 --source、--out、--source-id 和 --import-date。");
  }
  const output = resolve(args.out);
  await access(output).then(
    () => { throw new Error(`拒绝覆盖已有文件：${output}`); },
    () => undefined,
  );
  const markdown = await readFile(resolve(args.source), "utf8");
  const backup = buildLegacyBackup(parseTrainingCards(markdown), {
    sourceId: args["source-id"],
    importDate: args["import-date"],
  });
  await writeFile(output, `${JSON.stringify(backup, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(backup.legacyImportReport, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
```

该实现把幂等 key 固定为 SHA-256 十六进制摘要：`sourceId + 规范化 URL + date + evidence + helpLevel + notes + 同内容出现序号`。notes 只保存 source、blocker、trigger、evidence、inference；完全不读取 `nextReview`、S0-S4 或旧状态。

CLI 参数固定为：

```powershell
node scripts/legacy-training-cards.mjs --source $sourceFile --out $backupFile --source-id training-console --import-date 2026-08-31
```

只有用户显式提供的路径会写入；脚本拒绝覆盖已存在的输出文件。

- [ ] **Step 5：实现纯导入计划，保留现有题投影**

创建 `lib/data/import-plan.ts`：

```ts
import {
  contestIdentity,
  problemIdentity,
  type ImportBundle,
} from "./import.ts";

type ExistingContest = {
  id: number;
  title: string;
  contestUrl: string;
  startedAt: string;
};
type ExistingProblem = {
  id: number;
  title: string;
  url: string;
  platform: string;
};
type ExistingAttempt = {
  problemId: number;
  evidence: string;
  helpLevel: string;
  notes: string;
  idempotencyKey: string | null;
};

export function buildImportPlan(bundle: ImportBundle, existing: {
  contests: ExistingContest[];
  problems: ExistingProblem[];
  attempts: ExistingAttempt[];
  hasSettings: boolean;
  maxContestId: number;
  maxProblemId: number;
}, now = new Date().toISOString()) {
  const existingContestByKey = new Map(
    existing.contests.map((row) => [contestIdentity(row), row.id]),
  );
  const contestIds = new Map<number, number>();
  const contestRows = [];
  let nextContestId = existing.maxContestId;
  for (const contest of bundle.contests) {
    const found = existingContestByKey.get(contestIdentity(contest));
    const id = found ?? ++nextContestId;
    contestIds.set(contest.sourceId, id);
    if (found) continue;
    contestRows.push({
      id,
      title: contest.title,
      platform: contest.platform,
      contestUrl: contest.contestUrl,
      startedAt: contest.startedAt,
      durationMinutes: contest.durationMinutes,
      status: contest.status,
      notes: contest.notes,
      createdAt: contest.createdAt,
    });
  }

  const existingProblemByKey = new Map(
    existing.problems.map((row) => [problemIdentity(row), row.id]),
  );
  const problemIds = new Map<number, number>();
  const createdProblemSources = new Set<number>();
  let nextProblemId = existing.maxProblemId;
  for (const problem of bundle.problems) {
    const found = existingProblemByKey.get(problemIdentity(problem));
    const id = found ?? ++nextProblemId;
    problemIds.set(problem.sourceId, id);
    if (!found) createdProblemSources.add(problem.sourceId);
  }

  const problemRows = bundle.problems
    .filter((problem) => createdProblemSources.has(problem.sourceId))
    .map((problem) => ({
      id: problemIds.get(problem.sourceId)!,
      contestId: problem.sourceContestId
        ? (contestIds.get(problem.sourceContestId) ?? null)
        : null,
      title: problem.title,
      url: problem.url,
      platform: problem.platform,
      origin: problem.origin,
      status: problem.status,
      reviewStage: problem.reviewStage,
      cleanStreak: problem.cleanStreak,
      lapseCount: problem.lapseCount,
      trainingRole: problem.trainingRole,
      validatesProblemId: problem.sourceValidatesProblemId
        ? (problemIds.get(problem.sourceValidatesProblemId) ?? null)
        : null,
      transferIntegrity: problem.transferIntegrity,
      nextReviewAt: problem.nextReviewAt,
      lastEvidence: problem.lastEvidence,
      notes: problem.notes,
      createdAt: problem.createdAt,
      updatedAt: problem.updatedAt,
    }));

  const existingAttemptByKey = new Map(
    existing.attempts
      .filter((row) => row.idempotencyKey !== null)
      .map((row) => [row.idempotencyKey!, row]),
  );
  const attemptRows = [];
  let skippedAttempts = 0;
  for (const attempt of bundle.attempts) {
    const problemId = problemIds.get(attempt.sourceProblemId);
    if (!problemId) throw new Error("导入尝试找不到目标题目。");
    const found = attempt.idempotencyKey
      ? existingAttemptByKey.get(attempt.idempotencyKey)
      : undefined;
    if (found) {
      const same = found.problemId === problemId &&
        found.evidence === attempt.evidence &&
        found.helpLevel === attempt.helpLevel &&
        found.notes.trim() === attempt.notes.trim();
      if (!same) throw new Error("幂等键冲突：已有 attempt 内容不同。");
      skippedAttempts += 1;
      continue;
    }
    if (!attempt.idempotencyKey && !createdProblemSources.has(attempt.sourceProblemId)) {
      skippedAttempts += 1;
      continue;
    }
    attemptRows.push({
      problemId,
      context: attempt.context,
      evidence: attempt.evidence,
      helpLevel: attempt.helpLevel,
      idempotencyKey: attempt.idempotencyKey,
      previousStage: attempt.previousStage,
      nextStage: attempt.nextStage,
      scheduledAt: attempt.scheduledAt,
      scheduleReason: attempt.scheduleReason,
      notes: attempt.notes,
      attemptedAt: attempt.attemptedAt,
    });
  }

  const settingsRows = existing.hasSettings ? [] : [{
    id: 1,
    mode: bundle.settings.mode,
    timezone: bundle.settings.timezone,
    reminderTime: bundle.settings.reminderTime,
    updatedAt: now,
  }];
  const preview = {
    version: bundle.version,
    contests: {
      add: contestRows.length,
      skip: bundle.contests.length - contestRows.length,
    },
    problems: {
      add: problemRows.length,
      skip: bundle.problems.length - problemRows.length,
    },
    attempts: { add: attemptRows.length, skip: skippedAttempts },
    settings: existing.hasSettings ? { add: 0, skip: 1 } : { add: 1, skip: 0 },
  };
  return {
    preview,
    contests: contestRows,
    problems: problemRows,
    attempts: attemptRows,
    settings: settingsRows,
  };
}
```

这里的数组元素是完整 Drizzle insert row，不返回数据库 statement。显式 ID 只服务于同一 D1 batch 中的外键映射；若并发写入造成主键冲突，整个 batch 回滚，重新 dry-run 后再导入。

- [ ] **Step 6：让 `/api/import` 先完整计划，再用一个 D1 batch 写入**

`app/api/import/route.ts` 一次读取：现有 contests/problems、所有非空 idempotency attempts、settings 是否存在，以及 contest/problem 的 max ID。调用 `buildImportPlan` 后：

```ts
if (dryRun) return Response.json({ dryRun: true, preview: plan.preview });

const statements = [
  ...plan.contests.map((row) => db.insert(contests).values(row)),
  ...plan.problems.map((row) => db.insert(problems).values(row)),
  ...plan.attempts.map((row) => db.insert(attempts).values(row)),
  ...plan.settings.map((row) => db.insert(trainingSettings).values(row)),
];
if (statements.length > 0) {
  await db.batch(
    statements as [typeof statements[number], ...Array<typeof statements[number]>],
  );
}
return Response.json({ dryRun: false, imported: plan.preview });
```

所有 key/payload 冲突必须在构造 statements 前抛出，因此没有部分写入。删除旧的逐行 insert/update 循环；`validatesProblemId` 在 `buildImportPlan` 中使用显式目标 problem ID 一次写好。

- [ ] **Step 7：验证转换器与原子导入计划 GREEN**

Run: `node --test tests/legacy-training-cards.test.mjs tests/data-portability.test.mjs`

Expected: 全部通过。

Run: `npm test`

Expected: build 成功，全部测试通过。

- [ ] **Step 8：只读提取旧对话并生成本地迁移预览**

使用 Codex 的任务读取能力只读读取“acm复习训练 / 训练控制台”，把包含训练卡的消息内容保存到系统临时目录，不写入仓库。运行转换器生成同目录 v5 JSON，记录：卡片总数、自动导入题数、attempt 数、歧义数和首次 7 天激活题目。

把 `legacyImportReport.reviewRequired` 与前 7 天队列展示给用户复核。用户未确认前不上传备份；原对话不删除、不修改。

- [ ] **Step 9：通过现有 Dashboard dry-run/import 执行一次性迁移**

先在 Dashboard 选择生成的 v5 JSON 并只执行 dry-run。确认：

- 已有问题数量只计入 skip，当前状态和日期不会变化。
- 已有题缺失历史只计入 attempts add。
- 新题的首次日期每天最多一题。
- settings 为 skip。
- 歧义记录未出现在待写入集合。

用户确认后执行正式导入。导出新的 v5 备份，验证每个 synthetic key 恰好一条；重复 dry-run 同一文件应显示所有 attempts skip、无冲突。临时明文文件的位置明确告知用户，得到确认后再清理。

- [ ] **Step 10：更新一次性迁移说明并提交**

README 增加转换命令、dry-run、歧义报告和“旧 nextReview 永不导入”的说明。

```powershell
git add -- scripts/legacy-training-cards.mjs tests/legacy-training-cards.test.mjs lib/data/import-plan.ts lib/data/import.ts app/api/import/route.ts tests/data-portability.test.mjs README.md
git commit -m "feat: migrate legacy training cards safely"
```

---

### Task 7：最终回归、远程安全检查与交付

**Files:**
- Modify: `docs/project-state.md`（只在历史迁移真实完成后记录结果）
- Verify: all files changed by Tasks 1-6

**Interfaces:**
- Consumes: 两个里程碑的提交、远程 Site、专用 GPT、迁移后的 v5 备份。
- Produces: 可复现的交付证据和干净工作树。

- [ ] **Step 1：运行完整自动验证**

Run: `npm test`

Expected: build 成功，全部 Node tests 通过。

Run: `npm run lint`

Expected: exit 0。

Run: `npm run db:migrate:local`

Expected: 无待应用 migration。

Run: `git diff --check`

Expected: exit 0。

Run: `git status --short`

Expected: 只包含尚未提交的 `docs/project-state.md`，不包含临时训练卡或备份 JSON。

- [ ] **Step 2：运行远程鉴权与 Action 冒烟矩阵**

逐项记录实际 HTTP 结果：

1. 未登录 Dashboard：进入 Sign in with ChatGPT，不显示数据。
2. 非所有者：403/无权页。
3. 所有者：Dashboard 与普通 APIs 可用。
4. 错误 Bearer：Agent API 401。
5. 正确 Bearer：三个 Actions 可用。
6. OpenAPI 匿名可读，但只有三个 paths。
7. 相同 key 同 payload：第二次 `replayed=true`，attempt 数不变。
8. 相同 key 不同 payload：409，problem 投影不变。
9. Agent context 的 `due` keys 与精确白名单完全相等。

- [ ] **Step 3：验证数据兼容与旧历史结果**

用 v4 备份执行 dry-run，Expected: 可导入，旧 attempts 映射为 `unknown/null`。用最新 v5 备份执行 dry-run，Expected: 无冲突。检查旧训练控制台导入报告中的所有自动项和歧义项总数等于可识别卡片总数；未导入歧义仍可在原对话追溯。

- [ ] **Step 4：记录真实完成状态并提交**

`docs/project-state.md` 只写可核验事实：远程 migration 是否为 `0000`-`0005`、三个 Actions 是否冒烟通过、历史迁移实际新增题数/attempt 数/歧义数；不写 email、key、题目 notes 或备份路径。

```powershell
git add -- docs/project-state.md
git commit -m "docs: record ChatGPT Coach rollout"
```

- [ ] **Step 5：最终核对分支**

Run: `git log --oneline -9`

Expected: 包含本计划提交以及 Tasks 1-7 的独立提交。

Run: `git status --short`

Expected: 无输出。

Run: `git diff --name-only HEAD~7..HEAD | rg "legacy.*\.(json|txt|md)$"`

Expected: 不出现用户训练数据文件；只允许通用脚本、测试 fixture 和文档。
