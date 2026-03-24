import { z } from "zod";

export const FlourishingAxisSchema = z.enum([
  "coherence",
  "vitality",
  "agency",
  "truth_contact",
  "connection",
]);

export type FlourishingAxis = z.infer<typeof FlourishingAxisSchema>;

export const SessionBoundarySchema = z.enum(["session_open", "session_close", "check_in"]);
export type SessionBoundary = z.infer<typeof SessionBoundarySchema>;

export const FeltSenseTextureSchema = z.enum([
  "settled",
  "alive",
  "clear",
  "tense",
  "foggy",
  "resistant",
  "open",
  "contracted",
]);

export const FeltSenseStateSchema = z.object({
  boundary: SessionBoundarySchema,
  timestamp: z.string().datetime(),
  feltShift: z.number().int().min(-3).max(3).default(0),
  energy: z.number().int().min(0).max(10),
  clarity: z.number().int().min(0).max(10),
  emotionalLoad: z.number().int().min(0).max(10),
  textures: z.array(FeltSenseTextureSchema).max(4).default([]),
  bodyAnchor: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().min(1).max(400).optional(),
});

export type FeltSenseState = z.infer<typeof FeltSenseStateSchema>;

export function createFeltSenseState(input: FeltSenseState): FeltSenseState {
  return FeltSenseStateSchema.parse(input);
}

export const ProjectPhaseSchema = z.enum(["incubating", "active", "stalled", "drifting"]);
export type ProjectPhase = z.infer<typeof ProjectPhaseSchema>;

export const ProjectStateSnapshotSchema = z.object({
  projectKey: z.string().trim().min(1).max(120),
  timestamp: z.string().datetime(),
  lastMeaningfulTouch: z.string().datetime(),
  momentum: z.number().int().min(0).max(10),
  clarity: z.number().int().min(0).max(10),
  pull: z.number().int().min(0).max(10),
  evidenceOfProgress: z.number().int().min(0).max(10),
  driftSignals: z.array(z.string().trim().min(1).max(120)).max(6).default([]),
  incubationQuestion: z.string().trim().min(1).max(240).optional(),
});

export type ProjectStateSnapshot = z.infer<typeof ProjectStateSnapshotSchema>;

export function classifyProjectPhase(snapshot: ProjectStateSnapshot): ProjectPhase {
  const parsed = ProjectStateSnapshotSchema.parse(snapshot);
  const daysSinceTouch = elapsedDays(parsed.lastMeaningfulTouch, parsed.timestamp);

  if (
    parsed.pull >= 6 &&
    parsed.clarity <= 5 &&
    parsed.evidenceOfProgress <= 4 &&
    parsed.incubationQuestion
  ) {
    return "incubating";
  }

  if (
    parsed.momentum >= 6 &&
    parsed.clarity >= 6 &&
    parsed.evidenceOfProgress >= 5 &&
    parsed.driftSignals.length <= 1
  ) {
    return "active";
  }

  if (parsed.driftSignals.length >= 2 || (daysSinceTouch >= 7 && parsed.momentum <= 4)) {
    return "drifting";
  }

  return "stalled";
}

export const FlourishingMetricRecordSchema = z.object({
  metricKey: z.string().trim().min(1).max(120),
  timestamp: z.string().datetime(),
  source: z.enum(["self_report", "session_observation", "derived"]),
  scores: z.object({
    coherence: z.number().int().min(0).max(10),
    vitality: z.number().int().min(0).max(10),
    agency: z.number().int().min(0).max(10),
    truth_contact: z.number().int().min(0).max(10),
    connection: z.number().int().min(0).max(10),
  }),
  evidence: z.array(z.string().trim().min(1).max(160)).min(1).max(6),
  linkedProject: z.string().trim().min(1).max(120).optional(),
  linkedSessionBoundary: SessionBoundarySchema.optional(),
});

export type FlourishingMetricRecord = z.infer<typeof FlourishingMetricRecordSchema>;

export function summarizeFlourishing(record: FlourishingMetricRecord) {
  const parsed = FlourishingMetricRecordSchema.parse(record);
  const values = Object.values(parsed.scores);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const weakestAxis = Object.entries(parsed.scores).toSorted((a, b) => a[1] - b[1])[0]?.[0] as
    | FlourishingAxis
    | undefined;

  return {
    average,
    weakestAxis,
    belowThreshold: Object.entries(parsed.scores)
      .filter(([, value]) => value <= 4)
      .map(([axis]) => axis as FlourishingAxis),
  };
}

function elapsedDays(startIso: string, endIso: string): number {
  const elapsedMs = new Date(endIso).getTime() - new Date(startIso).getTime();
  return elapsedMs / (1000 * 60 * 60 * 24);
}
