import assert from "node:assert/strict";
import test from "node:test";
import {
  parseImportBundle,
  problemIdentity,
} from "../lib/data/import.ts";
import {
  createReminderCandidate,
  shanghaiDateKey,
} from "../lib/notifications/reminders.ts";

const BASE_BACKUP = {
  format: "xcpc-trainer-export",
  version: 1,
  settings: { mode: "recovery", timezone: "Asia/Shanghai", reminderTime: "21:00" },
  problems: [
    {
      id: 8,
      title: "A. Blind Resolve",
      url: "https://codeforces.com/problemset/problem/1/A",
      platform: "codeforces",
      origin: "contest",
      status: "review",
      reviewStage: 2,
      nextReviewAt: "2026-09-01T00:00:00.000Z",
      lastEvidence: "independent_ac",
      notes: "hidden until review",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-29T00:00:00.000Z",
    },
  ],
  attempts: [
    {
      problemId: 8,
      context: "review",
      evidence: "independent_ac",
      previousStage: 1,
      nextStage: 2,
      attemptedAt: "2026-08-29T00:00:00.000Z",
    },
  ],
};

test("v1 备份可以安全升级为统一导入结构", () => {
  const parsed = parseImportBundle(BASE_BACKUP);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.contests.length, 0);
  assert.equal(parsed.problems[0].sourceId, 8);
  assert.equal(parsed.problems[0].cleanStreak, 2);
  assert.equal(parsed.problems[0].lapseCount, 0);
  assert.equal(parsed.attempts[0].sourceProblemId, 8);
  assert.equal(parsed.settings.mode, "recovery");
});

test("题目链接去重不受末尾斜杠和大小写影响", () => {
  const first = problemIdentity({
    title: "A",
    platform: "codeforces",
    url: "https://CODEFORCES.com/problemset/problem/1/A/",
  });
  const second = problemIdentity({
    title: "renamed",
    platform: "other",
    url: "https://codeforces.com/problemset/problem/1/a",
  });
  assert.equal(first, second);
});

test("导入拒绝指向不存在题目的尝试记录", () => {
  const broken = structuredClone(BASE_BACKUP);
  broken.attempts[0].problemId = 999;
  assert.throws(() => parseImportBundle(broken), /找不到对应题目/);
});

test("旧版永久掌握记录会升级为可复习的低频保持", () => {
  const legacy = structuredClone(BASE_BACKUP);
  legacy.problems[0].status = "mastered";
  legacy.problems[0].reviewStage = 4;
  legacy.problems[0].nextReviewAt = null;
  const parsed = parseImportBundle(legacy);
  assert.equal(parsed.problems[0].status, "retained");
  assert.equal(parsed.problems[0].cleanStreak, 4);
  assert.ok(parsed.problems[0].nextReviewAt);
});

test("迁移题关联与陌生状态会保留在备份中", () => {
  const bundle = structuredClone(BASE_BACKUP);
  bundle.version = 4;
  bundle.problems.push({
    id: 9,
    title: "Unseen Transfer",
    url: "https://codeforces.com/problemset/problem/2/B",
    platform: "codeforces",
    origin: "practice",
    status: "transfer",
    reviewStage: 0,
    cleanStreak: 0,
    lapseCount: 0,
    trainingRole: "transfer",
    validatesProblemId: 8,
    transferIntegrity: "unseen",
    nextReviewAt: "2026-09-01T00:00:00.000Z",
    lastEvidence: "assigned_transfer",
    notes: "",
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  });
  const parsed = parseImportBundle(bundle);
  assert.equal(parsed.problems[1].sourceValidatesProblemId, 8);
  assert.equal(parsed.problems[1].trainingRole, "transfer");
  assert.equal(parsed.problems[1].transferIntegrity, "unseen");
});

test("导入拒绝指向不存在原题的迁移关联", () => {
  const bundle = structuredClone(BASE_BACKUP);
  bundle.version = 4;
  bundle.problems[0].validatesProblemId = 999;
  assert.throws(() => parseImportBundle(bundle), /找不到对应的原训练题/);
});

test("提醒按上海自然日生成稳定去重键", () => {
  const now = new Date("2026-08-29T16:30:00.000Z");
  assert.equal(shanghaiDateKey(now), "2026-08-30");
  const first = createReminderCandidate({
    now,
    channel: "qq_bot",
    dueCount: 4,
    titles: ["A", "B"],
    dashboardUrl: "https://trainer.example",
  });
  const second = createReminderCandidate({
    now: new Date("2026-08-30T10:00:00.000Z"),
    channel: "qq_bot",
    dueCount: 4,
    titles: ["A", "B"],
    dashboardUrl: "https://trainer.example",
  });
  assert.equal(first.dedupeKey, second.dedupeKey);
  assert.equal(first.payload.selectedCount, 2);
});
