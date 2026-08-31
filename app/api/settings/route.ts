import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { trainingSettings } from "@/db/schema";
import { requireOwnerAccess } from "@/lib/agent/auth";
import { isTrainingMode, MODE_CONFIG } from "@/lib/training/modes";

export async function PUT(request: Request) {
  const unauthorized = requireOwnerAccess(request);
  if (unauthorized) return unauthorized;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (!isTrainingMode(body.mode)) {
      return Response.json({ error: "无效的训练模式。" }, { status: 400 });
    }

    const db = getDb();
    const now = new Date().toISOString();
    const [existing] = await db
      .select({ id: trainingSettings.id })
      .from(trainingSettings)
      .where(eq(trainingSettings.id, 1))
      .limit(1);

    if (existing) {
      await db
        .update(trainingSettings)
        .set({ mode: body.mode, updatedAt: now })
        .where(eq(trainingSettings.id, 1));
    } else {
      await db.insert(trainingSettings).values({
        id: 1,
        mode: body.mode,
        updatedAt: now,
      });
    }

    return Response.json({
      mode: body.mode,
      dailyLimit: MODE_CONFIG[body.mode].dailyLimit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "设置保存失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
