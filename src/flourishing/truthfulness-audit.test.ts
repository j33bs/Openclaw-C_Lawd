import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assembleSystemState } from "./system-state.js";
import { runTruthfulnessAudit } from "./truthfulness-audit.js";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

const originalFetch = globalThis.fetch;

async function makeWorkspace(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(filePath: string, value: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, value, "utf8");
}

async function seedTruthfulnessPassWorkspace(workspaceDir: string): Promise<void> {
  const today = "2026-03-25";
  await writeText(path.join(workspaceDir, "memory", `${today}.md`), "# daily note\n");
  await writeText(path.join(workspaceDir, "nodes", "c_lawd", "MEMORY.md"), "# doctrine\n");
  await writeJson(path.join(workspaceDir, "workspace", "memory", "relationship.json"), {
    created: "2026-03-25T02:00:00.000Z",
    interactions: [
      {
        timestamp: "2026-03-25T04:00:00.000Z",
        type: "research_session",
        sentiment: 0.8,
        resolution: "success",
      },
    ],
    trust_score: 0.9,
    attunement_score: 0.8,
    checkins: [],
    insights: [],
  });
  await writeJson(path.join(workspaceDir, "workspace", "state", "fragmentation-assessment.json"), {
    collectedAt: "2026-03-25T03:00:00.000Z",
    severity: "low",
  });
}

beforeEach(() => {
  execFileMock.mockReset();
  globalThis.fetch = originalFetch;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-25T04:15:00.000Z"));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe("runTruthfulnessAudit", () => {
  it("returns all passing checks when the workspace is healthy", async () => {
    const workspaceDir = await makeWorkspace("truthfulness-audit-pass-");
    await seedTruthfulnessPassWorkspace(workspaceDir);

    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      callback(null, JSON.stringify({ status: "ready" }), "");
    });
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;

    const result = await runTruthfulnessAudit(workspaceDir);

    expect(result.checks).toHaveLength(6);
    expect(result.failures).toEqual([]);
    expect(result.passRate).toBe(1);
    expect(result.checks.every((check) => check.checkedAt)).toBe(true);
    expect(execFileMock).toHaveBeenCalledWith(
      "python3",
      [path.join(workspaceDir, "workspace", "knowledge_base", "kb.py"), "status", "--json"],
      expect.objectContaining({ cwd: workspaceDir, timeout: 10_000 }),
      expect.any(Function),
    );
  });

  it("reports failures when the workspace is missing key receipts", async () => {
    const workspaceDir = await makeWorkspace("truthfulness-audit-fail-");

    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      callback(null, JSON.stringify({ status: "starting" }), "");
    });
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 503 })) as typeof fetch;

    const result = await runTruthfulnessAudit(workspaceDir);

    expect(result.passRate).toBe(0);
    expect(result.failures).toHaveLength(6);
    expect(result.failures.join("\n")).toContain("Daily notes are current");
    expect(result.failures.join("\n")).toContain("Knowledge base is working");
    expect(result.failures.join("\n")).toContain("Embedding service is running");
    expect(result.failures.join("\n")).toContain("TACTI trackers are current");
    expect(result.failures.join("\n")).toContain("Node doctrine is available");
    expect(result.failures.join("\n")).toContain("Fragmentation monitoring is active");
  });

  it("treats Ollama timeout as a failed check", async () => {
    const workspaceDir = await makeWorkspace("truthfulness-audit-timeout-");
    await seedTruthfulnessPassWorkspace(workspaceDir);

    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      callback(null, JSON.stringify({ status: "ready" }), "");
    });
    globalThis.fetch = vi.fn(
      ((_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const err = new DOMException("The operation was aborted.", "AbortError");
          const signal = init?.signal;
          if (signal?.aborted) {
            reject(err);
            return;
          }
          signal?.addEventListener("abort", () => reject(err), { once: true });
        })) as typeof fetch,
    );

    const auditPromise = runTruthfulnessAudit(workspaceDir);
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await auditPromise;

    expect(result.passRate).toBeCloseTo(5 / 6, 5);
    expect(result.failures.join("\n")).toContain("Embedding service is running");
  });

  it("handles corrupt state files without throwing", async () => {
    const workspaceDir = await makeWorkspace("truthfulness-audit-corrupt-");
    await writeText(path.join(workspaceDir, "memory", "2026-03-25.md"), "# daily note\n");
    await writeText(path.join(workspaceDir, "nodes", "c_lawd", "MEMORY.md"), "# doctrine\n");
    await writeText(path.join(workspaceDir, "workspace", "memory", "relationship.json"), "{");
    await writeText(
      path.join(workspaceDir, "workspace", "state", "fragmentation-assessment.json"),
      "{",
    );

    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      callback(null, JSON.stringify({ status: "ready" }), "");
    });
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;

    const auditResult = await runTruthfulnessAudit(workspaceDir);
    const state = await assembleSystemState(workspaceDir);

    expect(auditResult.failures.join("\n")).toContain("TACTI trackers are current");
    expect(auditResult.failures.join("\n")).toContain("Fragmentation monitoring is active");
    expect(state.tactiSnapshot).toBeNull();
    expect(state.fragmentationSeverity).toBeNull();
    expect(state.staleSources).toEqual(
      expect.arrayContaining([
        "workspace/memory/arousal_state.json",
        "workspace/memory/relationship.json",
        "workspace/state/fragmentation-assessment.json",
      ]),
    );
  });
});

