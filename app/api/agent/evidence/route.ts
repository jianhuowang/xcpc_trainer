import { POST as recordEvidence } from "@/app/api/reviews/route";
import { requireAgentAccess } from "@/lib/agent/auth";

export async function POST(request: Request) {
  const unauthorized = requireAgentAccess(request);
  if (unauthorized) return unauthorized;
  return recordEvidence(request);
}
