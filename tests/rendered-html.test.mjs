import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the complete personal training loop in the mobile entry page", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(source, /先清债/);
  assert.match(source, /\/api\/problems/);
  assert.match(source, /\/api\/reviews/);
  assert.match(source, /今日训练队列/);
  assert.match(source, /盲做规则/);
});

test("agent policy rejects client review dates", async () => {
  const source = await readFile(
    new URL("../app/api/agent/context/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /clientMaySetReviewDate:\s*false/);
});

test("导入界面明确保留现有训练设置", async () => {
  const source = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /保留当前训练设置/);
  assert.doesNotMatch(source, /恢复备份中的训练模式设置/);
});

test("浏览器证据提交包含帮助等级和稳定幂等键", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /helpLevel:\s*reviewHelpLevel/);
  assert.match(source, /idempotencyKey:\s*reviewAttemptKey/);
});
