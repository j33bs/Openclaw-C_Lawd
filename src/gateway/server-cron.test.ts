import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CliDeps } from "../cli/deps.js";
import type { OpenClawConfig } from "../config/config.js";
import { SsrFBlockedError } from "../infra/net/ssrf.js";

const {
  enqueueSystemEventMock,
  requestHeartbeatNowMock,
  loadConfigMock,
  fetchWithSsrFGuardMock,
  runCronIsolatedAgentTurnMock,
  execFileMock,
  writeTruthfulnessAuditSnapshotMock,
  runFitnessCheckMock,
  runSunsetCheckMock,
} = vi.hoisted(() => ({
  enqueueSystemEventMock: vi.fn(),
  requestHeartbeatNowMock: vi.fn(),
  loadConfigMock: vi.fn(),
  fetchWithSsrFGuardMock: vi.fn(),
  execFileMock: vi.fn(
    (
      _command: string,
      _args: string[],
      _options: { cwd: string; timeout: number; maxBuffer?: number; encoding?: string },
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(
        null,
        JSON.stringify({
          stale_count: 2,
          blocked_count: 1,
          output_path: "/tmp/proposals.json",
        }),
        "",
      );
    },
  ),
  writeTruthfulnessAuditSnapshotMock: vi.fn(async () => ({
    checks: [],
    passRate: 1,
    failures: [],
  })),
  runFitnessCheckMock: vi.fn(async () => ({
    ok: true as const,
    report: {},
    redSignals: [],
    assessmentPath: "/tmp/fitness-assessment.json",
  })),
  runSunsetCheckMock: vi.fn(async () => ({
    ok: true as const,
    flaggedJobs: [],
  })),
  runCronIsolatedAgentTurnMock: vi.fn(async () => ({ status: "ok" as const, summary: "ok" })),
}));

function enqueueSystemEvent(...args: unknown[]) {
  return enqueueSystemEventMock(...args);
}

function requestHeartbeatNow(...args: unknown[]) {
  return requestHeartbeatNowMock(...args);
}

vi.mock("../infra/system-events.js", () => ({
  enqueueSystemEvent,
}));

vi.mock("../infra/heartbeat-wake.js", () => ({
  requestHeartbeatNow,
}));

vi.mock("../config/config.js", async () => {
  const actual = await vi.importActual<typeof import("../config/config.js")>("../config/config.js");
  return {
    ...actual,
    loadConfig: () => loadConfigMock(),
  };
});

vi.mock("../infra/net/fetch-guard.js", () => ({
  fetchWithSsrFGuard: fetchWithSsrFGuardMock,
}));

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

vi.mock("../flourishing/truthfulness-audit.js", () => ({
  writeTruthfulnessAuditSnapshot: writeTruthfulnessAuditSnapshotMock,
}));

vi.mock("../cron/jobs/fitness-check.js", () => ({
  runFitnessCheck: runFitnessCheckMock,
}));

vi.mock("../cron/jobs/sunset-check.js", () => ({
  runSunsetCheck: runSunsetCheckMock,
}));

vi.mock("../cron/isolated-agent.js", () => ({
  runCronIsolatedAgentTurn: runCronIsolatedAgentTurnMock,
}));

import { buildGatewayCronService, ensureFlourishingCronJobs } from "./server-cron.js";

const FLOURISHING_BUILTIN_MESSAGES = {
  truthfulnessAudit: "__builtin__:truthfulness-audit",
  fitnessSweep: "__builtin__:fitness-sweep",
  sunsetCheck: "__builtin__:sunset-check",
} as const;

function isFlourishingBuiltinMessage(message: string): boolean {
  return Object.values(FLOURISHING_BUILTIN_MESSAGES).includes(
    message as (typeof FLOURISHING_BUILTIN_MESSAGES)[keyof typeof FLOURISHING_BUILTIN_MESSAGES],
  );
}

function createCronConfig(name: string): OpenClawConfig {
  const tmpDir = path.join(os.tmpdir(), `${name}-${Date.now()}`);
  return {
    session: {
      mainKey: "main",
    },
    cron: {
      store: path.join(tmpDir, "cron.json"),
    },
  } as OpenClawConfig;
}

