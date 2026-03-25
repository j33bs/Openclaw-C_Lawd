import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInternalHookEvent,
  clearInternalHooks,
  triggerInternalHook,
} from "./internal-hooks.js";

const mocks = vi.hoisted(() => ({
  recordTactiInteraction: vi.fn(async () => {}),
  deriveSessionFlourishingMetrics: vi.fn(() => ({ metricKey: "tacti", scores: {}, evidence: [] })),
  recordMetric: vi.fn(async (_metric?: unknown, _source?: unknown) => {}),
  readTactiSnapshot: vi.fn(async () => null),
  assembleSystemState: vi.fn(async () => ({ fragmentationSeverity: null })),
  assembleContinuityBundle: vi.fn(async () => ({ confidence: "minimal" })),
  FlourishingMetricsStore: vi.fn().mockImplementation(() => ({
    record: async (metric: unknown, source: unknown) => await mocks.recordMetric(metric, source),
  })),
}));

vi.mock("../flourishing/tacti-recorder.js", () => ({
  recordTactiInteraction: mocks.recordTactiInteraction,
}));
vi.mock("../flourishing/auto-collect.js", () => ({
  deriveSessionFlourishingMetrics: mocks.deriveSessionFlourishingMetrics,
}));
vi.mock("../flourishing/metrics-store.js", () => ({
  FlourishingMetricsStore: mocks.FlourishingMetricsStore,
}));
vi.mock("../flourishing/tacti-state.js", () => ({
  readTactiSnapshot: mocks.readTactiSnapshot,
}));
vi.mock("../flourishing/system-state.js", () => ({
  assembleSystemState: mocks.assembleSystemState,
}));
vi.mock("../memory/continuity-bundle.js", () => ({
  assembleContinuityBundle: mocks.assembleContinuityBundle,
}));

let registerTactiHooks: typeof import("./tacti-hooks.js").registerTactiHooks;
const tempDirs: string[] = [];

async function makeWorkspaceDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tacti-hooks-"));
  tempDirs.push(dir);
  return dir;
}

async function readBriefingAckState(workspaceDir: string): Promise<{
  history: Array<Record<string, unknown>>;
}> {
  const raw = await fs.readFile(
    path.join(workspaceDir, "workspace", "state", "briefing-ack.json"),
    "utf8",
  );
  return JSON.parse(raw) as { history: Array<Record<string, unknown>> };
}

describe("registerTactiHooks", () => {
  beforeEach(async () => {
    vi.resetModules();
    clearInternalHooks();
    mocks.recordTactiInteraction.mockClear();
    mocks.deriveSessionFlourishingMetrics.mockClear();
    mocks.recordMetric.mockClear();
    mocks.readTactiSnapshot.mockClear();
    mocks.assembleSystemState.mockClear();
    mocks.assembleContinuityBundle.mockClear();
    mocks.FlourishingMetricsStore.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T12:00:00.000Z"));
    ({ registerTactiHooks } = await import("./tacti-hooks.js"));
  });

  afterEach(async () => {
    clearInternalHooks();
    vi.useRealTimers();
    await Promise.all(
      tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it("records received and sent message lifecycle events", async () => {
    const workspaceDir = await makeWorkspaceDir();
    registerTactiHooks(workspaceDir);

    await triggerInternalHook(
      createInternalHookEvent("message", "received", "session-1", {
        from: "user-1",
        content: "hello world",
        channelId: "telegram",
      }),
    );
    await triggerInternalHook(
      createInternalHookEvent("message", "sent", "session-1", {
        to: "user-1",
        content: "reply text",
        success: true,
        channelId: "telegram",
      }),
    );

    expect(mocks.recordTactiInteraction).toHaveBeenCalledTimes(2);
    expect(mocks.recordTactiInteraction).toHaveBeenNthCalledWith(1, {
      workspaceDir,
      sessionId: "session-1",
      role: "user",
      tokenCount: 2,
    });
    expect(mocks.recordTactiInteraction).toHaveBeenNthCalledWith(2, {
      workspaceDir,
      sessionId: "session-1",
      role: "assistant",
      tokenCount: 2,
    });
  });

  it("writes and acknowledges briefing deliveries", async () => {
    const workspaceDir = await makeWorkspaceDir();
    registerTactiHooks(workspaceDir);

    const briefingContent = [
      "## What Matters Today",
      "- stay grounded",
      "## Recommended Move",
      "- keep the slice narrow",
      "## System Health",
      "- all green",
    ].join("\n");

    await triggerInternalHook(
      createInternalHookEvent("message", "sent", "session-briefing", {
        to: "user-1",
        content: briefingContent,
        success: true,
        channelId: "telegram",
        conversationId: "chat-1",
      }),
    );

    const deliveredState = await readBriefingAckState(workspaceDir);
    expect(deliveredState.history).toHaveLength(1);
    expect(deliveredState.history[0]).toMatchObject({
      date: "2026-03-25",
      delivered: true,
      acknowledged: false,
      deliveredAt: "2026-03-25T12:00:00.000Z",
      channelId: "telegram",
      conversationId: "chat-1",
    });

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    await triggerInternalHook(
      createInternalHookEvent("message", "received", "session-briefing", {
        from: "user-1",
        content: "acknowledged",
        channelId: "telegram",
        conversationId: "chat-1",
      }),
    );

    const ackedState = await readBriefingAckState(workspaceDir);
    expect(ackedState.history[0]).toMatchObject({
      acknowledged: true,
      acknowledgedAt: "2026-03-25T12:05:00.000Z",
    });
  });
});
