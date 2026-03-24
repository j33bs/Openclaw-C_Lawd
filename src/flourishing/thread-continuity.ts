import { z } from "zod";

const ScoreSchema = z.number().int().min(0).max(10);

export const ThreadTouchKindSchema = z.enum(["anchor", "progress", "repair", "drift"]);
export type ThreadTouchKind = z.infer<typeof ThreadTouchKindSchema>;

export const ThreadTouchSchema = z.object({
  threadKey: z.string().trim().min(1).max(160),
  timestamp: z.string().datetime(),
  kind: ThreadTouchKindSchema,
  anchor: z.string().trim().min(1).max(240),
  salience: ScoreSchema,
  coherence: ScoreSchema,
  novelty: ScoreSchema,
  evidence: z.array(z.string().trim().min(1).max(160)).min(1).max(6),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  openLoops: z.array(z.string().trim().min(1).max(120)).max(8).default([]),
});

export type ThreadTouch = z.infer<typeof ThreadTouchSchema>;

export const ThreadContinuitySnapshotSchema = z.object({
  timestamp: z.string().datetime(),
  threadKey: z.string().trim().min(1).max(160),
  activeProjects: z.array(z.string().trim().min(1).max(120)).max(8).default([]),
  touches: z.array(ThreadTouchSchema).min(1).max(12),
});

export type ThreadContinuitySnapshot = z.infer<typeof ThreadContinuitySnapshotSchema>;

export const InteractionFingerprintSchema = z.object({
  timestamp: z.string().datetime(),
  intent: z.string().trim().min(1).max(80),
  anchor: z.string().trim().min(1).max(240).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  depth: ScoreSchema.default(5),
});

export type InteractionFingerprint = z.infer<typeof InteractionFingerprintSchema>;

export const NoveltyGradientInputSchema = z.object({
  current: InteractionFingerprintSchema,
  recent: z.array(InteractionFingerprintSchema).max(8).default([]),
});

export type NoveltyGradientInput = z.infer<typeof NoveltyGradientInputSchema>;

export const AntiFragmentationInputSchema = z.object({
  timestamp: z.string().datetime(),
  continuityCoverage: ScoreSchema,
  duplicateClarificationRate: z.number().min(0).max(1),
  unresolvedThreads: z.number().int().min(0).max(12),
  driftSignals: z.array(z.string().trim().min(1).max(120)).max(8).default([]),
  daysSinceMeaningfulTouch: z.number().min(0).max(365),
  crossSurfaceMismatchCount: z.number().int().min(0).max(12).default(0),
  contextSwitches: z.number().int().min(0).max(24).default(0),
});

export type AntiFragmentationInput = z.infer<typeof AntiFragmentationInputSchema>;

export type ScoredDimension = {
  score: number;
  band: "low" | "watch" | "healthy" | "strong";
  reasons: string[];
};

export type NoveltyGradient = {
  score: number;
  band: "flat" | "steady" | "fresh" | "spiky";
  reasons: string[];
};

export type FragmentationSeverity = "low" | "elevated" | "high" | "critical";

export type FragmentationAssessment = {
  pressure: number;
  severity: FragmentationSeverity;
  reasons: string[];
  nextActions: string[];
};

export type ThreadContinuityReport = {
  threadKey: string;
  generatedAt: string;
  connection: ScoredDimension;
  novelty: NoveltyGradient;
  fragmentation: FragmentationAssessment;
};

