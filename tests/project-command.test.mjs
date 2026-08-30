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
  assert.equal(packageJson.scripts.test, "npm run build && node --test");
  assert.doesNotMatch(Object.values(packageJson.scripts).join("\n"), /\bbash\b/);
});
