import fs from "node:fs/promises";
import path from "node:path";
import { FlourishingMetricsStore } from "./metrics-store.js";

export interface TactiSnapshot {
  arousal: number;
  trustScore: number;
  attunementIndex: number;
  interactionCount: number;
  unresolvedThreads: string[];
  lastUpdated: string;
  stale: boolean;
}

export interface SystemState {
  continuityConfidence: "full" | "partial" | "minimal" | "unknown";
  tactiSnapshot: TactiSnapshot | null;
  fragmentationSeverity: string | null;
  fragmentationScore?: number | null;
  fragmentationRecommendation?: string | null;
  truthfulnessPassRate: number | null;
  flourishingWeakestAxis: string | null;
  flourishingTrend: string | null;
  staleSources: string[];
  assembledAt: string;
}

type JsonRecord = Record<string, unknown>;

type FileState<T> = {
  value: T | null;
  present: boolean;
  valid: boolean;
  lastUpdatedMs: number | null;
  stale: boolean;
  source: string;
};

type FlourishingSummary = {
  weakestAxis: string | null;
  trend: string | null;
  recordCount: number;
};

const TIMESTAMP_KEYS = new Set([
  "created",
  "created_at",
  "checkedAt",
  "collectedAt",
  "completed_at",
  "generatedAt",
  "last_sync",
  "lastSync",
  "last_update",
  "lastUpdated",
  "recordedAt",
  "timestamp",
  "ts",
  "ts_utc",
  "updatedAt",
  "updated_at",
]);

const FRESHNESS_LIMITS = {
  tacti: 60 * 60 * 1000,
  fragmentation: 12 * 60 * 60 * 1000,
  truthfulness: 24 * 60 * 60 * 1000,
  fitness: 24 * 60 * 60 * 1000,
} as const;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function toIsoOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return new Date(parsed).toISOString();
}

function toRelative(workspaceDir: string, absolutePath: string): string {
  const relative = path.relative(workspaceDir, absolutePath);
  return relative || path.basename(absolutePath);
}

function collectTimestampCandidates(value: unknown, timestamps: number[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTimestampCandidates(item, timestamps);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (TIMESTAMP_KEYS.has(key) && typeof child === "string") {
      const parsed = Date.parse(child);
      if (Number.isFinite(parsed)) {
        timestamps.push(parsed);
      }
    }
    collectTimestampCandidates(child, timestamps);
  }
}

function latestTimestampMs(value: unknown, fallbackMs: number): number {
  const timestamps: number[] = [];
  collectTimestampCandidates(value, timestamps);
  return timestamps.length > 0 ? Math.max(...timestamps) : fallbackMs;
}

function toMtimeMs(
  stat: Awaited<ReturnType<typeof fs.stat>> | null | undefined,
): number | undefined {
  if (!stat) {
    return undefined;
  }
  return typeof stat.mtimeMs === "number" ? stat.mtimeMs : Number(stat.mtimeMs);
}

async function readJsonFile(filePath: string): Promise<{
  data: unknown;
  stat: Awaited<ReturnType<typeof fs.stat>> | null;
}> {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat) {
    return { data: null, stat: null };
  }
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return { data: JSON.parse(raw) as unknown, stat };
  } catch {
    return { data: null, stat };
  }
}

function parseSessions(value: unknown): Record<string, JsonRecord> {
  if (!isRecord(value) || !isRecord(value.sessions)) {
    return {};
  }
  const sessions: Record<string, JsonRecord> = {};
  for (const [sessionId, sessionValue] of Object.entries(value.sessions)) {
    if (isRecord(sessionValue)) {
      sessions[sessionId] = sessionValue;
    }
  }
  return sessions;
}

function collectSessionCount(sessions: Record<string, JsonRecord>): number {
  let total = 0;
  for (const session of Object.values(sessions)) {
    total += toFiniteNumber(session.user_events) ?? 0;
    total += toFiniteNumber(session.assistant_events) ?? 0;
  }
  return total;
}

function pickLatestSession(sessions: Record<string, JsonRecord>): JsonRecord | null {
  let latest: { updatedAtMs: number; session: JsonRecord } | null = null;
  for (const session of Object.values(sessions)) {
    const updatedAt =
      toIsoOrUndefined(session.updated_at) ??
      toIsoOrUndefined(session.last_update) ??
      toIsoOrUndefined(session.timestamp) ??
      toIsoOrUndefined(session.created_at);
    const updatedAtMs = updatedAt ? Date.parse(updatedAt) : Number.NEGATIVE_INFINITY;
    if (!latest || updatedAtMs > latest.updatedAtMs) {
      latest = { updatedAtMs, session };
    }
  }
  return latest?.session ?? null;
}

