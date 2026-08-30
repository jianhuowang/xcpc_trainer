export type NotificationChannel = "email" | "qq_bot" | "wechat_work";

export type DailyReminder = {
  date: string;
  dueCount: number;
  selectedCount: number;
  titles: string[];
  dashboardUrl: string;
};

export type DeliveryResult = {
  provider: string;
  externalId?: string;
  deliveredAt: string;
};

export interface NotificationProvider {
  readonly channel: NotificationChannel;
  sendDailyReminder(payload: DailyReminder): Promise<DeliveryResult>;
}

export function buildReminderText(reminder: DailyReminder) {
  const list = reminder.titles
    .map((title, index) => `${index + 1}. ${title}`)
    .join("\n");
  return [
    `XCPC 今日复习：${reminder.selectedCount}/${reminder.dueCount} 道`,
    list,
    `打开训练器：${reminder.dashboardUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
}
