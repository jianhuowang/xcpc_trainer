import { afterShanghaiDays } from "../training/scheduler.ts";

const PLATFORMS = new Set(["codeforces", "nowcoder", "atcoder", "luogu", "other"]);
const ORIGINS = new Set(["contest", "practice"]);
const STATUSES = new Set([
  "upsolve",
  "review",
  "transfer",
  "retained",
  "stable",
  "mastered",
]);
const EVIDENCE = new Set([
  "failed",
  "editorial_understood",
  "hinted_ac",
  "independent_ac",
]);
const LAST_EVIDENCE = new Set([...EVIDENCE, "assigned_transfer"]);
const TRAINING_ROLES = new Set(["core", "transfer"]);
const TRANSFER_INTEGRITIES = new Set([
  "not_applicable",
  "unseen",
  "exposed",
  "verified",
]);
const MODES = new Set(["normal", "recovery", "low_energy"]);

type SolveEvidence =
  | "failed"
  | "editorial_understood"
  | "hinted_ac"
  | "independent_ac";
type LastEvidence = SolveEvidence | "assigned_transfer";
type TrainingMode = "normal" | "recovery" | "low_energy";

function isSolveEvidence(value: unknown): value is SolveEvidence {
  return typeof value === "string" && EVIDENCE.has(value);
}

function isTrainingMode(value: unknown): value is TrainingMode {
  return typeof value === "string" && MODES.has(value);
}

export type ImportedContest = {
  sourceId: number;
  title: string;
  platform: string;
  contestUrl: string;
  startedAt: string;
  durationMinutes: number | null;
  status: string;
  notes: string;
  createdAt: string;
};

