import { buildAgentOpenApi } from "@/lib/agent/openapi";

export async function GET(request: Request) {
  return Response.json(buildAgentOpenApi(new URL(request.url).origin));
}
