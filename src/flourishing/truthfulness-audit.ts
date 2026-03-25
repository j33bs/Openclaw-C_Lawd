import { execFile } from "node:child_process";
import type { ExecFileOptions } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { formatErrorMessage } from "../infra/errors.js";
import { resolveRecentDateKeys } from "./tacti-state.js";

export interface TruthfulnessCheck {
  claim: string;
  verified: boolean;
  evidence: string;
  checkedAt: string;
}

export type TruthfulnessAuditResult = {
  checks: TruthfulnessCheck[];
  passRate: number;
  failures: string[];
};

const KB_TIMEOUT_MS = 10_000;
const OLLAMA_TIMEOUT_MS = 5_000;
const TACTI_FRESHNESS_MS = 24 * 60 * 60 * 1000;
const FRAGMENTATION_FRESHNESS_MS = 12 * 60 * 60 * 1000;
const TIMESTAMP_KEYS = new Set([
  "created",
  "created_at",
  "checkedAt",
  "collectedAt",
  "completed_at",
  "generatedAt",
  "last_sync",
  "lastSync",
  "last_update",
  "lastUpdated",
  "recordedAt",
  "timestamp",
  "ts",
  "ts_utc",
  "updatedAt",
  "updated_at",
]);

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toRelative(workspaceDir: string, absolutePath: string): string {
  const relative = path.relative(workspaceDir, absolutePath);
  return relative || path.basename(absolutePath);
}

function collectTimestampCandidates(value: unknown, timestamps: number[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTimestampCandidates(item, timestamps);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (TIMESTAMP_KEYS.has(key) && typeof child === "string") {
      const parsed = Date.parse(child);
      if (Number.isFinite(parsed)) {
        timestamps.push(parsed);
      }
    }
    collectTimestampCandidates(child, timestamps);
  }
}

function latestTimestampMs(value: unknown, fallbackMs: number): number {
  const timestamps: number[] = [];
  collectTimestampCandidates(value, timestamps);
  return timestamps.length > 0 ? Math.max(...timestamps) : fallbackMs;
}

function formatAge(ms: number): string {
  const hours = ms / (60 * 60 * 1000);
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(ms / (60 * 1000)));
    return `${minutes}m`;
  }
  if (hours < 24) {
    return `${Math.round(hours)}h`;
  }
  return `${Math.round(hours / 24)}d`;
}

async function appendAuditWarning(
  workspaceDir: string,
  result: TruthfulnessAuditResult,
): Promise<void> {
  const { today } = resolveRecentDateKeys();
  const dailyNotePath = path.join(workspaceDir, "memory", `${today}.md`);
  const lines = [
    "",
    "## Truthfulness Warning",
    `- Pass rate: ${Math.round(result.passRate * 100)}%`,
    ...result.failures.slice(0, 3).map((failure) => `- ${failure}`),
    "",
  ].join("\n");
  await fs.mkdir(path.dirname(dailyNotePath), { recursive: true });
  await fs.appendFile(dailyNotePath, lines, "utf8").catch(async () => {
    await fs.writeFile(dailyNotePath, `# ${today}\n${lines}\n`, "utf8");
  });
}

async function runExecFile(
  command: string,
  args: string[],
  options: ExecFileOptions,
): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }));
        return;
      }
      resolve({
        stdout: typeof stdout === "string" ? stdout : stdout.toString("utf8"),
        stderr: typeof stderr === "string" ? stderr : stderr.toString("utf8"),
      });
    });
  });
}

async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function assessDailyNote(
  workspaceDir: string,
  checkedAt: string,
): Promise<TruthfulnessCheck> {
  const { today } = resolveRecentDateKeys();
  const notePath = path.join(workspaceDir, "memory", `${today}.md`);
  const verified = await checkFileExists(notePath);
  return {
    claim: "Daily notes are current",
    verified,
    evidence: verified
      ? `found ${toRelative(workspaceDir, notePath)}`
      : `missing ${toRelative(workspaceDir, notePath)}`,
    checkedAt,
  };
}

async function assessKbBackend(
  workspaceDir: string,
  checkedAt: string,
): Promise<TruthfulnessCheck> {
  const scriptPath = path.join(workspaceDir, "workspace", "knowledge_base", "kb.py");
  try {
    const { stdout } = await runExecFile("python3", [scriptPath, "status", "--json"], {
      cwd: workspaceDir,
      timeout: KB_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      encoding: "utf8",
    });
    const parsed = JSON.parse(stdout) as unknown;
    const status =
      isRecord(parsed) && typeof parsed.status === "string" ? parsed.status.trim() : "";
    const verified = status === "ready";
    return {
      claim: "Knowledge base is working",
      verified,
      evidence: verified
        ? "kb.py status reported ready"
        : `kb.py status reported ${status || "unknown"}`,
      checkedAt,
    };
  } catch (error) {
    return {
      claim: "Knowledge base is working",
      verified: false,
      evidence: `kb.py status failed: ${formatErrorMessage(error)}`,
      checkedAt,
    };
  }
}

