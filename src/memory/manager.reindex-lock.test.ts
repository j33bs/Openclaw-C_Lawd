import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { MemoryIndexManager } from "./index.js";

type EmbeddingTestMocksModule = typeof import("./embedding.test-mocks.js");
type TestManagerHelpersModule = typeof import("./test-manager-helpers.js");

describe("memory manager full reindex locking", () => {
  let fixtureRoot = "";
  let workspaceDir = "";
  let indexPath = "";
  let manager: MemoryIndexManager | null = null;
  let caseId = 0;

  beforeAll(async () => {
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-mem-reindex-lock-"));
  });

  beforeEach(async () => {
    vi.resetModules();
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
  });

  afterAll(async () => {
    if (fixtureRoot) {
      await fs.rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("wraps safe full reindex in a file lock", async () => {
    const withFileLock = vi.fn(
      async (_filePath: string, _options: unknown, fn: () => Promise<void>) => {
        return await fn();
      },
    );
    vi.doMock("../infra/file-lock.js", () => ({ withFileLock }));

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
            sync: { watch: false, onSessionStart: false, onSearch: false },
          },
        },
        list: [{ id: "main", default: true }],
      },
    } as OpenClawConfig;

    manager = await helpers.getRequiredMemoryIndexManager({ cfg, agentId: "main" });
    await manager.sync({ force: true });

    expect(withFileLock).toHaveBeenCalledTimes(1);
    expect(withFileLock.mock.calls[0]?.[0]).toBe(indexPath);
    expect(withFileLock.mock.calls[0]?.[1]).toMatchObject({
      stale: 30 * 60_000,
      retries: expect.objectContaining({
        retries: 120,
        minTimeout: 250,
        maxTimeout: 2_000,
      }),
    });
  });
});