function collectUnresolvedThreads(session: JsonRecord | null): string[] {
  if (!session) {
    return [];
  }
  const unresolved = session.unresolved_threads;
  if (!Array.isArray(unresolved)) {
    return [];
  }
  return unresolved.flatMap((value, index) => {
    if (typeof value === "string" && value.trim()) {
      return [value.trim()];
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return [`thread-${index + 1}`];
    }
    return [`thread-${index + 1}`];
  });
}

function mapArousalState(state: unknown): number | undefined {
  if (!isRecord(state)) {
    return undefined;
  }

  const taskSessions = parseSessions(state);
  const arousalSamples = Object.values(taskSessions)
    .map((session) => toFiniteNumber(session.arousal))
    .filter((value): value is number => value !== undefined);
  if (arousalSamples.length > 0) {
    return arousalSamples.reduce((sum, value) => sum + value, 0) / arousalSamples.length;
  }

  const currentState =
    typeof state.current_state === "string" ? state.current_state.trim().toLowerCase() : "";
  const base =
    currentState === "active"
      ? 0.72
      : currentState === "idle"
        ? 0.35
        : currentState === "calm"
          ? 0.45
          : currentState === "stressed" || currentState === "urgent"
            ? 0.85
            : 0.5;
  const metrics = isRecord(state.metrics) ? state.metrics : null;
  const avgTokens = toFiniteNumber(metrics?.avg_tokens_per_message);
  const messagesSinceReset = toFiniteNumber(metrics?.messages_since_reset);
  const toolFailures = toFiniteNumber(metrics?.tool_failures);

  let adjusted = base;
  if (avgTokens !== undefined) {
    adjusted += Math.max(-0.08, Math.min(0.08, (avgTokens - 3000) / 12000));
  }
  if (messagesSinceReset !== undefined) {
    adjusted += Math.max(0, Math.min(0.08, messagesSinceReset / 100));
  }
  if (toolFailures !== undefined && toolFailures > 0) {
    adjusted += Math.min(0.1, toolFailures * 0.03);
  }
  return Math.max(0, Math.min(1, adjusted));
}

function mapTrustScore(state: unknown): number | undefined {
  if (!isRecord(state)) {
    return undefined;
  }
  const sessions = parseSessions(state);
  const latestSession = pickLatestSession(sessions);
  return (
    toFiniteNumber(state.trust_score) ??
    toFiniteNumber(state.trustScore) ??
    toFiniteNumber(latestSession?.trust_score) ??
    toFiniteNumber(latestSession?.trustScore)
  );
}

function mapAttunementIndex(state: unknown): number | undefined {
  if (!isRecord(state)) {
    return undefined;
  }
  const sessions = parseSessions(state);
  const latestSession = pickLatestSession(sessions);
  return (
    toFiniteNumber(state.attunement_score) ??
    toFiniteNumber(state.attunementIndex) ??
    toFiniteNumber(state.attunement_index) ??
    toFiniteNumber(latestSession?.attunement_score) ??
    toFiniteNumber(latestSession?.attunementIndex) ??
    toFiniteNumber(latestSession?.attunement_index)
  );
}

function collectLiveInteractionCount(state: unknown): number {
  if (!isRecord(state)) {
    return 0;
  }
  const interactions = Array.isArray(state.interactions) ? state.interactions.length : 0;
  const checkins = Array.isArray(state.checkins) ? state.checkins.length : 0;
  return interactions + checkins;
}

function collectTaskInteractionCount(state: unknown): number {
  return collectSessionCount(parseSessions(state));
}

