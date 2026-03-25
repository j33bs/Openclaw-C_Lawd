import fs from "node:fs/promises";
import path from "node:path";
import { resolveUserTimezone } from "../agents/date-time.js";
import { isFileMissingError } from "../memory/fs-utils.js";

export interface TactiSnapshot {
  arousal: number;
  trustScore: number;
  attunementIndex: number;
  interactionCount: number;
  unresolvedThreads: string[];
  lastUpdated: string;
  stale: boolean;
}

type FileStatus =
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "ok"; data: Record<string, unknown>; mtimeMs: number };

type LoadedState = {
  sessions: Record<string, Record<string, unknown>>;
  updatedAt?: string;
};

type LegacyArousalState = {
  arousal?: number;
  interactionCount: number;
  updatedAt?: string;
};

type LegacyRelationshipState = {
  trustScore?: number;
  attunementIndex?: number;
  unresolvedThreads: string[];
  interactionCount: number;
  updatedAt?: string;
};

const ONE_HOUR_MS = 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
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
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  return new Date(parsed).toISOString();
}

function currentTimeZone(): string {
  try {
    return resolveUserTimezone();
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }
}

function formatDateKey(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const map: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== "literal") {
        map[part.type] = part.value;
      }
    }
    if (map.year && map.month && map.day) {
      return `${map.year}-${map.month}-${map.day}`;
    }
  } catch {
    // Fall through to UTC formatting.
  }
  return date.toISOString().slice(0, 10);
}

function resolveRecentDateKeys(now = new Date()): { today: string; yesterday: string } {
  const timeZone = currentTimeZone();
  return {
    today: formatDateKey(now, timeZone),
    yesterday: formatDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000), timeZone),
  };
}

async function readJsonFile(filePath: string): Promise<FileStatus> {
  try {
    const text = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(text);
    if (!isRecord(parsed)) {
      return { kind: "invalid" };
    }
    const stat = await fs.stat(filePath);
    return { kind: "ok", data: parsed, mtimeMs: stat.mtimeMs };
  } catch (err) {
    if (isFileMissingError(err)) {
      return { kind: "missing" };
    }
    return { kind: "invalid" };
  }
}

function parseSessions(
  state: Record<string, unknown> | undefined,
): Record<string, Record<string, unknown>> {
  const sessions = state?.sessions;
  if (!isRecord(sessions)) {
    return {};
  }
  const result: Record<string, Record<string, unknown>> = {};
  for (const [sessionId, sessionState] of Object.entries(sessions)) {
    if (isRecord(sessionState)) {
      result[sessionId] = sessionState;
    }
  }
  return result;
}

function resolveState(payload: FileStatus): LoadedState | null {
  if (payload.kind !== "ok") {
    return null;
  }
  return {
    sessions: parseSessions(payload.data),
    updatedAt: toIsoOrUndefined(payload.data.updated_at),
  };
}

function mapLegacyArousalState(state: Record<string, unknown> | undefined): LegacyArousalState {
  if (!state) {
    return { interactionCount: 0 };
  }
  const metrics = isRecord(state.metrics) ? state.metrics : undefined;
  const currentState =
    typeof state.current_state === "string" ? state.current_state.trim().toLowerCase() : "";
  const rawArousal =
    toFiniteNumber(state.arousal) ??
    toFiniteNumber(state.arousal_level) ??
    (currentState === "overloaded" || currentState === "stressed"
      ? 0.9
      : currentState === "active"
        ? 0.7
        : currentState === "idle" || currentState === "calm"
          ? 0.3
          : undefined);
  const interactionCount =
    toFiniteNumber(metrics?.total_messages) ?? toFiniteNumber(metrics?.messages_since_reset) ?? 0;
  const updatedAt =
    toIsoOrUndefined(state.updated_at) ??
    toIsoOrUndefined(state.last_update) ??
    (Array.isArray(state.transitions)
      ? state.transitions
          .map((entry) => (isRecord(entry) ? toIsoOrUndefined(entry.timestamp) : undefined))
          .find((value): value is string => Boolean(value))
      : undefined);
  return {
    arousal: rawArousal,
    interactionCount: Math.max(0, Math.floor(interactionCount)),
    updatedAt,
  };
}

