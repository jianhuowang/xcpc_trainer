import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentOpenApi } from "../lib/agent/openapi.ts";
import { MODE_CONFIG } from "../lib/training/modes.ts";

test("三个模式固定使用 6/4/2 与 3/2/1", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(MODE_CONFIG).map(([key, value]) => [
      key, [value.dailyLimit, value.focusLimit],
    ])),
    { normal: [6, 3], recovery: [4, 2], low_energy: [2, 1] },
  );
});

test("公开 OpenAPI 只暴露三个 Coach operations", () => {
  const api = buildAgentOpenApi("https://trainer.example");
  assert.deepEqual(Object.keys(api.paths).sort(), [
    "/api/agent/context",
    "/api/agent/evidence",
    "/api/agent/mode",
  ]);
  assert.deepEqual(Object.values(api.paths).flatMap((path) =>
    Object.values(path).map((operation) => operation.operationId),
  ).sort(), ["getTrainingContext", "setTrainingMode", "submitTrainingEvidence"]);
});

test("公开 OpenAPI 为 GPT 编辑器提供对象形式的 components.schemas", () => {
  const api = buildAgentOpenApi("https://trainer.example");
  assert.deepEqual(api.components.schemas, {});
});

test("证据 Action 只接受证据字段，不接受排程字段", () => {
  const api = buildAgentOpenApi("https://trainer.example");
  const schema = api.paths["/api/agent/evidence"].post.requestBody
    .content["application/json"].schema;
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties).sort(), [
    "evidence", "helpLevel", "idempotencyKey", "notes", "problemId",
  ]);
  for (const forbidden of ["nextReviewAt", "status", "reviewStage", "cleanStreak", "lapseCount"]) {
    assert.equal(forbidden in schema.properties, false);
  }
});
