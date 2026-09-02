import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLegacyBackup,
  parseTrainingCards,
} from "../scripts/legacy-training-cards.mjs";

const SOURCE = `
[TRAINING_CARD]
recordable: 是
date: 2026-08-21
problem: Twin Permutations
platform: Codeforces
url: https://codeforces.com/problemset/problem/1831/A
source: 比赛
result: 提示后AC
hintLevel: H1
blocker: 建模
trigger: 先尝试构造更强条件
nextReview: 2026-08-24
evidence: H1 后独立推出构造并 AC。
[/TRAINING_CARD]
[TRAINING_CARD]
recordable: 是
date: 2026-08-25
problem: Twin Permutations
platform: Codeforces
url: https://codeforces.com/problemset/problem/1831/A/
source: 到期复习
result: 独立AC
hintLevel: H0
blocker: 无
trigger: 构造互补排列
nextReview: 不安排
evidence: 未使用提示并能解释正确性。
[/TRAINING_CARD]`;

test("同 URL 的训练卡合并为一题并保留多条 attempt", () => {
  const backup = buildLegacyBackup(parseTrainingCards(SOURCE), {
    sourceId: "training-console",
    importDate: "2026-09-02",
  });

  assert.equal(backup.version, 5);
  assert.equal(backup.problems.length, 1);
  assert.equal(
    backup.problems[0].url,
    "https://codeforces.com/problemset/problem/1831/A",
  );
  assert.deepEqual(
    backup.attempts.map((item) => [item.evidence, item.helpLevel]),
    [["hinted_ac", "h1"], ["independent_ac", "none"]],
  );
  assert.equal(new Set(backup.attempts.map((item) => item.idempotencyKey)).size, 2);
  assert.equal(backup.problems[0].nextReviewAt, "2026-09-01T16:00:00.000Z");
  assert.doesNotMatch(JSON.stringify(backup), /2026-08-24/);
});

test("缺少身份字段的训练卡进入待确认而不自动导入", () => {
  const cards = parseTrainingCards(SOURCE.replace(
    /url: https:\/\/codeforces\.com\/problemset\/problem\/1831\/A\/?/g,
    "url: 未提供",
  ));
  const backup = buildLegacyBackup(cards, {
    sourceId: "training-console",
    importDate: "2026-09-02",
  });

  assert.equal(backup.problems.length, 0);
  assert.equal(backup.legacyImportReport.reviewRequired.length, 2);
});

test("新题按最新证据风险每天温和激活一题", () => {
  const cards = [
    ["failed", "H3", "未完成"],
    ["editorial", "H2", "看懂未独立完成"],
    ["hinted", "H1", "提示后AC"],
    ["independent", "H0", "独立AC"],
  ].map(([slug, hintLevel, result], index) => `
[TRAINING_CARD]
recordable: 是
date: 2026-08-${20 + index}
problem: ${slug}
platform: other
url: https://example.com/${slug}
source: 到期复习
result: ${result}
hintLevel: ${hintLevel}
[/TRAINING_CARD]`).join("\n");

  const backup = buildLegacyBackup(parseTrainingCards(cards), {
    sourceId: "training-console",
    importDate: "2026-09-02",
  });

  assert.deepEqual(
    backup.problems.map((problem) => [problem.title, problem.nextReviewAt]),
    [
      ["failed", "2026-09-01T16:00:00.000Z"],
      ["editorial", "2026-09-02T16:00:00.000Z"],
      ["hinted", "2026-09-03T16:00:00.000Z"],
      ["independent", "2026-09-04T16:00:00.000Z"],
    ],
  );
});
