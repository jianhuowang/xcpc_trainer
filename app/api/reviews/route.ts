import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attempts, problems } from "@/db/schema";
import {
  isSolveEvidence,
} from "@/lib/training/scheduler";
import { scheduleProblemEvidence } from "@/lib/training/reactivation";
import { classifyTransferAttempt } from "@/lib/training/transfer";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const problemId = Number(body.problemId);
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";

    if (!Number.isInteger(problemId) || problemId <= 0) {
      return Response.json({ error: "无效的题目编号。" }, { status: 400 });
    }

    if (!isSolveEvidence(body.evidence)) {
      return Response.json({ error: "请选择有效的重做结果。" }, { status: 400 });
    }

    const db = getDb();
    const [problem] = await db
      .select()
      .from(problems)
      .where(eq(problems.id, problemId))
      .limit(1);

    if (!problem) {
      return Response.json({ error: "题目不存在。" }, { status: 404 });
    }
    if (
      problem.trainingRole === "transfer" &&
      problem.transferIntegrity === "verified"
    ) {
      return Response.json(
        { error: "这项迁移验证已经完成，请刷新训练队列。" },
        { status: 409 },
      );
    }

    const isTransfer = problem.trainingRole === "transfer";
    const transferAttempt = classifyTransferAttempt({
      trainingRole: problem.trainingRole,
      transferIntegrity: problem.transferIntegrity,
      evidence: body.evidence,
    });
    const verifiesTransfer = transferAttempt === "verified";
    const [sourceProblem] = problem.validatesProblemId
      ? await db
          .select()
          .from(problems)
          .where(eq(problems.id, problem.validatesProblemId))
          .limit(1)
      : [];
    if (isTransfer && !sourceProblem) {
      return Response.json(
        { error: "迁移任务缺少对应的原训练题，暂未记录结果。" },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const decision = verifiesTransfer
      ? {
          status: "stable" as const,
          reviewStage: 4,
          cleanStreak: 1,
          lapseCount: problem.lapseCount,
          dueAt: null,
          intervalDays: null,
          reason:
            "首次接触的无标签迁移题已独立完成：原训练题获得迁移证据，进入稳定状态。",
        }
      : scheduleProblemEvidence({
          status: problem.status,
          reviewStage: problem.reviewStage,
          cleanStreak: problem.cleanStreak,
          lapseCount: problem.lapseCount,
          lastEvidence: problem.lastEvidence,
          evidence: body.evidence,
        });
    const nextTransferIntegrity = isTransfer
      ? verifiesTransfer
        ? "verified"
        : problem.transferIntegrity === "unseen"
          ? "exposed"
          : problem.transferIntegrity
      : problem.transferIntegrity;

    const updateProblem = db
      .update(problems)
      .set({
        status: decision.status,
        reviewStage: decision.reviewStage,
        cleanStreak: decision.cleanStreak,
        lapseCount: decision.lapseCount,
        transferIntegrity: nextTransferIntegrity,
        nextReviewAt: decision.dueAt,
        lastEvidence: body.evidence,
        updatedAt: now,
      })
      .where(eq(problems.id, problemId))
      .returning();
    const insertAttempt = db.insert(attempts).values({
      problemId,
      context: verifiesTransfer
        ? "transfer_verified"
        : isTransfer
          ? "transfer"
          : "review",
      evidence: body.evidence,
      previousStage: problem.reviewStage,
      nextStage: decision.reviewStage,
      scheduledAt: decision.dueAt,
      scheduleReason: decision.reason,
      notes,
    });
    let updatedRows;
    if (verifiesTransfer && sourceProblem) {
      const updateSource = db
        .update(problems)
        .set({
          status: "stable",
          nextReviewAt: null,
          updatedAt: now,
        })
        .where(eq(problems.id, sourceProblem.id));
      [updatedRows] = await db.batch([
        updateProblem,
        updateSource,
        insertAttempt,
      ]);
    } else {
      [updatedRows] = await db.batch([updateProblem, insertAttempt]);
    }
    const [updated] = updatedRows;

    return Response.json({
      problem: updated,
      decision,
      transferValidation:
        transferAttempt === "verified"
          ? "verified"
          : transferAttempt === "invalidated"
            ? "invalidated"
            : transferAttempt === "already_exposed"
              ? "already_exposed"
              : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
