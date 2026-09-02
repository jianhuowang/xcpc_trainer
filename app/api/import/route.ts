import { eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { attempts, contests, problems, trainingSettings } from "@/db/schema";
import { requireOwnerAccess } from "@/lib/agent/auth";
import { parseImportBundle } from "@/lib/data/import";
import { buildImportPlan } from "@/lib/data/import-plan";

export async function POST(request: Request) {
  const unauthorized = requireOwnerAccess(request);
  if (unauthorized) return unauthorized;
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 2_500_000) {
      return Response.json({ error: "备份文件不能超过 2.5 MB。" }, { status: 413 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const bundle = parseImportBundle(body.data);
    const dryRun = body.dryRun !== false;
    const db = getDb();
    const [existingProblems, existingContests, existingAttempts, existingSettings] =
      await Promise.all([
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
        .select({
          problemId: attempts.problemId,
          context: attempts.context,
          evidence: attempts.evidence,
          helpLevel: attempts.helpLevel,
          idempotencyKey: attempts.idempotencyKey,
          previousStage: attempts.previousStage,
          nextStage: attempts.nextStage,
          scheduledAt: attempts.scheduledAt,
          scheduleReason: attempts.scheduleReason,
          notes: attempts.notes,
          attemptedAt: attempts.attemptedAt,
        })
        .from(attempts)
        .where(isNotNull(attempts.idempotencyKey)),
      db
        .select({ id: trainingSettings.id })
        .from(trainingSettings)
        .where(eq(trainingSettings.id, 1))
        .limit(1),
    ]);

    const plan = buildImportPlan(bundle, {
      contests: existingContests,
      problems: existingProblems,
      attempts: existingAttempts,
      hasSettings: existingSettings.length > 0,
      maxContestId: existingContests.reduce((max, row) => Math.max(max, row.id), 0),
      maxProblemId: existingProblems.reduce((max, row) => Math.max(max, row.id), 0),
    });

    if (dryRun) return Response.json({ dryRun: true, preview: plan.preview });

    const statements = [
      ...plan.contests.map((row) => db.insert(contests).values(row)),
      ...plan.problems.map((row) => db.insert(problems).values(row)),
      ...plan.attempts.map((row) => db.insert(attempts).values(row)),
      ...plan.settings.map((row) => db.insert(trainingSettings).values(row)),
    ];
    if (statements.length > 0) {
      await db.batch(
        statements as [typeof statements[number], ...Array<typeof statements[number]>],
      );
    }

    return Response.json({ dryRun: false, imported: plan.preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "导入失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
