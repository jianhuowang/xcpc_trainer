import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attempts, problems } from "@/db/schema";
import { requireOwnerAccess } from "@/lib/agent/auth";
import {
  isSolveEvidence,
  scheduleNextReview,
} from "@/lib/training/scheduler";
import { shouldReactivateProblem } from "@/lib/training/reactivation";

const ALLOWED_PLATFORMS = new Set([
  "codeforces",
  "nowcoder",
  "atcoder",
  "luogu",
  "other",
]);

const ALLOWED_ORIGINS = new Set(["contest", "practice"]);

export async function POST(request: Request) {
  const unauthorized = requireOwnerAccess(request);
  if (unauthorized) return unauthorized;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const platform =
      typeof body.platform === "string" && ALLOWED_PLATFORMS.has(body.platform)
        ? body.platform
        : "other";
    const origin =
      typeof body.origin === "string" && ALLOWED_ORIGINS.has(body.origin)
        ? body.origin
        : "practice";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";

    if (!title || title.length > 160) {
      return Response.json(
        { error: "题目名称不能为空，且不能超过 160 个字符。" },
        { status: 400 }
      );
    }

    if (!isSolveEvidence(body.evidence)) {
      return Response.json({ error: "请选择有效的完成情况。" }, { status: 400 });
    }

    if (url && !/^https?:\/\//i.test(url)) {
      return Response.json(
        { error: "题目链接必须以 http:// 或 https:// 开头。" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const db = getDb();
    if (url) {
      const normalizedUrl = url.replace(/\/$/, "").toLowerCase();
      const knownUrls = await db.select({ id: problems.id, url: problems.url }).from(problems);
      const duplicate = knownUrls.find(
        (problem) =>
          problem.url.replace(/\/$/, "").toLowerCase() === normalizedUrl,
      );
      if (duplicate) {
        const [existing] = await db
          .select()
          .from(problems)
          .where(eq(problems.id, duplicate.id))
          .limit(1);
        const mayReactivate =
          existing &&
          shouldReactivateProblem(existing.status, body.evidence);
        if (!mayReactivate || !existing) {
          return Response.json(
            { error: "这道题已经在训练记录中，请在原记录上提交证据。" },
            { status: 409 },
          );
        }
        const decision = scheduleNextReview({
          currentStage: existing.reviewStage,
          currentCleanStreak: existing.cleanStreak || existing.reviewStage,
          currentLapseCount: existing.lapseCount,
          evidence: body.evidence,
        });
        const updateProblem = db
          .update(problems)
          .set({
            status: decision.status,
            reviewStage: decision.reviewStage,
            cleanStreak: decision.cleanStreak,
            lapseCount: decision.lapseCount,
            nextReviewAt: decision.dueAt,
            lastEvidence: body.evidence,
            notes: notes || existing.notes,
            updatedAt: now,
          })
          .where(eq(problems.id, existing.id))
          .returning();
        const insertAttempt = db.insert(attempts).values({
          problemId: existing.id,
          context: "reactivation",
          evidence: body.evidence,
          previousStage: existing.reviewStage,
          nextStage: decision.reviewStage,
          scheduledAt: decision.dueAt,
          scheduleReason: `稳定或保持状态被新证据重新激活：${decision.reason}`,
          notes,
        });
        const [updatedRows] = await db.batch([updateProblem, insertAttempt]);
        return Response.json({
          problem: updatedRows[0],
          decision,
          reactivated: true,
        });
      }
    }

    const decision = scheduleNextReview({ evidence: body.evidence });
    const [problem] = await db
      .insert(problems)
      .values({
        title,
        url,
        platform,
        origin,
        status: decision.status,
        reviewStage: decision.reviewStage,
        cleanStreak: decision.cleanStreak,
        lapseCount: decision.lapseCount,
        nextReviewAt: decision.dueAt,
        lastEvidence: body.evidence,
        notes,
        updatedAt: now,
      })
      .returning();

    await db.insert(attempts).values({
      problemId: problem.id,
      context: "initial",
      evidence: body.evidence,
      previousStage: 0,
      nextStage: decision.reviewStage,
      scheduledAt: decision.dueAt,
      scheduleReason: decision.reason,
      notes,
    });

    return Response.json({ problem, decision }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
