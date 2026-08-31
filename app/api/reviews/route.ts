import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attempts, problems } from "@/db/schema";
import {
  parseEvidenceSubmission,
  sameEvidenceSubmission,
  toEvidenceReceipt,
  type EvidenceSubmission,
} from "@/lib/training/evidence";
import { scheduleProblemEvidence } from "@/lib/training/reactivation";
import { classifyTransferAttempt } from "@/lib/training/transfer";

function isIdempotencyKeyConflict(error: unknown) {
  return error instanceof Error && error.message.includes("attempts.idempotency_key");
}

export async function recordEvidence(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "证据请求必须是对象。" }, { status: 400 });
    }
    const parsed = parseEvidenceSubmission(body as Record<string, unknown>);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    const input = parsed.value;

    const db = getDb();
    const replayResponse = async (submission: EvidenceSubmission) => {
      const [existing] = await getDb()
        .select()
        .from(attempts)
        .where(eq(attempts.idempotencyKey, submission.idempotencyKey))
        .limit(1);
      if (!existing) return null;
      if (!sameEvidenceSubmission(existing as EvidenceSubmission, submission)) {
        return Response.json({ error: "相同幂等键携带了不同证据。" }, { status: 409 });
      }
      return Response.json(toEvidenceReceipt(existing, true));
    };
    const replay = await replayResponse(input);
    if (replay) return replay;

    const [problem] = await db
      .select()
      .from(problems)
      .where(eq(problems.id, input.problemId))
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
      evidence: input.evidence,
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
          evidence: input.evidence,
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
        lastEvidence: input.evidence,
        updatedAt: now,
      })
      .where(eq(problems.id, input.problemId))
      .returning();
    const insertAttempt = db.insert(attempts).values({
      problemId: input.problemId,
      context: verifiesTransfer
        ? "transfer_verified"
        : isTransfer
          ? "transfer"
          : "review",
      evidence: input.evidence,
      helpLevel: input.helpLevel,
      idempotencyKey: input.idempotencyKey,
      previousStage: problem.reviewStage,
      nextStage: decision.reviewStage,
      scheduledAt: decision.dueAt,
      scheduleReason: decision.reason,
      notes: input.notes,
    }).returning();
    try {
      const result = verifiesTransfer && sourceProblem
        ? await db.batch([
            insertAttempt,
            updateProblem,
            db
              .update(problems)
              .set({ status: "stable", nextReviewAt: null, updatedAt: now })
              .where(eq(problems.id, sourceProblem.id)),
          ])
        : await db.batch([insertAttempt, updateProblem]);
      const [inserted] = result[0];
      return Response.json(toEvidenceReceipt(inserted, false));
    } catch (error) {
      if (isIdempotencyKeyConflict(error)) {
        const racedReplay = await replayResponse(input);
        if (racedReplay) return racedReplay;
      }
      throw error;
    }
  } catch {
    return Response.json({ error: "更新失败" }, { status: 500 });
  }
}

export const POST = recordEvidence;
