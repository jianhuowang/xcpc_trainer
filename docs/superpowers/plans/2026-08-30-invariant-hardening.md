# XCPC Trainer 核心约束加固实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可在原生 Windows 与 POSIX 环境运行、且核心训练约束可由自动化测试证明的 XCPC Trainer 初版。

**Architecture:** 保留现有 D1 schema、路由与确定性排程器，只在现有边界上补最小纯函数：一个 Node 命令入口、一个稳定态证据决策函数、两个盲做投影函数和一个设置合并预览函数。所有消费者复用这些纯函数，不引入新依赖或第二套状态机。

**Tech Stack:** Node.js 22、TypeScript、React 19、Vinext、Drizzle ORM、Node 内置测试框架、ESLint。

## 全局约束

- 排程间隔保持失败 1 天、题解 2 天、提示 3 天、连续独立完成 3/7/21/45 天。
- 正常、恢复、低能量模式上限保持 6/4/2。
- 盲做响应不得包含 notes、算法标签、题解、历史解法、迁移来源或 `transferIntegrity`。
- 客户端不得提交任意日期、阶段、连续次数、状态或迁移完整性。
- 导出保持 v4，导入继续兼容 v1-v4。
- 不修改 `db/schema.ts`、`drizzle/0000`-`0004` 或既有快照；不生成新 migration。
- 不新增 npm 依赖；优先使用 Node 标准库和现有包的 `bin` 入口。
- 中文是界面与文档主语言，代码标识符保持英文。
- 所有生产行为变更先写失败测试，再写最小实现。

---

### Task 1：原生 Windows 与 POSIX npm 命令入口

**Files:**
- Create: `scripts/project-command.mjs`
- Create: `tests/project-command.test.mjs`
- Modify: `package.json`
- Preserve: `scripts/sites-env.sh`
- Preserve: `scripts/build-verified.sh`
- Preserve: `scripts/install-ci.sh`

**Interfaces:**
- Consumes: `process.env.npm_execpath`、各包 `package.json.bin`、现有 `.sites-runtime/` 忽略规则。
- Produces: `node scripts/project-command.mjs <install:ci|dev|build|start|lint|db:generate>`；子进程退出码原样返回，build 默认 180 秒超时。

- [ ] **Step 1: 写入会在旧 `package.json` 上失败的命令契约测试**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("npm 工作流统一通过跨平台 Node 入口执行", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(packageJson.scripts["install:ci"], "node scripts/project-command.mjs install:ci");
  assert.equal(packageJson.scripts.dev, "node scripts/project-command.mjs dev");
  assert.equal(packageJson.scripts.build, "node scripts/project-command.mjs build");
  assert.equal(packageJson.scripts.start, "node scripts/project-command.mjs start");
  assert.equal(packageJson.scripts.lint, "node scripts/project-command.mjs lint");
  assert.equal(packageJson.scripts["db:generate"], "node scripts/project-command.mjs db:generate");
  assert.equal(packageJson.scripts.test, "npm run build && node --test");
  assert.doesNotMatch(Object.values(packageJson.scripts).join("\n"), /\bbash\b/);
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node --test tests/project-command.test.mjs`

Expected: FAIL，`install:ci` 实际仍为 `bash scripts/install-ci.sh`。

- [ ] **Step 3: 添加单一 Node 命令入口并切换 npm scripts**

```js
#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2];
const extraArgs = process.argv.slice(3);
const commands = {
  dev: { packageName: "vite", binName: "vite", args: [] },
  build: { packageName: "vinext", binName: "vinext", args: ["build"], timeout: true },
  start: { packageName: "vinext", binName: "vinext", args: ["start"] },
  lint: {
    packageName: "eslint",
    binName: "eslint",
    args: [".", "--ignore-pattern", "dist", "--ignore-pattern", ".next"],
  },
  "db:generate": { packageName: "drizzle-kit", binName: "drizzle-kit", args: ["generate"] },
};

function durationMs(value, fallback) {
  const match = /^(\d+)(ms|s|m)?$/.exec(value ?? "");
  if (!match) return fallback;
  return Number(match[1]) * ({ ms: 1, s: 1000, m: 60_000 }[match[2] ?? "ms"]);
}

async function projectEnvironment() {
  const runtimeRoot = resolve(process.env.SITES_RUNTIME_ROOT ?? join(projectRoot, ".sites-runtime"));
  const paths = ["home", "npm-cache", "xdg-config", "tmp", "wrangler/logs"];
  await Promise.all(paths.map((path) => mkdir(join(runtimeRoot, path), { recursive: true })));
  const env = { ...process.env };
  for (const key of [
    "NPM_CONFIG_CACHE", "npm_config_cache", "npm_config_proxy", "npm_config_http_proxy",
    "npm_config_https_proxy", "NPM_CONFIG_PROXY", "NPM_CONFIG_HTTP_PROXY", "NPM_CONFIG_HTTPS_PROXY",
  ]) delete env[key];
  return {
    ...env,
    SITES_ENV_READY: "1",
    SITES_PROJECT_ROOT: projectRoot,
    SITES_RUNTIME_HOME: join(runtimeRoot, "home"),
    XDG_CONFIG_HOME: join(runtimeRoot, "xdg-config"),
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_LOG_PATH: join(runtimeRoot, "wrangler/logs"),
    MINIFLARE_REGISTRY_PATH: join(runtimeRoot, "wrangler/registry"),
    npm_config_cache: join(runtimeRoot, "npm-cache"),
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
  };
}

async function localBin(packageName, binName) {
  const packagePath = join(projectRoot, "node_modules", packageName, "package.json");
  let packageJson;
  try {
    packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  } catch {
    throw new Error(`${binName} 不可用，请先运行 npm ci。`);
  }
  const relativeBin = typeof packageJson.bin === "string" ? packageJson.bin : packageJson.bin?.[binName];
  if (!relativeBin) throw new Error(`${binName} 不可用，请先运行 npm ci。`);
  return join(dirname(packagePath), relativeBin);
}

function run(executable, args, env, timeoutMs = 0) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { cwd: projectRoot, env, stdio: "inherit" });
    let timedOut = false;
    const timer = timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          child.kill();
        }, timeoutMs)
      : null;
    child.once("error", reject);
    child.once("exit", (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) console.error(`命令运行超过 ${timeoutMs}ms，已终止。`);
      resolvePromise(timedOut ? 124 : (code ?? 1));
    });
  });
}

