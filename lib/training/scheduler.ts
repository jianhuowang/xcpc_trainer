export const EVIDENCE_VALUES = [
  "failed",
  "editorial_understood",
  "hinted_ac",
  "independent_ac",
] as const;

export type SolveEvidence = (typeof EVIDENCE_VALUES)[number];

export type TrainingStatus = "upsolve" | "review" | "retained" | "stable";

export type ScheduleDecision = {
  status: TrainingStatus;
  reviewStage: number;
  cleanStreak: number;
  lapseCount: number;
  dueAt: string;
  intervalDays: number;
  reason: string;
};

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Return midnight in Asia/Shanghai after a number of local calendar days. */
export function afterShanghaiDays(now: Date, days: number) {
  const local = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const dueUtc =
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + days,
    ) - SHANGHAI_OFFSET_MS;
  return new Date(dueUtc).toISOString();
}

export function isSolveEvidence(value: unknown): value is SolveEvidence {
  return (
    typeof value === "string" &&
    EVIDENCE_VALUES.includes(value as SolveEvidence)
  );
}

export function scheduleNextReview(input: {
  currentStage?: number;
  currentCleanStreak?: number;
  currentLapseCount?: number;
  evidence: SolveEvidence;
  now?: Date;
}): ScheduleDecision {
  const now = input.now ?? new Date();
  const cleanStreak = Math.max(0, Math.floor(input.currentCleanStreak ?? 0));
  const lapseCount = Math.max(0, Math.floor(input.currentLapseCount ?? 0));

  if (input.evidence === "failed") {
    return {
      status: "upsolve",
      reviewStage: 0,
      cleanStreak: 0,
      lapseCount: lapseCount + 1,
      dueAt: afterShanghaiDays(now, 1),
      intervalDays: 1,
      reason: "本次未独立完成，连续独立记录已清零；明天优先补题。",
    };
  }

  if (input.evidence === "editorial_understood") {
    return {
      status: "review",
      reviewStage: 0,
      cleanStreak: 0,
      lapseCount,
      dueAt: afterShanghaiDays(now, 2),
      intervalDays: 2,
      reason: "已接触题解，但还没有独立证据；两天后进行第一次盲重做。",
    };
  }

  if (input.evidence === "hinted_ac") {
    return {
      status: "review",
      reviewStage: 0,
      cleanStreak: 0,
      lapseCount,
      dueAt: afterShanghaiDays(now, 3),
      intervalDays: 3,
      reason: "提示打断了连续独立记录；三天后重新验证完整重建。",
    };
  }

  const nextCleanStreak = Math.min(4, cleanStreak + 1);
  const nextStage = nextCleanStreak;
  const intervalByStage: Record<number, number> = {
    1: 3,
    2: 7,
    3: 21,
    4: 45,
  };
  const intervalDays = intervalByStage[nextStage] ?? 45;
  const retained = nextStage >= 4;

  return {
    status: retained ? "retained" : "review",
    reviewStage: nextStage,
    cleanStreak: nextCleanStreak,
    lapseCount,
    dueAt: afterShanghaiDays(now, intervalDays),
    intervalDays,
    reason: retained
      ? "同题保持已经通过，进入 45 天低频维护；真正稳定仍需迁移题或后续比赛验证。"
      : nextStage === 1
        ? "首次独立完成，三天后进行第一次盲重做。"
        : `连续第 ${nextStage} 次无提示完成，${intervalDays} 天后再次验证。`,
  };
}
