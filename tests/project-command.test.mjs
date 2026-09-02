import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("npm 工作流统一通过跨平台 Node 入口执行", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(
    packageJson.scripts["install:ci"],
    "node scripts/project-command.mjs install:ci",
  );
  assert.equal(packageJson.scripts.dev, "node scripts/project-command.mjs dev");
  assert.equal(packageJson.scripts.build, "node scripts/project-command.mjs build");
  assert.equal(packageJson.scripts.start, "node scripts/project-command.mjs start");
  assert.equal(packageJson.scripts.lint, "node scripts/project-command.mjs lint");
  assert.equal(
    packageJson.scripts["db:generate"],
    "node scripts/project-command.mjs db:generate",
  );
  assert.equal(
    packageJson.scripts["db:migrate:local"],
    "node scripts/project-command.mjs db:migrate:local",
  );
  assert.equal(packageJson.scripts.test, "npm run build && node --test");
  assert.doesNotMatch(Object.values(packageJson.scripts).join("\n"), /\bbash\b/);
});

test("本地 D1 配置复用既有 migrations", async () => {
  const source = await readFile(
    new URL("../wrangler.local.jsonc", import.meta.url),
    "utf8",
  ).catch(() => "{}");
  const config = JSON.parse(source);
  assert.equal(config.d1_databases?.[0]?.binding, "DB");
  assert.equal(config.d1_databases?.[0]?.database_name, "site-creator-d1");
  assert.equal(config.d1_databases?.[0]?.migrations_dir, "drizzle");

  const defaultConfigExists = await readFile(
    new URL("../wrangler.jsonc", import.meta.url),
    "utf8",
  ).then(
    () => true,
    () => false,
  );
  assert.equal(defaultConfigExists, false);

  const commandSource = await readFile(
    new URL("../scripts/project-command.mjs", import.meta.url),
    "utf8",
  );
  assert.match(commandSource, /"--config",\s*"wrangler\.local\.jsonc"/);
});
