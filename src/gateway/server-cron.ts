import { execFile } from "node:child_process";
import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import { resolveUserTimezone } from "../agents/date-time.js";
import type { CliDeps } from "../cli/deps.js";
import { createOutboundSendDeps } from "../cli/outbound-send-deps.js";
import { loadConfig } from "../config/config.js";
import {
  canonicalizeMainSessionAlias,
  resolveAgentIdFromSessionKey,
  resolveAgentMainSessionKey,
} from "../config/sessions.js";
import { resolveStorePath } from "../config/sessions/paths.js";
import { resolveFailureDestination, sendFailureNotificationAnnounce } from "../cron/delivery.js";
import { runCronIsolatedAgentTurn } from "../cron/isolated-agent.js";
import { resolveDeliveryTarget } from "../cron/isolated-agent/delivery-target.js";
import { runFitnessCheck } from "../cron/jobs/fitness-check.js";
import { runSunsetCheck } from "../cron/jobs/sunset-check.js";
import {
  appendCronRunLog,
  resolveCronRunLogPath,
  resolveCronRunLogPruneOptions,
} from "../cron/run-log.js";
import { CronService } from "../cron/service.js";
import { resolveCronStorePath } from "../cron/store.js";
import type { CronJobCreate } from "../cron/types.js";
import { normalizeHttpWebhookUrl } from "../cron/webhook-url.js";
import { writeTruthfulnessAuditSnapshot } from "../flourishing/truthfulness-audit.js";
import { formatErrorMessage } from "../infra/errors.js";
import { runHeartbeatOnce } from "../infra/heartbeat-runner.js";
import { requestHeartbeatNow } from "../infra/heartbeat-wake.js";
import { fetchWithSsrFGuard } from "../infra/net/fetch-guard.js";
import { SsrFBlockedError } from "../infra/net/ssrf.js";
import { deliverOutboundPayloads } from "../infra/outbound/deliver.js";
import { enqueueSystemEvent } from "../infra/system-events.js";
import { getChildLogger } from "../logging.js";
import { normalizeAgentId, toAgentStoreSessionKey } from "../routing/session-key.js";
import { defaultRuntime } from "../runtime.js";

export type GatewayCronState = {
  cron: CronService;
  storePath: string;
  cronEnabled: boolean;
};

const CRON_WEBHOOK_TIMEOUT_MS = 10_000;
const FITNESS_PROPOSAL_TIMEOUT_MS = 10_000;
const DEFAULT_CRON_REVIEW_WINDOW_DAYS = 30;
const FLOURISHING_BUILTIN_MESSAGES = {
  truthfulnessAudit: "__builtin__:truthfulness-audit",
  fitnessSweep: "__builtin__:fitness-sweep",
  sunsetCheck: "__builtin__:sunset-check",
} as const;

type FlourishingBuiltinMessage =
  (typeof FLOURISHING_BUILTIN_MESSAGES)[keyof typeof FLOURISHING_BUILTIN_MESSAGES];

type ProposalLifecycleSummary = {
  ok: boolean;
  staleCount: number;
  blockedCount: number;
  outputPath?: string;
  error?: string;
};

function trimToOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function redactWebhookUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "<invalid-webhook-url>";
  }
}

type CronWebhookTarget = {
  url: string;
  source: "delivery" | "legacy";
};

function resolveCronWebhookTarget(params: {
  delivery?: { mode?: string; to?: string };
  legacyNotify?: boolean;
  legacyWebhook?: string;
}): CronWebhookTarget | null {
  const mode = params.delivery?.mode?.trim().toLowerCase();
  if (mode === "webhook") {
    const url = normalizeHttpWebhookUrl(params.delivery?.to);
    return url ? { url, source: "delivery" } : null;
  }

  if (params.legacyNotify) {
    const legacyUrl = normalizeHttpWebhookUrl(params.legacyWebhook);
    if (legacyUrl) {
      return { url: legacyUrl, source: "legacy" };
    }
  }

  return null;
}

function buildCronWebhookHeaders(webhookToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (webhookToken) {
    headers.Authorization = `Bearer ${webhookToken}`;
  }
  return headers;
}

