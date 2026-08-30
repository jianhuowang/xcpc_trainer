import assert from "node:assert/strict";
import test from "node:test";
import {
  afterShanghaiDays,
  scheduleNextReview,
} from "../lib/training/scheduler.ts";
import {
  buildDailyQueue,
  selectDailyQueue,
} from "../lib/training/modes.ts";
import { classifyTransferAttempt } from "../lib/training/transfer.ts";
import {
  scheduleProblemEvidence,
  shouldReactivateProblem,
} from "../lib/training/reactivation.ts";

const NOW = new Date("2026-08-29T12:00:00.000Z");

test("题解后两天按上海自然日安排第一次盲重做", () => {
  const result = scheduleNextReview({
    evidence: "editorial_understood",
    now: NOW,
  });
  assert.equal(result.reviewStage, 0);
  assert.equal(result.cleanStreak, 0);
  assert.equal(result.dueAt, "2026-08-30T16:00:00.000Z");
});

test("同一上海自然日的操作会得到同一个到期日", () => {
  const early = afterShanghaiDays(new Date("2026-08-29T00:05:00.000Z"), 3);
  const late = afterShanghaiDays(new Date("2026-08-29T15:55:00.000Z"), 3);
  assert.equal(early, late);
  assert.equal(early, "2026-08-31T16:00:00.000Z");
});

test("连续独立完成逐步延长间隔，但同题不会永久毕业", () => {
  const first = scheduleNextReview({ evidence: "independent_ac", now: NOW });
  const second = scheduleNextReview({
    currentStage: first.reviewStage,
    currentCleanStreak: first.cleanStreak,
    evidence: "independent_ac",
    now: NOW,
  });
  const third = scheduleNextReview({
    currentStage: second.reviewStage,
    currentCleanStreak: second.cleanStreak,
    evidence: "independent_ac",
    now: NOW,
  });
  const retained = scheduleNextReview({
    currentStage: third.reviewStage,
    currentCleanStreak: third.cleanStreak,
    evidence: "independent_ac",
    now: NOW,
  });

  assert.equal(first.intervalDays, 3);
  assert.equal(second.intervalDays, 7);
  assert.equal(third.intervalDays, 21);
  assert.equal(retained.status, "retained");
  assert.equal(retained.intervalDays, 45);
  assert.ok(retained.dueAt);
});

test("高阶段使用提示后不能靠一次独立 AC 直接恢复", () => {
  const hinted = scheduleNextReview({
    currentStage: 3,
    currentCleanStreak: 3,
    evidence: "hinted_ac",
    now: NOW,
  });
  const recovered = scheduleNextReview({
    currentStage: hinted.reviewStage,
    currentCleanStreak: hinted.cleanStreak,
    evidence: "independent_ac",
    now: NOW,
  });

  assert.equal(hinted.reviewStage, 0);
  assert.equal(hinted.cleanStreak, 0);
  assert.equal(recovered.reviewStage, 1);
  assert.equal(recovered.status, "review");
});

test("失败会清空连续记录并累计遗忘次数", () => {
  const failed = scheduleNextReview({
    currentStage: 3,
    currentCleanStreak: 3,
    currentLapseCount: 2,
    evidence: "failed",
    now: NOW,
  });
  const recovered = scheduleNextReview({
    currentStage: failed.reviewStage,
    currentCleanStreak: failed.cleanStreak,
    currentLapseCount: failed.lapseCount,
    evidence: "independent_ac",
    now: NOW,
  });

  assert.equal(failed.status, "upsolve");
  assert.equal(failed.reviewStage, 0);
  assert.equal(failed.cleanStreak, 0);
  assert.equal(failed.lapseCount, 3);
  assert.equal(recovered.reviewStage, 1);
  assert.equal(recovered.intervalDays, 3);
});

test("每日队列先排补题债务，再按到期时间排列", () => {
  const items = [
    { id: 1, label: "review-old", status: "review", nextReviewAt: "2026-08-20" },
    { id: 2, label: "transfer", status: "transfer", nextReviewAt: "2026-08-19" },
    { id: 3, label: "upsolve-new", status: "upsolve", nextReviewAt: "2026-08-29" },
    { id: 4, label: "upsolve-old", status: "upsolve", nextReviewAt: "2026-08-28" },
    { id: 5, label: "review-new", status: "review", nextReviewAt: "2026-08-29" },
  ];
  const queue = buildDailyQueue(items, "normal");
  assert.deepEqual(
    queue.selected.map((item) => item.label),
    ["upsolve-old", "upsolve-new", "transfer", "review-old", "review-new"],
  );
  assert.equal(queue.upsolve.length, 2);
  assert.equal(queue.transfer.length, 1);
  assert.equal(queue.review.length, 2);
});

test("同优先级同日期时使用稳定 ID 决胜", () => {
  const queue = buildDailyQueue(
    [
      { id: 30, status: "review", nextReviewAt: "2026-08-29" },
      { id: 10, status: "review", nextReviewAt: "2026-08-29" },
      { id: 20, status: "review", nextReviewAt: "2026-08-29" },
    ],
    "normal",
  );
  assert.deepEqual(
    queue.selected.map((item) => item.id),
    [10, 20, 30],
  );
});

test("只有陌生迁移题的首次独立 AC 可以形成迁移证据", () => {
  assert.equal(
    classifyTransferAttempt({
      trainingRole: "transfer",
      transferIntegrity: "unseen",
      evidence: "independent_ac",
    }),
    "verified",
  );
  assert.equal(
    classifyTransferAttempt({
      trainingRole: "transfer",
      transferIntegrity: "unseen",
      evidence: "hinted_ac",
    }),
    "invalidated",
  );
  assert.equal(
    classifyTransferAttempt({
      trainingRole: "transfer",
      transferIntegrity: "exposed",
      evidence: "independent_ac",
    }),
    "already_exposed",
  );
});

test("稳定或保持题遇到新的非独立证据会重新激活", () => {
  assert.equal(shouldReactivateProblem("stable", "failed"), true);
  assert.equal(shouldReactivateProblem("retained", "hinted_ac"), true);
  assert.equal(shouldReactivateProblem("stable", "independent_ac"), false);
  assert.equal(shouldReactivateProblem("review", "failed"), false);
});

test("稳定态再次独立完成只追加证据而不重新排期", () => {
  const decision = scheduleProblemEvidence({
    status: "stable",
    reviewStage: 4,
    cleanStreak: 1,
    lapseCount: 0,
    lastEvidence: "independent_ac",
    evidence: "independent_ac",
    now: NOW,
  });
  assert.equal(decision.status, "stable");
  assert.equal(decision.dueAt, null);
  assert.equal(decision.reviewStage, 4);
});

test("稳定态收到失败证据仍会重新激活", () => {
  const decision = scheduleProblemEvidence({
    status: "stable",
    reviewStage: 4,
    cleanStreak: 1,
    lapseCount: 0,
    lastEvidence: "independent_ac",
    evidence: "failed",
    now: NOW,
  });
  assert.equal(decision.status, "upsolve");
  assert.ok(decision.dueAt);
});

test("训练模式会稳定限制每日队列", () => {
  const items = [1, 2, 3, 4, 5, 6, 7];
  assert.deepEqual(selectDailyQueue(items, "normal"), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(selectDailyQueue(items, "recovery"), [1, 2, 3, 4]);
  assert.deepEqual(selectDailyQueue(items, "low_energy"), [1, 2]);
});
