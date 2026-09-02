import {
  contestIdentity,
  problemIdentity,
  type ImportBundle,
} from "./import.ts";

type ExistingContest = {
  id: number;
  title: string;
  contestUrl: string;
  startedAt: string;
};
type ExistingProblem = {
  id: number;
  title: string;
  url: string;
  platform: string;
};
type ExistingAttempt = {
  problemId: number;
  context: string;
  evidence: string;
  helpLevel: string;
  idempotencyKey: string | null;
  previousStage: number;
  nextStage: number;
  scheduledAt: string | null;
  scheduleReason: string;
  notes: string;
  attemptedAt: string;
};

export function buildImportPlan(bundle: ImportBundle, existing: {
  contests: ExistingContest[];
  problems: ExistingProblem[];
  attempts: ExistingAttempt[];
  hasSettings: boolean;
  maxContestId: number;
  maxProblemId: number;
}, now = new Date().toISOString()) {
  const existingContestByKey = new Map(
    existing.contests.map((row) => [contestIdentity(row), row.id]),
  );
  const contestIds = new Map<number, number>();
  const contestRows = [];
  let nextContestId = existing.maxContestId;
  for (const contest of bundle.contests) {
    const key = contestIdentity(contest);
    const found = existingContestByKey.get(key);
    const id = found ?? ++nextContestId;
    contestIds.set(contest.sourceId, id);
    if (found) continue;
    contestRows.push({
      id,
      title: contest.title,
      platform: contest.platform,
      contestUrl: contest.contestUrl,
      startedAt: contest.startedAt,
      durationMinutes: contest.durationMinutes,
      status: contest.status,
      notes: contest.notes,
      createdAt: contest.createdAt,
    });
    existingContestByKey.set(key, id);
  }

  const existingProblemByKey = new Map(
    existing.problems.map((row) => [problemIdentity(row), row.id]),
  );
  const problemIds = new Map<number, number>();
  const createdProblemSources = new Set<number>();
  let nextProblemId = existing.maxProblemId;
  for (const problem of bundle.problems) {
    const key = problemIdentity(problem);
    const found = existingProblemByKey.get(key);
    const id = found ?? ++nextProblemId;
    problemIds.set(problem.sourceId, id);
    if (found) continue;
    createdProblemSources.add(problem.sourceId);
    existingProblemByKey.set(key, id);
  }
  const problemRows = bundle.problems
    .filter((problem) => createdProblemSources.has(problem.sourceId))
    .map((problem) => ({
      id: problemIds.get(problem.sourceId)!,
      contestId: problem.sourceContestId
        ? (contestIds.get(problem.sourceContestId) ?? null)
        : null,
      title: problem.title,
      url: problem.url,
      platform: problem.platform,
      origin: problem.origin,
      status: problem.status,
      reviewStage: problem.reviewStage,
      cleanStreak: problem.cleanStreak,
      lapseCount: problem.lapseCount,
      trainingRole: problem.trainingRole,
      validatesProblemId: problem.sourceValidatesProblemId
        ? (problemIds.get(problem.sourceValidatesProblemId) ?? null)
        : null,
      transferIntegrity: problem.transferIntegrity,
      nextReviewAt: problem.nextReviewAt,
      lastEvidence: problem.lastEvidence,
      notes: problem.notes,
      createdAt: problem.createdAt,
      updatedAt: problem.updatedAt,
    }));

  const existingAttemptByKey = new Map(
    existing.attempts
      .filter((row) => row.idempotencyKey !== null)
      .map((row) => [row.idempotencyKey, row]),
  );
  const attemptRows = [];
  let skippedAttempts = 0;
  for (const attempt of bundle.attempts) {
    const problemId = problemIds.get(attempt.sourceProblemId);
    if (!problemId) throw new Error("导入尝试找不到目标题目。");
    const found = attempt.idempotencyKey
      ? existingAttemptByKey.get(attempt.idempotencyKey)
      : undefined;
    if (found) {
      const same = found.problemId === problemId &&
        found.context === attempt.context &&
        found.evidence === attempt.evidence &&
        found.helpLevel === attempt.helpLevel &&
        found.previousStage === attempt.previousStage &&
        found.nextStage === attempt.nextStage &&
        found.scheduledAt === attempt.scheduledAt &&
        found.scheduleReason.trim() === attempt.scheduleReason.trim() &&
        found.notes.trim() === attempt.notes.trim() &&
        found.attemptedAt === attempt.attemptedAt;
      if (!same) throw new Error("幂等键冲突：已有 attempt 内容不同。");
      skippedAttempts += 1;
      continue;
    }
    if (!attempt.idempotencyKey && !createdProblemSources.has(attempt.sourceProblemId)) {
      skippedAttempts += 1;
      continue;
    }
    attemptRows.push({
      problemId,
      context: attempt.context,
      evidence: attempt.evidence,
      helpLevel: attempt.helpLevel,
      idempotencyKey: attempt.idempotencyKey,
      previousStage: attempt.previousStage,
      nextStage: attempt.nextStage,
      scheduledAt: attempt.scheduledAt,
      scheduleReason: attempt.scheduleReason,
      notes: attempt.notes,
      attemptedAt: attempt.attemptedAt,
    });
  }

  const settingsRows = existing.hasSettings ? [] : [{
    id: 1,
    mode: bundle.settings.mode,
    timezone: bundle.settings.timezone,
    reminderTime: bundle.settings.reminderTime,
    updatedAt: now,
  }];
  const preview = {
    version: bundle.version,
    contests: {
      add: contestRows.length,
      skip: bundle.contests.length - contestRows.length,
    },
    problems: {
      add: problemRows.length,
      skip: bundle.problems.length - problemRows.length,
    },
    attempts: { add: attemptRows.length, skip: skippedAttempts },
    settings: existing.hasSettings ? { add: 0, skip: 1 } : { add: 1, skip: 0 },
  };
  return {
    preview,
    contests: contestRows,
    problems: problemRows,
    attempts: attemptRows,
    settings: settingsRows,
  };
}