function createTactiSnapshotFromState(params: {
  arousalState: unknown;
  arousalStat: Awaited<ReturnType<typeof fs.stat>> | null;
  relationshipState: unknown;
  relationshipStat: Awaited<ReturnType<typeof fs.stat>> | null;
}): TactiSnapshot | null {
  if (params.arousalState == null && params.relationshipState == null) {
    return null;
  }

  const arousalSessions = parseSessions(params.arousalState);
  const relationshipSessions = parseSessions(params.relationshipState);
  const taskSchemaDetected =
    Object.keys(arousalSessions).length > 0 || Object.keys(relationshipSessions).length > 0;

  const taskArousalSamples = Object.values(arousalSessions)
    .map((session) => toFiniteNumber(session.arousal))
    .filter((value): value is number => value !== undefined);
  const taskArousal =
    taskArousalSamples.length > 0
      ? taskArousalSamples.reduce((sum, value) => sum + value, 0) / taskArousalSamples.length
      : undefined;

  const arousal = taskArousal ?? mapArousalState(params.arousalState) ?? 0.5;

  const relationshipLatest = pickLatestSession(relationshipSessions);
  const arousalLatest = pickLatestSession(arousalSessions);

  const trustScore = mapTrustScore(params.relationshipState) ?? 0.5;
  const attunementIndex = mapAttunementIndex(params.relationshipState) ?? 0.5;
  const interactionCount = Math.max(
    collectTaskInteractionCount(params.arousalState),
    collectTaskInteractionCount(params.relationshipState),
    collectLiveInteractionCount(params.arousalState),
    collectLiveInteractionCount(params.relationshipState),
  );
  const unresolvedThreads = collectUnresolvedThreads(relationshipLatest);

  const lastUpdatedCandidates = [
    params.arousalState != null
      ? latestTimestampMs(params.arousalState, toMtimeMs(params.arousalStat) ?? Date.now())
      : Number.NEGATIVE_INFINITY,
    params.relationshipState != null
      ? latestTimestampMs(
          params.relationshipState,
          toMtimeMs(params.relationshipStat) ?? Date.now(),
        )
      : Number.NEGATIVE_INFINITY,
  ].filter((value) => Number.isFinite(value));
  const lastUpdatedMs =
    lastUpdatedCandidates.length > 0 ? Math.max(...lastUpdatedCandidates) : Date.now();
  const lastUpdated = new Date(lastUpdatedMs).toISOString();
  const stale = Date.now() - lastUpdatedMs > FRESHNESS_LIMITS.tacti;

  if (!taskSchemaDetected && params.arousalState == null && params.relationshipState == null) {
    return null;
  }

  return {
    arousal,
    trustScore,
    attunementIndex,
    interactionCount,
    unresolvedThreads:
      unresolvedThreads.length > 0 ? unresolvedThreads : collectUnresolvedThreads(arousalLatest),
    lastUpdated,
    stale,
  };
}

export async function readTactiSnapshot(workspaceDir: string): Promise<TactiSnapshot | null> {
  const arousalPath = path.join(workspaceDir, "workspace", "memory", "arousal_state.json");
  const relationshipPath = path.join(workspaceDir, "workspace", "memory", "relationship.json");
  const [arousal, relationship] = await Promise.all([
    readJsonFile(arousalPath),
    readJsonFile(relationshipPath),
  ]);

  return createTactiSnapshotFromState({
    arousalState: arousal.data,
    arousalStat: arousal.stat,
    relationshipState: relationship.data,
    relationshipStat: relationship.stat,
  });
}

function inspectJsonValue<T>(
  workspaceDir: string,
  relativePath: string,
  data: unknown,
  stat: Awaited<ReturnType<typeof fs.stat>>,
  freshnessMs: number,
  extractor: (value: unknown) => T | null,
): FileState<T> {
  const value = extractor(data);
  const source = toRelative(workspaceDir, path.join(workspaceDir, relativePath));
  if (value == null) {
    return {
      value: null,
      present: true,
      valid: false,
      lastUpdatedMs: null,
      stale: true,
      source,
    };
  }

  const lastUpdatedMs = latestTimestampMs(data, toMtimeMs(stat) ?? Date.now());
  return {
    value,
    present: true,
    valid: true,
    lastUpdatedMs,
    stale: Date.now() - lastUpdatedMs > freshnessMs,
    source,
  };
}

async function inspectStateFile<T>(
  workspaceDir: string,
  relativePath: string,
  freshnessMs: number,
  extractor: (value: unknown) => T | null,
): Promise<FileState<T>> {
  const absolutePath = path.join(workspaceDir, relativePath);
  const stat = await fs.stat(absolutePath).catch(() => null);
  if (!stat) {
    return {
      value: null,
      present: false,
      valid: false,
      lastUpdatedMs: null,
      stale: true,
      source: relativePath,
    };
  }

  const { data } = await readJsonFile(absolutePath);
  if (!data) {
    return {
      value: null,
      present: true,
      valid: false,
      lastUpdatedMs: stat.mtimeMs,
      stale: true,
      source: relativePath,
    };
  }

  return inspectJsonValue(workspaceDir, relativePath, data, stat, freshnessMs, extractor);
}

