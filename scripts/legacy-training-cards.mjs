import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterShanghaiDays } from "../lib/training/scheduler.ts";

const BLOCK = /\[TRAINING_CARD\]([\s\S]*?)\[\/TRAINING_CARD\]/g;
const EVIDENCE_PRIORITY = {
  failed: 0,
  editorial_understood: 1,
  hinted_ac: 2,
  independent_ac: 3,
};
const HELP_PRIORITY = { h3: 0, h2: 1, h1: 2, none: 3, unknown: 4 };

export function parseTrainingCards(markdown) {
  return [...markdown.matchAll(BLOCK)].map((match, index) => {
    const fields = {};
    for (const line of match[1].split(/\r?\n/)) {
      const colon = line.indexOf(":");
      if (colon > 0) fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
    return { index, ...fields };
  }).filter((card) => card.recordable === "是");
}

function normalizedUrl(value) {
  const url = displayUrl(value).toLowerCase();
  return /^https?:\/\//.test(url) ? url : "";
}

function displayUrl(value) {
  return (value ?? "").trim().replace(/\/$/, "");
}

function normalizedTitle(value) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizedPlatform(value) {
  const text = value ?? "";
  if (/codeforces/i.test(text)) return "codeforces";
  if (/牛客|nowcoder/i.test(text)) return "nowcoder";
  if (/atcoder/i.test(text)) return "atcoder";
  if (/洛谷|luogu/i.test(text)) return "luogu";
  return "other";
}

function mapAttempt(card) {
  const helpLevel = ({ H0: "none", H1: "h1", H2: "h2", H3: "h3" })[
    (card.hintLevel ?? "").toUpperCase()
  ] ?? "unknown";
  const result = (card.result ?? "").replace(/\s+/g, "");
  const evidence = result === "独立AC" && helpLevel === "none"
    ? "independent_ac"
    : result === "提示后AC"
      ? "hinted_ac"
      : result === "看懂未独立完成"
        ? "editorial_understood"
        : "failed";
  const notes = [
    ["source", card.source],
    ["blocker", card.blocker],
    ["trigger", card.trigger],
    ["evidence", card.evidence],
    ["inference", card.inference],
  ].filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join("\n");
  return { evidence, helpLevel, notes };
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function shanghaiInstant(date, hour = "12") {
  const instant = new Date(`${date}T${hour}:00:00+08:00`);
  if (Number.isNaN(instant.getTime())) throw new Error(`无效训练日期：${date}`);
  return instant.toISOString();
}

export function buildLegacyBackup(cards, { sourceId, importDate }) {
  if (!sourceId?.trim()) throw new Error("缺少 sourceId。");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(importDate)) {
    throw new Error("importDate 必须为 YYYY-MM-DD。");
  }

  const reviewRequired = [];
  const groups = new Map();
  for (const card of cards) {
    const url = normalizedUrl(card.url);
    if (!url || !card.problem?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(card.date ?? "")) {
      reviewRequired.push({
        index: card.index,
        problem: card.problem ?? "",
        reason: "缺少 URL、题名或有效日期",
      });
      continue;
    }
    const list = groups.get(url) ?? [];
    list.push(card);
    groups.set(url, list);
  }

  const accepted = [];
  for (const [url, group] of groups) {
    const titles = new Set(group.map((card) => normalizedTitle(card.problem)));
    if (titles.size !== 1) {
      reviewRequired.push({
        indexes: group.map((card) => card.index),
        reason: "同 URL 出现冲突题名",
        url,
      });
      continue;
    }
    const mapped = group
      .map((card) => ({ card, ...mapAttempt(card) }))
      .sort((left, right) => left.card.date.localeCompare(right.card.date) ||
        left.card.index - right.card.index);
    accepted.push({
      url: displayUrl(group[0].url),
      identityUrl: url,
      cards: mapped,
      latest: mapped.at(-1),
    });
  }

  accepted.sort((left, right) =>
    EVIDENCE_PRIORITY[left.latest.evidence] - EVIDENCE_PRIORITY[right.latest.evidence] ||
    HELP_PRIORITY[left.latest.helpLevel] - HELP_PRIORITY[right.latest.helpLevel] ||
    left.cards[0].card.date.localeCompare(right.cards[0].card.date) ||
    left.identityUrl.localeCompare(right.identityUrl) ||
    normalizedPlatform(left.cards[0].card.platform).localeCompare(
      normalizedPlatform(right.cards[0].card.platform),
    ) ||
    normalizedTitle(left.cards[0].card.problem).localeCompare(
      normalizedTitle(right.cards[0].card.problem),
    )
  );

  const importedAt = new Date(`${importDate}T00:00:00+08:00`);
  const problems = [];
  const attempts = [];
  for (const [rank, group] of accepted.entries()) {
    const sourceProblemId = rank + 1;
    const first = group.cards[0].card;
    const latest = group.latest;
    const occurrences = new Map();
    problems.push({
      id: sourceProblemId,
      contestId: null,
      title: first.problem.trim(),
      url: group.url,
      platform: normalizedPlatform(first.platform),
      origin: first.source === "比赛" ? "contest" : "practice",
      status: "review",
      reviewStage: 0,
      cleanStreak: 0,
      lapseCount: 0,
      trainingRole: "core",
      validatesProblemId: null,
      transferIntegrity: "not_applicable",
      nextReviewAt: afterShanghaiDays(importedAt, rank),
      lastEvidence: latest.evidence,
      notes: "旧训练控制台一次性导入；旧排程已忽略。",
      createdAt: shanghaiInstant(first.date),
      updatedAt: shanghaiInstant(latest.card.date),
    });
    for (const item of group.cards) {
      const canonical = [
        sourceId,
        group.url,
        item.card.date,
        item.evidence,
        item.helpLevel,
        item.notes,
      ].join("\n");
      const occurrence = occurrences.get(canonical) ?? 0;
      occurrences.set(canonical, occurrence + 1);
      attempts.push({
        problemId: sourceProblemId,
        context: "legacy_chat_import",
        evidence: item.evidence,
        helpLevel: item.helpLevel,
        idempotencyKey: sha256(`${canonical}\n${occurrence}`),
        previousStage: 0,
        nextStage: 0,
        scheduledAt: null,
        scheduleReason: "历史档案导入，不重放旧排程。",
        notes: item.notes,
        attemptedAt: shanghaiInstant(item.card.date),
      });
    }
  }

  return {
    format: "xcpc-trainer-export",
    version: 5,
    exportedAt: new Date().toISOString(),
    settings: {
      mode: "normal",
      timezone: "Asia/Shanghai",
      reminderTime: "20:30",
    },
    contests: [],
    problems,
    attempts,
    legacyImportReport: {
      cardCount: cards.length,
      acceptedProblems: problems.length,
      acceptedAttempts: attempts.length,
      reviewRequired,
    },
  };
}

function options(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    result[argv[index]?.replace(/^--/, "")] = argv[index + 1];
  }
  return result;
}

async function main() {
  const args = options(process.argv.slice(2));
  if (!args.source || !args.out || !args["source-id"] || !args["import-date"]) {
    throw new Error("需要 --source、--out、--source-id 和 --import-date。");
  }
  const output = resolve(args.out);
  await access(output).then(
    () => { throw new Error(`拒绝覆盖已有文件：${output}`); },
    () => undefined,
  );
  const markdown = await readFile(resolve(args.source), "utf8");
  const backup = buildLegacyBackup(parseTrainingCards(markdown), {
    sourceId: args["source-id"],
    importDate: args["import-date"],
  });
  await writeFile(output, `${JSON.stringify(backup, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(backup.legacyImportReport, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