async function assessOllamaEmbeddings(checkedAt: string): Promise<TruthfulnessCheck> {
  try {
    const response = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    });
    const verified = response.status === 200;
    return {
      claim: "Embedding service is running",
      verified,
      evidence: verified
        ? "HTTP 200 from Ollama /api/tags"
        : `HTTP ${response.status} from Ollama /api/tags`,
      checkedAt,
    };
  } catch (error) {
    return {
      claim: "Embedding service is running",
      verified: false,
      evidence: `Ollama /api/tags failed: ${formatErrorMessage(error)}`,
      checkedAt,
    };
  }
}

async function readJsonFile(filePath: string): Promise<{ data: unknown; mtimeMs: number | null }> {
  try {
    const [raw, stat] = await Promise.all([fs.readFile(filePath, "utf8"), fs.stat(filePath)]);
    try {
      return { data: JSON.parse(raw) as unknown, mtimeMs: stat.mtimeMs };
    } catch {
      return { data: null, mtimeMs: stat.mtimeMs };
    }
  } catch {
    return { data: null, mtimeMs: null };
  }
}

async function assessRelationshipFreshness(
  workspaceDir: string,
  checkedAt: string,
): Promise<TruthfulnessCheck> {
  const filePath = path.join(workspaceDir, "workspace", "memory", "relationship.json");
  const { data, mtimeMs } = await readJsonFile(filePath);
  if (!data) {
    return {
      claim: "TACTI trackers are current",
      verified: false,
      evidence: `missing or unreadable ${toRelative(workspaceDir, filePath)}`,
      checkedAt,
    };
  }

  const lastUpdatedMs = latestTimestampMs(data, mtimeMs ?? Date.now());
  const ageMs = Date.now() - lastUpdatedMs;
  const verified = ageMs <= TACTI_FRESHNESS_MS;

  return {
    claim: "TACTI trackers are current",
    verified,
    evidence: verified
      ? `relationship.json updated ${formatAge(ageMs)} ago`
      : `relationship.json is stale at ${formatAge(ageMs)} old`,
    checkedAt,
  };
}

async function assessPinnedDoctrine(
  workspaceDir: string,
  checkedAt: string,
): Promise<TruthfulnessCheck> {
  const doctrinePath = path.join(workspaceDir, "nodes", "c_lawd", "MEMORY.md");
  const verified = await checkFileExists(doctrinePath);
  return {
    claim: "Node doctrine is available",
    verified,
    evidence: verified
      ? `found ${toRelative(workspaceDir, doctrinePath)}`
      : `missing ${toRelative(workspaceDir, doctrinePath)}`,
    checkedAt,
  };
}

async function assessFragmentationRecency(
  workspaceDir: string,
  checkedAt: string,
): Promise<TruthfulnessCheck> {
  const filePath = path.join(workspaceDir, "workspace", "state", "fragmentation-assessment.json");
  const { data, mtimeMs } = await readJsonFile(filePath);
  if (!data) {
    return {
      claim: "Fragmentation monitoring is active",
      verified: false,
      evidence: `missing or unreadable ${toRelative(workspaceDir, filePath)}`,
      checkedAt,
    };
  }

  const lastUpdatedMs = latestTimestampMs(data, mtimeMs ?? Date.now());
  const ageMs = Date.now() - lastUpdatedMs;
  const verified = ageMs <= FRAGMENTATION_FRESHNESS_MS;

  return {
    claim: "Fragmentation monitoring is active",
    verified,
    evidence: verified
      ? `fragmentation assessment collected ${formatAge(ageMs)} ago`
      : `fragmentation assessment is stale at ${formatAge(ageMs)} old`,
    checkedAt,
  };
}

export async function runTruthfulnessAudit(workspaceDir: string): Promise<TruthfulnessAuditResult> {
  const checkedAt = new Date().toISOString();
  const checks = await Promise.all([
    assessDailyNote(workspaceDir, checkedAt),
    assessKbBackend(workspaceDir, checkedAt),
    assessOllamaEmbeddings(checkedAt),
    assessRelationshipFreshness(workspaceDir, checkedAt),
    assessPinnedDoctrine(workspaceDir, checkedAt),
    assessFragmentationRecency(workspaceDir, checkedAt),
  ]);

  const verifiedCount = checks.filter((check) => check.verified).length;
  const failures = checks
    .filter((check) => !check.verified)
    .map((check) => `${check.claim}: ${check.evidence}`);

  return {
    checks,
    passRate: verifiedCount / checks.length,
    failures,
  };
}

export async function writeTruthfulnessAuditSnapshot(
  workspaceDir: string,
): Promise<TruthfulnessAuditResult> {
  const result = await runTruthfulnessAudit(workspaceDir);
  const outputPath = path.join(workspaceDir, "workspace", "state", "truthfulness-audit.json");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  if (result.passRate < 0.8) {
    await appendAuditWarning(workspaceDir, result).catch(() => undefined);
  }
  return result;
}
