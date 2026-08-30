import type { DailyReminder, NotificationChannel } from "@/lib/notifications/types";

export type ReminderCandidate = {
  dedupeKey: string;
  channel: NotificationChannel;
  scheduledFor: string;
  payload: DailyReminder;
};

export function shanghaiDateKey(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function createReminderCandidate(input: {
  now?: Date;
  channel: NotificationChannel;
  dueCount: number;
  titles: string[];
  dashboardUrl: string;
}): ReminderCandidate {
  const now = input.now ?? new Date();
  const date = shanghaiDateKey(now);
  const payload: DailyReminder = {
    date,
    dueCount: input.dueCount,
    selectedCount: input.titles.length,
    titles: input.titles,
    dashboardUrl: input.dashboardUrl,
  };
  return {
    dedupeKey: `daily:${date}:${input.channel}`,
    channel: input.channel,
    scheduledFor: now.toISOString(),
    payload,
  };
}
