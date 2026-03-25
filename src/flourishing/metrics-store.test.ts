import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlourishingMetricsStore } from "./metrics-store.js";

describe("flourishing metrics store", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T02:00:00.000Z"));
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-flourishing-metrics-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it("records and queries append-only metric rows", async () => {
    const store = new FlourishingMetricsStore(workspaceDir);

    await store.record(
      {
        metricKey: "session-1",
        timestamp: "2026-03-25T01:00:00.000Z",
        source: "session_observation",
        scores: {
          coherence: 4,
          vitality: 6,
          agency: 5,
          truth_contact: 3,
          connection: 7,
        },
        evidence: ["session felt slightly fragmented"],
        linkedProject: "flourishing-mission",
        linkedSessionBoundary: "session_close",
      },
      "auto",
    );

    vi.setSystemTime(new Date("2026-03-25T04:00:00.000Z"));
    await store.record(
      {
        metricKey: "session-2",
        timestamp: "2026-03-25T03:00:00.000Z",
        source: "session_observation",
        scores: {
          coherence: 8,
          vitality: 7,
          agency: 8,
          truth_contact: 6,
          connection: 6,
        },
        evidence: ["session felt stable"],
      },
      "manual",
    );

    const recentOnly = await store.query({
      since: "2026-03-25T03:30:00.000Z",
      limit: 1,
    });
    expect(recentOnly).toHaveLength(1);
    expect(recentOnly[0]?.metricKey).toBe("session-2");

    const coherenceRows = await store.query({ axis: "coherence" });
    expect(coherenceRows).toHaveLength(2);
    expect(coherenceRows[0]?.recordedAt).toBe("2026-03-25T04:00:00.000Z");

    const rawStore = await fs.readFile(
      path.join(workspaceDir, "workspace", "state", "flourishing-metrics.jsonl"),
      "utf8",
    );
    expect(rawStore).toContain('"source":"auto"');
    expect(rawStore).toContain('"source":"manual"');
  });

  it("summarizes averages, weakest axis, and trend direction", async () => {
    const store = new FlourishingMetricsStore(workspaceDir);

    vi.setSystemTime(new Date("2026-03-25T01:00:00.000Z"));
    await store.record(
      {
        metricKey: "session-1",
        timestamp: "2026-03-25T01:00:00.000Z",
        source: "session_observation",
        scores: {
          coherence: 2,
          vitality: 2,
          agency: 2,
          truth_contact: 2,
          connection: 2,
        },
        evidence: ["first half lower"],
      },
      "auto",
    );

    vi.setSystemTime(new Date("2026-03-25T05:00:00.000Z"));
    await store.record(
      {
        metricKey: "session-2",
        timestamp: "2026-03-25T05:00:00.000Z",
        source: "session_observation",
        scores: {
          coherence: 8,
          vitality: 8,
          agency: 8,
          truth_contact: 8,
          connection: 8,
        },
        evidence: ["second half higher"],
      },
      "cron",
    );

    const summary = await store.summary({ since: "2026-03-25T00:00:00.000Z" });

    expect(summary.recordCount).toBe(2);
    expect(summary.weakestAxis).toBe("coherence");
    expect(summary.trend).toBe("improving");
    expect(summary.averageByAxis.coherence).toBe(5);
    expect(summary.averageByAxis.connection).toBe(5);
  });
});
