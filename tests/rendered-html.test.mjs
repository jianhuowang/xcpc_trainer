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

test("agent context cannot expose notes or accept client review dates", async () => {
  const source = await readFile(
    new URL("../app/api/agent/context/route.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /notes:\s*problem\.notes/);
  assert.match(source, /clientMaySetReviewDate:\s*false/);
});

test("dashboard strips notes and transfer relationships from blind queue payloads", async () => {
  const source = await readFile(
    new URL("../app/api/dashboard/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /notes:\s*""/);
  assert.match(source, /validatesProblemId:\s*null/);
  assert.match(source, /queue\.transfer\.map\(hideBlindFields\)/);
});
