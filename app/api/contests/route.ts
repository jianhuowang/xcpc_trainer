import { desc, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { attempts, contests, problems } from "@/db/schema";
import { requireAgentAccess } from "@/lib/agent/auth";
import { isSolveEvidence, scheduleNextReview } from "@/lib/training/scheduler";

const PLATFORMS = new Set(["codeforces", "nowcoder", "atcoder", "luogu", "other"]);

export async function GET(request: Request) {
  const unauthorized = requireAgentAccess(request);
  if (unauthorized) return unauthorized;
  try {
    const db = getDb();
    const rows = await db.select().from(contests).orderBy(desc(contests.startedAt)).limit(10);
    const ids = rows.map((contest) => contest.id);
      const linked = ids.length
      ? await db
        .select({
          id: problems.id,
          contestId: problems.contestId,
          status: problems.status,
        })
          .from(problems)
          .where(inArray(problems.contestId, ids))
      : [];

    return Response.json({
      contests: rows.map((contest) => {
        const contestProblems = linked.filter((problem) => problem.contestId === contest.id);
        return {
          ...contest,
          problemCount: contestProblems.length,
          openCount: contestProblems.filter(
            (problem) =>
              problem.status === "upsolve" ||
              problem.status === "review" ||
              problem.status === "transfer",
          ).length,
        };
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "比赛记录加载失败";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const unauthorized = requireAgentAccess(request);
  if (unauthorized) return unauthorized;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const platform = PLATFORMS.has(String(body.platform)) ? String(body.platform) : "other";
    const contestUrl = typeof body.contestUrl === "string" ? body.contestUrl.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const rawProblems = Array.isArray(body.problems) ? body.problems : [];
    const startedText = typeof body.startedAt === "string" ? body.startedAt : "";
    const started = new Date(
      startedText && !startedText.includes("T")
        ? `${startedText}T00:00:00+08:00`
        : startedText,
    );

    if (!title || title.length > 160) {
      return Response.json({ error: "比赛名称不能为空，且不能超过 160 个字符。" }, { status: 400 });
    }
    if (!startedText || Number.isNaN(started.getTime())) {
      return Response.json({ error: "请选择有效的比赛日期。" }, { status: 400 });
    }
    if (contestUrl && !/^https?:\/\//i.test(contestUrl)) {
      return Response.json({ error: "比赛链接必须以 http:// 或 https:// 开头。" }, { status: 400 });
    }
    if (rawProblems.length < 1 || rawProblems.length > 20) {
      return Response.json({ error: "一场比赛请录入 1 至 20 道暴露问题的题目。" }, { status: 400 });
    }

    const normalized = rawProblems.map((value, index) => {
      const row = value as Record<string, unknown>;
      const problemTitle = typeof row.title === "string" ? row.title.trim() : "";
      const url = typeof row.url === "string" ? row.url.trim() : "";
      const problemNotes = typeof row.notes === "string" ? row.notes.trim() : "";
      if (!problemTitle || problemTitle.length > 160) {
        throw new Error(`第 ${index + 1} 道题缺少有效名称。`);
      }
      if (url && !/^https?:\/\//i.test(url)) {
        throw new Error(`第 ${index + 1} 道题的链接无效。`);
      }
      if (!isSolveEvidence(row.evidence)) {
        throw new Error(`第 ${index + 1} 道题的训练证据无效。`);
      }
      return { title: problemTitle, url, notes: problemNotes, evidence: row.evidence };
    });

    const db = getDb();
    const [contest] = await db
      .insert(contests)
      .values({
        title,
        platform,
        contestUrl,
        startedAt: started.toISOString(),
        notes,
        status: "reviewed",
      })
      .returning();

    const createdProblems = [];
    for (const item of normalized) {
      const decision = scheduleNextReview({ evidence: item.evidence });
      const [problem] = await db
        .insert(problems)
        .values({
          contestId: contest.id,
          title: item.title,
          url: item.url,
          platform,
          origin: "contest",
          status: decision.status,
          reviewStage: decision.reviewStage,
          cleanStreak: decision.cleanStreak,
          lapseCount: decision.lapseCount,
          nextReviewAt: decision.dueAt,
          lastEvidence: item.evidence,
          notes: item.notes,
          updatedAt: new Date().toISOString(),
        })
        .returning();
      await db.insert(attempts).values({
        problemId: problem.id,
        context: "contest",
        evidence: item.evidence,
        previousStage: 0,
        nextStage: decision.reviewStage,
        scheduledAt: decision.dueAt,
        scheduleReason: decision.reason,
        notes: item.notes,
      });
      createdProblems.push(problem);
    }

    return Response.json({ contest, problems: createdProblems }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "比赛保存失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
