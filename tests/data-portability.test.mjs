import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  parseImportBundle,
  problemIdentity,
  settingsMergePreview,
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
  assert.equal(parsed.attempts[0].helpLevel, "unknown");
  assert.equal(parsed.attempts[0].idempotencyKey, null);
  assert.equal(parsed.settings.mode, "recovery");
});

test("v5 attempt 保留结构化帮助等级和幂等键", () => {
  const backup = structuredClone(BASE_BACKUP);
  backup.version = 5;
  backup.attempts[0].helpLevel = "h1";
  backup.attempts[0].idempotencyKey = "018f0f66-7a28-7e31-8a4d-a70b93879a11";
  const parsed = parseImportBundle(backup);
  assert.equal(parsed.attempts[0].helpLevel, "h1");
  assert.equal(
    parsed.attempts[0].idempotencyKey,
    "018f0f66-7a28-7e31-8a4d-a70b93879a11",
  );
});

test("v5 拒绝非法帮助等级和过短幂等键", () => {
  const backup = structuredClone(BASE_BACKUP);
  backup.version = 5;
  backup.attempts[0].helpLevel = "H9";
  backup.attempts[0].idempotencyKey = "short";
  assert.throws(() => parseImportBundle(backup), /帮助等级|幂等键/);
});

test("v5 拒绝备份内重复幂等键", () => {
  const backup = structuredClone(BASE_BACKUP);
  backup.version = 5;
  backup.attempts[0].helpLevel = "none";
  backup.attempts[0].idempotencyKey = "018f0f66-7a28-7e31-8a4d-a70b93879a11";
  backup.attempts.push({ ...backup.attempts[0] });
  assert.throws(() => parseImportBundle(backup), /重复幂等键/);
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

test("设置导入预览遵守仅合并语义", () => {
  assert.deepEqual(settingsMergePreview(false), { add: 1, skip: 0 });
  assert.deepEqual(settingsMergePreview(true), { add: 0, skip: 1 });
});

test("迁移历史只追加 0005 evidence integrity", async () => {
  const journal = JSON.parse(
    await readFile(
      new URL("../drizzle/meta/_journal.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(
    journal.entries.map((entry) => entry.tag),
    [
      "0000_chunky_moon_knight",
      "0001_mighty_bushwacker",
      "0002_curly_selene",
      "0003_warm_liz_osborn",
      "0004_mean_blue_blade",
      "0005_evidence_integrity",
    ],
  );
});

test("完整导出版本升级为 v5", async () => {
  const source = await readFile(
    new URL("../app/api/export/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /version:\s*5/);
});