function mapLegacyRelationshipState(
  state: Record<string, unknown> | undefined,
): LegacyRelationshipState {
  if (!state) {
    return { unresolvedThreads: [], interactionCount: 0 };
  }
  const interactions = Array.isArray(state.interactions) ? state.interactions : [];
  const unresolvedThreads = computeUnresolvedThreads(state);
  const interactionUpdatedAt = interactions
    .map((entry) => (isRecord(entry) ? toIsoOrUndefined(entry.timestamp) : undefined))
    .filter((value): value is string => Boolean(value))
    .toSorted()
    .at(-1);
  return {
    trustScore: toFiniteNumber(state.trust_score),
    attunementIndex:
      toFiniteNumber(state.attunement_index) ?? toFiniteNumber(state.attunement_score),
    unresolvedThreads,
    interactionCount: interactions.length,
    updatedAt:
      toIsoOrUndefined(state.updated_at) ?? interactionUpdatedAt ?? toIsoOrUndefined(state.created),
  };
}

function collectSessionCount(sessions: Record<string, Record<string, unknown>>): number {
  let total = 0;
  for (const sessionState of Object.values(sessions)) {
    const userEvents = toFiniteNumber(sessionState.user_events) ?? 0;
    const assistantEvents = toFiniteNumber(sessionState.assistant_events) ?? 0;
    total += userEvents + assistantEvents;
  }
  return total;
}

