# 到期题卡片辅助信息可读性实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将到期题卡片的辅助信息从 10px 低对比度文字调整为 12px 高对比度文字。

**Architecture:** 复用现有 `DueCard`，只替换该行的 Tailwind 类；用现有源码契约测试锁定样式，不新增组件或依赖。

**Tech Stack:** Next.js、React、Tailwind CSS、Node.js test runner

## Global Constraints

- 仅调整 `DueCard` 中“到期日期 · 先盲做，不看旧笔记”这一行。
- 保留等宽字体、大写转换、现有字距、文案和布局。
- 不修改确定性排程、盲做投影字段、导入导出格式、数据库结构或迁移历史。
- 不新增依赖。

---

### Task 1: 提升到期题卡片辅助信息可读性

**Files:**
- Modify: `app/page.tsx:912`
- Test: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: `DueCard` 已有 `problem.nextReviewAt` 和 `localDay()` 输出。
- Produces: 字号为 `text-xs`、颜色为 `text-foreground/70` 的原有辅助信息行。

- [ ] **Step 1: 写入失败的样式契约测试**

在 `tests/rendered-html.test.mjs` 末尾加入：

```js
test("到期题卡片辅助信息保持可读字号和对比度", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(
    source,
    /className="mt-1 font-mono text-xs uppercase tracking-wider text-foreground\/70"[\s\S]*?到期 \{localDay\(problem\.nextReviewAt\)\} · 先盲做，不看旧笔记/,
  );
});
```

- [ ] **Step 2: 运行测试并确认 RED**

运行：

```powershell
npm test -- tests/rendered-html.test.mjs
```

预期：新增测试 FAIL，因为源码仍包含 `text-[10px] ... text-muted-foreground`。

- [ ] **Step 3: 完成最小样式修改**

在 `app/page.tsx` 的 `DueCard` 中将：

```tsx
<p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
```

替换为：

```tsx
<p className="mt-1 font-mono text-xs uppercase tracking-wider text-foreground/70">
```

- [ ] **Step 4: 运行定向测试并确认 GREEN**

运行：

```powershell
npm test -- tests/rendered-html.test.mjs
```

预期：新增测试 PASS。

- [ ] **Step 5: 完整验证**

运行：

```powershell
npm test
npm run lint
git diff --check
```

预期：所有测试通过、lint 无错误、diff 无空白错误。

- [ ] **Step 6: 提交并部署**

运行：

```powershell
git add -- app/page.tsx tests/rendered-html.test.mjs
git commit -m "fix: improve due card metadata readability"
```

将提交推送到站点源码仓库并创建新站点版本；部署成功后确认生产首页返回 200，且到期题卡片辅助信息使用新样式。
