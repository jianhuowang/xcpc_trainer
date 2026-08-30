import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { problems, reminderJobs, trainingSettings } from "@/db/schema";
import { buildReminderText, type NotificationChannel } from "@/lib/notifications/types";
import { createReminderCandidate } from "@/lib/notifications/reminders";
import { buildDailyQueue, isTrainingMode, MODE_CONFIG } from "@/lib/training/modes";

const CHANNELS = new Set<NotificationChannel>(["email", "qq_bot", "wechat_work"]);

async function reminderSnapshot(request: Request, channel: NotificationChannel) {
  const db = getDb();
  const [rows, settingsRows] = await Promise.all([
    db.select().from(problems).orderBy(asc(problems.nextReviewAt)).limit(500),
    db.select().from(trainingSettings).where(eq(trainingSettings.id, 1)).limit(1),
  ]);
  const mode = isTrainingMode(settingsRows[0]?.mode) ? settingsRows[0].mode : "normal";
  const now = new Date();
  const allDue = rows.filter(
    (problem) =>
      (problem.status === "mastered" && problem.nextReviewAt === null) ||
      (problem.nextReviewAt !== null && problem.nextReviewAt <= now.toISOString()),
  );
  const selected = buildDailyQueue(allDue, mode).selected;
  const candidate = createReminderCandidate({
    now,
    channel,
    dueCount: allDue.length,
    titles: selected.map((problem) => problem.title),
    dashboardUrl: new URL(request.url).origin,
  });
  return { db, mode, allDue, selected, candidate };
}

export async function GET(request: Request) {
  try {
    const { db, mode, allDue, selected, candidate } = await reminderSnapshot(request, "email");
    const jobs = await db.select().from(reminderJobs).orderBy(desc(reminderJobs.createdAt)).limit(8);
    return Response.json({
      ready: true,
      deliveryConnected: false,
      mode,
      dailyLimit: MODE_CONFIG[mode].dailyLimit,
      dueCount: allDue.length,
      selectedCount: selected.length,
      preview: buildReminderText(candidate.payload),
      jobs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "提醒预览失败";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const requested = String(body.channel ?? "email") as NotificationChannel;
    const channel = CHANNELS.has(requested) ? requested : "email";
    const { db, allDue, selected, candidate } = await reminderSnapshot(request, channel);
    if (!allDue.length) {
      return Response.json({ queued: false, reason: "今天没有到期任务。" });
    }

    const [created] = await db
      .insert(reminderJobs)
      .values({
        dedupeKey: candidate.dedupeKey,
        channel,
        status: "pending",
        payload: JSON.stringify(candidate.payload),
        scheduledFor: candidate.scheduledFor,
      })
      .onConflictDoNothing({ target: reminderJobs.dedupeKey })
      .returning();

    return Response.json({
      queued: Boolean(created),
      duplicate: !created,
      dueCount: allDue.length,
      selectedCount: selected.length,
      job: created ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "提醒任务生成失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
