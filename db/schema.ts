import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const contests = sqliteTable(
  "contests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    platform: text("platform").notNull().default("other"),
    contestUrl: text("contest_url").notNull().default(""),
    startedAt: text("started_at").notNull(),
    durationMinutes: integer("duration_minutes"),
    status: text("status").notNull().default("reviewed"),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("contests_started_at_idx").on(table.startedAt)],
);

export const problems = sqliteTable(
  "problems",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contestId: integer("contest_id").references(() => contests.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    url: text("url").notNull().default(""),
    platform: text("platform").notNull().default("other"),
    origin: text("origin").notNull().default("practice"),
    status: text("status").notNull().default("review"),
    reviewStage: integer("review_stage").notNull().default(0),
    cleanStreak: integer("clean_streak").notNull().default(0),
    lapseCount: integer("lapse_count").notNull().default(0),
    trainingRole: text("training_role").notNull().default("core"),
    validatesProblemId: integer("validates_problem_id"),
    transferIntegrity: text("transfer_integrity")
      .notNull()
      .default("not_applicable"),
    nextReviewAt: text("next_review_at"),
    lastEvidence: text("last_evidence").notNull().default("failed"),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("problems_next_review_idx").on(table.nextReviewAt),
    index("problems_status_idx").on(table.status),
    index("problems_contest_idx").on(table.contestId),
    index("problems_validates_idx").on(table.validatesProblemId),
  ]
);

export const attempts = sqliteTable(
  "attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    problemId: integer("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    context: text("context").notNull().default("initial"),
    evidence: text("evidence").notNull(),
    helpLevel: text("help_level").notNull().default("unknown"),
    idempotencyKey: text("idempotency_key"),
    previousStage: integer("previous_stage").notNull().default(0),
    nextStage: integer("next_stage").notNull().default(0),
    scheduledAt: text("scheduled_at"),
    scheduleReason: text("schedule_reason").notNull().default(""),
    notes: text("notes").notNull().default(""),
    attemptedAt: text("attempted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("attempts_problem_idx").on(table.problemId),
    uniqueIndex("attempts_idempotency_key_unique").on(table.idempotencyKey),
  ],
);

export const trainingSettings = sqliteTable("training_settings", {
  id: integer("id").primaryKey().default(1),
  mode: text("mode").notNull().default("normal"),
  timezone: text("timezone").notNull().default("Asia/Shanghai"),
  reminderTime: text("reminder_time").notNull().default("20:30"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const reminderJobs = sqliteTable(
  "reminder_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    dedupeKey: text("dedupe_key").notNull(),
    channel: text("channel").notNull(),
    status: text("status").notNull().default("pending"),
    payload: text("payload").notNull(),
    scheduledFor: text("scheduled_for").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error").notNull().default(""),
    deliveredAt: text("delivered_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("reminder_jobs_dedupe_idx").on(table.dedupeKey),
    index("reminder_jobs_status_idx").on(table.status),
  ],
);
