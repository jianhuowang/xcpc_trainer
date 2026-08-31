import assert from "node:assert/strict";
import test from "node:test";
import { authorizeAgentRequest, authorizeOwnerRequest } from "../lib/auth/access.ts";

const config = { ownerEmail: "owner@example.com", agentApiKey: "agent-secret" };
const request = (url, headers = {}) => new Request(url, { headers });

test("loopback 缺少 secrets 时只允许本地开发", () => {
  assert.equal(authorizeOwnerRequest(request("http://localhost:5173/api/dashboard"), {}), null);
  assert.equal(
    authorizeOwnerRequest(request("https://trainer.example/api/dashboard"), {}).status,
    503,
  );
});

test("明确的生产配置不会信任 loopback Host", () => {
  assert.equal(
    authorizeOwnerRequest(request("http://localhost:5173/api/dashboard"), {
      allowLoopbackWithoutSecrets: false,
    }).status,
    503,
  );
});

test("owner API 区分未登录、非所有者和所有者", () => {
  assert.equal(authorizeOwnerRequest(request("https://trainer.example/api/dashboard"), config).status, 401);
  assert.equal(authorizeOwnerRequest(request("https://trainer.example/api/dashboard", {
    "oai-authenticated-user-email": "other@example.com",
  }), config).status, 403);
  assert.equal(authorizeOwnerRequest(request("https://trainer.example/api/dashboard", {
    "oai-authenticated-user-email": " Owner@Example.com ",
  }), config), null);
});

test("Agent API 接受 owner 或正确 Bearer，拒绝其他身份", () => {
  assert.equal(authorizeAgentRequest(request("https://trainer.example/api/agent/context", {
    authorization: "Bearer agent-secret",
  }), config), null);
  assert.equal(authorizeAgentRequest(request("https://trainer.example/api/agent/context", {
    "oai-authenticated-user-email": "owner@example.com",
  }), config), null);
  assert.equal(authorizeAgentRequest(request("https://trainer.example/api/agent/context", {
    "oai-authenticated-user-email": "other@example.com",
  }), config).status, 403);
  assert.equal(authorizeAgentRequest(request("https://trainer.example/api/agent/context", {
    authorization: "Bearer wrong",
  }), config).status, 401);
  assert.equal(authorizeAgentRequest(request("https://trainer.example/api/agent/context", {
    authorization: "Bearer agent-secret",
  }), { agentApiKey: "agent-secret" }).status, 503);
});
