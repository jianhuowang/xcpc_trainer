import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attempts, contests, problems, trainingSettings } from "@/db/schema";

export async function GET() {
  try {
    const db = getDb();
    const [contestRows, problemRows, attemptRows, settingsRows] = await Promise.all([
      db.select().from(contests).orderBy(asc(contests.id)),
      db.select().from(problems).orderBy(asc(problems.id)),
      db.select().from(attempts).orderBy(asc(attempts.id)),
      db
        .select()
        .from(trainingSettings)
        .where(eq(trainingSettings.id, 1))
        .limit(1),
    ]);
    const exportedAt = new Date().toISOString();
    const filename = `xcpc-trainer-${exportedAt.slice(0, 10)}.json`;

    return new Response(
      JSON.stringify(
        {
          format: "xcpc-trainer-export",
          version: 4,
          exportedAt,
          policy: {
            failed: 1,
            editorialUnderstood: 2,
            hintedAc: 3,
            independentAc: [3, 7, 21, 45],
            evidenceBreaksCleanStreak: [
              "failed",
              "editorial_understood",
              "hinted_ac",
            ],
            sameProblemCanPermanentlyMaster: false,
            transferRule:
              "Only a first-attempt independent AC on an unseen linked transfer problem creates stable evidence.",
          },
          settings: settingsRows[0] ?? {
            id: 1,
            mode: "normal",
            timezone: "Asia/Shanghai",
            reminderTime: "20:30",
          },
          contests: contestRows,
          problems: problemRows,
          attempts: attemptRows,
        },
        null,
        2,
      ),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "导出失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
