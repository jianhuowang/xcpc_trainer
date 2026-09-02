# XCPC Trainer 本地 D1 初始化设计

**日期：** 2026-08-30

**状态：** 已确认并实施

## 问题

`npm run dev` 可以在原生 Windows 启动页面，但新的本地环境尚未应用 `drizzle/0000`-`0004`。因此首页可以返回 HTTP 200，`/api/dashboard` 却会因表不存在而返回 500，当前 README 的首次使用步骤不完整。

## 选定方案

增加显式命令：

```powershell
npm run db:migrate:local
```

该命令复用项目已经安装的 Wrangler，在项目本地持久化目录中对 `DB` binding 应用 `drizzle/` 下的既有 migrations。命令通过现有 `scripts/project-command.mjs` 执行，保持 Windows 与 POSIX 一致，不引入 Bash 或新依赖。

首次使用顺序固定为：

```powershell
npm ci
npm run db:migrate:local
npm run dev
```

## 配置与数据边界

- 增加仅供 Wrangler CLI 使用的 `wrangler.local.jsonc`，避免 Cloudflare Vite 插件自动加载后与 `vite.config.ts` 的内联配置冲突；binding 名保持 `DB`，本地数据库名保持 `site-creator-d1`。
- migration 目录明确指向现有 `drizzle/`。
- 本地数据继续存放在已忽略的 `.wrangler/state`，不会进入 Git、导出文件或托管 D1。
- 命令可以重复运行；已经应用的 migration 由 Wrangler 记录并跳过。
- 不修改 `db/schema.ts`，不新增或改写 `0000`-`0004`，完整导出保持 v4，导入保持 v1-v4。
- `npm run dev` 不自动修改数据库；初始化仍是用户可见的显式动作。

## 错误处理

- 未安装依赖时沿用现有命令入口的“请先运行 npm ci”提示。
- migration 执行失败时保留 Wrangler 的非零退出码和错误输出，不继续启动开发服务器。
- 不自动删除、重建或覆盖已有本地数据库。

## 测试与验收

1. 命令契约测试先证明 `db:migrate:local` 尚不存在，再验证 package script 与 Node 命令入口映射。
2. 配置测试验证 `DB` binding、`drizzle` migration 目录和本地占位 database ID。
3. `npm run db:migrate:local` 首次执行成功，再次执行报告无待应用 migration。
4. `npm run dev` 后，`GET /api/dashboard` 返回 HTTP 200，而不只是首页壳返回 200。
5. `npm test`、`npm run lint`、`npm run db:generate` 全部通过，且 schema、既有 SQL 与 migration journal 无差异。

## 文档更新

README 与项目状态把本地 migration 命令加入首次使用步骤，并说明本地 D1 与托管 D1 相互独立。
