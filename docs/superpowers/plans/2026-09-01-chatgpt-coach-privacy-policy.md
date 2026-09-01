# XCPC Trainer Coach 隐私政策页实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Trainer 同域提供匿名可读的 `/privacy`，供 Custom GPT Action 填写隐私政策 URL，同时保持所有训练页面和数据 API 的现有鉴权不变。

**Architecture:** 使用独立的 `app/privacy/route.ts` Route Handler 返回静态 HTML，不经过受所有者鉴权保护的 Root Layout。页面不读取会话、环境变量或数据库，也不加载脚本和第三方资源。

**Tech Stack:** TypeScript、Next/Vinext Route Handler、Node.js 内置测试框架、内联 CSS。

## Global Constraints

- 不修改确定性排程、盲做白名单、v5 导入导出或 `0000`-`0005` 迁移历史。
- 不新增依赖、Cookie、分析追踪、数据表或 migration。
- `/privacy` 必须匿名返回 `200 text/html; charset=utf-8`；其他页面和数据 API 继续保持现有所有者鉴权。
- 隐私政策默认使用简体中文，代码标识符、协议名和字段名保留英文。

---

### Task 1：公开静态隐私政策 Route

**Files:**
- Create: `app/privacy/route.ts`
- Create: `tests/privacy-policy.test.mjs`

**Interfaces:**
- Consumes: 浏览器或 GPT 编辑器发出的 `GET /privacy`。
- Produces: `GET(): Response`，状态码 `200`，响应头 `Content-Type: text/html; charset=utf-8`，正文为无脚本静态隐私政策。

- [ ] **Step 1：写失败的 Route 契约测试**

创建 `tests/privacy-policy.test.mjs`：

```js
import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/privacy/route.ts";

test("隐私政策页匿名返回静态中文 HTML", async () => {
  const response = GET();
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html; charset=utf-8$/i);
  for (const text of [
    "XCPC Trainer Coach 隐私政策",
    "getTrainingContext",
    "setTrainingMode",
    "submitTrainingEvidence",
    "AGENT_API_KEY",
    "不会出售",
    "GitHub Issues",
  ]) {
    assert.match(html, new RegExp(text));
  }
  assert.doesNotMatch(html, /<script\b/i);
});
```

- [ ] **Step 2：运行定向测试并确认 RED**

Run: `npm test -- tests/privacy-policy.test.mjs`

Expected: FAIL，提示无法导入 `app/privacy/route.ts`。

- [ ] **Step 3：实现最小静态 Route Handler**

创建 `app/privacy/route.ts`：

```ts
const PRIVACY_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>XCPC Trainer Coach 隐私政策</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; line-height: 1.7; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    main { max-width: 48rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
    h1, h2 { line-height: 1.25; }
    h2 { margin-top: 2rem; }
    code { overflow-wrap: anywhere; }
    a { color: LinkText; }
  </style>
</head>
<body>
  <main>
    <h1>XCPC Trainer Coach 隐私政策</h1>
    <p>生效日期：2026-09-01</p>
    <p>XCPC Trainer Coach 是连接 ChatGPT 与个人 XCPC Trainer 的训练工具。Trainer 是排程与训练记录的唯一事实源。</p>

    <h2>处理的数据</h2>
    <p><code>getTrainingContext</code> 只读取盲做安全的训练上下文；<code>setTrainingMode</code> 只保存用户明确选择的训练模式；<code>submitTrainingEvidence</code> 只在用户确认后提交 <code>problemId</code>、<code>evidence</code>、<code>helpLevel</code>、可选 <code>notes</code> 与幂等键。服务端自行计算排程。</p>

    <h2>用途与保存</h2>
    <p>数据仅用于生成个人训练队列、记录真实尝试、安排复习和提供导出。Trainer 不会出售训练数据，也不会将其用于广告。</p>
    <p><code>AGENT_API_KEY</code> 仅用于 Action 鉴权，不写入数据库、导出、notes 或应用日志。</p>

    <h2>追踪与平台数据</h2>
    <p>本应用不额外添加分析追踪或广告脚本。托管与身份平台可能依照其自身政策处理提供服务所必需的技术元数据。</p>

    <h2>访问、导出与删除</h2>
    <p>训练数据由站点所有者管理。所有者可以通过 Trainer 导出数据，并负责处理删除请求。</p>

    <h2>联系</h2>
    <p>技术问题可通过 <a href="https://github.com/jianhuowang/xcpc_trainer/issues">GitHub Issues</a> 联系。请勿在公开 Issue 中粘贴 API key、账号信息或敏感训练内容。</p>
  </main>
</body>
</html>`;

export function GET() {
  return new Response(PRIVACY_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
```

- [ ] **Step 4：运行定向测试并确认 GREEN**

Run: `npm test -- tests/privacy-policy.test.mjs`

Expected: PASS，1 test、0 failures。

- [ ] **Step 5：运行完整回归验证**

Run: `npm test`

Expected: PASS，现有 52 项测试加新增 1 项全部通过；构建继续保留所有者鉴权测试。

Run: `npm run lint`

Expected: exit code 0，无 lint error。

Run: `git diff --check`

Expected: exit code 0，无空白错误。

- [ ] **Step 6：提交实现**

```powershell
git add -- 'app/privacy/route.ts' 'tests/privacy-policy.test.mjs'
git commit -m "feat: publish Coach privacy policy"
git push origin HEAD
```

- [ ] **Step 7：保存并经批准部署 Sites 新版本**

先将同一 HEAD 推送到 Sites 配置的 source repository，打包成功的 `dist/` 与 `.openai/hosting.json`，保存新 Site version。获得用户对公开生产部署的明确批准后部署该 version；不修改环境变量或 D1。

- [ ] **Step 8：执行生产冒烟并填写 GPT**

Run:

```powershell
$response = Invoke-WebRequest -Uri 'https://xcpc-trainer.whjjswhj.chatgpt.site/privacy' -UseBasicParsing
[pscustomobject]@{
  Status = $response.StatusCode
  ContentType = $response.Headers['Content-Type']
  HasTitle = $response.Content.Contains('XCPC Trainer Coach 隐私政策')
}
```

Expected: `Status=200`、`ContentType` 包含 `text/html`、`HasTitle=True`。

在 GPT Action 的“隐私政策”字段填写：

```text
https://xcpc-trainer.whjjswhj.chatgpt.site/privacy
```

保留三个 Actions 和现有 Bearer Authentication，不重新生成 key。
