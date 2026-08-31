import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { problems, trainingSettings } from "@/db/schema";
import { requireAgentAccess } from "@/lib/agent/auth";
import {
  buildDailyQueue,
  isTrainingMode,
  MODE_CONFIG,
} from "@/lib/training/modes";
import { toAgentDueProblem } from "@/lib/training/projection";

export async function GET(request: Request) {
  const unauthorized = requireAgentAccess(request);
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const [rows, settingsRows] = await Promise.all([
      db.select().from(problems).orderBy(asc(problems.nextReviewAt)).limit(500),
      db.select().from(trainingSettings).where(eq(trainingSettings.id, 1)).limit(1),
    ]);
    const mode = isTrainingMode(settingsRows[0]?.mode) ? settingsRows[0].mode : "normal";
    const now = new Date().toISOString();
    const allDue = rows.filter(
      (problem) =>
        (problem.status === "mastered" && problem.nextReviewAt === null) ||
        (problem.nextReviewAt !== null && problem.nextReviewAt <= now),
    );
    const queue = buildDailyQueue(allDue, mode);
    const due = queue.selected.map(toAgentDueProblem);

    return Response.json({
      generatedAt: now,
      mode,
      dailyLimit: MODE_CONFIG[mode].dailyLimit,
      focusLimit: MODE_CONFIG[mode].focusLimit,
      dueCount: allDue.length,
      deferredCount: queue.deferred,
      due,
      acceptedHelpLevels: ["none", "h1", "h2", "h3", "unknown"],
      policy: {
        failedDays: 1,
        editorialUnderstoodDays: 2,
        hintedAcDays: 3,
        independentAcDays: [3, 7, 21, 45],
        nonIndependentResetsCleanStreak: true,
        sameProblemCanPermanentlyMaster: false,
        clientMaySetReviewDate: false,
      },
      blindResolve: {
        hiddenFields: ["notes", "algorithmTags", "editorial", "previousSolution"],
        instruction: "先让用户独立重建解法，再提交结构化证据。",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "训练上下文读取失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
