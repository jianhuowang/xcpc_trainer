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
  const parsed = parseEvidenceSubmission({
    problemId: 7,
    evidence: "hinted_ac",
    helpLevel: "h1",
    notes: "  卡在状态定义  ",
    idempotencyKey: KEY,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(sameEvidenceSubmission({
    problemId: 7,
    evidence: "hinted_ac",
    helpLevel: "h1",
    notes: "卡在状态定义",
  }, parsed.value), true);
  assert.equal(sameEvidenceSubmission({
    problemId: 7,
    evidence: "hinted_ac",
    helpLevel: "h2",
    notes: "卡在状态定义",
  }, parsed.value), false);
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
  if (parsed.ok) return;
  assert.match(parsed.error, /不支持的字段/);
});