async function main() {
  const env = await projectEnvironment();
  if (command === "install:ci") {
    if (!process.env.npm_execpath) throw new Error("无法定位 npm CLI。");
    return run(process.execPath, [process.env.npm_execpath, "ci", "--cache", env.npm_config_cache], env);
  }
  const spec = commands[command];
  if (!spec) throw new Error(`未知项目命令：${command ?? "(missing)"}`);
  const executable = await localBin(spec.packageName, spec.binName);
  const timeout = spec.timeout ? durationMs(process.env.SITES_BUILD_TIMEOUT, 180_000) : 0;
  return run(process.execPath, [executable, ...spec.args, ...extraArgs], env, timeout);
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 69;
  });
```

`package.json` scripts 改为：

```json
{
  "install:ci": "node scripts/project-command.mjs install:ci",
  "dev": "node scripts/project-command.mjs dev",
  "build": "node scripts/project-command.mjs build",
  "start": "node scripts/project-command.mjs start",
  "test": "npm run build && node --test",
  "lint": "node scripts/project-command.mjs lint",
  "db:generate": "node scripts/project-command.mjs db:generate"
}
```

- [ ] **Step 4: 验证 GREEN 与真实 Windows 入口**

Run: `node --test tests/project-command.test.mjs`

Expected: PASS。

Run: `npm run lint`

Expected: exit 0，不出现 `bash is not recognized`。

Run: `npm test`

Expected: build 成功，全部 Node tests 通过。

- [ ] **Step 5: 提交**

```powershell
git add -- package.json scripts/project-command.mjs tests/project-command.test.mjs
git commit -m "build: support native Windows npm workflows"
```

---

### Task 2：统一稳定态证据决策

**Files:**
- Modify: `lib/training/reactivation.ts`
- Modify: `app/api/reviews/route.ts`
- Modify: `tests/scheduler.test.mjs`

**Interfaces:**
- Consumes: 当前题目投影与 `SolveEvidence`。
- Produces: `scheduleProblemEvidence(input)`；`stable + independent_ac` 返回 `nextReviewAt=null`，其余证据复用 `scheduleNextReview`。

- [ ] **Step 1: 写入稳定态反例测试**

```js
import { scheduleProblemEvidence } from "../lib/training/reactivation.ts";

test("稳定态再次独立完成只追加证据而不重新排期", () => {
  const decision = scheduleProblemEvidence({
    status: "stable",
    reviewStage: 4,
    cleanStreak: 1,
    lapseCount: 0,
    lastEvidence: "independent_ac",
    evidence: "independent_ac",
    now: NOW,
  });
  assert.equal(decision.status, "stable");
  assert.equal(decision.dueAt, null);
  assert.equal(decision.reviewStage, 4);
});

