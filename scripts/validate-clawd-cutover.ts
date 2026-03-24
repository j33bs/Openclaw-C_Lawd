import fs from "node:fs";
import path from "node:path";

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

const repoRoot = process.cwd();

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
}

function exists(relPath: string): boolean {
  return fs.existsSync(path.join(repoRoot, relPath));
}

function checkExists(relPath: string): CheckResult {
  return {
    name: `exists:${relPath}`,
    ok: exists(relPath),
    detail: exists(relPath) ? "present" : "missing",
  };
}

function checkContains(relPath: string, needle: string, name: string): CheckResult {
  const content = read(relPath);
  return {
    name,
    ok: content.includes(needle),
    detail: content.includes(needle) ? `found in ${relPath}` : `missing from ${relPath}`,
  };
}

function checkNoLegacyPath(relPaths: string[]): CheckResult {
  const offenders: string[] = [];
  for (const relPath of relPaths) {
    if (!exists(relPath)) {
      continue;
    }
    const content = read(relPath);
    if (content.includes("/Users/heathyeager/clawd")) {
      offenders.push(relPath);
    }
  }
  return {
    name: "no-legacy-active-paths",
    ok: offenders.length === 0,
    detail:
      offenders.length === 0
        ? "no active surfaces reference /Users/heathyeager/clawd"
        : offenders.join(", "),
  };
}

function walk(relDir: string): string[] {
  const absDir = path.join(repoRoot, relDir);
  if (!fs.existsSync(absDir)) {
    return [];
  }
  const out: string[] = [];
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const relPath = path.join(relDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(relPath));
    } else if (entry.isFile()) {
      out.push(relPath);
    }
  }
  return out;
}

function checkNoHardcodedSourceUiEndpoints(): CheckResult {
  const archivalAllowPrefixes = ["nodes/c_lawd/legacy-root/"];
  const skipPrefixes = [
    ".git/",
    "node_modules/",
    "dist/",
    "coverage/",
    "workspace/knowledge_base/data/",
  ];
  const candidateFiles = [
    ...walk("memory"),
    ...walk("nodes"),
    ...walk("ops"),
    ...walk("workspace/governance"),
    "TOOLS.md",
    "MEMORY.md",
    ".env.example",
  ].filter((relPath, index, arr) => arr.indexOf(relPath) === index);

  const endpointRegex = /https?:\/\/[^\s`"')>]+/g;
  const offenders: string[] = [];

  for (const relPath of candidateFiles) {
    if (!exists(relPath) || skipPrefixes.some((prefix) => relPath.startsWith(prefix))) {
      continue;
    }
    const content = read(relPath);
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (!/(Source UI|source ui|source-ui|\bDali\b)/i.test(line)) {
        return;
      }
      const matches = line.match(endpointRegex) ?? [];
      for (const match of matches) {
        if (archivalAllowPrefixes.some((prefix) => relPath.startsWith(prefix))) {
          continue;
        }
        offenders.push(`${relPath}:${idx + 1} -> ${match}`);
      }
    });
  }

  return {
    name: "no-hardcoded-source-ui-endpoints-in-tracked-docs",
    ok: offenders.length === 0,
    detail:
      offenders.length === 0
        ? "no non-archival tracked docs hardcode a Source UI / Dali endpoint"
        : offenders.join(", "),
  };
}

const checks: CheckResult[] = [
  ...[
    "identity/README.md",
    "human/README.md",
    "memory/README.md",
    "doctrine/README.md",
    "doctrine/runtime-kernel.md",
    "ops/README.md",
    "ops/cutover.md",
    "ops/config-rebind.md",
    "ops/scripts.md",
    "ops/scripts/README.md",
    "AGENTS.md",
    "SOUL.md",
    "TOOLS.md",
    "IDENTITY.md",
    "USER.md",
    "HEARTBEAT.md",
    "MEMORY.md",
    "memory",
    "nodes/c_lawd/CONVERSATION_KERNEL.md",
    "nodes/c_lawd/MEMORY.md",
    "workspace/governance/OPEN_QUESTIONS.md",
    "workspace/research/TACTI_framework_integration.md",
    "workspace/research/IMPLEMENTATION_ROADMAP.md",
    "workspace/evolution/kb_status.py",
    "workspace/knowledge_base/refresh_seed.py",
    "workspace/knowledge_base/kb.py",
    "workspace/knowledge_base/data/entities.jsonl",
    "profile/user_memory.jsonl",
  ].map(checkExists),
  checkContains("AGENTS.md", "nodes/c_lawd/CONVERSATION_KERNEL.md", "agents-loads-node-kernel"),
  checkContains("AGENTS.md", "nodes/c_lawd/MEMORY.md", "agents-loads-node-memory"),
  checkContains("HEARTBEAT.md", "HEARTBEAT_OK", "heartbeat-has-quiet-gating"),
  checkContains("TOOLS.md", "Source UI receipt:", "tools-enforces-source-ui-receipts"),
  checkContains(
    "nodes/c_lawd/CONVERSATION_KERNEL.md",
    "do not claim side effects without receipts",
    "kernel-enforces-receipts",
  ),
  checkContains(
    "workspace/knowledge_base/README.md",
    "local Ollama embeddings plus a rebuildable sqlite vector store",
    "kb-readme-documents-local-backend-status",
  ),
  checkContains(
    "workspace/knowledge_base/README.md",
    "kb.py sync",
    "kb-readme-documents-sync-command",
  ),
  checkContains(".env.example", "OPENCLAW_INTERBEING_DALI_REMOTE_HOST", "env-documents-dali-host"),
  checkContains(
    "ops/config-rebind.md",
    "agents.defaults.memorySearch.extraPaths",
    "config-rebind-documents-memory-extra-paths",
  ),
  checkContains(
    "ops/config-rebind.md",
    "env.vars.OPENCLAW_HOME",
    "config-rebind-documents-openclaw-home",
  ),
  checkContains(
    "ops/config-rebind.md",
    "plugins.load.paths",
    "config-rebind-documents-plugin-path-rebind",
  ),
  checkNoHardcodedSourceUiEndpoints(),
  checkNoLegacyPath([
    "AGENTS.md",
    "SOUL.md",
    "TOOLS.md",
    "IDENTITY.md",
    "USER.md",
    "HEARTBEAT.md",
    "MEMORY.md",
    "identity/README.md",
    "human/README.md",
    "memory/README.md",
    "doctrine/README.md",
    "doctrine/runtime-kernel.md",
    "ops/README.md",
    "ops/cutover.md",
    "ops/config-rebind.md",
    "ops/scripts.md",
    "nodes/c_lawd/CONVERSATION_KERNEL.md",
    "nodes/c_lawd/MEMORY.md",
  ]),
];

let failed = 0;
for (const check of checks) {
  const status = check.ok ? "PASS" : "FAIL";
  if (!check.ok) {
    failed += 1;
  }
  console.log(`${status} ${check.name} :: ${check.detail}`);
}

if (failed > 0) {
  console.error(`cutover validation failed: ${failed} check(s)`);
  process.exit(1);
}

console.log("cutover validation passed");
