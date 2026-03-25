import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempWorkspace } from "../../test-helpers/workspace.js";
import type { CronJob } from "../types.js";
import { runSunsetCheck } from "./sunset-check.js";

async function writeCronStore(storePath: string, jobs: CronJob[]): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(
    storePath,
    `${JSON.stringify(
      {
        version: 1,
        jobs,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function createJob(
  overrides: Partial<CronJob> & Pick<CronJob, "id" | "name" | "enabled">,
): CronJob {
  const now = Date.parse("2026-03-25T12:00:00.000Z");
  const { id, name, enabled, ...rest } = overrides;
  return {
    ...rest,
    id,
    name,
    enabled,
    createdAtMs: now,
    updatedAtMs: now,
    schedule: { kind: "every", everyMs: 60_000 },
    sessionTarget: "main",
    wakeMode: "now",
    payload: { kind: "systemEvent", text: "tick" },
    state: {},
  };
}

describe("runSunsetCheck", () => {
  it("flags active jobs whose review date has passed without recent evidence and writes the review note", async () => {
    const workspaceDir = await makeTempWorkspace("sunset-check-");
    const storePath = path.join(workspaceDir, "workspace", "state", "cron-store.json");
    const nowMs = Date.parse("2026-03-25T12:00:00.000Z");

    const jobs = [
      createJob({
        id: "job-no-evidence",
        name: "job-no-evidence",
        enabled: true,
        description:
          "This job needs a review because its description is intentionally long enough to be truncated by the sunset checker note output.",
        reviewDate: "2026-03-20",
      }),
      createJob({
        id: "job-stale-evidence",
        name: "job-stale-evidence",
        enabled: true,
        reviewDate: "2026-03-20",
        lastEvidenceDate: "2026-03-10",
      }),
      createJob({
        id: "job-borderline-evidence",
        name: "job-borderline-evidence",
        enabled: true,
        reviewDate: "2026-03-20",
        lastEvidenceDate: "2026-03-11",
      }),
      createJob({
        id: "job-future",
        name: "job-future",
        enabled: true,
        reviewDate: "2026-04-01",
        lastEvidenceDate: "2026-03-24",
      }),
      createJob({
        id: "job-disabled",
        name: "job-disabled",
        enabled: false,
        reviewDate: "2026-03-20",
        lastEvidenceDate: "2026-02-01",
      }),
    ];

    await writeCronStore(storePath, jobs);

    const result = await runSunsetCheck({
      workspaceDir,
      storePath,
      nowMs,
      timezone: "UTC",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("unexpected failure");
    }

    expect(result.flaggedJobs.map((job) => job.id)).toEqual([
      "job-no-evidence",
      "job-stale-evidence",
    ]);
    expect(result.flaggedJobs[0]?.summary).toBe(jobs[0].description!.trim().slice(0, 80));
    expect(result.flaggedJobs[1]?.summary).toBe("job-stale-evidence");

    const dailyNotePath = path.join(workspaceDir, "memory", "2026-03-25.md");
    const dailyNote = await fs.readFile(dailyNotePath, "utf8");
    expect(dailyNote).toContain("## Automation Review");
    expect(dailyNote).toContain(`- job-no-evidence: ${jobs[0].description!.trim().slice(0, 80)}`);
    expect(dailyNote).toContain("- job-stale-evidence: job-stale-evidence");
    expect(dailyNote).not.toContain("job-borderline-evidence");
    expect(dailyNote).not.toContain("job-future");
    expect(dailyNote).not.toContain("job-disabled");
  });

  it("returns cleanly when no jobs need review and leaves the daily note untouched", async () => {
    const workspaceDir = await makeTempWorkspace("sunset-check-");
    const storePath = path.join(workspaceDir, "workspace", "state", "cron-store.json");
    const nowMs = Date.parse("2026-03-25T12:00:00.000Z");

    await writeCronStore(storePath, [
      createJob({
        id: "job-fresh",
        name: "job-fresh",
        enabled: true,
        reviewDate: "2026-04-01",
        lastEvidenceDate: "2026-03-24",
      }),
    ]);

    const result = await runSunsetCheck({
      workspaceDir,
      storePath,
      nowMs,
      timezone: "UTC",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("unexpected failure");
    }
    expect(result.flaggedJobs).toEqual([]);

    const dailyNotePath = path.join(workspaceDir, "memory", "2026-03-25.md");
    await expect(fs.readFile(dailyNotePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