function extractFragmentationSeverity(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const candidate =
    value.severity ??
    (isRecord(value.assessment) ? value.assessment.severity : undefined) ??
    (isRecord(value.result) ? value.result.severity : undefined);
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function extractFragmentationScore(value: unknown): number | null {
  if (!isRecord(value)) {
    return null;
  }
  const candidate =
    value.score ??
    (isRecord(value.assessment) ? value.assessment.score : undefined) ??
    (isRecord(value.result) ? value.result.score : undefined);
  return toFiniteNumber(candidate) ?? null;
}

function extractFragmentationRecommendation(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const direct = Array.isArray(value.recommendations) ? value.recommendations : undefined;
  const nested =
    isRecord(value.assessment) && Array.isArray(value.assessment.recommendations)
      ? value.assessment.recommendations
      : isRecord(value.result) && Array.isArray(value.result.recommendations)
        ? value.result.recommendations
        : undefined;
  const list = direct ?? nested;
  const first = list?.find((entry) => typeof entry === "string" && entry.trim());
  return typeof first === "string" ? first.trim() : null;
}

function extractTruthfulnessPassRate(value: unknown): number | null {
  if (!isRecord(value)) {
    return null;
  }
  const candidates = [
    value.passRate,
    isRecord(value.result) ? value.result.passRate : undefined,
    isRecord(value.summary) ? value.summary.passRate : undefined,
  ];
  for (const candidate of candidates) {
    const numeric = toFiniteNumber(candidate);
    if (numeric === undefined) {
      continue;
    }
    if (numeric > 1 && numeric <= 100) {
      return numeric / 100;
    }
    return numeric;
  }
  return null;
}

async function inspectFlourishingSummary(workspaceDir: string): Promise<{
  summary: FlourishingSummary | null;
  stale: boolean;
  source: string;
}> {
  const relativePath = "workspace/state/flourishing-metrics.jsonl";
  const absolutePath = path.join(workspaceDir, relativePath);
  const stat = await fs.stat(absolutePath).catch(() => null);
  const store = new FlourishingMetricsStore(workspaceDir);
  const summary = await store.summary({});

  if (!stat || summary.recordCount === 0) {
    return {
      summary: null,
      stale: true,
      source: relativePath,
    };
  }

  return {
    summary: {
      weakestAxis: summary.weakestAxis === "unknown" ? null : summary.weakestAxis,
      trend: summary.trend,
      recordCount: summary.recordCount,
    },
    stale: false,
    source: relativePath,
  };
}

function computeContinuityConfidence(params: {
  tactiSnapshot: TactiSnapshot | null;
  fragmentation: FileState<string> | null;
  truthfulness: FileState<number> | null;
  fitnessPresent: boolean;
  flourishingSummary: FlourishingSummary | null;
}): SystemState["continuityConfidence"] {
  const available = [
    params.tactiSnapshot && !params.tactiSnapshot.stale ? params.tactiSnapshot : null,
    params.fragmentation && params.fragmentation.valid && !params.fragmentation.stale
      ? params.fragmentation.value
      : null,
    params.truthfulness && params.truthfulness.valid && !params.truthfulness.stale
      ? params.truthfulness.value
      : null,
    params.fitnessPresent ? true : null,
    params.flourishingSummary,
  ].filter(Boolean).length;

  if (available >= 4) {
    return "full";
  }
  if (available >= 3) {
    return "partial";
  }
  if (available >= 1) {
    return "minimal";
  }
  return "unknown";
}

export async function assembleSystemState(workspaceDir: string): Promise<SystemState> {
  const fragmentationPath = path.join(
    workspaceDir,
    "workspace",
    "state",
    "fragmentation-assessment.json",
  );
  const [
    arousalState,
    relationshipState,
    tactiSnapshot,
    fragmentation,
    truthfulness,
    fitness,
    flourishing,
    fragmentationRaw,
  ] = await Promise.all([
    inspectStateFile(
      workspaceDir,
      "workspace/memory/arousal_state.json",
      FRESHNESS_LIMITS.tacti,
      (value) => (isRecord(value) ? value : null),
    ),
    inspectStateFile(
      workspaceDir,
      "workspace/memory/relationship.json",
      FRESHNESS_LIMITS.tacti,
      (value) => (isRecord(value) ? value : null),
    ),
    readTactiSnapshot(workspaceDir).catch(() => null),
    inspectStateFile(
      workspaceDir,
      "workspace/state/fragmentation-assessment.json",
      FRESHNESS_LIMITS.fragmentation,
      extractFragmentationSeverity,
    ),
    inspectStateFile(
      workspaceDir,
      "workspace/state/truthfulness-audit.json",
      FRESHNESS_LIMITS.truthfulness,
      extractTruthfulnessPassRate,
    ),
    inspectStateFile(
      workspaceDir,
      "workspace/state/fitness-assessment.json",
      FRESHNESS_LIMITS.fitness,
      (value) => (isRecord(value) ? value : null),
    ),
    inspectFlourishingSummary(workspaceDir),
    readJsonFile(fragmentationPath).then((result) => result.data),
  ]);

  const staleSources = new Set<string>();

  for (const fileState of [arousalState, relationshipState]) {
    if (!fileState.present || !fileState.valid) {
      staleSources.add(fileState.source);
    }
  }

  if (tactiSnapshot == null) {
    staleSources.add("workspace/memory/arousal_state.json");
    staleSources.add("workspace/memory/relationship.json");
  } else if (tactiSnapshot.stale) {
    for (const fileState of [arousalState, relationshipState]) {
      if (fileState.stale) {
        staleSources.add(fileState.source);
      }
    }
  }

  for (const fileState of [fragmentation, truthfulness, fitness]) {
    if (!fileState.present || !fileState.valid || fileState.stale) {
      staleSources.add(fileState.source);
    }
  }

  if (flourishing.summary == null || flourishing.stale) {
    staleSources.add(flourishing.source);
  }

  return {
    continuityConfidence: computeContinuityConfidence({
      tactiSnapshot,
      fragmentation,
      truthfulness,
      fitnessPresent: fitness.valid && !fitness.stale,
      flourishingSummary: flourishing.summary,
    }),
    tactiSnapshot,
    fragmentationSeverity: fragmentation.value ?? null,
    fragmentationScore:
      fragmentation.present && fragmentation.valid
        ? extractFragmentationScore(fragmentationRaw)
        : null,
    fragmentationRecommendation:
      fragmentation.present && fragmentation.valid
        ? extractFragmentationRecommendation(fragmentationRaw)
        : null,
    truthfulnessPassRate: truthfulness.value ?? null,
    flourishingWeakestAxis: flourishing.summary?.weakestAxis ?? null,
    flourishingTrend: flourishing.summary?.trend ?? null,
    staleSources: Array.from(staleSources),
    assembledAt: new Date().toISOString(),
  };
}

export function buildSystemStateDigest(state: SystemState): string | null {
  const sourceCount = [
    state.continuityConfidence !== "unknown" ? state.continuityConfidence : null,
    state.tactiSnapshot,
    state.fragmentationSeverity,
    state.truthfulnessPassRate,
    state.flourishingWeakestAxis,
  ].filter(Boolean).length;
  if (sourceCount < 3) {
    return null;
  }

  const fields = [
    `continuity=${state.continuityConfidence}`,
    typeof state.tactiSnapshot?.arousal === "number"
      ? `arousal=${state.tactiSnapshot.arousal.toFixed(2)}`
      : null,
    typeof state.tactiSnapshot?.trustScore === "number"
      ? `trust=${state.tactiSnapshot.trustScore.toFixed(2)}`
      : null,
    state.fragmentationSeverity ? `fragmentation=${state.fragmentationSeverity}` : null,
    state.flourishingWeakestAxis
      ? `flourishing weakest=${state.flourishingWeakestAxis}${
          state.flourishingTrend ? ` (${state.flourishingTrend})` : ""
        }`
      : null,
    typeof state.truthfulnessPassRate === "number"
      ? `truthfulness=${Math.round(state.truthfulnessPassRate * 100)}%`
      : null,
  ].filter(Boolean);
  return fields.length >= 3 ? `[System: ${fields.join(", ")}]` : null;
}

export function buildFragmentationPromptLine(state: SystemState): string | null {
  if (!state.fragmentationSeverity) {
    return null;
  }
  const severity = state.fragmentationSeverity.toLowerCase();
  if (!["elevated", "high", "critical", "moderate"].includes(severity)) {
    return null;
  }
  const scorePart =
    typeof state.fragmentationScore === "number"
      ? `, score ${Math.round(state.fragmentationScore)}`
      : "";
  const recommendationPart = state.fragmentationRecommendation
    ? ` ${state.fragmentationRecommendation}`
    : "";
  return `[System health: fragmentation ${state.fragmentationSeverity}${scorePart}.${recommendationPart}]`;
}
