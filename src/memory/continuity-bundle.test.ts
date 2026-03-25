import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTempWorkspace, writeWorkspaceFile } from "../test-helpers/workspace.js";
import { assembleContinuityBundle } from "./continuity-bundle.js";

function createMockMemoryManager(results: unknown[] = []) {
  return {
    searchKeyword: vi.fn().mockResolvedValue(results),
  };
}

describe("assembleContinuityBundle", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T08:00:00+10:00"));
    workspaceDir = await makeTempWorkspace("openclaw-continuity-bundle-");
    await fs.mkdir(path.join(workspaceDir, "memory"), { recursive: true });
    await fs.mkdir(path.join(workspaceDir, "nodes", "alpha"), { recursive: true });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it("returns a full bundle when today, yesterday, and pinned doctrine exist", async () => {
    await writeWorkspaceFile({
      dir: workspaceDir,
      name: "memory/2026-03-25.md",
      content: "# Today\n- focus on continuity\n",
    });
    await writeWorkspaceFile({
      dir: workspaceDir,
      name: "memory/2026-03-24.md",
      content: "# Yesterday\n- we landed the backlog\n",
    });
    await writeWorkspaceFile({
      dir: workspaceDir,
      name: "nodes/alpha/MEMORY.md",
      content: "# Pinned doctrine\n- keep it local-first\n",
    });
    await writeWorkspaceFile({
      dir: workspaceDir,
      name: "nodes/alpha/CONVERSATION_KERNEL.md",
      content: "# Kernel\n- be direct\n",
    });

    const memoryManager = createMockMemoryManager([
      {
        path: "memory/2026-03-25.md",
        snippet: "duplicate should be skipped",
        score: 0.9,
      },
      {
        path: "sessions/session-1.md",
        snippet: "relevant session fragment",
        score: 0.8,
      },
    ]);

    const bundle = await assembleContinuityBundle({
      workspaceDir,
      memoryManager,
      query: "continuity",
      maxTokens: 120,
    });

    expect(bundle.confidence).toBe("full");
    expect(bundle.entries.filter((entry) => entry.kind === "daily-note")).toHaveLength(2);
    expect(bundle.entries.filter((entry) => entry.kind === "pinned-doctrine")).toHaveLength(2);
    expect(bundle.entries.some((entry) => entry.source === "memory/2026-03-25.md")).toBe(true);
    expect(
      bundle.entries
        .filter((entry) => entry.kind === "session-snippet")
        .map((entry) => entry.source),
    ).toEqual(["sessions/session-1.md"]);
    expect(memoryManager.searchKeyword).toHaveBeenCalledTimes(1);
  });

  it("returns partial confidence when only today's note exists", async () => {
    await writeWorkspaceFile({
      dir: workspaceDir,
      name: "memory/2026-03-25.md",
      content: "# Today\n- just one note\n",
    });

    const bundle = await assembleContinuityBundle({ workspaceDir });

    expect(bundle.confidence).toBe("partial");
    expect(bundle.entries).toHaveLength(1);
    expect(bundle.entries[0]?.date).toBe("2026-03-25");
  });

  it("returns minimal confidence when local sources are absent", async () => {
    const memoryManager = createMockMemoryManager([
      {
        path: "sessions/session-1.md",
        snippet: "semantic-only support",
        score: 0.82,
      },
    ]);

    const bundle = await assembleContinuityBundle({
      workspaceDir,
      memoryManager,
      query: "support",
    });

    expect(bundle.confidence).toBe("minimal");
    expect(bundle.entries).toHaveLength(1);
    expect(bundle.entries[0]?.kind).toBe("session-snippet");
  });

  it("skips semantic search when no query is provided", async () => {
    const memoryManager = createMockMemoryManager();

    await assembleContinuityBundle({
      workspaceDir,
      memoryManager,
    });

    expect(memoryManager.searchKeyword).not.toHaveBeenCalled();
  });

  it("trims oversized entries to the token budget", async () => {
    const longContent = Array.from({ length: 80 }, (_, index) => `word${index}`).join(" ");
    await writeWorkspaceFile({
      dir: workspaceDir,
      name: "memory/2026-03-25.md",
      content: longContent,
    });

    const bundle = await assembleContinuityBundle({
      workspaceDir,
      maxTokens: 20,
    });

    expect(bundle.entries[0]?.content.length).toBeLessThan(longContent.length);
    expect(bundle.entries[0]?.content).toContain("...");
  });

  it("does not throw when file reads fail", async () => {
    const readFileSpy = vi.spyOn(fs, "readFile").mockRejectedValue(new Error("read failure"));

    await expect(assembleContinuityBundle({ workspaceDir })).resolves.toMatchObject({
      confidence: "minimal",
      entries: [],
    });

    readFileSpy.mockRestore();
  });
});
