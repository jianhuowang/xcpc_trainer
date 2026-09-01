import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/privacy/route.ts";

test("隐私政策页匿名返回静态中文 HTML", async () => {
  const response = GET();
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html; charset=utf-8$/i);
  for (const text of [
    "XCPC Trainer Coach 隐私政策",
    "getTrainingContext",
    "setTrainingMode",
    "submitTrainingEvidence",
    "AGENT_API_KEY",
    "不会出售",
    "GitHub Issues",
  ]) {
    assert.match(html, new RegExp(text));
  }
  assert.doesNotMatch(html, /<script\b/i);
});
