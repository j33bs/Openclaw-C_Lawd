import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordTactiInteraction } from "./tacti-recorder.js";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => mocks.spawn(...args),
}));

function createMockChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
    unref: ReturnType<typeof vi.fn>;
  };
  child.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  child.unref = vi.fn();
  return child;
}

async function makeWorkspaceDir(withCore = true): Promise<string> {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "tacti-recorder-"));
  const tactiDir = path.join(workspaceDir, "workspace", "memory");
  await fs.mkdir(tactiDir, { recursive: true });
  if (withCore) {
    await fs.writeFile(path.join(tactiDir, "tacti_core.py"), "# core\n", "utf8");
  }
  return workspaceDir;
}

describe("recordTactiInteraction", () => {
  beforeEach(() => {
    mocks.spawn.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends a tacti payload to stdin and returns immediately", async () => {
    const workspaceDir = await makeWorkspaceDir(true);
    const child = createMockChild();
    mocks.spawn.mockReturnValue(child);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await recordTactiInteraction({
      workspaceDir,
      sessionId: "session-1",
      role: "assistant",
      tokenCount: 123,
      toolCalls: 2,
      toolFailures: 1,
    });

    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    const [command, argv, options] = mocks.spawn.mock.calls[0] as [
      string,
      string[],
      { cwd: string; stdio: string[] },
    ];
    expect(command).toBe("python3");
    expect(argv).toEqual([path.join("workspace", "memory", "tacti_cli.py")]);
    expect(options.cwd).toBe(workspaceDir);
    expect(options.stdio).toEqual(["pipe", "ignore", "pipe"]);

    expect(child.stdin.write).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(child.stdin.write.mock.calls[0]?.[0]));
    expect(payload).toMatchObject({
      command: "record_interaction",
      session_id: "session-1",
      role: "assistant",
      type: "assistant_message",
      sentiment: 0.5,
      resolution: "complete",
      token_count: 123,
      tool_calls: 2,
      tool_failures: 1,
    });
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("returns silently when tacti_core.py is missing", async () => {
    const workspaceDir = await makeWorkspaceDir(false);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await recordTactiInteraction({
      workspaceDir,
      sessionId: "session-2",
      role: "user",
      tokenCount: 5,
    });

    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("logs a timeout warning without throwing", async () => {
    vi.useFakeTimers();
    const workspaceDir = await makeWorkspaceDir(true);
    const child = createMockChild();
    mocks.spawn.mockReturnValue(child);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await recordTactiInteraction({
      workspaceDir,
      sessionId: "session-3",
      role: "assistant",
      tokenCount: 1,
    });

    await vi.advanceTimersByTimeAsync(5000);

    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    expect(
      stderrSpy.mock.calls.some((call) => String(call[0]).includes("timed out after 5000ms")),
    ).toBe(true);
  });

  it("logs subprocess errors without throwing", async () => {
    const workspaceDir = await makeWorkspaceDir(true);
    const child = createMockChild();
    mocks.spawn.mockReturnValue(child);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await recordTactiInteraction({
      workspaceDir,
      sessionId: "session-4",
      role: "assistant",
      tokenCount: 1,
    });

    child.emit("error", new Error("boom"));

    expect(stderrSpy.mock.calls.some((call) => String(call[0]).includes("tacti CLI error"))).toBe(
      true,
    );
  });
});
