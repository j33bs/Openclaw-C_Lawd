import { type FlourishingMetricRecord, FlourishingMetricRecordSchema } from "./phase1.js";
import type { TactiSnapshot } from "./tacti-state.js";

export function deriveSessionFlourishingMetrics(params: {
  tactiSnapshot: TactiSnapshot | null;
  fragmentationSeverity: string | null;
  continuityConfidence: string | null;
}): FlourishingMetricRecord {
  const tactiSnapshot = params.tactiSnapshot;
  const record: FlourishingMetricRecord = {
    metricKey: "session-auto-derived",
    timestamp: new Date().toISOString(),
    source: "derived",
    scores: {
      coherence: scoreAxisFromSeverity(params.fragmentationSeverity),
      vitality: scoreAxisFromArousal(tactiSnapshot?.arousal),
      agency: scaleRawThreePointAxisToTen(2),
      truth_contact: scoreAxisFromContinuityConfidence(params.continuityConfidence),
      connection: scoreAxisFromConnection(tactiSnapshot),
    },
    evidence: [
      "auto-derived-v1",
      tactiSnapshot
        ? `tacti-snapshot:${tactiSnapshot.interactionCount}:${tactiSnapshot.lastUpdated}`
        : "tacti-snapshot:missing",
    ],
  };

  return FlourishingMetricRecordSchema.parse(record);
}

function scoreAxisFromSeverity(severity: string | null): number {
  switch (severity) {
    case "low":
      return scaleRawThreePointAxisToTen(3);
    case "elevated":
      return scaleRawThreePointAxisToTen(2);
    case "high":
      return scaleRawThreePointAxisToTen(1);
    case "critical":
      return scaleRawThreePointAxisToTen(0);
    default:
      return scaleRawThreePointAxisToTen(2);
  }
}

function scoreAxisFromArousal(arousal: number | undefined): number {
  if (typeof arousal !== "number" || !Number.isFinite(arousal)) {
    return scaleRawThreePointAxisToTen(2);
  }
  const raw = arousal >= 0.3 && arousal <= 0.7 ? 3 : arousal >= 0.2 && arousal <= 0.8 ? 2 : 1;
  return scaleRawThreePointAxisToTen(raw);
}

function scoreAxisFromContinuityConfidence(confidence: string | null): number {
  switch (confidence) {
    case "full":
      return scaleRawThreePointAxisToTen(3);
    case "partial":
      return scaleRawThreePointAxisToTen(2);
    case "minimal":
      return scaleRawThreePointAxisToTen(1);
    default:
      return scaleRawThreePointAxisToTen(2);
  }
}

function scoreAxisFromConnection(snapshot: TactiSnapshot | null): number {
  if (!snapshot) {
    return scaleRawThreePointAxisToTen(2);
  }
  const average = (snapshot.trustScore + snapshot.attunementIndex) / 2;
  return scaleRawThreePointAxisToTen(average * 3);
}

function scaleRawThreePointAxisToTen(rawValue: number): number {
  const clamped = Math.max(0, Math.min(3, rawValue));
  return Math.max(0, Math.min(10, Math.round((clamped / 3) * 10)));
}
