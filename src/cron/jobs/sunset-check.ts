import fs from "node:fs/promises";
import path from "node:path";
import { resolveUserTimezone } from "../../agents/date-time.js";
import { loadCronStore, resolveCronStorePath } from "../store.js";
import type { CronJob } from "../types.js";

const REVIEW_WINDOW_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type SunsetFlaggedJob = {
  id: string;
  name: string;
  summary: string;
  reviewDate: string;
  lastEvidenceDate?: string;
};

export type SunsetCheckResult =
  | {
      ok: true;
      flaggedJobs: SunsetFlaggedJob[];
      dailyNotePath?: string;
    }
  | {
      ok: false;
      error: string;
      flaggedJobs: [];
    };

export type SunsetCheckParams = {
  workspaceDir: string;
  storePath?: string;
  nowMs?: number;
  timezone?: string;
  logger?: Pick<Console, "warn" | "error">;
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

function normalizeDateStamp(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return new Date(parsed).toISOString().slice(0, 10);
}

function dateStampToMs(dateStamp: string): number | undefined {
  const parsed = Date.parse(`${dateStamp}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function summarizeJob(job: Pick<CronJob, "description" | "name">): string {
  const source =
    typeof job.description === "string" && job.description.trim()
      ? job.description.trim()
      : job.name;
  return source.slice(0, 80);
}

function needsReview(job: CronJob, todayStamp: string): boolean {
  if (!job.enabled) {
    return false;
  }

  const reviewDate = normalizeDateStamp(job.reviewDate);
  if (!reviewDate || reviewDate > todayStamp) {
    return false;
  }

  const evidenceDate = normalizeDateStamp(job.lastEvidenceDate);
  if (!evidenceDate) {
    return true;
  }

  const todayMs = dateStampToMs(todayStamp);
  const evidenceMs = dateStampToMs(evidenceDate);
  if (todayMs === undefined || evidenceMs === undefined) {
    return true;
  }
  return Math.floor((todayMs - evidenceMs) / MS_PER_DAY) > REVIEW_WINDOW_DAYS;
}

async function appendAutomationReview(
  workspaceDir: string,
  dateStamp: string,
  flaggedJobs: SunsetFlaggedJob[],
): Promise<string> {
  const dailyNotePath = path.join(workspaceDir, "memory", `${dateStamp}.md`);
  const lines = [
    "## Automation Review",
    "These jobs are past review date with no recent evidence of usefulness:",
    ...flaggedJobs.map((job) => `- ${job.id}: ${job.summary}`),
  ].join("\n");
  await appendSectionIfNeeded(dailyNotePath, lines);
  return dailyNotePath;
}

export async function runSunsetCheck(params: SunsetCheckParams): Promise<SunsetCheckResult> {
  const logger = params.logger ?? console;
  const nowMs = params.nowMs ?? Date.now();
  const timezone = resolveUserTimezone(params.timezone ?? process.env.TZ);
  const todayStamp = formatDateStamp(nowMs, timezone);
  const storePath = resolveCronStorePath(params.storePath);

  try {
    const store = await loadCronStore(storePath);
    const flaggedJobs = store.jobs
      .filter((job) => needsReview(job, todayStamp))
      .map((job) => ({
        id: job.id,
        name: job.name,
        summary: summarizeJob(job),
        reviewDate: normalizeDateStamp(job.reviewDate) ?? todayStamp,
        lastEvidenceDate: normalizeDateStamp(job.lastEvidenceDate),
      }));

    if (flaggedJobs.length === 0) {
      return { ok: true, flaggedJobs };
    }

    const dailyNotePath = await appendAutomationReview(
      params.workspaceDir,
      todayStamp,
      flaggedJobs,
    );
    return {
      ok: true,
      flaggedJobs,
      dailyNotePath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`sunset check failed: ${message}`);
    return {
      ok: false,
      error: message,
      flaggedJobs: [],
    };
  }
}
