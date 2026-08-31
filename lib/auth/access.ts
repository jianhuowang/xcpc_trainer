export type AccessConfig = {
  ownerEmail?: string;
  agentApiKey?: string;
  allowLoopbackWithoutSecrets?: boolean;
};

export const normalizeEmail = (value?: string) => value?.trim().toLowerCase() ?? "";

const jsonError = (status: number, error: string, bearer = false) =>
  Response.json(
    { error },
    { status, headers: bearer ? { "WWW-Authenticate": "Bearer" } : undefined },
  );

export function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

const allowsLocalDevelopment = (request: Request, config: AccessConfig) =>
  config.allowLoopbackWithoutSecrets === true &&
  isLoopbackHost(new URL(request.url).hostname);

export function authorizeOwnerRequest(request: Request, config: AccessConfig) {
  const ownerEmail = normalizeEmail(config.ownerEmail);
  if (!ownerEmail) {
    return allowsLocalDevelopment(request, config)
      ? null
      : jsonError(503, "站点尚未配置 TRAINER_OWNER_EMAIL。");
  }
  const actual = normalizeEmail(
    request.headers.get("oai-authenticated-user-email") ?? undefined,
  );
  if (!actual) return jsonError(401, "请先使用 ChatGPT 登录。");
  return actual === ownerEmail ? null : jsonError(403, "当前账号不是 Trainer 所有者。");
}

export function authorizeAgentRequest(request: Request, config: AccessConfig) {
  if (!normalizeEmail(config.ownerEmail) && !allowsLocalDevelopment(request, config)) {
    return jsonError(503, "站点尚未配置 TRAINER_OWNER_EMAIL。");
  }
  const owner = authorizeOwnerRequest(request, config);
  if (owner === null) return null;
  const key = config.agentApiKey?.trim() ?? "";
  if (key && request.headers.get("authorization") === `Bearer ${key}`) return null;
  if (request.headers.get("oai-authenticated-user-email")) return owner;
  return jsonError(401, "Agent API 需要有效 Bearer 凭证。", true);
}
