import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveUserTimezone } from "../../agents/date-time.js";

export type FitnessAssessment = {
  assessed_at?: string;
  [key: string]: unknown;
};

export type FitnessCheckResult =
  | {
      ok: true;
      report: FitnessAssessment;
      redSignals: string[];
      assessmentPath: string;
      dailyNotePath?: string;
    }
  | {
      ok: false;
      error: string;
      redSignals: [];
    };

export type FitnessCheckParams = {
  workspaceDir: string;
  nowMs?: number;
  timezone?: string;
  timeoutMs?: number;
  pythonBinary?: string;
  logger?: Pick<Console, "warn" | "error">;
};

type RunFitnessProcessParams = {
  workspaceDir: string;
  timeoutMs: number;
  pythonBinary: string;
  logger: Pick<Console, "warn" | "error">;
};

function formatDateStamp(nowMs: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(nowMs));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (year && month && day) {
    return `${year}-${month}-${day}`;
  }
  return new Date(nowMs).toISOString().slice(0, 10);
}

function resolveReportRedSignals(report: FitnessAssessment): string[] {
  const signals: string[] = [];

  const memoryCoverage = report.memory_coverage as { days_since_last?: number | null } | undefined;
  const memoryGap = memoryCoverage?.days_since_last;
  if (memoryGap == null) {
    signals.push("memory: no daily logs found");
  } else if (typeof memoryGap === "number" && memoryGap > 2) {
    signals.push(`memory: no log in ${memoryGap} days`);
  }

  const memoryFreshness = report.memory_freshness as { stale_categories?: string[] } | undefined;
  const staleCategories = memoryFreshness?.stale_categories ?? [];
  if (staleCategories.length > 0) {
    signals.push(`memory freshness: stale/missing -> ${staleCategories.join(", ")}`);
  }

  const knowledgeBase = report.knowledge_base as
    | { status?: string; warnings?: string[] }
    | undefined;
  const kbStatus = knowledgeBase?.status;
  if (kbStatus === "seed_only" || kbStatus === "missing" || kbStatus === "stale") {
    const detail = knowledgeBase?.warnings?.[0] ?? `knowledge-base status is ${kbStatus}`;
    signals.push(`knowledge base: ${detail}`);
  }

  const evolutionRecency = report.evolution_recency as
    | { days_since_last_entry?: number | null }
    | undefined;
  const daysSinceLastEntry = evolutionRecency?.days_since_last_entry;
  if (typeof daysSinceLastEntry === "number" && daysSinceLastEntry > 30) {
    signals.push(`evolution: ${daysSinceLastEntry} days since last growth entry`);
  }

  return signals;
}

async function appendSectionIfNeeded(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  let prefix = "";
  try {
    const existing = await fs.readFile(filePath, "utf8");
    if (existing.trim().length > 0) {
      prefix = existing.endsWith("\n") ? "\n" : "\n\n";
    }
  } catch {
    prefix = "";
  }
  await fs.appendFile(filePath, `${prefix}${content}\n`, "utf8");
}

async function writeAssessmentFile(
  workspaceDir: string,
  report: FitnessAssessment,
): Promise<string> {
  const assessmentPath = path.join(workspaceDir, "workspace", "state", "fitness-assessment.json");
  await fs.mkdir(path.dirname(assessmentPath), { recursive: true });
  await fs.writeFile(assessmentPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return assessmentPath;
}

async function appendFitnessAlert(
  workspaceDir: string,
  dateStamp: string,
  redSignals: string[],
): Promise<string> {
  const dailyNotePath = path.join(workspaceDir, "memory", `${dateStamp}.md`);
  const lines = ["## Fitness Alert", ...redSignals.map((signal) => `- ${signal}`)].join("\n");
  await appendSectionIfNeeded(dailyNotePath, lines);
  return dailyNotePath;
}

function runFitnessProcess(params: RunFitnessProcessParams): Promise<string> {
  const fitnessScript = path.join(params.workspaceDir, "workspace", "evolution", "fitness.py");
  return new Promise((resolve, reject) => {
    const child = spawn(params.pythonBinary, [fitnessScript, "--json"], {
      cwd: params.workspaceDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }) as ChildProcess;

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGKILL");
      params.logger.warn(`fitness check timed out after ${params.timeoutMs}ms`);
      reject(new Error(`fitness check timed out after ${params.timeoutMs}ms`));
    }, params.timeoutMs);

    const finalize = (handler: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      handler();
    };

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    child.on("error", (error) => {
      finalize(() => {
        params.logger.warn(`fitness check failed to start: ${String(error)}`);
        reject(error);
      });
    });
    child.on("close", (code, signal) => {
      finalize(() => {
        if (code !== 0) {
          const detail =
            stderr.trim() || stdout.trim() || `exit code ${code}${signal ? ` (${signal})` : ""}`;
          params.logger.warn(`fitness check exited with failure: ${detail}`);
          reject(new Error(detail));
          return;
        }
        const output = stdout.trim();
        if (!output) {
          const detail = stderr.trim() || "fitness.py produced no JSON output";
          params.logger.warn(`fitness check produced no output: ${detail}`);
          reject(new Error(detail));
          return;
        }
        resolve(output);
      });
    });
  });
}

export async function runFitnessCheck(params: FitnessCheckParams): Promise<FitnessCheckResult> {
  const logger = params.logger ?? console;
  const timeoutMs = params.timeoutMs ?? 10_000;
  const pythonBinary = params.pythonBinary ?? "python3";
  const nowMs = params.nowMs ?? Date.now();
  const timezone = resolveUserTimezone(params.timezone ?? process.env.TZ);
  const dateStamp = formatDateStamp(nowMs, timezone);

  try {
    const stdout = await runFitnessProcess({
      workspaceDir: params.workspaceDir,
      timeoutMs,
      pythonBinary,
      logger,
    });

    const report = JSON.parse(stdout) as FitnessAssessment;
    const assessmentPath = await writeAssessmentFile(params.workspaceDir, report);
    const redSignals = resolveReportRedSignals(report);
    if (redSignals.length > 0) {
      const dailyNotePath = await appendFitnessAlert(params.workspaceDir, dateStamp, redSignals);
      return {
        ok: true,
        report,
        redSignals,
        assessmentPath,
        dailyNotePath,
      };
    }
    return {
      ok: true,
      report,
      redSignals,
      assessmentPath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`fitness check failed: ${message}`);
    return {
      ok: false,
      error: message,
      redSignals: [],
    };
  }
}
