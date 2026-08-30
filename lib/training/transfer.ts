import type { SolveEvidence } from "./scheduler.ts";

export type TransferAttemptResult =
  | "not_transfer"
  | "verified"
  | "invalidated"
  | "already_exposed";

export function classifyTransferAttempt(input: {
  trainingRole: string;
  transferIntegrity: string;
  evidence: SolveEvidence;
}): TransferAttemptResult {
  if (input.trainingRole !== "transfer") return "not_transfer";
  if (input.transferIntegrity !== "unseen") return "already_exposed";
  return input.evidence === "independent_ac" ? "verified" : "invalidated";
}
