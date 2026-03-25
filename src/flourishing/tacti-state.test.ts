import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readTactiSnapshot } from "./tacti-state.js";

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("readTactiSnapshot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a full snapshot when both tracker files are present", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "tacti-state-full-"));
    const base = path.join(workspaceDir, "workspace", "memory");
    await writeJson(path.join(base, "arousal_state.json"), {
      schema: 1,
      updated_at: "2026-03-25T09:00:00.000Z",
      sessions: {
        alpha: {
          user_events: 2,
          assistant_events: 3,
          arousal: 0.7,
          updated_at: "2026-03-25T09:00:00.000Z",
        },
        beta: {
          user_events: 1,
          assistant_events: 1,
          arousal: 0.9,
          updated_at: "2026-03-25T10:00:00.000Z",
        },
      },
    });
    await writeJson(path.join(base, "relationship.json"), {
      schema: 1,
      updated_at: "2026-03-25T11:30:00.000Z",
      sessions: {
        alpha: {
          user_events: 2,
          assistant_events: 3,
          trust_score: 0.4,
          attunement_index: 0.5,
          unresolved_threads: ["thread-a", "thread-b"],
          updated_at: "2026-03-25T09:00:00.000Z",
        },
        beta: {
          user_events: 1,
          assistant_events: 1,
          trust_score: 0.8,
          attunement_index: 0.7,
          unresolved_threads: ["thread-c"],
          updated_at: "2026-03-25T11:30:00.000Z",
        },
      },
    });

    const snapshot = await readTactiSnapshot(workspaceDir);

    expect(snapshot).toMatchObject({
      arousal: 0.8,
      trustScore: 0.8,
      attunementIndex: 0.7,
      interactionCount: 7,
      unresolvedThreads: ["thread-c"],
      lastUpdated: "2026-03-25T11:30:00.000Z",
      stale: false,
    });
  });

  it("returns a partial snapshot when only the arousal file exists", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "tacti-state-arousal-"));
    const base = path.join(workspaceDir, "workspace", "memory");
    await writeJson(path.join(base, "arousal_state.json"), {
      schema: 1,
      updated_at: "2026-03-25T08:00:00.000Z",
      sessions: {
        only: {
          user_events: 4,
          assistant_events: 2,
          arousal: 0.64,
          updated_at: "2026-03-25T08:00:00.000Z",
        },
      },
    });

    const snapshot = await readTactiSnapshot(workspaceDir);

    expect(snapshot).toMatchObject({
      arousal: 0.64,
      trustScore: 1,
      attunementIndex: 1,
      interactionCount: 6,
      unresolvedThreads: [],
      lastUpdated: "2026-03-25T08:00:00.000Z",
      stale: true,
    });
  });

  it("returns a partial snapshot when only the relationship file exists", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "tacti-state-relationship-"));
    const base = path.join(workspaceDir, "workspace", "memory");
    await writeJson(path.join(base, "relationship.json"), {
      schema: 1,
      updated_at: "2026-03-25T11:45:00.000Z",
      sessions: {
        only: {
          user_events: 3,
          assistant_events: 1,
          trust_score: 0.3,
          attunement_index: 0.4,
          unresolved_threads: ["thread-x", "thread-y"],
          updated_at: "2026-03-25T11:45:00.000Z",
        },
      },
    });

    const snapshot = await readTactiSnapshot(workspaceDir);

    expect(snapshot).toMatchObject({
      arousal: 0.5,
      trustScore: 0.3,
      attunementIndex: 0.4,
      interactionCount: 4,
      unresolvedThreads: ["thread-x", "thread-y"],
      lastUpdated: "2026-03-25T11:45:00.000Z",
      stale: false,
    });
  });

  it("returns null when neither tracker file exists", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "tacti-state-empty-"));

    await expect(readTactiSnapshot(workspaceDir)).resolves.toBeNull();
  });

  it("returns null for corrupt JSON", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "tacti-state-corrupt-"));
    const base = path.join(workspaceDir, "workspace", "memory");
    await fs.mkdir(base, { recursive: true });
    await fs.writeFile(path.join(base, "arousal_state.json"), "{", "utf8");

    await expect(readTactiSnapshot(workspaceDir)).resolves.toBeNull();
  });

  it("marks stale snapshots based on the last update time", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "tacti-state-stale-"));
    const base = path.join(workspaceDir, "workspace", "memory");
    await writeJson(path.join(base, "relationship.json"), {
      schema: 1,
      updated_at: "2026-03-25T10:30:00.000Z",
      sessions: {
        only: {
          user_events: 1,
          assistant_events: 1,
          trust_score: 0.7,
          attunement_index: 0.8,
          unresolved_threads: [],
          updated_at: "2026-03-25T10:30:00.000Z",
        },
      },
    });

    const snapshot = await readTactiSnapshot(workspaceDir);

    expect(snapshot?.stale).toBe(true);
  });

  it("reads legacy top-level TACTI schema data when session maps are absent", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "tacti-state-legacy-"));
    const base = path.join(workspaceDir, "workspace", "memory");
    await writeJson(path.join(base, "arousal_state.json"), {
      schema: 0,
      arousal_level: 0.92,
      current_state: "active",
      metrics: {
        total_messages: 9,
      },
      transitions: [{ timestamp: "2026-03-25T08:00:00.000Z" }],
    });
    await writeJson(path.join(base, "relationship.json"), {
      schema: 0,
      trust_score: 0.42,
      attunement_score: 0.67,
      unresolved_threads: ["legacy-thread", 2],
      interactions: [
        { timestamp: "2026-03-25T11:15:00.000Z" },
        { timestamp: "2026-03-25T11:45:00.000Z" },
      ],
      created: "2026-03-25T07:00:00.000Z",
    });

    const snapshot = await readTactiSnapshot(workspaceDir);

    expect(snapshot).toMatchObject({
      arousal: 0.92,
      trustScore: 0.42,
      attunementIndex: 0.67,
      interactionCount: 9,
      unresolvedThreads: ["legacy-thread", "thread-2"],
      lastUpdated: "2026-03-25T11:45:00.000Z",
      stale: false,
    });
  });
});
