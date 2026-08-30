import assert from "node:assert/strict";
import test from "node:test";
import { groupCodeforcesSubmissions } from "../lib/integrations/codeforces.ts";

test("Codeforces 提交按题目聚合且不泄露 tags", () => {
  const result = groupCodeforcesSubmissions([
    {
      id: 2,
      contestId: 1000,
      creationTimeSeconds: 200,
      verdict: "OK",
      problem: { contestId: 1000, index: "A", name: "Example", rating: 800, tags: ["math"] },
    },
    {
      id: 1,
      contestId: 1000,
      creationTimeSeconds: 100,
      verdict: "WRONG_ANSWER",
      problem: { contestId: 1000, index: "A", name: "Example", rating: 800 },
    },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].accepted, true);
  assert.equal(result[0].submissionCount, 2);
  assert.equal(result[0].suggestedEvidence, null);
  assert.equal("tags" in result[0], false);
});

test("未通过题目只建议 failed 证据", () => {
  const [candidate] = groupCodeforcesSubmissions([
    {
      id: 4,
      contestId: 120000,
      creationTimeSeconds: 400,
      verdict: "TIME_LIMIT_EXCEEDED",
      problem: { contestId: 120000, index: "C", name: "Gym Task" },
    },
  ]);
  assert.equal(candidate.suggestedEvidence, "failed");
  assert.match(candidate.url, /\/gym\/120000\/problem\/C$/);
});
