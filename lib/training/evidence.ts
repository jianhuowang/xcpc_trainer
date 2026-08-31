import { HELP_LEVELS, type HelpLevel } from "../data/import.ts";
import { isSolveEvidence, type SolveEvidence } from "./scheduler.ts";

export type EvidenceSubmission = {
  problemId: number;
  evidence: SolveEvidence;
  helpLevel: HelpLevel;
  notes: string;
  idempotencyKey: string;
};

type ParseResult =
  | { ok: true; value: EvidenceSubmission }
  | { ok: false; error: string };

const KEY = /^[A-Za-z0-9._:-]{16,128}$/;
const FIELDS = new Set([
  "problemId",
  "evidence",
  "helpLevel",
  "notes",
  "idempotencyKey",
]);

export function parseEvidenceSubmission(body: Record<string, unknown>): ParseResult {
  if (Object.keys(body).some((key) => !FIELDS.has(key))) {
    return { ok: false, error: "证据请求包含不支持的字段。" };
  }
  const problemId = Number(body.problemId);
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const helpLevel = typeof body.helpLevel === "string" ? body.helpLevel : "";
  const idempotencyKey =
    typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";

  if (!Number.isInteger(problemId) || problemId <= 0) {
    return { ok: false, error: "无效的题目编号。" };
  }
  if (!isSolveEvidence(body.evidence)) {
    return { ok: false, error: "请选择有效的重做结果。" };
  }
  if (!HELP_LEVELS.includes(helpLevel as HelpLevel)) {
    return { ok: false, error: "请选择有效的帮助等级。" };
  }
  if (notes.length > 4000) return { ok: false, error: "记录不能超过 4000 字符。" };
  if (!KEY.test(idempotencyKey)) return { ok: false, error: "缺少有效的幂等键。" };
  if (body.evidence === "independent_ac" && helpLevel !== "none") {
    return { ok: false, error: "独立完成的帮助等级只能是 none。" };
  }
  if (
    (body.evidence === "hinted_ac" || body.evidence === "editorial_understood") &&
    helpLevel === "none"
  ) {
    return { ok: false, error: "该证据必须记录实际帮助等级。" };
  }
  return {
    ok: true,
    value: {
      problemId,
      evidence: body.evidence,
      helpLevel: helpLevel as HelpLevel,
      notes,
      idempotencyKey,
    },
  };
}

export function sameEvidenceSubmission(
  existing: Pick<EvidenceSubmission, "problemId" | "evidence" | "helpLevel" | "notes">,
  input: EvidenceSubmission,
) {
  return existing.problemId === input.problemId &&
    existing.evidence === input.evidence &&
    existing.helpLevel === input.helpLevel &&
    existing.notes.trim() === input.notes;
}

export function toEvidenceReceipt(attempt: {
  id: number;
  problemId: number;
  evidence: string;
  helpLevel: string;
  nextStage: number;
  scheduledAt: string | null;
  scheduleReason: string;
}, replayed: boolean) {
  return {
    recorded: true,
    replayed,
    attemptId: attempt.id,
    problemId: attempt.problemId,
    evidence: attempt.evidence,
    helpLevel: attempt.helpLevel,
    nextStage: attempt.nextStage,
    scheduledAt: attempt.scheduledAt,
    scheduleReason: attempt.scheduleReason,
  };
}
