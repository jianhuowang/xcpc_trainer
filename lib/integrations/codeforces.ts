export type CodeforcesSubmission = {
  id: number;
  contestId?: number;
  creationTimeSeconds: number;
  verdict?: string;
  participantType?: string;
  problem: {
    contestId?: number;
    problemsetName?: string;
    index: string;
    name: string;
    rating?: number;
  };
};

export type CodeforcesCandidate = {
  key: string;
  title: string;
  url: string;
  contestId: number | null;
  index: string;
  rating: number | null;
  accepted: boolean;
  submissionCount: number;
  lastSubmissionAt: string;
  suggestedEvidence: "failed" | null;
};

function problemUrl(contestId: number | undefined, index: string) {
  if (!contestId) return "";
  return contestId >= 100000
    ? `https://codeforces.com/gym/${contestId}/problem/${index}`
    : `https://codeforces.com/contest/${contestId}/problem/${index}`;
}

export function groupCodeforcesSubmissions(
  submissions: CodeforcesSubmission[],
): CodeforcesCandidate[] {
  const grouped = new Map<string, CodeforcesSubmission[]>();
  for (const submission of submissions) {
    const contestId = submission.problem.contestId ?? submission.contestId;
    const key = `${contestId ?? submission.problem.problemsetName ?? "unknown"}:${submission.problem.index}`;
    const group = grouped.get(key) ?? [];
    group.push(submission);
    grouped.set(key, group);
  }

  return [...grouped.entries()]
    .map(([key, group]) => {
      const latest = [...group].sort((a, b) => b.id - a.id)[0];
      const contestId = latest.problem.contestId ?? latest.contestId;
      const accepted = group.some((submission) => submission.verdict === "OK");
      return {
        key,
        title: `${latest.problem.index}. ${latest.problem.name}`,
        url: problemUrl(contestId, latest.problem.index),
        contestId: contestId ?? null,
        index: latest.problem.index,
        rating: latest.problem.rating ?? null,
        accepted,
        submissionCount: group.length,
        lastSubmissionAt: new Date(latest.creationTimeSeconds * 1000).toISOString(),
        suggestedEvidence: accepted ? null : "failed",
      };
    })
    .sort((a, b) => b.lastSubmissionAt.localeCompare(a.lastSubmissionAt));
}
