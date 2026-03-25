import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { MemoryIndexManager } from "./index.js";

describe("memory manager idle-gated sync", () => {
  let fixtureRoot = "";
  let workspaceDir = "";
  let indexPath = "";
  let manager: MemoryIndexManager | null = null;
  let caseId = 0;

  beforeAll(async () => {
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-mem-idle-sync-"));
  });

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubEnv("OPENCLAW_TEST_MEMORY_UNSAFE_REINDEX", "0");
    workspaceDir = path.join(fixtureRoot, `case-${caseId++}`);
    indexPath = path.join(workspaceDir, "index.sqlite");
    await fs.mkdir(path.join(workspaceDir, "memory"), { recursive: true });
    await fs.writeFile(path.join(workspaceDir, "MEMORY.md"), "Hello memory.");
  });

  afterEach(async () => {
    if (manager) {
      await manager.close();
      manager = null;
    }
    vi.useRealTimers();
  });

  afterAll(async () => {
    if (fixtureRoot) {
      await fs.rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  async function createManager(getSystemIdleMsMock: ReturnType<typeof vi.fn>) {
    vi.doMock("../infra/system-idle.js", () => ({
      getSystemIdleMs: getSystemIdleMsMock,
    }));
    const embeddingMocks = await import("./embedding.test-mocks.js");
    embeddingMocks.resetEmbeddingMocks();
    const helpers = await import("./test-manager-helpers.js");
    const cfg = {
      agents: {
        defaults: {
          workspace: workspaceDir,
          memorySearch: {
            provider: "openai",
            model: "mock-embed",
            store: { path: indexPath },
            cache: { enabled: false },
            chunking: { tokens: 4000, overlap: 0 },
            sync: {
              watch: false,
              onSessionStart: false,
              onSearch: false,
              idleSeconds: 1,
            },
          },
        },
        list: [{ id: "main", default: true }],
      },
    } as OpenClawConfig;
    manager = await helpers.getRequiredMemoryIndexManager({ cfg, agentId: "main" });
    return manager;
  }

  it("defers watch-triggered indexing until the system is idle", async () => {
    const idleMock = vi
      .fn<() => Promise<number | null>>()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(2_000);
    const manager = await createManager(idleMock);
    (manager as unknown as { dirty: boolean }).dirty = true;

    await manager.sync({ reason: "watch" });
    expect(manager.status().files).toBe(0);

    await vi.advanceTimersByTimeAsync(30_000);
    await ((manager as unknown as { syncing?: Promise<void> }).syncing ?? Promise.resolve());
    expect(manager.status().files).toBeGreaterThan(0);
    expect(idleMock).toHaveBeenCalledTimes(2);
  });

  it("does not defer forced syncs", async () => {
    const idleMock = vi.fn<() => Promise<number | null>>().mockResolvedValue(0);
    const manager = await createManager(idleMock);
    (manager as unknown as { dirty: boolean }).dirty = true;

    await manager.sync({ reason: "watch", force: true });

    expect(manager.status().files).toBeGreaterThan(0);
    expect(idleMock).not.toHaveBeenCalled();
  });
});
