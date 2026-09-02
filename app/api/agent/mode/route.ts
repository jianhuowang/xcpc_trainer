import { updateTrainingMode } from "@/app/api/settings/route";
import { requireAgentAccess } from "@/lib/agent/auth";

export async function PUT(request: Request) {
  const unauthorized = requireAgentAccess(request);
  return unauthorized ?? updateTrainingMode(request);
}
