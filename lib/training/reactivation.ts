import type { SolveEvidence } from "./scheduler.ts";

export function shouldReactivateProblem(
  status: string,
  evidence: SolveEvidence,
) {
  return (
    ["retained", "stable", "mastered"].includes(status) &&
    evidence !== "independent_ac"
  );
}
