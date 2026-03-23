import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeVectorStoreAdapter } from "../workspace/memory/unified_query.js";

function seedKnowledgeBase(root: string, entities: string, lastSync: string): void {
  const dataDir = path.join(root, "workspace", "knowledge_base", "data");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "entities.jsonl"), entities, "utf8");
  fs.writeFileSync(path.join(dataDir, "last_sync.txt"), lastSync, "utf8");
}

describe("makeVectorStoreAdapter", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true });
    }
  });

  it("hides the compatibility corpus when only the seed row exists", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-unified-query-"));
    tempDirs.push(root);
    seedKnowledgeBase(root, '{"id":"doctrine"}\n', "2026-03-24T08:00:00+00:00");

    const adapter = makeVectorStoreAdapter({ repoRoot: root });
    await expect(adapter.query()).resolves.toEqual([]);
  });

  it("hides the compatibility corpus when last_sync is missing or invalid", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-unified-query-"));
    tempDirs.push(root);
    seedKnowledgeBase(root, '{"id":"doctrine"}\n{"id":"memory-health"}\n', "not-a-timestamp");

    const adapter = makeVectorStoreAdapter({ repoRoot: root });
    await expect(adapter.query()).resolves.toEqual([]);
  });

  it("exposes the compatibility corpus only after sync and beyond the seed row", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-unified-query-"));
    tempDirs.push(root);
    seedKnowledgeBase(
      root,
      '{"id":"doctrine","name":"Seed"}\n{"id":"memory-health","name":"Live"}\n',
      "2026-03-24T08:00:00+00:00",
    );

    const adapter = makeVectorStoreAdapter({ repoRoot: root });
    await expect(adapter.query({ limit: 10 })).resolves.toEqual([
      {
        source: "vector_store",
        ts: null,
        kind: "entity",
        title: "Seed",
        text: "",
        refs: ["entity:doctrine"],
      },
      {
        source: "vector_store",
        ts: null,
        kind: "entity",
        title: "Live",
        text: "",
        refs: ["entity:memory-health"],
      },
    ]);
  });
});
