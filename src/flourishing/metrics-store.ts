import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { type FlourishingMetricRecord, FlourishingMetricRecordSchema } from "./phase1.js";

const FLOURISHING_AXES = [
  "coherence",
  "vitality",
  "agency",
  "truth_contact",
  "connection",
] as const;

export interface StoredMetricRecord {
  id: string;
  recordedAt: string;
  source: "auto" | "manual" | "cron";
  metricKey: string;
  scores: Record<string, number>;
  evidence: string;
  linkedProject?: string;
}

export class FlourishingMetricsStore {
  private readonly storePath: string;

  constructor(workspaceDir: string) {
    this.storePath = path.join(workspaceDir, "workspace", "state", "flourishing-metrics.jsonl");
  }

  async record(metric: FlourishingMetricRecord, source: "auto" | "manual" | "cron"): Promise<void> {
    const parsed = FlourishingMetricRecordSchema.parse(metric);
    const record: StoredMetricRecord = {
      id: randomUUID(),
      recordedAt: new Date().toISOString(),
      source,
      metricKey: parsed.metricKey,
      scores: { ...parsed.scores },
      evidence: parsed.evidence.join(" | "),
      linkedProject: parsed.linkedProject,
    };

    await fs.mkdir(path.dirname(this.storePath), { recursive: true });
    await fs.appendFile(this.storePath, `${JSON.stringify(record)}\n`, "utf8");
  }

  async query(params: {
    since?: string;
    axis?: string;
    limit?: number;
  }): Promise<StoredMetricRecord[]> {
    const records = await this.readRecords();
    const sinceMs = params.since ? new Date(params.since).getTime() : Number.NaN;
    const filtered = records
      .filter((record) => {
        if (Number.isFinite(sinceMs) && new Date(record.recordedAt).getTime() < sinceMs) {
          return false;
        }
        if (params.axis) {
          return typeof record.scores[params.axis] === "number";
        }
        return true;
      })
      .toSorted((left, right) => right.recordedAt.localeCompare(left.recordedAt));

    if (typeof params.limit === "number" && Number.isFinite(params.limit)) {
      return filtered.slice(0, Math.max(0, Math.floor(params.limit)));
    }

    return filtered;
  }

  async summary(params: { since?: string }): Promise<{
    averageByAxis: Record<string, number>;
    weakestAxis: string;
    trend: "improving" | "stable" | "declining";
    recordCount: number;
  }> {
    const records = await this.query({ since: params.since });
    const averageByAxis: Record<string, number> = Object.fromEntries(
      FLOURISHING_AXES.map((axis) => [axis, 0]),
    );

    if (records.length === 0) {
      return {
        averageByAxis,
        weakestAxis: "unknown",
        trend: "stable",
        recordCount: 0,
      };
    }

    for (const axis of FLOURISHING_AXES) {
      averageByAxis[axis] =
        records.reduce((sum, record) => sum + (record.scores[axis] ?? 0), 0) / records.length;
    }

    const weakestAxis = FLOURISHING_AXES.reduce((weakest, axis) => {
      return averageByAxis[axis] < averageByAxis[weakest] ? axis : weakest;
    }, FLOURISHING_AXES[0]);

    const chronological = records.toSorted(
      (left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime(),
    );
    const midpoint = Math.floor(chronological.length / 2);
    const firstHalf = chronological.slice(0, midpoint);
    const secondHalf = chronological.slice(midpoint);
    const firstAverage = averageRecordStrength(firstHalf);
    const secondAverage = averageRecordStrength(secondHalf);
    const delta = secondAverage - firstAverage;

    const trend =
      firstHalf.length === 0 || secondHalf.length === 0
        ? "stable"
        : delta > 0.25
          ? "improving"
          : delta < -0.25
            ? "declining"
            : "stable";

    return {
      averageByAxis,
      weakestAxis,
      trend,
      recordCount: records.length,
    };
  }

  private async readRecords(): Promise<StoredMetricRecord[]> {
    try {
      const raw = await fs.readFile(this.storePath, "utf8");
      return raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .flatMap((line) => {
          try {
            const parsed = JSON.parse(line) as Partial<StoredMetricRecord>;
            if (
              typeof parsed.id !== "string" ||
              typeof parsed.recordedAt !== "string" ||
              typeof parsed.source !== "string" ||
              typeof parsed.metricKey !== "string" ||
              typeof parsed.evidence !== "string" ||
              typeof parsed.scores !== "object" ||
              parsed.scores === null
            ) {
              return [];
            }
            return [
              {
                id: parsed.id,
                recordedAt: parsed.recordedAt,
                source: parsed.source,
                metricKey: parsed.metricKey,
                scores: parsed.scores,
                evidence: parsed.evidence,
                linkedProject: parsed.linkedProject,
              },
            ];
          } catch {
            return [];
          }
        });
    } catch {
      return [];
    }
  }
}

function averageRecordStrength(records: StoredMetricRecord[]): number {
  if (records.length === 0) {
    return 0;
  }
  return (
    records.reduce((sum, record) => {
      const values = FLOURISHING_AXES.map((axis) => record.scores[axis] ?? 0);
      const recordAverage = values.reduce((axisSum, value) => axisSum + value, 0) / values.length;
      return sum + recordAverage;
    }, 0) / records.length
  );
}
