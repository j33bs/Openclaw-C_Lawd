import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTempWorkspace } from "../../test-helpers/workspace.js";
import { runFitnessCheck, type FitnessCheckResult } from "./fitness-check.js";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

type MockStream = EventEmitter & {
  on: EventEmitter["on"];
};

type MockChild = EventEmitter & {
  stdout: MockStream;
  stderr: MockStream;
  kill: ReturnType<typeof vi.fn>;
};

function createMockChild(): MockChild {
  const stdout = new EventEmitter() as MockStream;
  stdout.on = stdout.on.bind(stdout);
  const stderr = new EventEmitter() as MockStream;
  stderr.on = stderr.on.bind(stderr);
  const child = new EventEmitter() as MockChild;
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = vi.fn();
  return child;
}

function isFailedFitnessCheck(
  result: FitnessCheckResult,
): result is Extract<FitnessCheckResult, { ok: false }> {
  return !result.ok;
}

describe("runFitnessCheck", () => {
  const spawnMock = vi.mocked(spawn);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs fitness.py, writes the raw report, and appends alerts for red signals", async () => {
    const workspaceDir = await makeTempWorkspace("fitness-check-");
    await fs.mkdir(path.join(workspaceDir, "memory"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceDir, "memory", "2026-03-25.md"),
      "# Daily note\n",
      "utf8",
    );

    const child = createMockChild();
    spawnMock.mockReturnValue(child as unknown as ChildProcess);

    const report = {
      assessed_at: "2026-03-25T00:00:00.000Z",
      memory_coverage: { days_since_last: 4 },
      memory_freshness: { stale_categories: ["daily notes"] },
      knowledge_base: { status: "stale", warnings: ["kb stale"] },
      evolution_recency: { days_since_last_entry: 40 },
    };

    const promise = runFitnessCheck({
      workspaceDir,
      timezone: "UTC",
      nowMs: Date.parse("2026-03-25T12:00:00.000Z"),
      timeoutMs: 10_000,
    });

    child.stdout.emit("data", Buffer.from(`${JSON.stringify(report)}\n`));
    child.emit("close", 0, null);

    const result = await promise;

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("unexpected failure");
    }
    expect(spawnMock).toHaveBeenCalledWith(
      "python3",
      [path.join(workspaceDir, "workspace", "evolution", "fitness.py"), "--json"],
      expect.objectContaining({
        cwd: workspaceDir,
        windowsHide: true,
      }),
    );

    const statePath = path.join(workspaceDir, "workspace", "state", "fitness-assessment.json");
    expect(JSON.parse(await fs.readFile(statePath, "utf8"))).toEqual(report);

    const dailyNotePath = path.join(workspaceDir, "memory", "2026-03-25.md");
    const dailyNote = await fs.readFile(dailyNotePath, "utf8");
    expect(dailyNote).toContain("## Fitness Alert");
    expect(dailyNote).toContain("- memory: no log in 4 days");
    expect(dailyNote).toContain("- memory freshness: stale/missing -> daily notes");
    expect(dailyNote).toContain("- knowledge base: kb stale");
    expect(dailyNote).toContain("- evolution: 40 days since last growth entry");
  });

  it("does not append an alert when the report is healthy", async () => {
    const workspaceDir = await makeTempWorkspace("fitness-check-");
    await fs.mkdir(path.join(workspaceDir, "memory"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceDir, "memory", "2026-03-25.md"),
      "# Daily note\n",
      "utf8",
    );

    const child = createMockChild();
    spawnMock.mockReturnValue(child as unknown as ChildProcess);

    const report = {
      assessed_at: "2026-03-25T00:00:00.000Z",
      memory_coverage: { days_since_last: 0 },
      memory_freshness: { stale_categories: [] },
      knowledge_base: { status: "healthy", warnings: [] },
      evolution_recency: { days_since_last_entry: 2 },
    };

    const promise = runFitnessCheck({
      workspaceDir,
      timezone: "UTC",
      nowMs: Date.parse("2026-03-25T12:00:00.000Z"),
    });

    child.stdout.emit("data", Buffer.from(JSON.stringify(report)));
    child.emit("close", 0, null);

    const result = await promise;

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("unexpected failure");
    }
    expect(result.redSignals).toEqual([]);

    const dailyNotePath = path.join(workspaceDir, "memory", "2026-03-25.md");
    const dailyNote = await fs.readFile(dailyNotePath, "utf8");
    expect(dailyNote).toBe("# Daily note\n");
  });

  it("returns failure and logs a warning on timeout without throwing", async () => {
    vi.useFakeTimers();

    const workspaceDir = await makeTempWorkspace("fitness-check-");
    const child = createMockChild();
    spawnMock.mockReturnValue(child as unknown as ChildProcess);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const promise = runFitnessCheck({
      workspaceDir,
      timezone: "UTC",
      timeoutMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    const result = await promise;

    expect(result.ok).toBe(false);
    if (isFailedFitnessCheck(result)) {
      expect(result.error).toContain("timed out");
    } else {
      throw new Error("unexpected success");
    }
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });
});
