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

vi.mock("../../memory/index.js", () => ({
  getMemorySearchManager: async () => ({ manager: mockState.manager }),
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
    mockState.reset();
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

  function createConfig(workspaceDir: string): OpenClawConfig {
    return asOpenClawConfig({
      agents: {
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
});