test("稳定态收到失败证据仍会重新激活", () => {
  const decision = scheduleProblemEvidence({
    status: "stable",
    reviewStage: 4,
    cleanStreak: 1,
    lapseCount: 0,
    lastEvidence: "independent_ac",
    evidence: "failed",
    now: NOW,
  });
  assert.equal(decision.status, "upsolve");
  assert.ok(decision.dueAt);
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node --test tests/scheduler.test.mjs`

Expected: FAIL，`scheduleProblemEvidence` 尚未导出。

- [ ] **Step 3: 实现最小纯策略函数并接入 review 路由**

```ts
export function scheduleProblemEvidence(input: {
  status: string;
  reviewStage: number;
  cleanStreak: number;
  lapseCount: number;
  lastEvidence: string;
  evidence: SolveEvidence;
  now?: Date;
}) {
  if (input.status === "stable" && input.evidence === "independent_ac") {
    return {
      status: "stable" as const,
      reviewStage: input.reviewStage,
      cleanStreak: input.cleanStreak,
      lapseCount: input.lapseCount,
      dueAt: null,
      intervalDays: null,
      reason: "稳定态再次独立完成：保留本次证据，不重新建立同题排程。",
    };
  }
  return scheduleNextReview({
    currentStage: input.reviewStage,
    currentCleanStreak:
      input.cleanStreak === 0 && input.lastEvidence === "independent_ac"
        ? input.reviewStage
        : input.cleanStreak,
    currentLapseCount: input.lapseCount,
    evidence: input.evidence,
    now: input.now,
  });
}
```

`app/api/reviews/route.ts` 的普通证据分支改为调用 `scheduleProblemEvidence`；迁移首次验证分支保持原样，attempt 插入仍与问题投影更新处于同一 `db.batch`。

- [ ] **Step 4: 验证 GREEN**

Run: `node --test tests/scheduler.test.mjs`

Expected: 全部通过。

Run: `npm test`

Expected: 全部通过。

- [ ] **Step 5: 提交**

```powershell
git add -- lib/training/reactivation.ts app/api/reviews/route.ts tests/scheduler.test.mjs
git commit -m "fix: preserve stable state on independent reviews"
```

---

### Task 3：确定性队列 ID 决胜

**Files:**
- Modify: `lib/training/modes.ts`
- Modify: `tests/scheduler.test.mjs`

**Interfaces:**
- Consumes: `{ id: number, status: string, nextReviewAt: string | null }`。
- Produces: `prioritizeTrainingQueue` 在状态和日期相同时按数值 ID 升序。

- [ ] **Step 1: 写入同优先级同日期的反例测试**

```js
test("同优先级同日期时使用稳定 ID 决胜", () => {
  const queue = buildDailyQueue([
    { id: 30, status: "review", nextReviewAt: "2026-08-29" },
    { id: 10, status: "review", nextReviewAt: "2026-08-29" },
    { id: 20, status: "review", nextReviewAt: "2026-08-29" },
  ], "normal");
  assert.deepEqual(queue.selected.map((item) => item.id), [10, 20, 30]);
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node --test tests/scheduler.test.mjs`

Expected: FAIL，当前结果保留输入顺序 `[30, 10, 20]`。

- [ ] **Step 3: 增加最终 ID 比较**

```ts
export type QueueCandidate = {
  id: number;
  status: string;
  nextReviewAt: string | null;
};

// 日期比较结果非零时直接返回；相同时：
return left.id - right.id;
```

同时把原有测试 fixture 的字符串 ID 改成唯一数值 ID，断言顺序仍覆盖 upsolve、transfer、review 优先级。

- [ ] **Step 4: 验证 GREEN**

Run: `node --test tests/scheduler.test.mjs`

Expected: 全部通过。

- [ ] **Step 5: 提交**

```powershell
git add -- lib/training/modes.ts tests/scheduler.test.mjs
git commit -m "fix: make training queue order deterministic"
```

---

### Task 4：盲做 DTO 精确白名单

**Files:**
- Create: `lib/training/projection.ts`
- Create: `tests/projection.test.mjs`
- Modify: `app/api/dashboard/route.ts`
- Modify: `app/api/agent/context/route.ts`
- Modify: `app/page.tsx`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: Drizzle problem 行需要的结构字段。
- Produces: `toDashboardBlindProblem(problem)` 与 `toAgentDueProblem(problem)` 两个固定 DTO；传入对象新增字段时响应不会自动扩张。

- [ ] **Step 1: 写入精确字段集合测试**

```js
import { toAgentDueProblem, toDashboardBlindProblem } from "../lib/training/projection.ts";

const problem = {
  id: 7,
  title: "Blind",
  url: "https://example.com/problem",
  platform: "other",
  origin: "practice",
  status: "transfer",
  reviewStage: 2,
  cleanStreak: 1,
  nextReviewAt: "2026-09-01T16:00:00.000Z",
  notes: "secret",
  lastEvidence: "hinted_ac",
  validatesProblemId: 3,
  transferIntegrity: "unseen",
};

test("Dashboard 盲做投影只包含精确白名单", () => {
  assert.deepEqual(Object.keys(toDashboardBlindProblem(problem)).sort(), [
    "cleanStreak", "id", "nextReviewAt", "origin", "platform", "status", "title", "url",
  ]);
});

test("Agent 到期投影不包含历史与迁移来源", () => {
  assert.deepEqual(Object.keys(toAgentDueProblem(problem)).sort(), [
    "dueAt", "id", "origin", "platform", "queueType", "reviewStage", "title", "url",
  ]);
  assert.equal(toAgentDueProblem(problem).queueType, "unlabeled_transfer");
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node --test tests/projection.test.mjs`

Expected: FAIL，投影模块不存在。

- [ ] **Step 3: 实现两个显式对象投影并替换路由 map**

```ts
type ProblemProjectionInput = {
  id: number;
  title: string;
  url: string;
  platform: string;
  origin: string;
  status: string;
  reviewStage: number;
  cleanStreak: number;
  nextReviewAt: string | null;
};

export function toDashboardBlindProblem(problem: ProblemProjectionInput) {
  return {
    id: problem.id,
    title: problem.title,
    url: problem.url,
    platform: problem.platform,
    origin: problem.origin,
    status: problem.status,
    cleanStreak: problem.cleanStreak,
    nextReviewAt: problem.nextReviewAt,
  };
}

export function toAgentDueProblem(problem: ProblemProjectionInput) {
  return {
    id: problem.id,
    title: problem.title,
    url: problem.url,
    platform: problem.platform,
    origin: problem.origin,
    reviewStage: problem.reviewStage,
    queueType:
      problem.status === "upsolve"
        ? "upsolve"
        : problem.status === "transfer"
          ? "unlabeled_transfer"
          : "blind_review",
    dueAt: problem.nextReviewAt,
  };
}
```

Dashboard 的 `due/queues/transferCandidates/recent` 全部使用 `toDashboardBlindProblem`；Agent 的 due map 使用 `toAgentDueProblem`。删除 `hideBlindFields`，并把页面 `Problem` 类型收窄到 Dashboard DTO 的八个字段。

- [ ] **Step 4: 删除脆弱的源码脱敏断言，保留行为契约**

从 `tests/rendered-html.test.mjs` 删除搜索 `notes: ""`、`validatesProblemId: null` 和 Agent map 源码的测试；保留页面闭环与 `clientMaySetReviewDate: false` 契约。字段泄露由 `tests/projection.test.mjs` 的精确 keys 测试负责。

- [ ] **Step 5: 验证 GREEN**

Run: `node --test tests/projection.test.mjs tests/rendered-html.test.mjs`

Expected: 全部通过。

Run: `npm test`

Expected: 全部通过。

- [ ] **Step 6: 提交**

```powershell
git add -- lib/training/projection.ts app/api/dashboard/route.ts app/api/agent/context/route.ts app/page.tsx tests/projection.test.mjs tests/rendered-html.test.mjs
git commit -m "fix: whitelist blind queue projections"
```

---

### Task 5：设置仅合并与可移植性守卫

**Files:**
- Modify: `lib/data/import.ts`
- Modify: `app/api/import/route.ts`
- Modify: `app/page.tsx`
- Modify: `tests/data-portability.test.mjs`
- Modify: `tests/rendered-html.test.mjs`
- Read-only verify: `drizzle/meta/_journal.json`
- Read-only verify: `app/api/export/route.ts`

**Interfaces:**
- Consumes: 导入前是否已存在 `training_settings.id=1`。
- Produces: `settingsMergePreview(existing)` 返回 `{ add, skip }`；实际导入只在缺失时插入设置，绝不 update 现有设置。

- [ ] **Step 1: 写入 merge-only、迁移序列与 v4 守卫测试**

```js
import { readFile } from "node:fs/promises";
import { settingsMergePreview } from "../lib/data/import.ts";

test("设置导入预览遵守仅合并语义", () => {
  assert.deepEqual(settingsMergePreview(false), { add: 1, skip: 0 });
  assert.deepEqual(settingsMergePreview(true), { add: 0, skip: 1 });
});

test("迁移历史保持 0000 到 0004 的仅追加基线", async () => {
  const journal = JSON.parse(
    await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(journal.entries.map((entry) => entry.tag), [
    "0000_chunky_moon_knight",
    "0001_mighty_bushwacker",
    "0002_curly_selene",
    "0003_warm_liz_osborn",
    "0004_mean_blue_blade",
  ]);
});

test("完整导出版本保持 v4", async () => {
  const source = await readFile(new URL("../app/api/export/route.ts", import.meta.url), "utf8");
  assert.match(source, /version:\s*4/);
});
```

并在 `tests/rendered-html.test.mjs` 增加：

```js
test("导入界面明确保留现有训练设置", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /保留当前训练设置/);
  assert.doesNotMatch(source, /恢复备份中的训练模式设置/);
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node --test tests/data-portability.test.mjs tests/rendered-html.test.mjs`

Expected: FAIL，`settingsMergePreview` 尚未导出，页面仍承诺恢复设置。

- [ ] **Step 3: 实现预览和实际写入的同一 merge-only 决策**

```ts
export function settingsMergePreview(existing: boolean) {
  return existing ? { add: 0, skip: 1 } : { add: 1, skip: 0 };
}
```

`app/api/import/route.ts` 在读取已有比赛和题目时一并读取 `training_settings.id=1`，预览增加：

```ts
settings: settingsMergePreview(Boolean(existingSettings)),
```

实际写入删除 `update(trainingSettings)` 分支，只保留：

```ts
if (!existingSettings) {
  await db.insert(trainingSettings).values({
    id: 1,
    mode: bundle.settings.mode,
    timezone: bundle.settings.timezone,
    reminderTime: bundle.settings.reminderTime,
    updatedAt: new Date().toISOString(),
  });
}
```

`ImportPreview` 增加 `settings: { add: number; skip: number }`，预览文案根据 `preview.settings.skip` 显示“保留当前训练设置”或“写入备份中的训练设置”。

- [ ] **Step 4: 验证 GREEN 与无迁移差异**

Run: `node --test tests/data-portability.test.mjs tests/rendered-html.test.mjs`

Expected: 全部通过。

Run: `npm run db:generate`

Expected: Drizzle 报告无 schema 变化，`git status --short drizzle db/schema.ts` 无输出。

Run: `npm test`

Expected: 全部通过。

- [ ] **Step 5: 提交**

```powershell
git add -- lib/data/import.ts app/api/import/route.ts app/page.tsx tests/data-portability.test.mjs tests/rendered-html.test.mjs
git commit -m "fix: keep imported settings merge-only"
```

---

### Task 6：交付验证与状态文档

**Files:**
- Modify: `docs/project-state.md`
- Modify: `docs/architecture.md`
- Verify: all changed production and test files

**Interfaces:**
- Consumes: Tasks 1-5 的已提交结果。
- Produces: 可复现的 Windows 初版基线与中文交接状态。

- [ ] **Step 1: 更新架构与项目状态**

把仍为英文的 `docs/architecture.md` 与 `docs/project-state.md` 完整翻译成中文，保留必要英文术语、字段名和代码标识符；同时补充盲做投影使用显式白名单、队列最终按 ID 决胜、设置导入不会覆盖当前设置，以及原生 Windows npm 工作流与稳定态守卫已完成。只改事实，不加入后续功能承诺。

- [ ] **Step 2: 运行完整验证**

Run: `npm test`

Expected: build 成功，全部测试通过。

Run: `npm run lint`

Expected: exit 0。

Run: `npm run db:generate`

Expected: 无 schema 变化。

Run: `git diff --check`

Expected: exit 0。

Run: `git status --short`

Expected: 只包含计划内文档变更，不包含 `db/schema.ts`、`drizzle/*.sql` 或 `drizzle/meta/*.json`。

- [ ] **Step 3: 提交文档**

```powershell
git add -- docs/architecture.md docs/project-state.md
git commit -m "docs: record invariant hardening baseline"
```

- [ ] **Step 4: 最终核对提交序列和工作树**

Run: `git log --oneline -7`

Expected: 包含本计划文档以及 Tasks 1-6 的独立提交。

Run: `git status --short`

Expected: 无输出。
