import { describe, expect, it } from "vitest";
import {
  buildThreadContinuityReport,
  detectFragmentationPressure,
  scoreConnectionToWhatMatters,
  scoreNoveltyGradient,
} from "./thread-continuity.js";

describe("flourishing thread continuity", () => {
  it("scores strong connection-to-what-matters when anchors are recent and coherent", () => {
    const result = scoreConnectionToWhatMatters({
      timestamp: "2026-03-24T11:00:00.000Z",
      threadKey: "flourishing-mission",
      activeProjects: ["flourishing-mission"],
      touches: [
        {
          threadKey: "flourishing-mission",
          timestamp: "2026-03-24T10:00:00.000Z",
          kind: "anchor",
          anchor: "Keep compute pointed at authentic flourishing.",
          salience: 9,
          coherence: 8,
          novelty: 5,
          evidence: ["restated the mission in operational terms"],
          tags: ["mission", "flourishing"],
          openLoops: ["define the smallest continuity slice"],
        },
        {
          threadKey: "flourishing-mission",
          timestamp: "2026-03-24T10:30:00.000Z",
          kind: "progress",
          anchor: "Translate the mission into code and tests.",
          salience: 8,
          coherence: 8,
          novelty: 6,
          evidence: ["chose a bounded local system instead of abstract planning"],
          tags: ["implementation", "tests"],
          openLoops: ["define the smallest continuity slice"],
        },
      ],
    });

    expect(result.score).toBeGreaterThanOrEqual(8);
    expect(result.band).toBe("strong");
    expect(result.reasons.join(" ")).toContain("recent progress touch present");
  });

  it("flags flat novelty when the interaction keeps repeating itself", () => {
    const result = scoreNoveltyGradient({
      current: {
        timestamp: "2026-03-24T11:00:00.000Z",
        intent: "status-check",
        anchor: "status check on flourishing continuity",
        tags: ["status", "continuity"],
        depth: 3,
      },
      recent: [
        {
          timestamp: "2026-03-24T10:55:00.000Z",
          intent: "status-check",
          anchor: "status check on flourishing continuity",
          tags: ["status", "continuity"],
          depth: 3,
        },
        {
          timestamp: "2026-03-24T10:45:00.000Z",
          intent: "status-check",
          anchor: "status check on flourishing continuity",
          tags: ["status", "continuity"],
          depth: 2,
        },
      ],
    });

    expect(result.band).toBe("flat");
    expect(result.reasons.join(" ")).toContain("repeat the same intent");
  });

  it("detects critical fragmentation pressure from continuity gaps and drift", () => {
    const result = detectFragmentationPressure({
      timestamp: "2026-03-24T11:00:00.000Z",
      continuityCoverage: 3,
      duplicateClarificationRate: 0.5,
      unresolvedThreads: 5,
      driftSignals: ["scope churn", "repeat clarifications", "stale anchors"],
      daysSinceMeaningfulTouch: 8,
      crossSurfaceMismatchCount: 2,
      contextSwitches: 9,
    });

    expect(result.severity).toBe("critical");
    expect(result.nextActions).toContain(
      "refresh the continuity bundle before the next substantial reply",
    );
    expect(result.nextActions).toContain("attach receipts or ids to the next stateful claim");
  });

  it("builds an integrated continuity report", () => {
    const report = buildThreadContinuityReport({
      snapshot: {
        timestamp: "2026-03-24T11:00:00.000Z",
        threadKey: "flourishing-mission",
        activeProjects: ["flourishing-mission"],
        touches: [
          {
            threadKey: "flourishing-mission",
            timestamp: "2026-03-24T10:00:00.000Z",
            kind: "anchor",
            anchor: "Keep compute pointed at authentic flourishing.",
            salience: 8,
            coherence: 8,
            novelty: 5,
            evidence: ["named the mission directly"],
            tags: ["mission"],
            openLoops: ["thread continuity slice"],
          },
        ],
      },
      novelty: {
        current: {
          timestamp: "2026-03-24T11:00:00.000Z",
          intent: "implementation",
          anchor: "turn the roadmap into a tiny working system",
          tags: ["implementation", "continuity"],
          depth: 7,
        },
        recent: [
          {
            timestamp: "2026-03-24T09:00:00.000Z",
            intent: "planning",
            anchor: "identify the right flourishing slice",
            tags: ["planning", "mission"],
            depth: 4,
          },
        ],
      },
      fragmentation: {
        timestamp: "2026-03-24T11:00:00.000Z",
        continuityCoverage: 7,
        duplicateClarificationRate: 0.1,
        unresolvedThreads: 1,
        driftSignals: [],
        daysSinceMeaningfulTouch: 0,
        crossSurfaceMismatchCount: 0,
        contextSwitches: 2,
      },
    });

    expect(report.threadKey).toBe("flourishing-mission");
    expect(report.connection.score).toBeGreaterThan(0);
    expect(report.novelty.band).toMatch(/steady|fresh|spiky/);
    expect(report.fragmentation.severity).toBe("low");
  });
});
