import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attempts, problems } from "@/db/schema";
import { requireOwnerAccess } from "@/lib/agent/auth";
import {
  groupCodeforcesSubmissions,
  type CodeforcesSubmission,
} from "@/lib/integrations/codeforces";
import { isSolveEvidence, scheduleNextReview } from "@/lib/training/scheduler";
import { shouldReactivateProblem } from "@/lib/training/reactivation";

const HANDLE_PATTERN = /^[A-Za-z0-9_.-]{3,30}$/;

export async function GET(request: Request) {
  const unauthorized = requireOwnerAccess(request);
  if (unauthorized) return unauthorized;

  try {
    const url = new URL(request.url);
    const handle = (url.searchParams.get("handle") ?? "").trim();
    const requestedCount = Number(url.searchParams.get("count") ?? 60);
    const count = Number.isInteger(requestedCount)
      ? Math.max(10, Math.min(requestedCount, 100))
      : 60;
    if (!HANDLE_PATTERN.test(handle)) {
      return Response.json({ error: "请输入有效的 Codeforces handle。" }, { status: 400 });
    }

    const apiUrl = new URL("https://codeforces.com/api/user.status");
    apiUrl.searchParams.set("handle", handle);
    apiUrl.searchParams.set("from", "1");
    apiUrl.searchParams.set("count", String(count));
    const response = await fetch(apiUrl, {
      headers: { "User-Agent": "xcpc-trainer/0.2" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Codeforces 返回 HTTP ${response.status}`);
    const payload = (await response.json()) as {
      status?: string;
      comment?: string;
      result?: CodeforcesSubmission[];
    };
    if (payload.status !== "OK" || !Array.isArray(payload.result)) {
      throw new Error(payload.comment || "Codeforces 提交记录读取失败");
    }

    const candidates = groupCodeforcesSubmissions(payload.result).slice(0, 30);
    const db = getDb();
    const tracked = await db
      .select({ url: problems.url, status: problems.status })
      .from(problems);
    const trackedByUrl = new Map(
      tracked
        .filter((problem) => problem.url)
        .map((problem) => [
          problem.url.replace(/\/$/, "").toLowerCase(),
          problem.status,
        ]),
    );

    return Response.json({
      handle,
      fetchedSubmissions: payload.result.length,
      candidates: candidates.map((candidate) => {
        const trackedStatus = candidate.url
          ? (trackedByUrl.get(candidate.url.replace(/\/$/, "").toLowerCase()) ?? null)
          : null;
        return {
          ...candidate,
          tracked: trackedStatus !== null,
          trackedStatus,
          reactivatable:
            trackedStatus !== null &&
            ["retained", "stable", "mastered"].includes(trackedStatus),
        };
      }),
      evidenceWarning:
        "Codeforces 的 AC 只证明提交通过，不能证明是否看过题解；AC 题必须由用户确认训练证据。",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Codeforces 同步失败";
    return Response.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const unauthorized = requireOwnerAccess(request);
  if (unauthorized) return unauthorized;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length < 1 || items.length > 30) {
      return Response.json({ error: "一次请选择 1 至 30 道题。" }, { status: 400 });
    }

    const normalized = items.map((value, index) => {
      const item = value as Record<string, unknown>;
      const title = typeof item.title === "string" ? item.title.trim() : "";
      const url = typeof item.url === "string" ? item.url.trim() : "";
      if (!title || !url || !/^https:\/\/codeforces\.com\//i.test(url)) {
        throw new Error(`第 ${index + 1} 道题不是有效的 Codeforces 题目。`);
      }
      if (!isSolveEvidence(item.evidence)) {
        throw new Error(`请确认第 ${index + 1} 道题的训练证据。`);
      }
      return { title: title.slice(0, 160), url, evidence: item.evidence };
    });

    const db = getDb();
    const existing = await db.select().from(problems);
    const known = new Map(
      existing.map((problem) => [
        problem.url.replace(/\/$/, "").toLowerCase(),
        problem,
      ]),
    );
    let imported = 0;
    let reactivated = 0;
    let skipped = 0;
    for (const item of normalized) {
      const key = item.url.replace(/\/$/, "").toLowerCase();
      const existingProblem = known.get(key);
      if (existingProblem) {
        if (!shouldReactivateProblem(existingProblem.status, item.evidence)) {
          skipped += 1;
          continue;
        }
        const decision = scheduleNextReview({
          currentStage: existingProblem.reviewStage,
          currentCleanStreak:
            existingProblem.cleanStreak || existingProblem.reviewStage,
          currentLapseCount: existingProblem.lapseCount,
          evidence: item.evidence,
        });
        const now = new Date().toISOString();
        const updateProblem = db
          .update(problems)
          .set({
            status: decision.status,
            reviewStage: decision.reviewStage,
            cleanStreak: decision.cleanStreak,
            lapseCount: decision.lapseCount,
            nextReviewAt: decision.dueAt,
            lastEvidence: item.evidence,
            updatedAt: now,
          })
          .where(eq(problems.id, existingProblem.id));
        const insertAttempt = db.insert(attempts).values({
          problemId: existingProblem.id,
          context: "codeforces_reactivation",
          evidence: item.evidence,
          previousStage: existingProblem.reviewStage,
          nextStage: decision.reviewStage,
          scheduledAt: decision.dueAt,
          scheduleReason: `Codeforces 新证据重新激活：${decision.reason}`,
        });
        await db.batch([updateProblem, insertAttempt]);
        reactivated += 1;
        continue;
      }
      const decision = scheduleNextReview({ evidence: item.evidence });
      const [problem] = await db
        .insert(problems)
        .values({
          title: item.title,
          url: item.url,
          platform: "codeforces",
          origin: "contest",
          status: decision.status,
          reviewStage: decision.reviewStage,
          cleanStreak: decision.cleanStreak,
          lapseCount: decision.lapseCount,
          nextReviewAt: decision.dueAt,
          lastEvidence: item.evidence,
          updatedAt: new Date().toISOString(),
        })
        .returning();
      await db.insert(attempts).values({
        problemId: problem.id,
        context: "codeforces_import",
        evidence: item.evidence,
        previousStage: 0,
        nextStage: decision.reviewStage,
        scheduledAt: decision.dueAt,
        scheduleReason: decision.reason,
      });
      known.set(key, problem);
      imported += 1;
    }

    return Response.json({ imported, reactivated, skipped }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Codeforces 导入失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
