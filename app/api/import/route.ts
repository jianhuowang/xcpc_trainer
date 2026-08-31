import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attempts, contests, problems, trainingSettings } from "@/db/schema";
import {
  contestIdentity,
  parseImportBundle,
  problemIdentity,
  settingsMergePreview,
} from "@/lib/data/import";

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 2_500_000) {
      return Response.json({ error: "备份文件不能超过 2.5 MB。" }, { status: 413 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const bundle = parseImportBundle(body.data);
    const dryRun = body.dryRun !== false;
    const db = getDb();
    const [existingProblems, existingContests, existingSettings] = await Promise.all([
      db
        .select({
          id: problems.id,
          title: problems.title,
          url: problems.url,
          platform: problems.platform,
        })
        .from(problems),
      db
        .select({
          id: contests.id,
          title: contests.title,
          contestUrl: contests.contestUrl,
          startedAt: contests.startedAt,
        })
        .from(contests),
      db
        .select({ id: trainingSettings.id })
        .from(trainingSettings)
        .where(eq(trainingSettings.id, 1))
        .limit(1),
    ]);

    const problemKeys = new Set(existingProblems.map(problemIdentity));
    const contestKeys = new Set(existingContests.map(contestIdentity));
    const newContests = bundle.contests.filter(
      (contest) => !contestKeys.has(contestIdentity(contest)),
    );
    const newProblems = bundle.problems.filter(
      (problem) => !problemKeys.has(problemIdentity(problem)),
    );
    const newProblemIds = new Set(newProblems.map((problem) => problem.sourceId));
    const newAttempts = bundle.attempts.filter((attempt) =>
      newProblemIds.has(attempt.sourceProblemId),
    );
    const preview = {
      version: bundle.version,
      contests: { add: newContests.length, skip: bundle.contests.length - newContests.length },
      problems: { add: newProblems.length, skip: bundle.problems.length - newProblems.length },
      attempts: { add: newAttempts.length },
      settings: settingsMergePreview(existingSettings.length > 0),
    };

    if (dryRun) return Response.json({ dryRun: true, preview });

    const contestMap = new Map<number, number>();
    const existingContestByKey = new Map(
      existingContests.map((contest) => [contestIdentity(contest), contest.id]),
    );
    for (const contest of bundle.contests) {
      const key = contestIdentity(contest);
      const existingId = existingContestByKey.get(key);
      if (existingId) {
        contestMap.set(contest.sourceId, existingId);
        continue;
      }
      const [created] = await db
        .insert(contests)
        .values({
          title: contest.title,
          platform: contest.platform,
          contestUrl: contest.contestUrl,
          startedAt: contest.startedAt,
          durationMinutes: contest.durationMinutes,
          status: contest.status,
          notes: contest.notes,
          createdAt: contest.createdAt,
        })
        .returning({ id: contests.id });
      contestMap.set(contest.sourceId, created.id);
      existingContestByKey.set(key, created.id);
    }

    const existingProblemByKey = new Map(
      existingProblems.map((problem) => [problemIdentity(problem), problem.id]),
    );
    const importedProblemMap = new Map<number, number>();
    const createdProblemSources = new Set<number>();
    for (const problem of bundle.problems) {
      const key = problemIdentity(problem);
      const existingId = existingProblemByKey.get(key);
      if (existingId) {
        importedProblemMap.set(problem.sourceId, existingId);
        continue;
      }
      const [created] = await db
        .insert(problems)
        .values({
          contestId: problem.sourceContestId
            ? (contestMap.get(problem.sourceContestId) ?? null)
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
          transferIntegrity: problem.transferIntegrity,
          nextReviewAt: problem.nextReviewAt,
          lastEvidence: problem.lastEvidence,
          notes: problem.notes,
          createdAt: problem.createdAt,
          updatedAt: problem.updatedAt,
        })
        .returning({ id: problems.id });
      importedProblemMap.set(problem.sourceId, created.id);
      createdProblemSources.add(problem.sourceId);
      existingProblemByKey.set(key, created.id);
    }

    for (const problem of bundle.problems) {
      if (
        !createdProblemSources.has(problem.sourceId) ||
        problem.sourceValidatesProblemId === null
      ) {
        continue;
      }
      const problemId = importedProblemMap.get(problem.sourceId);
      const validatesProblemId = importedProblemMap.get(
        problem.sourceValidatesProblemId,
      );
      if (!problemId || !validatesProblemId) continue;
      await db
        .update(problems)
        .set({ validatesProblemId })
        .where(eq(problems.id, problemId));
    }

    for (const attempt of bundle.attempts) {
      if (!createdProblemSources.has(attempt.sourceProblemId)) continue;
      const problemId = importedProblemMap.get(attempt.sourceProblemId);
      if (!problemId) continue;
      await db.insert(attempts).values({
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

    if (!existingSettings.length) {
      await db
        .insert(trainingSettings)
        .values({
          id: 1,
          mode: bundle.settings.mode,
          timezone: bundle.settings.timezone,
          reminderTime: bundle.settings.reminderTime,
          updatedAt: new Date().toISOString(),
        })
        .onConflictDoNothing({ target: trainingSettings.id });
    }

    return Response.json({ dryRun: false, imported: preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "导入失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
