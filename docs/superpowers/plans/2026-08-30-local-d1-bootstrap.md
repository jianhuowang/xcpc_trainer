# XCPC Trainer 本地 D1 初始化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让全新本地 checkout 通过一个显式 npm 命令应用既有 D1 migrations，并在启动后得到可用 Dashboard。

**Architecture:** 复用已安装的 Wrangler CLI 和现有跨平台 Node 命令入口；仓库级 Wrangler 配置只描述当前本地 `DB` binding 与 `drizzle/` 目录。迁移和开发服务器保持两个显式步骤，不引入自动建表逻辑。

**Tech Stack:** Node.js 22、Wrangler 4、Cloudflare D1、Node 内置测试框架。

## 全局约束

- 不修改 `db/schema.ts`，不新增或改写 `drizzle/0000`-`0004`。
- 完整导出保持 v4，导入保持 v1-v4。
- 不新增 npm 依赖，不调用 Bash。
- 本地数据库只写入已忽略的 `.wrangler/state`。
- migration 必须由用户显式执行，`npm run dev` 不自动写数据库。

---

### Task 1：本地 D1 初始化命令与首次使用文档

**Files:**
- Create: `wrangler.local.jsonc`
- Modify: `package.json`
- Modify: `scripts/project-command.mjs`
- Modify: `tests/project-command.test.mjs`
- Modify: `README.md`
- Modify: `docs/project-state.md`

**Interfaces:**
- Consumes: Wrangler 的 `d1 migrations apply DB --local --persist-to .wrangler/state` 命令与现有 `drizzle/` migrations。
- Produces: `npm run db:migrate:local`；重复执行时不重复应用 migration。

- [x] **Step 1：写入失败的命令与配置契约测试**

在 `tests/project-command.test.mjs` 的 npm 工作流断言中增加：

```js
assert.equal(
  packageJson.scripts["db:migrate:local"],
  "node scripts/project-command.mjs db:migrate:local",
);
```

并增加配置测试；文件不存在时以空对象进入断言，保证 RED 是契约不满足而不是测试加载错误：

```js
test("本地 D1 配置复用既有 migrations", async () => {
  const source = await readFile(
    new URL("../wrangler.local.jsonc", import.meta.url),
    "utf8",
  ).catch(() => "{}");
  const config = JSON.parse(source);
  assert.equal(config.d1_databases?.[0]?.binding, "DB");
  assert.equal(config.d1_databases?.[0]?.database_name, "site-creator-d1");
  assert.equal(config.d1_databases?.[0]?.migrations_dir, "drizzle");
});
```

- [x] **Step 2：运行测试并确认 RED**

Run: `node --test tests/project-command.test.mjs`

Expected: FAIL，`db:migrate:local` 实际为 `undefined`，且本地 D1 配置断言不成立。

- [x] **Step 3：实现最小命令与 Wrangler 配置**

在 `package.json` 增加：

```json
"db:migrate:local": "node scripts/project-command.mjs db:migrate:local"
```

在 `scripts/project-command.mjs` 的 `commands` 中增加：

```js
"db:migrate:local": {
  packageName: "wrangler",
  binName: "wrangler",
  args: [
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--persist-to",
    ".wrangler/state",
    "--config",
    "wrangler.local.jsonc",
  ],
},
```

创建 CLI 专用的 `wrangler.local.jsonc`；不能使用默认名 `wrangler.jsonc`，否则 Cloudflare Vite 插件会自动加载它，并与 `vite.config.ts` 的内联配置重复：

```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "xcpc-trainer-local",
  "main": "worker/index.ts",
  "compatibility_date": "2026-05-15",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "site-creator-d1",
      "database_id": "00000000-0000-4000-8000-000000000000",
      "migrations_dir": "drizzle"
    }
  ]
}
```

- [x] **Step 4：验证命令契约 GREEN**

Run: `node --test tests/project-command.test.mjs`

Expected: 2 tests PASS。

- [x] **Step 5：更新首次使用文档**

把 README 和 `docs/project-state.md` 的首次使用顺序统一为：

```powershell
npm ci
npm run db:migrate:local
npm run dev
```

说明本地 migration 只作用于 `.wrangler/state`，与托管 D1 相互独立。

- [x] **Step 6：执行真实迁移并验证重复运行**

Run: `npm run db:migrate:local`

Expected: `0000`-`0004` 应用成功。

Run: `npm run db:migrate:local`

Expected: Wrangler 报告没有待应用 migration，exit 0。

- [x] **Step 7：启动并验证 Dashboard API**

Run: `npm run dev`

另一个 PowerShell 运行：

```powershell
(Invoke-WebRequest -UseBasicParsing http://localhost:5173/api/dashboard).StatusCode
```

Expected: `200`。

- [x] **Step 8：运行完整回归检查**

Run: `npm test`

Expected: 生产构建成功，全部测试通过。

Run: `npm run lint`

Expected: exit 0。

Run: `npm run db:generate`

Expected: `No schema changes`。

Run: `git diff --check`

Expected: exit 0，且 `git diff --name-only -- db/schema.ts drizzle` 无输出。

- [ ] **Step 9：提交并更新 PR**

```powershell
git add -- wrangler.local.jsonc package.json scripts/project-command.mjs tests/project-command.test.mjs README.md docs/project-state.md docs/superpowers/specs/2026-08-30-local-d1-bootstrap-design.md docs/superpowers/plans/2026-08-30-local-d1-bootstrap.md
git commit -m "fix: initialize local D1 before first use"
git push
```