describe("assembleSystemState", () => {
  it("assembles a unified state from the live workspace schemas", async () => {
    const workspaceDir = await makeWorkspace("system-state-live-");
    await writeJson(path.join(workspaceDir, "workspace", "memory", "relationship.json"), {
      created: "2026-03-25T01:00:00.000Z",
      interactions: [
        {
          timestamp: "2026-03-25T02:00:00.000Z",
          type: "research_session",
          sentiment: 0.8,
          resolution: "success",
        },
        {
          timestamp: "2026-03-25T03:00:00.000Z",
          type: "daily_briefing",
          sentiment: 0.9,
          resolution: "success",
        },
      ],
      trust_score: 0.95,
      attunement_score: 0.88,
      checkins: [],
      insights: [],
    });
    await writeJson(path.join(workspaceDir, "workspace", "memory", "arousal_state.json"), {
      current_state: "active",
      transitions: [{ from: "idle", to: "active", timestamp: "2026-03-25T01:30:00.000Z" }],
      metrics: {
        avg_tokens_per_message: 4100,
        messages_since_reset: 3,
        tool_failures: 0,
        total_messages: 3,
      },
      last_update: "2026-03-25T03:30:00.000Z",
    });
    await writeJson(
      path.join(workspaceDir, "workspace", "state", "fragmentation-assessment.json"),
      {
        collectedAt: "2026-03-25T04:00:00.000Z",
        severity: "elevated",
      },
    );
    await writeJson(path.join(workspaceDir, "workspace", "state", "truthfulness-audit.json"), {
      passRate: 0.8333333333333334,
    });
    await writeJson(path.join(workspaceDir, "workspace", "state", "fitness-assessment.json"), {
      collectedAt: "2026-03-25T04:10:00.000Z",
      signals: [{ name: "memory-freshness", level: "green" }],
    });
    await writeText(
      path.join(workspaceDir, "workspace", "state", "flourishing-metrics.jsonl"),
      [
        JSON.stringify({
          id: "r1",
          recordedAt: "2026-03-25T01:00:00.000Z",
          source: "manual",
          metricKey: "morning",
          scores: {
            coherence: 6,
            vitality: 3,
            agency: 5,
            truth_contact: 6,
            connection: 7,
          },
          evidence: "morning",
        }),
        JSON.stringify({
          id: "r2",
          recordedAt: "2026-03-25T02:00:00.000Z",
          source: "manual",
          metricKey: "midday",
          scores: {
            coherence: 7,
            vitality: 4,
            agency: 6,
            truth_contact: 7,
            connection: 8,
          },
          evidence: "midday",
        }),
        JSON.stringify({
          id: "r3",
          recordedAt: "2026-03-25T03:00:00.000Z",
          source: "manual",
          metricKey: "afternoon",
          scores: {
            coherence: 8,
            vitality: 6,
            agency: 7,
            truth_contact: 8,
            connection: 8,
          },
          evidence: "afternoon",
        }),
        JSON.stringify({
          id: "r4",
          recordedAt: "2026-03-25T04:00:00.000Z",
          source: "manual",
          metricKey: "evening",
          scores: {
            coherence: 9,
            vitality: 7,
            agency: 8,
            truth_contact: 9,
            connection: 9,
          },
          evidence: "evening",
        }),
        "",
      ].join("\n"),
    );

    const state = await assembleSystemState(workspaceDir);

    expect(state.tactiSnapshot).toMatchObject({
      arousal: expect.any(Number),
      trustScore: 0.95,
      attunementIndex: 0.88,
      interactionCount: 2,
      stale: false,
    });
    expect(state.fragmentationSeverity).toBe("elevated");
    expect(state.truthfulnessPassRate).toBeCloseTo(0.8333333333333334, 10);
    expect(state.flourishingWeakestAxis).toBe("vitality");
    expect(state.flourishingTrend).toBe("improving");
    expect(state.staleSources).toEqual([]);
    expect(["full", "partial"]).toContain(state.continuityConfidence);
    expect(new Date(state.assembledAt).toISOString()).toBe(state.assembledAt);
  });
});
