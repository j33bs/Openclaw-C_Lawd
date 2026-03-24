import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import type { MemoryProviderStatus } from "../../memory/types.js";

type MemoryReadParams = { relPath: string; from?: number; lines?: number };
type MemoryReadResult = { text: string; path: string };
type StatusOverride = Partial<MemoryProviderStatus>;

const mockState = vi.hoisted(() => {
  let searchImpl: () => Promise<unknown[]> = async () => [];
  let readFileImpl: (params: MemoryReadParams) => Promise<MemoryReadResult> = async (params) => ({
    text: "",
    path: params.relPath,
  });
  let statusOverride: StatusOverride | undefined;
  return {
    manager: {
      search: vi.fn(async () => await searchImpl()),
      readFile: vi.fn(async (params: MemoryReadParams) => await readFileImpl(params)),
      status: () => ({
        backend: "builtin",
        files: 1,
        chunks: 1,
        dirty: false,
        workspaceDir: "/workspace",
        dbPath: "/workspace/.memory/index.sqlite",
        provider: "builtin",
        model: "builtin",
        requestedProvider: "builtin",
        sources: ["memory" as const],
        sourceCounts: [{ source: "memory" as const, files: 1, chunks: 1 }],
        ...statusOverride,
      }),
      sync: vi.fn(),
      probeVectorAvailability: vi.fn(async () => true),
      close: vi.fn(),
    },
    setSearchImpl(next: () => Promise<unknown[]>) {
      searchImpl = next;
    },
    setReadFileImpl(next: (params: MemoryReadParams) => Promise<MemoryReadResult>) {
      readFileImpl = next;
    },
    setStatusOverride(next?: StatusOverride) {
      statusOverride = next;
    },
    reset() {
      searchImpl = async () => [];
      readFileImpl = async (params: MemoryReadParams) => ({ text: "", path: params.relPath });
      statusOverride = undefined;
      vi.clearAllMocks();
    },
  };
});

const sessionState = vi.hoisted(() => {
  let files: string[] = [];
  let entries = new Map<
    string,
    {
      path: string;
      absPath: string;
      mtimeMs: number;
      size: number;
      hash: string;
      content: string;
      lineMap: number[];
    }
  >();
  return {
    listSessionFilesForAgent: vi.fn(async () => files),
    buildSessionEntry: vi.fn(async (absPath: string) => entries.get(absPath) ?? null),
    sessionPathForFile(absPath: string) {
      return `sessions/${path.basename(absPath)}`;
    },
    setEntries(
      next: Array<{
        absPath: string;
        relPath: string;
        content: string;
        lineMap?: number[];
        mtimeMs?: number;
      }>,
    ) {
      files = next.map((entry) => entry.absPath);
      entries = new Map(
        next.map((entry) => [
          entry.absPath,
          {
            path: entry.relPath,
            absPath: entry.absPath,
            mtimeMs: entry.mtimeMs ?? Date.now(),
            size: entry.content.length,
            hash: `hash:${entry.absPath}`,
            content: entry.content,
            lineMap: entry.lineMap ?? entry.content.split("\n").map((_line, index) => index + 1),
          },
        ]),
      );
    },
    reset() {
      files = [];
      entries = new Map();
      this.listSessionFilesForAgent.mockClear();
      this.buildSessionEntry.mockClear();
    },
  };
});

vi.mock("../../memory/index.js", () => ({
  getMemorySearchManager: async () => ({ manager: mockState.manager }),
}));

vi.mock("../../memory/session-files.js", () => ({
  listSessionFilesForAgent: sessionState.listSessionFilesForAgent,
  buildSessionEntry: sessionState.buildSessionEntry,
  sessionPathForFile: (absPath: string) => sessionState.sessionPathForFile(absPath),
}));

function asOpenClawConfig(config: Partial<OpenClawConfig>): OpenClawConfig {
  return config as OpenClawConfig;
}

async function createMemorySearchToolOrThrow(config: OpenClawConfig) {
  const { createMemorySearchTool } = await import("./memory-tool.js");
  const tool = createMemorySearchTool({ config });
  if (!tool) {
    throw new Error("tool missing");
  }
  return tool;
}

async function createMemoryGetToolOrThrow(config: OpenClawConfig) {
  const { createMemoryGetTool } = await import("./memory-tool.js");
  const tool = createMemoryGetTool({ config });
  if (!tool) {
    throw new Error("tool missing");
  }
  return tool;
}

