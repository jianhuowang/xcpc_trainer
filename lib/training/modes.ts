export const TRAINING_MODES = ["normal", "recovery", "low_energy"] as const;

export type TrainingMode = (typeof TRAINING_MODES)[number];

export const MODE_CONFIG: Record<
  TrainingMode,
  { label: string; dailyLimit: number; description: string }
> = {
  normal: {
    label: "正常",
    dailyLimit: 6,
    description: "每天最多安排 6 道到期题。",
  },
  recovery: {
    label: "恢复",
    dailyLimit: 4,
    description: "压缩到 4 道，只处理已有训练债务。",
  },
  low_energy: {
    label: "低能量",
    dailyLimit: 2,
    description: "保留 2 道关键任务，避免彻底中断。",
  },
};

export function isTrainingMode(value: unknown): value is TrainingMode {
  return (
    typeof value === "string" &&
    TRAINING_MODES.includes(value as TrainingMode)
  );
}

export function selectDailyQueue<T>(items: T[], mode: TrainingMode): T[] {
  return items.slice(0, MODE_CONFIG[mode].dailyLimit);
}

export type QueueCandidate = {
  id: number;
  status: string;
  nextReviewAt: string | null;
};

export function prioritizeTrainingQueue<T extends QueueCandidate>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const priority = (status: string) =>
      status === "upsolve" ? 0 : status === "transfer" ? 1 : 2;
    const leftPriority = priority(left.status);
    const rightPriority = priority(right.status);
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    const dueOrder = (left.nextReviewAt ?? "").localeCompare(
      right.nextReviewAt ?? "",
    );
    return dueOrder || left.id - right.id;
  });
}

export function buildDailyQueue<T extends QueueCandidate>(
  items: T[],
  mode: TrainingMode,
) {
  const prioritized = prioritizeTrainingQueue(items);
  const selected = selectDailyQueue(prioritized, mode);
  return {
    selected,
    upsolve: selected.filter((item) => item.status === "upsolve"),
    transfer: selected.filter((item) => item.status === "transfer"),
    review: selected.filter(
      (item) => item.status !== "upsolve" && item.status !== "transfer",
    ),
    deferred: Math.max(0, prioritized.length - selected.length),
  };
}
