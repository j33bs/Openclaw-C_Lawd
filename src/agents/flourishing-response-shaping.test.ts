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
    expect(recommendResponseMode({ relationalStrain: true, asksForDelegation: true })).toBe(
      "repair",
    );
  });

  it("falls back to agency-first under confusion or repeated failure", () => {
    expect(recommendResponseMode({ repeatedFailures: 2 })).toBe("agency_first");
    expect(recommendResponseMode({ userUncertainty: true })).toBe("agency_first");
  });

  it("uses tight execute when intent is clear and delegation is wanted", () => {
    expect(recommendResponseMode({ asksForDelegation: true })).toBe("tight_execute");
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
});