describe("memory_search local file fallback", () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    vi.resetModules();
    mockState.reset();
    sessionState.reset();
  });

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dir) => {
        await fs.rm(dir, { recursive: true, force: true });
      }),
    );
  });

  async function createWorkspace(): Promise<string> {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-memory-tool-"));
    tempDirs.push(workspaceDir);
    await fs.mkdir(path.join(workspaceDir, "memory"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceDir, "memory", "2026-03-24.md"),
      "Telegram worklog capture is now durable and recallable.\n",
      "utf-8",
    );
    return workspaceDir;
  }

  function createConfig(
    workspaceDir: string,
    memorySearch?: {
      sources?: Array<"memory" | "sessions">;
      experimental?: { sessionMemory?: boolean };
    },
  ): OpenClawConfig {
    return asOpenClawConfig({
      agents: {
        defaults: memorySearch ? { memorySearch } : undefined,
        list: [{ id: "main", default: true, workspace: workspaceDir }],
      },
    });
  }

  it("returns file fallback hits when semantic search fails", async () => {
    const workspaceDir = await createWorkspace();
    mockState.setSearchImpl(async () => {
      throw new Error("embedding provider timeout");
    });

    const tool = await createMemorySearchToolOrThrow(createConfig(workspaceDir));
    const result = await tool.execute("fallback-error", { query: "telegram worklog durable" });
    const details = result.details as {
      results: Array<{ path: string; snippet: string }>;
      mode?: string;
      warning?: string;
    };

    expect(details.mode).toBe("filesystem-fallback");
    expect(details.warning).toMatch(/^Semantic memory search unavailable:/);
    expect(details.results[0]?.path).toBe("memory/2026-03-24.md");
  });

  it("supplements empty dirty semantic results with file fallback hits", async () => {
    const workspaceDir = await createWorkspace();
    mockState.setSearchImpl(async () => []);
    mockState.setStatusOverride({ dirty: true });

    const tool = await createMemorySearchToolOrThrow(createConfig(workspaceDir));
    const result = await tool.execute("fallback-dirty", { query: "recallable" });
    const details = result.details as {
      results: Array<{ path: string; snippet: string }>;
      mode?: string;
    };

    expect(details.mode).toContain("filesystem");
    expect(details.results[0]?.path).toBe("memory/2026-03-24.md");
    expect(details.results[0]?.snippet).toContain("recallable");
  });

  it("falls back to filesystem reads when semantic memory_get is unavailable", async () => {
    const workspaceDir = await createWorkspace();
    mockState.setReadFileImpl(async () => {
      throw new Error("embedding provider timeout");
    });

    const tool = await createMemoryGetToolOrThrow(createConfig(workspaceDir));
    const result = await tool.execute("fallback-read", {
      path: "memory/2026-03-24.md",
      from: 1,
      lines: 1,
    });
    const details = result.details as { path: string; text: string; disabled?: boolean };

    expect(details.disabled).toBeUndefined();
    expect(details.path).toBe("memory/2026-03-24.md");
    expect(details.text).toContain("Telegram worklog capture is now durable");
  });

  it("falls back to session transcript hits when session memory is enabled", async () => {
    const workspaceDir = await createWorkspace();
    mockState.setSearchImpl(async () => {
      throw new Error("embedding provider timeout");
    });
    sessionState.setEntries([
      {
        absPath: "/tmp/session-1.jsonl",
        relPath: "sessions/session-1.jsonl",
        content:
          "User: Please patch the Telegram fallback.\nAssistant: Patched the session recall path.",
        lineMap: [12, 18],
      },
    ]);

    const tool = await createMemorySearchToolOrThrow(
      createConfig(workspaceDir, {
        sources: ["sessions"],
        experimental: { sessionMemory: true },
      }),
    );
    const result = await tool.execute("fallback-session-search", {
      query: "patched session recall",
    });
    const details = result.details as {
      results: Array<{ path: string; snippet: string; source: string }>;
      mode?: string;
      warning?: string;
    };

    expect(details.mode).toBe("filesystem-fallback");
    expect(details.warning).toMatch(/^Semantic memory search unavailable:/);
    expect(details.results[0]?.path).toBe("sessions/session-1.jsonl");
    expect(details.results[0]?.source).toBe("sessions");
    expect(details.results[0]?.snippet).toContain("Patched the session recall path.");
  });

  it("falls back to session transcript reads when memory_get targets a session path", async () => {
    const workspaceDir = await createWorkspace();
    mockState.setReadFileImpl(async () => {
      throw new Error("embedding provider timeout");
    });
    sessionState.setEntries([
      {
        absPath: "/tmp/session-2.jsonl",
        relPath: "sessions/session-2.jsonl",
        content: "User: Remember the Grok switch.\nAssistant: Switched the default and fallbacks.",
        lineMap: [9, 14],
      },
    ]);

    const tool = await createMemoryGetToolOrThrow(
      createConfig(workspaceDir, {
        sources: ["sessions"],
        experimental: { sessionMemory: true },
      }),
    );
    const result = await tool.execute("fallback-session-read", {
      path: "sessions/session-2.jsonl",
      from: 14,
      lines: 1,
    });
    const details = result.details as { path: string; text: string; disabled?: boolean };

    expect(details.disabled).toBeUndefined();
    expect(details.path).toBe("sessions/session-2.jsonl");
    expect(details.text).toContain("Assistant: Switched the default and fallbacks.");
  });

  it("merges direct filesystem recall with semantic hits so fresh notes are visible before reindex", async () => {
    const workspaceDir = await createWorkspace();
    await fs.writeFile(
      path.join(workspaceDir, "memory", "2026-03-24.md"),
      "# 2026-03-24\nFresh Telegram parity note.\nImmediate recall should find this before idle indexing.",
      "utf-8",
    );
    mockState.setSearchImpl(async () => [
      {
        path: "memory/2026-03-20.md",
        source: "memory",
        score: 0.7,
        snippet: "Older indexed note about parity work.",
        startLine: 3,
        endLine: 4,
      },
    ]);

    const tool = await createMemorySearchToolOrThrow(createConfig(workspaceDir));
    const result = await tool.execute("merge-local-search", {
      query: "Immediate recall should find this",
      maxResults: 4,
    });
    const details = result.details as {
      results: Array<{ path: string; snippet: string }>;
      mode?: string;
      warning?: string;
    };

    expect(details.warning).toBeUndefined();
    expect(details.mode).toContain("filesystem");
    expect(details.results.some((entry) => entry.path === "memory/2026-03-24.md")).toBe(true);
    expect(details.results.some((entry) => entry.path === "memory/2026-03-20.md")).toBe(true);
  });
});
