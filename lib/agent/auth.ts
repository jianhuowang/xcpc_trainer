import { env } from "cloudflare:workers";
import { authorizeAgentRequest, authorizeOwnerRequest } from "@/lib/auth/access";

function config() {
  const values = env as unknown as {
    TRAINER_OWNER_EMAIL?: string;
    AGENT_API_KEY?: string;
  };
  return {
    ownerEmail: values.TRAINER_OWNER_EMAIL,
    agentApiKey: values.AGENT_API_KEY,
    allowLoopbackWithoutSecrets: process.env.NODE_ENV === "development",
  };
}

export const requireOwnerAccess = (request: Request) =>
  authorizeOwnerRequest(request, config());
export const requireAgentAccess = (request: Request) =>
  authorizeAgentRequest(request, config());
