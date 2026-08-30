#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2];
const extraArgs = process.argv.slice(3);
const commands = {
  dev: { packageName: "vite", binName: "vite", args: [] },
  build: {
    packageName: "vinext",
    binName: "vinext",
    args: ["build"],
    timeout: true,
  },
  start: { packageName: "vinext", binName: "vinext", args: ["start"] },
  lint: {
    packageName: "eslint",
    binName: "eslint",
    args: [".", "--ignore-pattern", "dist", "--ignore-pattern", ".next"],
  },
  "db:generate": {
    packageName: "drizzle-kit",
    binName: "drizzle-kit",
    args: ["generate"],
  },
};

function durationMs(value, fallback) {
  const match = /^(\d+)(ms|s|m)?$/.exec(value ?? "");
  if (!match) return fallback;
  return (
    Number(match[1]) * { ms: 1, s: 1000, m: 60_000 }[match[2] ?? "ms"]
  );
}

async function projectEnvironment() {
  const runtimeRoot = resolve(
    process.env.SITES_RUNTIME_ROOT ?? join(projectRoot, ".sites-runtime"),
  );
  const paths = ["home", "npm-cache", "xdg-config", "tmp", "wrangler/logs"];
  await Promise.all(
    paths.map((path) => mkdir(join(runtimeRoot, path), { recursive: true })),
  );
  const env = { ...process.env };
  for (const key of [
    "NPM_CONFIG_CACHE",
    "npm_config_cache",
    "npm_config_proxy",
    "npm_config_http_proxy",
    "npm_config_https_proxy",
    "NPM_CONFIG_PROXY",
    "NPM_CONFIG_HTTP_PROXY",
    "NPM_CONFIG_HTTPS_PROXY",
  ]) {
    delete env[key];
  }
  return {
    ...env,
    SITES_ENV_READY: "1",
    SITES_PROJECT_ROOT: projectRoot,
    SITES_RUNTIME_HOME: join(runtimeRoot, "home"),
    XDG_CONFIG_HOME: join(runtimeRoot, "xdg-config"),
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_LOG_PATH: join(runtimeRoot, "wrangler/logs"),
    MINIFLARE_REGISTRY_PATH: join(runtimeRoot, "wrangler/registry"),
    npm_config_cache: join(runtimeRoot, "npm-cache"),
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
  };
}

async function localBin(packageName, binName) {
  const packagePath = join(
    projectRoot,
    "node_modules",
    packageName,
    "package.json",
  );
  let packageJson;
  try {
    packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  } catch {
    throw new Error(`${binName} 不可用，请先运行 npm ci。`);
  }
  const relativeBin =
    typeof packageJson.bin === "string"
      ? packageJson.bin
      : packageJson.bin?.[binName];
  if (!relativeBin) throw new Error(`${binName} 不可用，请先运行 npm ci。`);
  return join(dirname(packagePath), relativeBin);
}

function run(executable, args, env, timeoutMs = 0) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      cwd: projectRoot,
      env,
      stdio: "inherit",
    });
    let timedOut = false;
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill();
          }, timeoutMs)
        : null;
    child.once("error", reject);
    child.once("exit", (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) console.error(`命令运行超过 ${timeoutMs}ms，已终止。`);
      resolvePromise(timedOut ? 124 : (code ?? 1));
    });
  });
}

async function main() {
  const env = await projectEnvironment();
  if (command === "install:ci") {
    if (!process.env.npm_execpath) throw new Error("无法定位 npm CLI。");
    return run(
      process.execPath,
      [process.env.npm_execpath, "ci", "--cache", env.npm_config_cache],
      env,
    );
  }
  const spec = commands[command];
  if (!spec) throw new Error(`未知项目命令：${command ?? "(missing)"}`);
  const executable = await localBin(spec.packageName, spec.binName);
  const timeout = spec.timeout
    ? durationMs(process.env.SITES_BUILD_TIMEOUT, 180_000)
    : 0;
  return run(process.execPath, [executable, ...spec.args, ...extraArgs], env, timeout);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 69;
  });