async function postCronWebhook(params: {
  webhookUrl: string;
  webhookToken?: string;
  payload: unknown;
  logContext: Record<string, unknown>;
  blockedLog: string;
  failedLog: string;
  logger: ReturnType<typeof getChildLogger>;
}): Promise<void> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, CRON_WEBHOOK_TIMEOUT_MS);

  try {
    const result = await fetchWithSsrFGuard({
      url: params.webhookUrl,
      init: {
        method: "POST",
        headers: buildCronWebhookHeaders(params.webhookToken),
        body: JSON.stringify(params.payload),
        signal: abortController.signal,
      },
    });
    await result.release();
  } catch (err) {
    if (err instanceof SsrFBlockedError) {
      params.logger.warn(
        {
          ...params.logContext,
          reason: formatErrorMessage(err),
          webhookUrl: redactWebhookUrl(params.webhookUrl),
        },
        params.blockedLog,
      );
    } else {
      params.logger.warn(
        {
          ...params.logContext,
          err: formatErrorMessage(err),
          webhookUrl: redactWebhookUrl(params.webhookUrl),
        },
        params.failedLog,
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

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

function addDays(dateStamp: string, days: number): string {
  const parsed = Date.parse(`${dateStamp}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) {
    return dateStamp;
  }
  return new Date(parsed + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isFlourishingBuiltinMessage(message: string): message is FlourishingBuiltinMessage {
  return Object.values(FLOURISHING_BUILTIN_MESSAGES).includes(message as FlourishingBuiltinMessage);
}

function buildFlourishingBuiltinSpecs(params: {
  timezone?: string;
  nowMs?: number;
}): Array<{ marker: FlourishingBuiltinMessage; job: CronJobCreate }> {
  const timezone = resolveUserTimezone(params.timezone ?? process.env.TZ);
  const nowMs = params.nowMs ?? Date.now();
  const today = formatDateStamp(nowMs, timezone);
  const reviewDate = addDays(today, DEFAULT_CRON_REVIEW_WINDOW_DAYS);

  return [
    {
      marker: FLOURISHING_BUILTIN_MESSAGES.truthfulnessAudit,
      job: {
        name: "Flourishing Truthfulness Audit",
        description:
          "Runs the local truthfulness audit and records whether grounding surfaces are still live.",
        enabled: true,
        reviewDate,
        schedule: { kind: "every", everyMs: 12 * 60 * 60 * 1000 },
        sessionTarget: "isolated",
        wakeMode: "now",
        payload: {
          kind: "agentTurn",
          message: FLOURISHING_BUILTIN_MESSAGES.truthfulnessAudit,
        },
      },
    },
    {
      marker: FLOURISHING_BUILTIN_MESSAGES.fitnessSweep,
      job: {
        name: "Flourishing Fitness Sweep",
        description:
          "Runs the daily fitness assessment and proposal lifecycle check for the workspace.",
        enabled: true,
        reviewDate,
        schedule: {
          kind: "cron",
          expr: "15 6 * * *",
          tz: timezone,
        },
        sessionTarget: "isolated",
        wakeMode: "now",
        payload: {
          kind: "agentTurn",
          message: FLOURISHING_BUILTIN_MESSAGES.fitnessSweep,
        },
      },
    },
    {
      marker: FLOURISHING_BUILTIN_MESSAGES.sunsetCheck,
      job: {
        name: "Flourishing Sunset Check",
        description:
          "Surfaces active cron jobs that are past review date without recent evidence of usefulness.",
        enabled: true,
        reviewDate,
        schedule: {
          kind: "cron",
          expr: "0 9 * * 1",
          tz: timezone,
        },
        sessionTarget: "isolated",
        wakeMode: "now",
        payload: {
          kind: "agentTurn",
          message: FLOURISHING_BUILTIN_MESSAGES.sunsetCheck,
        },
      },
    },
  ];
}

async function runExecFile(
  command: string,
  args: string[],
  options: {
    cwd: string;
    timeout: number;
  },
): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        timeout: options.timeout,
        maxBuffer: 1024 * 1024,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stdout, stderr }));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

async function runProposalLifecycle(workspaceDir: string): Promise<ProposalLifecycleSummary> {
  const scriptPath = `${workspaceDir}/workspace/evolution/proposal_lifecycle.py`;
  try {
    const { stdout } = await runExecFile("python3", [scriptPath, "--json"], {
      cwd: workspaceDir,
      timeout: FITNESS_PROPOSAL_TIMEOUT_MS,
    });
    const parsed = JSON.parse(stdout) as unknown;
    const record =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    return {
      ok: true,
      staleCount:
        typeof record.stale_count === "number" && Number.isFinite(record.stale_count)
          ? record.stale_count
          : 0,
      blockedCount:
        typeof record.blocked_count === "number" && Number.isFinite(record.blocked_count)
          ? record.blocked_count
          : 0,
      outputPath: typeof record.output_path === "string" ? record.output_path : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      staleCount: 0,
      blockedCount: 0,
      error: formatErrorMessage(error),
    };
  }
}

async function runFlourishingBuiltinJob(params: {
  message: FlourishingBuiltinMessage;
  workspaceDir: string;
  storePath: string;
  logger: ReturnType<typeof getChildLogger>;
}): Promise<{
  status: "ok" | "error";
  error?: string;
  summary?: string;
  lastEvidenceDate?: string;
}> {
  const lastEvidenceDate = formatDateStamp(Date.now(), resolveUserTimezone(process.env.TZ));
  switch (params.message) {
    case FLOURISHING_BUILTIN_MESSAGES.truthfulnessAudit: {
      const result = await writeTruthfulnessAuditSnapshot(params.workspaceDir).catch((error) => ({
        error: formatErrorMessage(error),
      }));
      if ("error" in result) {
        return {
          status: "error",
          error: result.error,
        };
      }
      return {
        status: "ok",
        summary: `truthfulness audit ${Math.round(result.passRate * 100)}% (${result.failures.length} failures)`,
        lastEvidenceDate,
      };
    }
    case FLOURISHING_BUILTIN_MESSAGES.fitnessSweep: {
      const fitness = await runFitnessCheck({ workspaceDir: params.workspaceDir });
      if (!fitness.ok) {
        return {
          status: "error",
          error: fitness.error,
        };
      }
      const proposalLifecycle = await runProposalLifecycle(params.workspaceDir);
      if (!proposalLifecycle.ok) {
        return {
          status: "error",
          error: `proposal lifecycle check failed: ${proposalLifecycle.error ?? "unknown error"}`,
        };
      }
      return {
        status: "ok",
        summary: `fitness sweep ${fitness.redSignals.length} red signals; proposals stale=${proposalLifecycle.staleCount} blocked=${proposalLifecycle.blockedCount}`,
        lastEvidenceDate,
      };
    }
    case FLOURISHING_BUILTIN_MESSAGES.sunsetCheck: {
      const result = await runSunsetCheck({
        workspaceDir: params.workspaceDir,
        storePath: params.storePath,
      });
      if (!result.ok) {
        return {
          status: "error",
          error: result.error,
        };
      }
      return {
        status: "ok",
        summary:
          result.flaggedJobs.length > 0
            ? `sunset check flagged ${result.flaggedJobs.length} jobs`
            : "sunset check found no jobs needing review",
        lastEvidenceDate,
      };
    }
  }
}

export async function ensureFlourishingCronJobs(params: {
  cron: CronService;
  workspaceDir: string;
  timezone?: string;
  nowMs?: number;
}): Promise<void> {
  const existingJobs = await params.cron.list({ includeDisabled: true });
  const existingByMarker = new Map<FlourishingBuiltinMessage, (typeof existingJobs)[number]>();
  for (const job of existingJobs) {
    if (job.payload.kind !== "agentTurn") {
      continue;
    }
    if (isFlourishingBuiltinMessage(job.payload.message)) {
      existingByMarker.set(job.payload.message, job);
    }
  }

  for (const spec of buildFlourishingBuiltinSpecs({
    timezone: params.timezone,
    nowMs: params.nowMs,
  })) {
    const existing = existingByMarker.get(spec.marker);
    if (!existing) {
      await params.cron.add(spec.job);
      continue;
    }
    const patch: Parameters<CronService["update"]>[1] = {};
    if (!existing.description) {
      patch.description = spec.job.description;
    }
    if (!existing.reviewDate) {
      patch.reviewDate = spec.job.reviewDate;
    }
    if (Object.keys(patch).length > 0) {
      await params.cron.update(existing.id, patch);
    }
  }
}

export function buildGatewayCronService(params: {
  cfg: ReturnType<typeof loadConfig>;
  deps: CliDeps;
  broadcast: (event: string, payload: unknown, opts?: { dropIfSlow?: boolean }) => void;
  workspaceDir?: string;
}): GatewayCronState {
  const cronLogger = getChildLogger({ module: "cron" });
  const storePath = resolveCronStorePath(params.cfg.cron?.store);
  const cronEnabled = process.env.OPENCLAW_SKIP_CRON !== "1" && params.cfg.cron?.enabled !== false;

  const resolveCronAgent = (requested?: string | null) => {
    const runtimeConfig = loadConfig();
    const normalized =
      typeof requested === "string" && requested.trim() ? normalizeAgentId(requested) : undefined;
    const hasAgent =
      normalized !== undefined &&
      Array.isArray(runtimeConfig.agents?.list) &&
      runtimeConfig.agents.list.some(
        (entry) =>
          entry && typeof entry.id === "string" && normalizeAgentId(entry.id) === normalized,
      );
    const agentId = hasAgent ? normalized : resolveDefaultAgentId(runtimeConfig);
    return { agentId, cfg: runtimeConfig };
  };

  const resolveCronSessionKey = (params: {
    runtimeConfig: ReturnType<typeof loadConfig>;
    agentId: string;
    requestedSessionKey?: string | null;
  }) => {
    const requested = params.requestedSessionKey?.trim();
    if (!requested) {
      return resolveAgentMainSessionKey({
        cfg: params.runtimeConfig,
        agentId: params.agentId,
      });
    }
    const candidate = toAgentStoreSessionKey({
      agentId: params.agentId,
      requestKey: requested,
      mainKey: params.runtimeConfig.session?.mainKey,
    });
    const canonical = canonicalizeMainSessionAlias({
      cfg: params.runtimeConfig,
      agentId: params.agentId,
      sessionKey: candidate,
    });
    if (canonical !== "global") {
      const sessionAgentId = resolveAgentIdFromSessionKey(canonical);
      if (normalizeAgentId(sessionAgentId) !== normalizeAgentId(params.agentId)) {
        return resolveAgentMainSessionKey({
          cfg: params.runtimeConfig,
          agentId: params.agentId,
        });
      }
    }
    return canonical;
  };

  const resolveCronWakeTarget = (opts?: { agentId?: string; sessionKey?: string | null }) => {
    const runtimeConfig = loadConfig();
    const requestedAgentId = opts?.agentId ? resolveCronAgent(opts.agentId).agentId : undefined;
    const derivedAgentId =
      requestedAgentId ??
      (opts?.sessionKey
        ? normalizeAgentId(resolveAgentIdFromSessionKey(opts.sessionKey))
        : undefined);
    const agentId = derivedAgentId || undefined;
    const sessionKey =
      opts?.sessionKey && agentId
        ? resolveCronSessionKey({
            runtimeConfig,
            agentId,
            requestedSessionKey: opts.sessionKey,
          })
        : undefined;
    return { runtimeConfig, agentId, sessionKey };
  };

  const defaultAgentId = resolveDefaultAgentId(params.cfg);
  const runLogPrune = resolveCronRunLogPruneOptions(params.cfg.cron?.runLog);
  const resolveSessionStorePath = (agentId?: string) =>
    resolveStorePath(params.cfg.session?.store, {
      agentId: agentId ?? defaultAgentId,
    });
  const sessionStorePath = resolveSessionStorePath(defaultAgentId);
  const warnedLegacyWebhookJobs = new Set<string>();

  const cron = new CronService({
    storePath,
    cronEnabled,
    cronConfig: params.cfg.cron,
    defaultAgentId,
    resolveSessionStorePath,
    sessionStorePath,
    enqueueSystemEvent: (text, opts) => {
      const { agentId, cfg: runtimeConfig } = resolveCronAgent(opts?.agentId);
      const sessionKey = resolveCronSessionKey({
        runtimeConfig,
        agentId,
        requestedSessionKey: opts?.sessionKey,
      });
      enqueueSystemEvent(text, { sessionKey, contextKey: opts?.contextKey });
    },
    requestHeartbeatNow: (opts) => {
      const { agentId, sessionKey } = resolveCronWakeTarget(opts);
      requestHeartbeatNow({
        reason: opts?.reason,
        agentId,
        sessionKey,
      });
    },
    runHeartbeatOnce: async (opts) => {
      const { runtimeConfig, agentId, sessionKey } = resolveCronWakeTarget(opts);
      // Merge cron-supplied heartbeat overrides (e.g. target: "last") with the
      // fully resolved agent heartbeat config so cron-triggered heartbeats
      // respect agent-specific overrides (agents.list[].heartbeat) before
      // falling back to agents.defaults.heartbeat.
      const agentEntry =
        Array.isArray(runtimeConfig.agents?.list) &&
        runtimeConfig.agents.list.find(
          (entry) =>
            entry && typeof entry.id === "string" && normalizeAgentId(entry.id) === agentId,
        );
      const agentHeartbeat =
        agentEntry && typeof agentEntry === "object" ? agentEntry.heartbeat : undefined;
      const baseHeartbeat = {
        ...runtimeConfig.agents?.defaults?.heartbeat,
        ...agentHeartbeat,
      };
      const heartbeatOverride = opts?.heartbeat
        ? { ...baseHeartbeat, ...opts.heartbeat }
        : undefined;
      return await runHeartbeatOnce({
        cfg: runtimeConfig,
        reason: opts?.reason,
        agentId,
        sessionKey,
        heartbeat: heartbeatOverride,
        deps: { ...params.deps, runtime: defaultRuntime },
      });
    },
    runIsolatedAgentJob: async ({ job, message, abortSignal }) => {
      if (params.workspaceDir && isFlourishingBuiltinMessage(message)) {
        if (abortSignal?.aborted) {
          return { status: "error" as const, error: "cron: job execution timed out" };
        }
        return await runFlourishingBuiltinJob({
          message,
          workspaceDir: params.workspaceDir,
          storePath,
          logger: cronLogger,
        });
      }
      const { agentId, cfg: runtimeConfig } = resolveCronAgent(job.agentId);
      let sessionKey = `cron:${job.id}`;
      if (job.sessionTarget.startsWith("session:")) {
        const customSessionId = job.sessionTarget.slice(8).trim();
        if (customSessionId) {
          sessionKey = customSessionId;
        }
      }
      return await runCronIsolatedAgentTurn({
        cfg: runtimeConfig,
        deps: params.deps,
        job,
        message,
        abortSignal,
        agentId,
        sessionKey,
        lane: "cron",
      });
    },
    sendCronFailureAlert: async ({ job, text, channel, to, mode, accountId }) => {
      const { agentId, cfg: runtimeConfig } = resolveCronAgent(job.agentId);
      const webhookToken = trimToOptionalString(params.cfg.cron?.webhookToken);

      // Webhook mode requires a URL - fail closed if missing
      if (mode === "webhook" && !to) {
        cronLogger.warn(
          { jobId: job.id },
          "cron: failure alert webhook mode requires URL, skipping",
        );
        return;
      }

      if (mode === "webhook" && to) {
        const webhookUrl = normalizeHttpWebhookUrl(to);
        if (webhookUrl) {
          await postCronWebhook({
            webhookUrl,
            webhookToken,
            payload: {
              jobId: job.id,
              jobName: job.name,
              message: text,
            },
            logContext: { jobId: job.id },
            blockedLog: "cron: failure alert webhook blocked by SSRF guard",
            failedLog: "cron: failure alert webhook failed",
            logger: cronLogger,
          });
        } else {
          cronLogger.warn(
            {
              jobId: job.id,
              webhookUrl: redactWebhookUrl(to),
            },
            "cron: failure alert webhook URL is invalid, skipping",
          );
        }
        return;
      }

      const target = await resolveDeliveryTarget(runtimeConfig, agentId, {
        channel,
        to,
        accountId,
      });
      if (!target.ok) {
        throw target.error;
      }
      await deliverOutboundPayloads({
        cfg: runtimeConfig,
        channel: target.channel,
        to: target.to,
        accountId: target.accountId,
        threadId: target.threadId,
        payloads: [{ text }],
        deps: createOutboundSendDeps(params.deps),
      });
    },
    log: getChildLogger({ module: "cron", storePath }),
    onEvent: (evt) => {
      params.broadcast("cron", evt, { dropIfSlow: true });
      if (evt.action === "finished") {
        const webhookToken = trimToOptionalString(params.cfg.cron?.webhookToken);
        const legacyWebhook = trimToOptionalString(params.cfg.cron?.webhook);
        const job = cron.getJob(evt.jobId);
        const legacyNotify = (job as { notify?: unknown } | undefined)?.notify === true;
        const webhookTarget = resolveCronWebhookTarget({
          delivery:
            job?.delivery && typeof job.delivery.mode === "string"
              ? { mode: job.delivery.mode, to: job.delivery.to }
              : undefined,
          legacyNotify,
          legacyWebhook,
        });

        if (!webhookTarget && job?.delivery?.mode === "webhook") {
          cronLogger.warn(
            {
              jobId: evt.jobId,
              deliveryTo: job.delivery.to,
            },
            "cron: skipped webhook delivery, delivery.to must be a valid http(s) URL",
          );
        }

        if (webhookTarget?.source === "legacy" && !warnedLegacyWebhookJobs.has(evt.jobId)) {
          warnedLegacyWebhookJobs.add(evt.jobId);
          cronLogger.warn(
            {
              jobId: evt.jobId,
              legacyWebhook: redactWebhookUrl(webhookTarget.url),
            },
            "cron: deprecated notify+cron.webhook fallback in use, migrate to delivery.mode=webhook with delivery.to",
          );
        }

        if (webhookTarget && evt.summary) {
          void (async () => {
            await postCronWebhook({
              webhookUrl: webhookTarget.url,
              webhookToken,
              payload: evt,
              logContext: { jobId: evt.jobId },
              blockedLog: "cron: webhook delivery blocked by SSRF guard",
              failedLog: "cron: webhook delivery failed",
              logger: cronLogger,
            });
          })();
        }

        if (evt.status === "error" && job) {
          const failureDest = resolveFailureDestination(job, params.cfg.cron?.failureDestination);
          if (failureDest) {
            const isBestEffort =
              job.delivery?.bestEffort === true ||
              (job.payload.kind === "agentTurn" && job.payload.bestEffortDeliver === true);

            if (!isBestEffort) {
              const failureMessage = `Cron job "${job.name}" failed: ${evt.error ?? "unknown error"}`;
              const failurePayload = {
                jobId: job.id,
                jobName: job.name,
                message: failureMessage,
                status: evt.status,
                error: evt.error,
                runAtMs: evt.runAtMs,
                durationMs: evt.durationMs,
                nextRunAtMs: evt.nextRunAtMs,
              };

              if (failureDest.mode === "webhook" && failureDest.to) {
                const webhookUrl = normalizeHttpWebhookUrl(failureDest.to);
                if (webhookUrl) {
                  void (async () => {
                    await postCronWebhook({
                      webhookUrl,
                      webhookToken,
                      payload: failurePayload,
                      logContext: { jobId: evt.jobId },
                      blockedLog: "cron: failure destination webhook blocked by SSRF guard",
                      failedLog: "cron: failure destination webhook failed",
                      logger: cronLogger,
                    });
                  })();
                } else {
                  cronLogger.warn(
                    {
                      jobId: evt.jobId,
                      webhookUrl: redactWebhookUrl(failureDest.to),
                    },
                    "cron: failure destination webhook URL is invalid, skipping",
                  );
                }
              } else if (failureDest.mode === "announce") {
                const { agentId, cfg: runtimeConfig } = resolveCronAgent(job.agentId);
                void sendFailureNotificationAnnounce(
                  params.deps,
                  runtimeConfig,
                  agentId,
                  job.id,
                  {
                    channel: failureDest.channel,
                    to: failureDest.to,
                    accountId: failureDest.accountId,
                  },
                  `[Cron Failure] ${failureMessage}`,
                );
              }
            }
          }
        }

        const logPath = resolveCronRunLogPath({
          storePath,
          jobId: evt.jobId,
        });
        void appendCronRunLog(
          logPath,
          {
            ts: Date.now(),
            jobId: evt.jobId,
            action: "finished",
            status: evt.status,
            error: evt.error,
            summary: evt.summary,
            delivered: evt.delivered,
            deliveryStatus: evt.deliveryStatus,
            deliveryError: evt.deliveryError,
            sessionId: evt.sessionId,
            sessionKey: evt.sessionKey,
            runAtMs: evt.runAtMs,
            durationMs: evt.durationMs,
            nextRunAtMs: evt.nextRunAtMs,
            model: evt.model,
            provider: evt.provider,
            usage: evt.usage,
          },
          runLogPrune,
        ).catch((err) => {
          cronLogger.warn({ err: String(err), logPath }, "cron: run log append failed");
        });
      }
    },
  });

  return { cron, storePath, cronEnabled };
}
