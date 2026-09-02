import assert from "node:assert/strict";
import test from "node:test";
import {
  toAgentDueProblem,
  toDashboardBlindProblem,
} from "../lib/training/projection.ts";

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
    "cleanStreak",
    "id",
    "nextReviewAt",
    "origin",
    "platform",
    "status",
    "title",
    "url",
  ]);
});

test("Agent 到期投影不包含历史与迁移来源", () => {
  assert.deepEqual(Object.keys(toAgentDueProblem(problem)).sort(), [
    "dueAt",
    "id",
    "origin",
    "platform",
    "queueType",
    "reviewStage",
    "title",
    "url",
  ]);
  assert.equal(toAgentDueProblem(problem).queueType, "unlabeled_transfer");
});
