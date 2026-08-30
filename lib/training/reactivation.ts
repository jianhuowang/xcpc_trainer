import {
  scheduleNextReview,
  type SolveEvidence,
} from "./scheduler.ts";

export function shouldReactivateProblem(
  status: string,
  evidence: SolveEvidence,
) {
  return (
    ["retained", "stable", "mastered"].includes(status) &&
    evidence !== "independent_ac"
  );
}

export function scheduleProblemEvidence(input: {
  status: string;
  reviewStage: number;
  cleanStreak: number;
  lapseCount: number;
  lastEvidence: string;
  evidence: SolveEvidence;
  now?: Date;
}) {
  if (input.status === "stable" && input.evidence === "independent_ac") {
    return {
      status: "stable" as const,
      reviewStage: input.reviewStage,
      cleanStreak: input.cleanStreak,
      lapseCount: input.lapseCount,
      dueAt: null,
      intervalDays: null,
      reason: "稳定态再次独立完成：保留本次证据，不重新建立同题排程。",
    };
  }

  return scheduleNextReview({
    currentStage: input.reviewStage,
    currentCleanStreak:
      input.cleanStreak === 0 && input.lastEvidence === "independent_ac"
        ? input.reviewStage
        : input.cleanStreak,
    currentLapseCount: input.lapseCount,
    evidence: input.evidence,
    now: input.now,
  });
}