export type ImportedProblem = {
  sourceId: number;
  sourceContestId: number | null;
  sourceValidatesProblemId: number | null;
  title: string;
  url: string;
  platform: string;
  origin: string;
  status: string;
  reviewStage: number;
  cleanStreak: number;
  lapseCount: number;
  trainingRole: string;
  transferIntegrity: string;
  nextReviewAt: string | null;
  lastEvidence: LastEvidence;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ImportedAttempt = {
  sourceProblemId: number;
  context: string;
  evidence: SolveEvidence;
  previousStage: number;
  nextStage: number;
  scheduledAt: string | null;
  scheduleReason: string;
  notes: string;
  attemptedAt: string;
};

export type ImportBundle = {
  version: 1 | 2 | 3 | 4;
  contests: ImportedContest[];
  problems: ImportedProblem[];
  attempts: ImportedAttempt[];
  settings: {
    mode: TrainingMode;
    timezone: string;
    reminderTime: string;
  };
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("备份内容不是有效对象。");
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, fallback = "", max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

function integerValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function sourceId(value: unknown, label: string) {
  const id = integerValue(value, -1);
  if (id <= 0) throw new Error(`${label}缺少有效编号。`);
  return id;
}

function dateValue(value: unknown, fallback: string | null = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function urlValue(value: unknown) {
  const url = stringValue(value, "", 2000);
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) throw new Error(`无效链接：${url.slice(0, 80)}`);
  return url;
}

export function problemIdentity(input: { title: string; url: string; platform: string }) {
  if (input.url) return `url:${input.url.replace(/\/$/, "").toLowerCase()}`;
  return `title:${input.platform}:${input.title.trim().toLowerCase()}`;
}

export function contestIdentity(input: {
  title: string;
  contestUrl: string;
  startedAt: string;
}) {
  if (input.contestUrl) {
    return `url:${input.contestUrl.replace(/\/$/, "").toLowerCase()}`;
  }
  return `title:${input.title.trim().toLowerCase()}:${input.startedAt.slice(0, 10)}`;
}

export function settingsMergePreview(existing: boolean) {
  return existing ? { add: 0, skip: 1 } : { add: 1, skip: 0 };
}

export function parseImportBundle(input: unknown): ImportBundle {
  const envelope = record(input);
  if (envelope.format !== "xcpc-trainer-export") {
    throw new Error("这不是 XCPC Trainer 导出的备份。 ");
  }
  const version = integerValue(envelope.version, -1);
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4) {
    throw new Error("暂不支持这个备份版本。");
  }

  const rawProblems = Array.isArray(envelope.problems) ? envelope.problems : [];
  const rawAttempts = Array.isArray(envelope.attempts) ? envelope.attempts : [];
  const rawContests = Array.isArray(envelope.contests) ? envelope.contests : [];
  if (rawProblems.length > 500 || rawAttempts.length > 5000 || rawContests.length > 200) {
    throw new Error("单次导入上限为 200 场比赛、500 道题和 5000 条尝试记录。");
  }

  const now = new Date().toISOString();
  const contests = rawContests.map((item, index) => {
    const row = record(item);
    const title = stringValue(row.title, "", 160);
    if (!title) throw new Error(`第 ${index + 1} 场比赛缺少名称。`);
    return {
      sourceId: sourceId(row.id, `第 ${index + 1} 场比赛`),
      title,
      platform: PLATFORMS.has(String(row.platform)) ? String(row.platform) : "other",
      contestUrl: urlValue(row.contestUrl),
      startedAt: dateValue(row.startedAt, now) ?? now,
      durationMinutes:
        integerValue(row.durationMinutes, 0) > 0
          ? Math.min(integerValue(row.durationMinutes), 1440)
          : null,
      status: stringValue(row.status, "reviewed", 32),
      notes: stringValue(row.notes),
      createdAt: dateValue(row.createdAt, now) ?? now,
    };
  });

  const problems = rawProblems.map((item, index) => {
    const row = record(item);
    const title = stringValue(row.title, "", 160);
    if (!title) throw new Error(`第 ${index + 1} 道题缺少名称。`);
    if (typeof row.lastEvidence !== "string" || !LAST_EVIDENCE.has(row.lastEvidence)) {
      throw new Error(`第 ${index + 1} 道题的训练证据无效。`);
    }
    const rawStatus = String(row.status);
    const status = rawStatus === "mastered"
      ? "retained"
      : STATUSES.has(rawStatus)
        ? rawStatus
        : "review";
    const reviewStage = Math.max(0, Math.min(integerValue(row.reviewStage), 4));
    const cleanStreak = row.cleanStreak === undefined
      ? row.lastEvidence === "independent_ac" ? reviewStage : 0
      : Math.max(0, Math.min(integerValue(row.cleanStreak), 4));
    const parsedReviewAt = dateValue(row.nextReviewAt);
    const trainingRole = TRAINING_ROLES.has(String(row.trainingRole))
      ? String(row.trainingRole)
      : row.lastEvidence === "assigned_transfer"
        ? "transfer"
        : "core";
    const transferIntegrity = TRANSFER_INTEGRITIES.has(String(row.transferIntegrity))
      ? String(row.transferIntegrity)
      : trainingRole === "transfer"
        ? "exposed"
        : "not_applicable";
    return {
      sourceId: sourceId(row.id, `第 ${index + 1} 道题`),
      sourceContestId:
        integerValue(row.contestId, 0) > 0 ? integerValue(row.contestId) : null,
      sourceValidatesProblemId:
        integerValue(row.validatesProblemId, 0) > 0
          ? integerValue(row.validatesProblemId)
          : null,
      title,
      url: urlValue(row.url),
      platform: PLATFORMS.has(String(row.platform)) ? String(row.platform) : "other",
      origin: ORIGINS.has(String(row.origin)) ? String(row.origin) : "practice",
      status,
      reviewStage,
      cleanStreak,
      lapseCount: Math.max(0, integerValue(row.lapseCount)),
      trainingRole,
      transferIntegrity,
      nextReviewAt:
        status === "retained" && parsedReviewAt === null
          ? afterShanghaiDays(new Date(), 45)
          : parsedReviewAt,
      lastEvidence: row.lastEvidence,
      notes: stringValue(row.notes),
      createdAt: dateValue(row.createdAt, now) ?? now,
      updatedAt: dateValue(row.updatedAt, now) ?? now,
    };
  });

  const problemIds = new Set(problems.map((problem) => problem.sourceId));
  for (const [index, problem] of problems.entries()) {
    if (
      problem.sourceValidatesProblemId !== null &&
      !problemIds.has(problem.sourceValidatesProblemId)
    ) {
      throw new Error(`第 ${index + 1} 道迁移题找不到对应的原训练题。`);
    }
  }
  const attempts = rawAttempts.map((item, index) => {
    const row = record(item);
    const problemId = sourceId(row.problemId, `第 ${index + 1} 条尝试记录`);
    if (!problemIds.has(problemId)) {
      throw new Error(`第 ${index + 1} 条尝试记录找不到对应题目。`);
    }
    if (!isSolveEvidence(row.evidence)) {
      throw new Error(`第 ${index + 1} 条尝试记录的训练证据无效。`);
    }
    return {
      sourceProblemId: problemId,
      context: stringValue(row.context, "initial", 32),
      evidence: row.evidence,
      previousStage: Math.max(0, Math.min(integerValue(row.previousStage), 4)),
      nextStage: Math.max(0, Math.min(integerValue(row.nextStage), 4)),
      scheduledAt: dateValue(row.scheduledAt),
      scheduleReason: stringValue(row.scheduleReason, "", 1000),
      notes: stringValue(row.notes),
      attemptedAt: dateValue(row.attemptedAt, now) ?? now,
    };
  });

  const rawSettings = envelope.settings ? record(envelope.settings) : {};
  const mode = isTrainingMode(rawSettings.mode) ? rawSettings.mode : "normal";
  return {
    version,
    contests,
    problems,
    attempts,
    settings: {
      mode,
      timezone: stringValue(rawSettings.timezone, "Asia/Shanghai", 64),
      reminderTime: /^\d{2}:\d{2}$/.test(String(rawSettings.reminderTime))
        ? String(rawSettings.reminderTime)
        : "20:30",
    },
  };
}
