import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { attempts, contests, problems, trainingSettings } from "@/db/schema";
import { requireOwnerAccess } from "@/lib/agent/auth";
import {
  buildDailyQueue,
  isTrainingMode,
  MODE_CONFIG,
  type TrainingMode,
} from "@/lib/training/modes";
import { toDashboardBlindProblem } from "@/lib/training/projection";

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) {
    return "数据库尚未初始化，请先应用项目迁移。";
  }
  return message;
}

export async function GET(request: Request) {
  const unauthorized = requireOwnerAccess(request);
  if (unauthorized) return unauthorized;
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(problems)
      .orderBy(asc(problems.nextReviewAt), desc(problems.createdAt))
      .limit(200);
    const [storedSettings] = await db
      .select()
      .from(trainingSettings)
      .where(eq(trainingSettings.id, 1))
      .limit(1);
    const recentContestRows = await db
      .select()
      .from(contests)
      .orderBy(desc(contests.startedAt))
      .limit(5);
    const recentAttempts = await db
      .select({ context: attempts.context, evidence: attempts.evidence })
      .from(attempts)
      .orderBy(desc(attempts.attemptedAt))
      .limit(500);
    const recentContestIds = recentContestRows.map((contest) => contest.id);
    const contestProblems = recentContestIds.length
      ? await db
          .select({ contestId: problems.contestId, status: problems.status })
          .from(problems)
          .where(inArray(problems.contestId, recentContestIds))
      : [];
    const mode: TrainingMode = isTrainingMode(storedSettings?.mode)
      ? storedSettings.mode
      : "normal";

    const now = new Date().toISOString();
    const allDue = rows.filter(
      (problem) =>
        (problem.status === "mastered" && problem.nextReviewAt === null) ||
        (problem.nextReviewAt !== null && problem.nextReviewAt <= now)
    );
    const queue = buildDailyQueue(allDue, mode);
    const pendingTransferSources = new Set(
      rows
        .filter(
          (problem) =>
            problem.trainingRole === "transfer" &&
            problem.transferIntegrity === "unseen" &&
            problem.validatesProblemId !== null,
        )
        .map((problem) => problem.validatesProblemId),
    );
    const transferCandidates = rows.filter(
      (problem) =>
        problem.trainingRole === "core" &&
        (problem.status === "retained" || problem.status === "mastered") &&
        !pendingTransferSources.has(problem.id),
    );
    const blindAttempts = recentAttempts.filter((attempt) =>
      ["review", "transfer", "transfer_verified"].includes(attempt.context),
    );
    const independentPasses = blindAttempts.filter(
      (attempt) => attempt.evidence === "independent_ac",
    ).length;

    return Response.json({
      due: queue.selected.map(toDashboardBlindProblem),
      queues: {
        upsolve: queue.upsolve.map(toDashboardBlindProblem),
        transfer: queue.transfer.map(toDashboardBlindProblem),
        review: queue.review.map(toDashboardBlindProblem),
      },
      transferCandidates: transferCandidates.map(toDashboardBlindProblem),
      recent: [...rows]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 8)
        .map(toDashboardBlindProblem),
      recentContests: recentContestRows.map((contest) => {
        const linked = contestProblems.filter((problem) => problem.contestId === contest.id);
        return {
          ...contest,
          problemCount: linked.length,
          openCount: linked.filter(
            (problem) =>
              problem.status === "upsolve" ||
              problem.status === "review" ||
              problem.status === "transfer",
          ).length,
        };
      }),
      stats: {
        total: rows.length,
        due: allDue.length,
        deferred: queue.deferred,
        reviewing: rows.filter((problem) => problem.status === "review").length,
        upsolve: rows.filter((problem) => problem.status === "upsolve").length,
        retained: rows.filter(
          (problem) => problem.status === "retained" || problem.status === "mastered",
        ).length,
        stable: rows.filter((problem) => problem.status === "stable").length,
        transferPending: rows.filter(
          (problem) =>
            problem.trainingRole === "transfer" &&
            problem.transferIntegrity === "unseen",
        ).length,
        quality: {
          sampleSize: blindAttempts.length,
          independentPassRate: blindAttempts.length
            ? Math.round((independentPasses / blindAttempts.length) * 100)
            : null,
          failedBlindAttempts: blindAttempts.filter(
            (attempt) => attempt.evidence === "failed",
          ).length,
          verifiedTransfers: recentAttempts.filter(
            (attempt) => attempt.context === "transfer_verified",
          ).length,
        },
      },
      settings: {
        mode,
        dailyLimit: MODE_CONFIG[mode].dailyLimit,
        timezone: storedSettings?.timezone ?? "Asia/Shanghai",
        reminderTime: storedSettings?.reminderTime ?? "20:30",
      },
      generatedAt: now,
    });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
