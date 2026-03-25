#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const logLevel = process.env.OPENCLAW_BUILD_VERBOSE ? "info" : "warn";
const extraArgs = process.argv.slice(2);
const INEFFECTIVE_DYNAMIC_IMPORT_RE = /\[INEFFECTIVE_DYNAMIC_IMPORT\]/;
const spawnOptions = {
  encoding: "utf8",
  stdio: "pipe",
  shell: process.platform === "win32",
};

function resolvePnpmRunner() {
  const pnpmVersion = spawnSync("pnpm", ["--version"], {
    encoding: "utf8",
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  if (pnpmVersion.status === 0) {
    return { command: "pnpm", prefix: [] };
  }
  const corepackVersion = spawnSync("corepack", ["pnpm", "--version"], {
    encoding: "utf8",
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  if (corepackVersion.status === 0) {
    return { command: "corepack", prefix: ["pnpm"] };
  }
  return { command: "pnpm", prefix: [] };
}

const pnpmRunner = resolvePnpmRunner();
const result = spawnSync(
  pnpmRunner.command,
  [
    ...pnpmRunner.prefix,
    "exec",
    "tsdown",
    "--config-loader",
    "unrun",
    "--logLevel",
    logLevel,
    ...extraArgs,
  ],
  spawnOptions,
);

const stdout = result.stdout ?? "";
const stderr = result.stderr ?? "";
if (stdout) {
  process.stdout.write(stdout);
}
if (stderr) {
  process.stderr.write(stderr);
}

if (result.status === 0 && INEFFECTIVE_DYNAMIC_IMPORT_RE.test(`${stdout}\n${stderr}`)) {
  console.error(
    "Build emitted [INEFFECTIVE_DYNAMIC_IMPORT]. Replace transparent runtime re-export facades with real runtime boundaries.",
  );
  process.exit(1);
}

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
