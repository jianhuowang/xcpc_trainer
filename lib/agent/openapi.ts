const modeSchema = { type: "string", enum: ["normal", "recovery", "low_energy"] } as const;
const evidenceSchema = {
  type: "string",
  enum: ["failed", "editorial_understood", "hinted_ac", "independent_ac"],
} as const;
const helpLevelSchema = {
  type: "string",
  enum: ["none", "h1", "h2", "h3", "unknown"],
} as const;
const receiptSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "recorded", "replayed", "attemptId", "problemId", "evidence",
    "helpLevel", "nextStage", "scheduledAt", "scheduleReason",
  ],
  properties: {
    recorded: { type: "boolean" },
    replayed: { type: "boolean" },
    attemptId: { type: "integer" },
    problemId: { type: "integer" },
    evidence: evidenceSchema,
    helpLevel: helpLevelSchema,
    nextStage: { type: "integer" },
    scheduledAt: { type: ["string", "null"] },
    scheduleReason: { type: "string" },
  },
} as const;

export function buildAgentOpenApi(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "XCPC Trainer Coach API",
      version: "0.5.0",
      description: "读取盲做安全队列、显式切换模式并提交服务端排程证据。",
    },
    servers: [{ url: origin }],
    security: [{ bearerAuth: [] }],
    paths: {
      "/api/agent/context": {
        get: {
          operationId: "getTrainingContext",
          summary: "读取当前盲做安全队列",
          responses: {
            "200": { description: "当前模式、队列上限和安全到期题" },
            "401": { description: "缺少或错误的 Bearer" },
            "403": { description: "登录账号不是所有者" },
            "500": { description: "Trainer 读取失败" },
          },
        },
      },
      "/api/agent/mode": {
        put: {
          operationId: "setTrainingMode",
          summary: "持久化用户明确选择的训练模式",
          requestBody: {
            required: true,
            content: { "application/json": { schema: {
              type: "object",
              required: ["mode"],
              additionalProperties: false,
              properties: { mode: modeSchema },
            } } },
          },
          responses: {
            "200": { description: "模式、到期上限和建议重点上限" },
            "400": { description: "无效模式" },
            "401": { description: "缺少或错误的 Bearer" },
            "403": { description: "登录账号不是所有者" },
            "500": { description: "Trainer 写入失败" },
          },
        },
      },
      "/api/agent/evidence": {
        post: {
          operationId: "submitTrainingEvidence",
          summary: "幂等提交一次用户已确认的真实尝试",
          requestBody: {
            required: true,
            content: { "application/json": { schema: {
              type: "object",
              required: ["problemId", "evidence", "helpLevel", "idempotencyKey"],
              additionalProperties: false,
              properties: {
                problemId: { type: "integer", minimum: 1 },
                evidence: evidenceSchema,
                helpLevel: helpLevelSchema,
                notes: { type: "string", maxLength: 4000 },
                idempotencyKey: {
                  type: "string",
                  minLength: 16,
                  maxLength: 128,
                  pattern: "^[A-Za-z0-9._:-]+$",
                },
              },
            } } },
          },
          responses: {
            "200": {
              description: "安全 attempt 回执；重试时 replayed=true",
              content: { "application/json": { schema: receiptSchema } },
            },
            "400": { description: "无效证据或帮助等级" },
            "401": { description: "缺少或错误的 Bearer" },
            "403": { description: "登录账号不是所有者" },
            "404": { description: "题目不存在" },
            "409": { description: "相同 key 携带不同 payload" },
            "500": { description: "Trainer 写入失败" },
          },
        },
      },
    },
    components: {
      schemas: {},
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
    },
  } as const;
}
