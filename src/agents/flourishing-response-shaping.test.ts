import { describe, expect, it } from "vitest";
import {
  buildFlourishingPromptSection,
  recommendResponseMode,
  scoreMeaningDensity,
  shouldOpenRepairLoop,
} from "./flourishing-response-shaping.js";

describe("scoreMeaningDensity", () => {
  it("scores directly useful, grounded, agency-preserving actions as medium/high", () => {
    const result = scoreMeaningDensity({
      directUserGoal: true,
      truthContact: true,
      userAgency: true,
      relationshipCare: true,
      longHorizon: true,
    });

    expect(result.score).toBeGreaterThanOrEqual(2);
    expect(result.verdict).toMatch(/medium|high/);
    expect(result.reasons).toContain("directly serves the stated goal");
  });

  it("penalizes decorative moves", () => {
    const result = scoreMeaningDensity({
      directUserGoal: false,
      truthContact: false,
      decorativeRisk: true,
    });

    expect(result.score).toBe(0);
    expect(result.verdict).toBe("low");
    expect(result.reasons).toContain("risks decorative output without durable value");
  });
});

describe("recommendResponseMode", () => {
  it("chooses repair under relational strain", () => {
    const result = recommendResponseMode({ relationalStrain: true, asksForDelegation: true });

    expect(result.mode).toBe("repair");
    expect(result.reasons).toContain("relational strain detected");
  });

  it("falls back to agency-first under confusion or repeated failure", () => {
    const repeatedFailure = recommendResponseMode({ repeatedFailures: 2 });
    const uncertainty = recommendResponseMode({ userUncertainty: true });

    expect(repeatedFailure.mode).toBe("agency_first");
    expect(repeatedFailure.reasons).toContain("repeated failures suggest narrowing");
    expect(uncertainty.mode).toBe("agency_first");
    expect(uncertainty.reasons).toContain("user uncertainty suggests narrowing");
  });

  it("uses tight execute when intent is clear and delegation is wanted", () => {
    const result = recommendResponseMode({ asksForDelegation: true });

    expect(result.mode).toBe("tight_execute");
    expect(result.reasons).toContain("delegation requested and intent is clear");
  });
});

describe("shouldOpenRepairLoop", () => {
  it("opens on clear mismatch", () => {
    expect(shouldOpenRepairLoop({ mismatch: "clear" })).toBe(true);
  });

  it("opens when multiple weaker strain signals cluster", () => {
    expect(
      shouldOpenRepairLoop({
        mismatch: "minor",
        userFriction: true,
        assistantOverreach: true,
      }),
    ).toBe(true);
  });

  it("stays closed for isolated mild noise", () => {
    expect(shouldOpenRepairLoop({ mismatch: "minor", userFriction: true })).toBe(false);
  });
});

describe("buildFlourishingPromptSection", () => {
  it("returns empty when disabled", () => {
    expect(buildFlourishingPromptSection({ enabled: false })).toEqual([]);
  });

  it("renders meaning-density, response mode, and repair guidance when enabled", () => {
    const section = buildFlourishingPromptSection({
      enabled: true,
      meaningDensity: { enabled: true, executionMinScore: 2 },
      responseMode: {
        enabled: true,
        defaultMode: "agency_first",
        collapseFailureThreshold: 2,
      },
      repairLoop: { enabled: true },
    }).join("\n");

    expect(section).toContain("## Flourishing Response Shaping");
    expect(section).toContain("Meaning-density preflight");
    expect(section).toContain("Agency-first mode means");
    expect(section).toContain("Repair-loop hook");
  });

  it("includes live continuity and TACTI signal lines when configured", () => {
    const section = buildFlourishingPromptSection({
      enabled: true,
      liveSignals: {
        continuityConfidence: "partial",
        tactiSnapshot: {
          arousal: 0.42,
          trustScore: 0.73,
          attunementIndex: 0.61,
          interactionCount: 9,
          unresolvedThreads: ["one", "two"],
          lastUpdated: "2026-03-25T00:00:00.000Z",
          stale: false,
        },
      },
    }).join("\n");

    expect(section).toContain("Live continuity signal: partial.");
    expect(section).toContain(
      "Live TACTI signal: arousal 0.42, trust 0.73, attunement 0.61, unresolved threads 2.",
    );
  });
});
