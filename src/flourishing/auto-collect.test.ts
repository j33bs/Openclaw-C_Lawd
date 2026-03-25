import { describe, expect, it } from "vitest";
import { deriveSessionFlourishingMetrics } from "./auto-collect.js";
import { FlourishingMetricRecordSchema } from "./phase1.js";

describe("auto-derived flourishing metrics", () => {
  it("maps tacti and continuity signals into a valid metric record", () => {
    const record = deriveSessionFlourishingMetrics({
      tactiSnapshot: {
        arousal: 0.9,
        trustScore: 0.2,
        attunementIndex: 0.4,
        interactionCount: 12,
        unresolvedThreads: ["thread-1", "thread-2"],
        lastUpdated: "2026-03-25T01:00:00.000Z",
        stale: false,
      },
      fragmentationSeverity: "high",
      continuityConfidence: "partial",
    });

    expect(FlourishingMetricRecordSchema.parse(record)).toMatchObject({
      source: "derived",
      scores: {
        coherence: 3,
        vitality: 3,
        agency: 7,
        truth_contact: 7,
        connection: 3,
      },
    });
    expect(record.evidence[0]).toBe("auto-derived-v1");
  });

  it("falls back to neutral defaults when signals are absent", () => {
    const record = deriveSessionFlourishingMetrics({
      tactiSnapshot: null,
      fragmentationSeverity: null,
      continuityConfidence: null,
    });

    expect(record.source).toBe("derived");
    expect(record.scores.coherence).toBe(7);
    expect(record.scores.vitality).toBe(7);
    expect(record.scores.agency).toBe(7);
    expect(record.scores.truth_contact).toBe(7);
    expect(record.scores.connection).toBe(7);
  });
});
