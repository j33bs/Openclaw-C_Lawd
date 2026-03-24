import { describe, expect, it } from "vitest";
import { assessFragmentation, AntiFragmentationSignalSchema } from "./anti-fragmentation.js";

describe("anti-fragmentation detector", () => {
  it("reports low fragmentation when continuity surfaces are healthy", () => {
    const result = assessFragmentation(
      AntiFragmentationSignalSchema.parse({
        recallSuccessRate: 0.92,
        duplicateClarificationRate: 0.03,
        dailyNoteFreshnessHours: 4,
        continuityBundleAvailable: true,
        pinnedDoctrineAvailable: true,
        sessionMemoryAvailable: true,
        unresolvedDriftSignals: 0,
        crossSurfaceMismatchCount: 0,
        toolFailureRate: 0.02,
      }),
    );

    expect(result.severity).toBe("low");
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.recommendations).toEqual([]);
  });

  it("reports critical fragmentation when continuity is degraded across multiple surfaces", () => {
    const result = assessFragmentation({
      recallSuccessRate: 0.41,
      duplicateClarificationRate: 0.38,
      dailyNoteFreshnessHours: 72,
      continuityBundleAvailable: false,
      pinnedDoctrineAvailable: false,
      sessionMemoryAvailable: false,
      unresolvedDriftSignals: 5,
      crossSurfaceMismatchCount: 4,
      toolFailureRate: 0.24,
    });

    expect(result.severity).toBe("critical");
    expect(result.score).toBeLessThan(35);
    expect(result.factors).toContain("users are repeating context too often");
    expect(result.recommendations).toContain(
      "ship the recent continuity bundle for continuity-sensitive turns",
    );
    expect(result.recommendations).toContain(
      "require receipted state claims and log drift incidents",
    );
  });

  it("treats moderate continuity degradation as elevated or high before catastrophe", () => {
    const result = assessFragmentation({
      recallSuccessRate: 0.76,
      duplicateClarificationRate: 0.12,
      dailyNoteFreshnessHours: 30,
      continuityBundleAvailable: true,
      pinnedDoctrineAvailable: true,
      sessionMemoryAvailable: true,
      unresolvedDriftSignals: 2,
      crossSurfaceMismatchCount: 1,
      toolFailureRate: 0.08,
    });

    expect(["elevated", "high"]).toContain(result.severity);
    expect(result.score).toBeLessThan(80);
    expect(result.factors).toContain("duplicate clarification rate is rising");
  });
});
