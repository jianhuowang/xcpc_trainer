import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { problems } from "@/db/schema";
import { requireOwnerAccess } from "@/lib/agent/auth";
import { afterShanghaiDays } from "@/lib/training/scheduler";

const PLATFORMS = new Set([
  "codeforces",
  "nowcoder",
  "atcoder",
  "luogu",
  "other",
]);

export async function POST(request: Request) {
  const unauthorized = requireOwnerAccess(request);
  if (unauthorized) return unauthorized;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const sourceProblemId = Number(body.sourceProblemId);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const platform = PLATFORMS.has(String(body.platform))
      ? String(body.platform)
      : "other";

    if (!Number.isInteger(sourceProblemId) || sourceProblemId <= 0) {
      return Response.json({ error: "缺少有效的原训练题。" }, { status: 400 });
    }
    if (!title || title.length > 160) {
      return Response.json(
        { error: "迁移题名称不能为空，且不能超过 160 个字符。" },
        { status: 400 },
      );
    }
    if (url && !/^https?:\/\//i.test(url)) {
      return Response.json(
        { error: "迁移题链接必须以 http:// 或 https:// 开头。" },
        { status: 400 },
      );
    }

    const db = getDb();
    const [source] = await db
      .select()
      .from(problems)
      .where(eq(problems.id, sourceProblemId))
      .limit(1);
    if (!source) {
      return Response.json({ error: "原训练题不存在。" }, { status: 404 });
    }
    if (source.status !== "retained" && source.status !== "mastered") {
      return Response.json(
        { error: "只有完成同题保持的题目才能进入迁移验证。" },
        { status: 409 },
      );
    }

    const [pending] = await db
      .select({ id: problems.id })
      .from(problems)
      .where(
        and(
          eq(problems.trainingRole, "transfer"),
          eq(problems.validatesProblemId, sourceProblemId),
          eq(problems.transferIntegrity, "unseen"),
        ),
      )
      .limit(1);
    if (pending) {
      return Response.json(
        { error: "这道题已经有一项尚未作答的迁移任务。" },
        { status: 409 },
      );
    }
    if (url) {
      const normalizedUrl = url.replace(/\/$/, "").toLowerCase();
      const tracked = await db.select({ url: problems.url }).from(problems);
      if (
        tracked.some(
          (problem) =>
            problem.url.replace(/\/$/, "").toLowerCase() === normalizedUrl,
        )
      ) {
        return Response.json(
          { error: "这道迁移题已经存在于训练记录中，不能视为陌生题。" },
          { status: 409 },
        );
      }
    }

    const now = new Date();
    const [problem] = await db
      .insert(problems)
      .values({
        title,
        url,
        platform,
        origin: "practice",
        status: "transfer",
        reviewStage: 0,
        cleanStreak: 0,
        lapseCount: 0,
        trainingRole: "transfer",
        validatesProblemId: sourceProblemId,
        transferIntegrity: "unseen",
        nextReviewAt: afterShanghaiDays(now, 0),
        lastEvidence: "assigned_transfer",
        updatedAt: now.toISOString(),
      })
      .returning();

    return Response.json(
      {
        problem,
        instruction: "作答前不要查看原题标签、旧笔记或二者的关联。",
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "迁移任务创建失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
