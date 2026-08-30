const evidenceSchema = {
  type: "string",
  enum: ["failed", "editorial_understood", "hinted_ac", "independent_ac"],
};

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return Response.json({
    openapi: "3.1.0",
    info: {
      title: "XCPC Trainer Agent API",
      version: "0.4.0",
      description:
        "Provider-neutral API for reading a hint-free training queue and submitting evidence. The server alone chooses review dates.",
    },
    servers: [{ url: origin }],
    security: [{ bearerAuth: [] }],
    paths: {
      "/api/agent/context": {
        get: {
          operationId: "getTrainingContext",
          summary: "Read the current hint-free due queue and deterministic policy",
          responses: {
            "200": {
              description: "Training context without private notes or solution hints",
              content: { "application/json": { schema: { type: "object" } } },
            },
            "401": { description: "Missing owner session or API key" },
          },
        },
      },
      "/api/agent/evidence": {
        post: {
          operationId: "submitTrainingEvidence",
          summary: "Submit one completed attempt and let the server reschedule it",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["problemId", "evidence"],
                  additionalProperties: false,
                  properties: {
                    problemId: { type: "integer", minimum: 1 },
                    evidence: evidenceSchema,
                    notes: { type: "string", maxLength: 4000 },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Evidence recorded and next review decided" },
            "400": { description: "Invalid evidence" },
            "401": { description: "Missing owner session or API key" },
            "404": { description: "Problem not found" },
          },
        },
      },
      "/api/contests": {
        post: {
          operationId: "createContestSession",
          summary: "Create a contest and enqueue its exposed problems",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title", "platform", "startedAt", "problems"],
                  properties: {
                    title: { type: "string", maxLength: 160 },
                    platform: {
                      type: "string",
                      enum: ["codeforces", "nowcoder", "atcoder", "luogu", "other"],
                    },
                    contestUrl: { type: "string", format: "uri" },
                    startedAt: { type: "string", format: "date" },
                    notes: { type: "string" },
                    problems: {
                      type: "array",
                      minItems: 1,
                      maxItems: 20,
                      items: {
                        type: "object",
                        required: ["title", "evidence"],
                        properties: {
                          title: { type: "string", maxLength: 160 },
                          url: { type: "string", format: "uri" },
                          evidence: evidenceSchema,
                          notes: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Contest and linked training problems created" },
            "400": { description: "Invalid contest evidence" },
          },
        },
      },
      "/api/transfers": {
        post: {
          operationId: "createUnseenTransferTask",
          summary: "Link an unseen transfer problem to a retained source problem",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["sourceProblemId", "title"],
                  additionalProperties: false,
                  properties: {
                    sourceProblemId: { type: "integer", minimum: 1 },
                    title: { type: "string", maxLength: 160 },
                    url: { type: "string", format: "uri" },
                    platform: {
                      type: "string",
                      enum: ["codeforces", "nowcoder", "atcoder", "luogu", "other"],
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Unseen transfer task created and queued" },
            "400": { description: "Invalid transfer task" },
            "409": { description: "Source is not retained or already has a pending task" },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    },
  });
}
