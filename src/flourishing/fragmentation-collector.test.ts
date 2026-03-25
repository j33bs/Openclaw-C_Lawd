import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectFragmentationSignals } from "./fragmentation-collector.js";

describe("fragmentation collector", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T02:00:00.000Z"));
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-fragmentation-collector-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it("collects healthy signals from the local workspace", async () => {
    const memoryDir = path.join(workspaceDir, "memory");
    const nodesDir = path.join(workspaceDir, "nodes", "c_lawd");
    const stateDir = path.join(workspaceDir, "workspace", "state", "sessions");
    await fs.mkdir(memoryDir, { recursive: true });
    await fs.mkdir(nodesDir, { recursive: true });
    await fs.mkdir(stateDir, { recursive: true });

    const dailyNote = path.join(memoryDir, "2026-03-25.md");
    await fs.writeFile(dailyNote, "# 2026-03-25\n", "utf8");
    await fs.utimes(
      dailyNote,
      new Date("2026-03-25T01:00:00.000Z"),
      new Date("2026-03-25T01:00:00.000Z"),
    );
    await fs.writeFile(path.join(nodesDir, "MEMORY.md"), "# doctrine\n", "utf8");
    await fs.writeFile(path.join(nodesDir, "CONVERSATION_KERNEL.md"), "# kernel\n", "utf8");
    await fs.writeFile(path.join(stateDir, "session-state.json"), "{}\n", "utf8");

    const signal = await collectFragmentationSignals(workspaceDir);

    expect(signal.recallSuccessRate).toBeCloseTo(0.8);
    expect(signal.duplicateClarificationRate).toBeCloseTo(0.1);
    expect(signal.continuityBundleAvailable).toBe(true);
    expect(signal.pinnedDoctrineAvailable).toBe(true);
    expect(signal.sessionMemoryAvailable).toBe(true);
    expect(signal.dailyNoteFreshnessHours).toBeGreaterThanOrEqual(0);
    expect(signal.dailyNoteFreshnessHours).toBeLessThan(2);
  });

  it("falls back to default signals when nothing is present", async () => {
    const signal = await collectFragmentationSignals(workspaceDir);

    expect(signal).toMatchObject({
      recallSuccessRate: 0.8,
      duplicateClarificationRate: 0.1,
      dailyNoteFreshnessHours: 999,
      continuityBundleAvailable: false,
      pinnedDoctrineAvailable: false,
      sessionMemoryAvailable: false,
      unresolvedDriftSignals: 0,
      crossSurfaceMismatchCount: 0,
      toolFailureRate: 0,
    });
  });
});
