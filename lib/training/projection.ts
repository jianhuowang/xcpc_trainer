type ProblemProjectionInput = {
  id: number;
  title: string;
  url: string;
  platform: string;
  origin: string;
  status: string;
  reviewStage: number;
  cleanStreak: number;
  nextReviewAt: string | null;
};

export function toDashboardBlindProblem(problem: ProblemProjectionInput) {
  return {
    id: problem.id,
    title: problem.title,
    url: problem.url,
    platform: problem.platform,
    origin: problem.origin,
    status: problem.status,
    cleanStreak: problem.cleanStreak,
    nextReviewAt: problem.nextReviewAt,
  };
}

export function toAgentDueProblem(problem: ProblemProjectionInput) {
  return {
    id: problem.id,
    title: problem.title,
    url: problem.url,
    platform: problem.platform,
    origin: problem.origin,
    reviewStage: problem.reviewStage,
    queueType:
      problem.status === "upsolve"
        ? "upsolve"
        : problem.status === "transfer"
          ? "unlabeled_transfer"
          : "blind_review",
    dueAt: problem.nextReviewAt,
  };
}