describe("buildGatewayCronService", () => {
  beforeEach(() => {
    enqueueSystemEventMock.mockClear();
    requestHeartbeatNowMock.mockClear();
    loadConfigMock.mockClear();
    fetchWithSsrFGuardMock.mockClear();
    execFileMock.mockClear();
    writeTruthfulnessAuditSnapshotMock.mockClear();
    runFitnessCheckMock.mockClear();
    runSunsetCheckMock.mockClear();
    runCronIsolatedAgentTurnMock.mockClear();
  });

  it("routes main-target jobs to the scoped session for enqueue + wake", async () => {
    const cfg = createCronConfig("server-cron");
    loadConfigMock.mockReturnValue(cfg);

    const state = buildGatewayCronService({
      cfg,
      deps: {} as CliDeps,
      broadcast: () => {},
    });
    try {
      const job = await state.cron.add({
        name: "canonicalize-session-key",
        enabled: true,
        schedule: { kind: "at", at: new Date(1).toISOString() },
        sessionTarget: "main",
        wakeMode: "next-heartbeat",
        sessionKey: "discord:channel:ops",
        payload: { kind: "systemEvent", text: "hello" },
      });

      await state.cron.run(job.id, "force");

      expect(enqueueSystemEventMock).toHaveBeenCalledWith(
        "hello",
        expect.objectContaining({
          sessionKey: "agent:main:discord:channel:ops",
        }),
      );
      expect(requestHeartbeatNowMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionKey: "agent:main:discord:channel:ops",
        }),
      );
    } finally {
      state.cron.stop();
    }
  });

  it("blocks private webhook URLs via SSRF-guarded fetch", async () => {
    const cfg = createCronConfig("server-cron-ssrf");
    loadConfigMock.mockReturnValue(cfg);
    fetchWithSsrFGuardMock.mockRejectedValue(
      new SsrFBlockedError("Blocked: resolves to private/internal/special-use IP address"),
    );

    const state = buildGatewayCronService({
      cfg,
      deps: {} as CliDeps,
      broadcast: () => {},
    });
    try {
      const job = await state.cron.add({
        name: "ssrf-webhook-blocked",
        enabled: true,
        schedule: { kind: "at", at: new Date(1).toISOString() },
        sessionTarget: "main",
        wakeMode: "next-heartbeat",
        payload: { kind: "systemEvent", text: "hello" },
        delivery: {
          mode: "webhook",
          to: "http://127.0.0.1:8080/cron-finished",
        },
      });

      await state.cron.run(job.id, "force");

      expect(fetchWithSsrFGuardMock).toHaveBeenCalledOnce();
      expect(fetchWithSsrFGuardMock).toHaveBeenCalledWith({
        url: "http://127.0.0.1:8080/cron-finished",
        init: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: expect.stringContaining('"action":"finished"'),
          signal: expect.any(AbortSignal),
        },
      });
    } finally {
      state.cron.stop();
    }
  });

  it("passes custom session targets through to isolated cron runs", async () => {
    const tmpDir = path.join(os.tmpdir(), `server-cron-custom-session-${Date.now()}`);
    const cfg = {
      session: {
        mainKey: "main",
      },
      cron: {
        store: path.join(tmpDir, "cron.json"),
      },
    } as OpenClawConfig;
    loadConfigMock.mockReturnValue(cfg);

    const state = buildGatewayCronService({
      cfg,
      deps: {} as CliDeps,
      broadcast: () => {},
    });
    try {
      const job = await state.cron.add({
        name: "custom-session",
        enabled: true,
        schedule: { kind: "at", at: new Date(1).toISOString() },
        sessionTarget: "session:project-alpha-monitor",
        wakeMode: "next-heartbeat",
        payload: { kind: "agentTurn", message: "hello" },
      });

      await state.cron.run(job.id, "force");

      expect(runCronIsolatedAgentTurnMock).toHaveBeenCalledWith(
        expect.objectContaining({
          job: expect.objectContaining({ id: job.id }),
          sessionKey: "project-alpha-monitor",
        }),
      );
    } finally {
      state.cron.stop();
    }
  });

  it("seeds built-in flourishing jobs and records lastEvidenceDate on success", async () => {
    const cfg = createCronConfig("server-cron-flourishing");
    loadConfigMock.mockReturnValue(cfg);
    const workspaceDir = path.dirname(cfg.cron!.store!);

    const state = buildGatewayCronService({
      cfg,
      deps: {} as CliDeps,
      broadcast: () => {},
      workspaceDir,
    });
    try {
      await ensureFlourishingCronJobs({
        cron: state.cron,
        workspaceDir,
        timezone: "UTC",
        nowMs: Date.UTC(2026, 2, 25, 12, 0, 0),
      });

      const seededJobs = await state.cron.list({ includeDisabled: true });
      const builtinJobs = seededJobs.filter(
        (job) =>
          job.payload.kind === "agentTurn" && isFlourishingBuiltinMessage(job.payload.message),
      );

      expect(builtinJobs).toHaveLength(3);
      expect(
        builtinJobs.map((job) => ({
          name: job.name,
          message: job.payload.kind === "agentTurn" ? job.payload.message : "",
          reviewDate: job.reviewDate,
        })),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Flourishing Truthfulness Audit",
            message: FLOURISHING_BUILTIN_MESSAGES.truthfulnessAudit,
            reviewDate: "2026-04-24",
          }),
          expect.objectContaining({
            name: "Flourishing Fitness Sweep",
            message: FLOURISHING_BUILTIN_MESSAGES.fitnessSweep,
            reviewDate: "2026-04-24",
          }),
          expect.objectContaining({
            name: "Flourishing Sunset Check",
            message: FLOURISHING_BUILTIN_MESSAGES.sunsetCheck,
            reviewDate: "2026-04-24",
          }),
        ]),
      );

      for (const job of builtinJobs) {
        await state.cron.run(job.id, "force");
        const updated = state.cron.getJob(job.id);
        expect(updated?.lastEvidenceDate).toBe("2026-03-25");
      }

      expect(writeTruthfulnessAuditSnapshotMock).toHaveBeenCalledOnce();
      expect(runFitnessCheckMock).toHaveBeenCalledOnce();
      expect(runSunsetCheckMock).toHaveBeenCalledOnce();
      expect(execFileMock).toHaveBeenCalledOnce();
      expect(runCronIsolatedAgentTurnMock).not.toHaveBeenCalled();
    } finally {
      state.cron.stop();
    }
  });
});