export function scoreConnectionToWhatMatters(snapshot: ThreadContinuitySnapshot): ScoredDimension {
  const parsed = ThreadContinuitySnapshotSchema.parse(snapshot);
  const orderedTouches = [...parsed.touches].toSorted(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const anchorTouches = orderedTouches.filter((touch) => touch.kind === "anchor");
  const latestTouch = orderedTouches[0];
  const latestAnchor = anchorTouches[0];
  const avgSalience = average(orderedTouches.map((touch) => touch.salience));
  const avgCoherence = average(orderedTouches.map((touch) => touch.coherence));
  const daysSinceAnchor = latestAnchor
    ? elapsedDays(latestAnchor.timestamp, parsed.timestamp)
    : Number.POSITIVE_INFINITY;
  const openLoops = new Set(orderedTouches.flatMap((touch) => touch.openLoops));

  let score = Math.round(
    avgSalience * 0.45 + avgCoherence * 0.35 + Math.min(anchorTouches.length, 3),
  );
  const reasons: string[] = [];

  if (latestAnchor) {
    reasons.push(`latest anchor ${formatDays(daysSinceAnchor)} old`);
  } else {
    score -= 3;
    reasons.push("no explicit anchor to what matters");
  }

  if (daysSinceAnchor > 3) {
    score -= 2;
    reasons.push("anchor is stale");
  }

  if (openLoops.size >= 4) {
    score -= 1;
    reasons.push("many open loops are still unresolved");
  }

  if (latestTouch.kind === "progress" || latestTouch.kind === "repair") {
    score += 1;
    reasons.push(`recent ${latestTouch.kind} touch present`);
  }

  if (parsed.activeProjects.length > 0) {
    reasons.push(`linked to ${parsed.activeProjects.length} active project(s)`);
  }

  return {
    score: clampScore(score),
    band: scoreBand(clampScore(score)),
    reasons,
  };
}

export function scoreNoveltyGradient(input: NoveltyGradientInput): NoveltyGradient {
  const parsed = NoveltyGradientInputSchema.parse(input);
  if (parsed.recent.length === 0) {
    return { score: 6, band: "fresh", reasons: ["no recent interaction baseline"] };
  }

  const comparisons = parsed.recent.map((prior) => compareInteractions(parsed.current, prior));
  const avgTagOverlap = average(comparisons.map((item) => item.tagOverlap));
  const avgAnchorOverlap = average(comparisons.map((item) => item.anchorOverlap));
  const avgDepthDelta = average(comparisons.map((item) => item.depthDelta));
  const repeatedIntent = comparisons.filter((item) => item.intentSame).length;

  let score = 5;
  score += Math.round((1 - avgTagOverlap) * 3);
  score += Math.round((1 - avgAnchorOverlap) * 2);
  score += Math.round(avgDepthDelta);

  const reasons: string[] = [];

  if (repeatedIntent >= Math.ceil(parsed.recent.length / 2)) {
    score -= 2;
    reasons.push("recent interactions repeat the same intent");
  }

  if (avgTagOverlap >= 0.8 && avgAnchorOverlap >= 0.8) {
    score -= 2;
    reasons.push("interaction pattern is highly repetitive");
  }

  if (avgTagOverlap <= 0.25 && avgDepthDelta >= 3) {
    score += 1;
    reasons.push("current move opens a meaningfully new angle");
  }

  const boundedScore = clampScore(score);
  if (reasons.length === 0) {
    reasons.push("novelty sits in the healthy middle range");
  }

  return {
    score: boundedScore,
    band: noveltyBand(boundedScore),
    reasons,
  };
}

export function detectFragmentationPressure(
  input: AntiFragmentationInput,
): FragmentationAssessment {
  const parsed = AntiFragmentationInputSchema.parse(input);
  let pressure = 0;
  const reasons: string[] = [];
  const nextActions: string[] = [];

  if (parsed.continuityCoverage <= 4) {
    pressure += 3;
    reasons.push("continuity coverage is thin");
    nextActions.push("refresh the continuity bundle before the next substantial reply");
  } else if (parsed.continuityCoverage <= 6) {
    pressure += 1;
    reasons.push("continuity coverage is partial");
  }

  if (parsed.duplicateClarificationRate >= 0.4) {
    pressure += 3;
    reasons.push("duplicate clarification rate is high");
    nextActions.push("collapse repeated asks into one explicit unresolved question list");
  } else if (parsed.duplicateClarificationRate >= 0.2) {
    pressure += 1;
    reasons.push("clarification churn is rising");
  }

  if (parsed.unresolvedThreads >= 4) {
    pressure += 2;
    reasons.push("too many unresolved threads are in flight");
    nextActions.push("pick one live thread and close or park the rest with receipts");
  } else if (parsed.unresolvedThreads >= 2) {
    pressure += 1;
    reasons.push("multiple open threads remain active");
  }

  if (parsed.daysSinceMeaningfulTouch >= 7) {
    pressure += 2;
    reasons.push("too long since a meaningful touch on the active thread");
    nextActions.push("re-anchor the thread to what matters before expanding scope");
  } else if (parsed.daysSinceMeaningfulTouch >= 3) {
    pressure += 1;
    reasons.push("meaningful touch is getting stale");
  }

  if (parsed.driftSignals.length >= 3) {
    pressure += 2;
    reasons.push("several drift signals are present");
  } else if (parsed.driftSignals.length >= 1) {
    pressure += 1;
    reasons.push("drift signals have started to appear");
  }

  if (parsed.crossSurfaceMismatchCount >= 2) {
    pressure += 2;
    reasons.push("cross-surface truth mismatch is visible");
    nextActions.push("attach receipts or ids to the next stateful claim");
  } else if (parsed.crossSurfaceMismatchCount === 1) {
    pressure += 1;
    reasons.push("one cross-surface mismatch was observed");
  }

  if (parsed.contextSwitches >= 8) {
    pressure += 2;
    reasons.push("context switching is fragmenting the interaction");
    nextActions.push("narrow to one next action instead of branching further");
  } else if (parsed.contextSwitches >= 5) {
    pressure += 1;
    reasons.push("context switching is elevated");
  }

  const severity = fragmentationSeverity(pressure);
  if (nextActions.length === 0) {
    nextActions.push("maintain the current thread and keep receipts tight");
  }

  return { pressure, severity, reasons, nextActions };
}

export function buildThreadContinuityReport(params: {
  snapshot: ThreadContinuitySnapshot;
  novelty: NoveltyGradientInput;
  fragmentation: AntiFragmentationInput;
}): ThreadContinuityReport {
  const snapshot = ThreadContinuitySnapshotSchema.parse(params.snapshot);
  return {
    threadKey: snapshot.threadKey,
    generatedAt: snapshot.timestamp,
    connection: scoreConnectionToWhatMatters(snapshot),
    novelty: scoreNoveltyGradient(params.novelty),
    fragmentation: detectFragmentationPressure(params.fragmentation),
  };
}

function compareInteractions(current: InteractionFingerprint, prior: InteractionFingerprint) {
  const currentTags = new Set(current.tags.map(normalizeToken));
  const priorTags = new Set(prior.tags.map(normalizeToken));
  const currentAnchor = new Set(tokenize(current.anchor ?? current.intent));
  const priorAnchor = new Set(tokenize(prior.anchor ?? prior.intent));

  return {
    tagOverlap: jaccard(currentTags, priorTags),
    anchorOverlap: jaccard(currentAnchor, priorAnchor),
    depthDelta: Math.min(Math.abs(current.depth - prior.depth), 4),
    intentSame: normalizeToken(current.intent) === normalizeToken(prior.intent),
  };
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function elapsedDays(startIso: string, endIso: string): number {
  const elapsedMs = new Date(endIso).getTime() - new Date(startIso).getTime();
  return elapsedMs / (1000 * 60 * 60 * 24);
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(10, Math.round(score)));
}

function scoreBand(score: number): ScoredDimension["band"] {
  if (score <= 2) {
    return "low";
  }
  if (score <= 5) {
    return "watch";
  }
  if (score <= 7) {
    return "healthy";
  }
  return "strong";
}

function noveltyBand(score: number): NoveltyGradient["band"] {
  if (score <= 2) {
    return "flat";
  }
  if (score <= 5) {
    return "steady";
  }
  if (score <= 8) {
    return "fresh";
  }
  return "spiky";
}

function fragmentationSeverity(pressure: number): FragmentationSeverity {
  if (pressure <= 2) {
    return "low";
  }
  if (pressure <= 5) {
    return "elevated";
  }
  if (pressure <= 8) {
    return "high";
  }
  return "critical";
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) {
    return 1;
  }

  const intersection = [...left].filter((value) => right.has(value)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function formatDays(days: number): string {
  if (!Number.isFinite(days)) {
    return "unknown";
  }
  if (days < 1) {
    return "<1 day";
  }
  return `${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"}`;
}
