import { env } from "cloudflare:workers";

export function requireAgentAccess(request: Request): Response | null {
  if (request.headers.get("oai-authenticated-user-email")) return null;

  const configured = (env as unknown as { AGENT_API_KEY?: string }).AGENT_API_KEY?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  if (configured && authorization === `Bearer ${configured}`) return null;

  return Response.json(
    {
      error:
        "Agent API 需要站点所有者会话，或部署环境中的 AGENT_API_KEY Bearer 凭证。",
    },
    {
      status: 401,
      headers: { "WWW-Authenticate": "Bearer" },
    },
  );
}