function collectArousal(sessions: Record<string, Record<string, unknown>>): number | undefined {
  const values: number[] = [];
  for (const sessionState of Object.values(sessions)) {
    const arousal = toFiniteNumber(sessionState.arousal);
    if (arousal !== undefined) {
      values.push(arousal);
    }
  }
  if (values.length === 0) {
    return undefined;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pickLatestSession(
  sessions: Record<string, Record<string, unknown>>,
): Record<string, unknown> | undefined {
  let latest: { updatedAtMs: number; session: Record<string, unknown> } | undefined;
  for (const sessionState of Object.values(sessions)) {
    const updatedAt = toIsoOrUndefined(sessionState.updated_at);
    const updatedAtMs = updatedAt ? Date.parse(updatedAt) : Number.NEGATIVE_INFINITY;
    if (!latest || updatedAtMs > latest.updatedAtMs) {
      latest = { updatedAtMs, session: sessionState };
    }
  }
  return latest?.session;
}

function collectUpdatedAtCandidates(
  loaded: Array<{ kind: "ok"; data: LoadedState; mtimeMs: number }>,
): string[] {
  const candidates: string[] = [];
  for (const entry of loaded) {
    const stateCandidates: string[] = [];
    if (entry.data.updatedAt) {
      stateCandidates.push(entry.data.updatedAt);
    }
    const latestSession = pickLatestSession(entry.data.sessions);
    const latestUpdatedAt = latestSession ? toIsoOrUndefined(latestSession.updated_at) : undefined;
    if (latestUpdatedAt) {
      stateCandidates.push(latestUpdatedAt);
    }
    if (stateCandidates.length > 0) {
      candidates.push(...stateCandidates);
    } else {
      candidates.push(new Date(entry.mtimeMs).toISOString());
    }
  }
  return candidates;
}

function computeUnresolvedThreads(sessionState: Record<string, unknown> | undefined): string[] {
  if (!sessionState) {
    return [];
  }
  const unresolved = sessionState.unresolved_threads;
  if (Array.isArray(unresolved)) {
    return unresolved.map((value, index) => {
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return `thread-${index + 1}`;
      }
      return `thread-${index + 1}`;
    });
  }
  const count = toFiniteNumber(unresolved);
  if (count && count > 0) {
    return Array.from({ length: Math.floor(count) }, (_, index) => `thread-${index + 1}`);
  }
  return [];
}

function maybeStale(lastUpdated: string): boolean {
  const parsed = Date.parse(lastUpdated);
  if (Number.isNaN(parsed)) {
    return false;
  }
  return Date.now() - parsed > ONE_HOUR_MS;
}

export async function readTactiSnapshot(workspaceDir: string): Promise<TactiSnapshot | null> {
  const workspaceMemoryDir = path.join(workspaceDir, "workspace", "memory");
  const arousalPath = path.join(workspaceMemoryDir, "arousal_state.json");
  const relationshipPath = path.join(workspaceMemoryDir, "relationship.json");

  const [arousalRaw, relationshipRaw] = await Promise.all([
    readJsonFile(arousalPath),
    readJsonFile(relationshipPath),
  ]);

  if (arousalRaw.kind === "invalid" || relationshipRaw.kind === "invalid") {
    return null;
  }

  if (arousalRaw.kind === "missing" && relationshipRaw.kind === "missing") {
    return null;
  }

  const arousalState = resolveState(arousalRaw);
  const relationshipState = resolveState(relationshipRaw);
  const legacyArousal =
    arousalRaw.kind === "ok" ? mapLegacyArousalState(arousalRaw.data) : { interactionCount: 0 };
  const legacyRelationship =
    relationshipRaw.kind === "ok"
      ? mapLegacyRelationshipState(relationshipRaw.data)
      : { unresolvedThreads: [], interactionCount: 0 };

  const arousalSessions = arousalState?.sessions ?? {};
  const relationshipSessions = relationshipState?.sessions ?? {};

  const arousalValue = collectArousal(arousalSessions);
  const relationshipLatest = pickLatestSession(relationshipSessions);
  const arousalLatest = pickLatestSession(arousalSessions);

  const trustScore =
    toFiniteNumber(relationshipLatest?.trust_score) ?? legacyRelationship.trustScore ?? 1;
  const attunementIndex =
    toFiniteNumber(relationshipLatest?.attunement_index) ?? legacyRelationship.attunementIndex ?? 1;
  const arousal =
    arousalValue ?? toFiniteNumber(arousalLatest?.arousal) ?? legacyArousal.arousal ?? 0.5;

  const interactionCount = Math.max(
    collectSessionCount(arousalSessions),
    collectSessionCount(relationshipSessions),
    legacyArousal.interactionCount,
    legacyRelationship.interactionCount,
  );

  const unresolvedThreads =
    computeUnresolvedThreads(relationshipLatest).length > 0
      ? computeUnresolvedThreads(relationshipLatest)
      : legacyRelationship.unresolvedThreads;

  const updatedAtCandidates = collectUpdatedAtCandidates([
    ...(arousalRaw.kind === "ok"
      ? [{ kind: "ok" as const, data: arousalState!, mtimeMs: arousalRaw.mtimeMs }]
      : []),
    ...(relationshipRaw.kind === "ok"
      ? [{ kind: "ok" as const, data: relationshipState!, mtimeMs: relationshipRaw.mtimeMs }]
      : []),
  ]);
  const parsedUpdatedAt = updatedAtCandidates
    .concat(
      [legacyArousal.updatedAt, legacyRelationship.updatedAt].filter((value): value is string =>
        Boolean(value),
      ),
    )
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  const lastUpdatedMs = parsedUpdatedAt.length > 0 ? Math.max(...parsedUpdatedAt) : Date.now();
  const lastUpdated = new Date(lastUpdatedMs).toISOString();

  return {
    arousal,
    trustScore,
    attunementIndex,
    interactionCount,
    unresolvedThreads,
    lastUpdated,
    stale: maybeStale(lastUpdated),
  };
}

export { resolveRecentDateKeys };
