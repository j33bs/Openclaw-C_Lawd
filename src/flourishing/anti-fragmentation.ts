import { z } from "zod";

export const FragmentationSeveritySchema = z.enum(["low", "elevated", "high", "critical"]);
export type FragmentationSeverity = z.infer<typeof FragmentationSeveritySchema>;

export const AntiFragmentationSignalSchema = z.object({
  recallSuccessRate: z.number().min(0).max(1),
  duplicateClarificationRate: z.number().min(0).max(1),
  dailyNoteFreshnessHours: z.number().min(0),
  continuityBundleAvailable: z.boolean(),
  pinnedDoctrineAvailable: z.boolean(),
  sessionMemoryAvailable: z.boolean(),
  unresolvedDriftSignals: z.number().int().min(0).max(20).default(0),
  crossSurfaceMismatchCount: z.number().int().min(0).max(20).default(0),
  toolFailureRate: z.number().min(0).max(1).default(0),
});

export type AntiFragmentationSignal = z.infer<typeof AntiFragmentationSignalSchema>;

export type AntiFragmentationAssessment = {
  score: number;
  severity: FragmentationSeverity;
  factors: string[];
  recommendations: string[];
};

export function assessFragmentation(input: AntiFragmentationSignal): AntiFragmentationAssessment {
  const signal = AntiFragmentationSignalSchema.parse(input);
  let score = 100;
  const factors: string[] = [];
  const recommendations: string[] = [];

  if (signal.recallSuccessRate < 0.6) {
    score -= 25;
    factors.push("recall success rate is low");
    recommendations.push("strengthen the recent continuity bundle before expanding new behavior");
  } else if (signal.recallSuccessRate < 0.8) {
    score -= 12;
    factors.push("recall success rate is soft");
  }

  if (signal.duplicateClarificationRate >= 0.25) {
    score -= 18;
    factors.push("users are repeating context too often");
    recommendations.push("prioritize local-first recall and continuity-sensitive reply formatting");
  } else if (signal.duplicateClarificationRate >= 0.1) {
    score -= 8;
    factors.push("duplicate clarification rate is rising");
  }

  if (signal.dailyNoteFreshnessHours > 48) {
    score -= 16;
    factors.push("daily notes are stale");
    recommendations.push(
      "restore daily-note freshness so recent continuity has a strong local source",
    );
  } else if (signal.dailyNoteFreshnessHours > 24) {
    score -= 8;
    factors.push("daily notes are aging past one day");
  }

  if (!signal.continuityBundleAvailable) {
    score -= 14;
    factors.push("no continuity bundle is available");
    recommendations.push("ship the recent continuity bundle for continuity-sensitive turns");
  }

  if (!signal.pinnedDoctrineAvailable) {
    score -= 10;
    factors.push("pinned doctrine is unavailable to the current recall path");
    recommendations.push(
      "restore pinned node doctrine loading before trusting broader memory synthesis",
    );
  }

  if (!signal.sessionMemoryAvailable) {
    score -= 10;
    factors.push("recent session memory is unavailable");
    recommendations.push(
      "restore session snippet access so recent work survives outside semantic matches",
    );
  }

  if (signal.unresolvedDriftSignals >= 4) {
    score -= 12;
    factors.push("project drift signals are accumulating");
    recommendations.push("add a meaning-anchor briefing or collapse-aware narrowing pass");
  } else if (signal.unresolvedDriftSignals >= 2) {
    score -= 6;
    factors.push("some project drift signals are present");
  }

  if (signal.crossSurfaceMismatchCount >= 3) {
    score -= 14;
    factors.push("cross-surface truth mismatches are recurring");
    recommendations.push("require receipted state claims and log drift incidents");
  } else if (signal.crossSurfaceMismatchCount >= 1) {
    score -= 6;
    factors.push("at least one cross-surface mismatch was observed");
  }

  if (signal.toolFailureRate >= 0.2) {
    score -= 12;
    factors.push("tool failure rate is high");
    recommendations.push(
      "prefer collapse-aware narrowing instead of parallel expansion under failure pressure",
    );
  } else if (signal.toolFailureRate >= 0.1) {
    score -= 5;
    factors.push("tool failure rate is elevated");
  }

  score = Math.max(0, Math.min(100, score));

  const severity: FragmentationSeverity =
    score >= 80 ? "low" : score >= 60 ? "elevated" : score >= 35 ? "high" : "critical";

  return {
    score,
    severity,
    factors,
    recommendations: Array.from(new Set(recommendations)),
  };
}
