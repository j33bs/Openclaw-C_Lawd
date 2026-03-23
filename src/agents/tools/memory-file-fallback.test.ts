import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { searchLocalMemoryFiles } from "./memory-file-fallback.js";

describe("searchLocalMemoryFiles", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dir) => {
        await fs.rm(dir, { recursive: true, force: true });
      }),
    );
  });

  it("finds direct matches in canonical memory files", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-memory-fallback-"));
    tempDirs.push(workspaceDir);
    await fs.mkdir(path.join(workspaceDir, "memory"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceDir, "memory", "2026-03-24.md"),
      ["Morning note", "Telegram parity work is now durable.", "Worklog entry captured."].join(
        "\n",
      ),
      "utf-8",
    );

    const results = await searchLocalMemoryFiles({
      workspaceDir,
      query: "telegram parity durable",
      maxResults: 5,
    });

    expect(results[0]?.path).toBe("memory/2026-03-24.md");
    expect(results[0]?.snippet).toContain("Telegram parity work is now durable.");
    expect(results[0]?.source).toBe("memory");
  });
});
