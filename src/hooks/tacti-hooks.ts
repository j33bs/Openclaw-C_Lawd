import fs from "node:fs/promises";
import path from "node:path";
import { deriveSessionFlourishingMetrics } from "../flourishing/auto-collect.js";
import { FlourishingMetricsStore } from "../flourishing/metrics-store.js";
import { assembleSystemState } from "../flourishing/system-state.js";
import { recordTactiInteraction } from "../flourishing/tacti-recorder.js";
import { readTactiSnapshot } from "../flourishing/tacti-state.js";
import { assembleContinuityBundle } from "../memory/continuity-bundle.js";
import type { InternalHookEvent } from "./internal-hooks.js";
import { registerInternalHook } from "./internal-hooks.js";

type BriefingAckEntry = {
  date: string;
  delivered: boolean;
  acknowledged: boolean;
  deliveredAt?: string;
  acknowledgedAt?: string;
  channelId?: string;
  conversationId?: string;
};

type BriefingAckState = {
  history: BriefingAckEntry[];
};

const REGISTERED_WORKSPACES = new Set<string>();
const BRIEFING_ACK_WINDOW_MS = 2 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function approximateTokenCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

function todayDateKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function briefingAckPath(workspaceDir: string): string {
  return path.join(workspaceDir, "workspace", "state", "briefing-ack.json");
}

async function loadBriefingAckState(workspaceDir: string): Promise<BriefingAckState> {
  try {
    const raw = await fs.readFile(briefingAckPath(workspaceDir), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.history)) {
      return { history: [] };
    }
    return {
      history: parsed.history.filter(isRecord).map((entry) => ({
        date: typeof entry.date === "string" ? entry.date : todayDateKey(),
        delivered: entry.delivered === true,
        acknowledged: entry.acknowledged === true,
        deliveredAt: typeof entry.deliveredAt === "string" ? entry.deliveredAt : undefined,
        acknowledgedAt: typeof entry.acknowledgedAt === "string" ? entry.acknowledgedAt : undefined,
        channelId: typeof entry.channelId === "string" ? entry.channelId : undefined,
        conversationId: typeof entry.conversationId === "string" ? entry.conversationId : undefined,
      })),
    };
  } catch {
    return { history: [] };
  }
}

async function saveBriefingAckState(workspaceDir: string, state: BriefingAckState): Promise<void> {
  const filePath = briefingAckPath(workspaceDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function looksLikeBriefing(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    normalized.includes("## what matters today") &&
    normalized.includes("## recommended move") &&
    normalized.includes("## system health")
  );
}

async function markBriefingDelivered(params: {
  workspaceDir: string;
  content: string;
  channelId?: string;
  conversationId?: string;
}): Promise<void> {
  if (!looksLikeBriefing(params.content)) {
    return;
  }
  const state = await loadBriefingAckState(params.workspaceDir);
  const deliveredAt = new Date().toISOString();
  const date = todayDateKey(new Date(deliveredAt));
  const nextEntry: BriefingAckEntry = {
    date,
    delivered: true,
    acknowledged: false,
    deliveredAt,
    channelId: params.channelId,
    conversationId: params.conversationId,
  };
  state.history = state.history.filter((entry) => entry.date !== date);
  state.history.push(nextEntry);
  state.history = state.history.slice(-30);
  await saveBriefingAckState(params.workspaceDir, state);
}

async function markBriefingAcknowledged(params: {
  workspaceDir: string;
  channelId?: string;
  conversationId?: string;
}): Promise<void> {
  const state = await loadBriefingAckState(params.workspaceDir);
  const nowMs = Date.now();
  for (let index = state.history.length - 1; index >= 0; index -= 1) {
    const entry = state.history[index];
    if (!entry || !entry.delivered || entry.acknowledged || !entry.deliveredAt) {
      continue;
    }
    const deliveredAtMs = Date.parse(entry.deliveredAt);
    if (!Number.isFinite(deliveredAtMs) || nowMs - deliveredAtMs > BRIEFING_ACK_WINDOW_MS) {
      continue;
    }
    if (params.channelId && entry.channelId && params.channelId !== entry.channelId) {
      continue;
    }
    if (
      params.conversationId &&
      entry.conversationId &&
      params.conversationId !== entry.conversationId
    ) {
      continue;
    }
    entry.acknowledged = true;
    entry.acknowledgedAt = new Date(nowMs).toISOString();
    await saveBriefingAckState(params.workspaceDir, state);
    return;
  }
}

async function recordAutoMetrics(workspaceDir: string): Promise<void> {
  const [tactiSnapshot, continuityBundle, systemState] = await Promise.all([
    readTactiSnapshot(workspaceDir).catch(() => null),
    assembleContinuityBundle({ workspaceDir, maxTokens: 160 }).catch(() => undefined),
    assembleSystemState(workspaceDir).catch(() => null),
  ]);
  const metrics = deriveSessionFlourishingMetrics({
    tactiSnapshot,
    fragmentationSeverity: systemState?.fragmentationSeverity ?? null,
    continuityConfidence: continuityBundle?.confidence ?? null,
  });
  await new FlourishingMetricsStore(workspaceDir).record(metrics, "auto");
}

async function handleMessageSent(workspaceDir: string, event: InternalHookEvent): Promise<void> {
  const content = typeof event.context.content === "string" ? event.context.content : "";
  const success = event.context.success === true;
  if (!content.trim()) {
    return;
  }
  await recordTactiInteraction({
    workspaceDir,
    sessionId: event.sessionKey || "unknown",
    role: "assistant",
    tokenCount: approximateTokenCount(content),
  });
  if (!success) {
    return;
  }
  await Promise.allSettled([
    recordAutoMetrics(workspaceDir),
    markBriefingDelivered({
      workspaceDir,
      content,
      channelId: typeof event.context.channelId === "string" ? event.context.channelId : undefined,
      conversationId:
        typeof event.context.conversationId === "string" ? event.context.conversationId : undefined,
    }),
  ]);
}

async function handleMessageReceived(
  workspaceDir: string,
  event: InternalHookEvent,
): Promise<void> {
  const content = typeof event.context.content === "string" ? event.context.content : "";
  if (content.trim()) {
    await recordTactiInteraction({
      workspaceDir,
      sessionId: event.sessionKey || "unknown",
      role: "user",
      tokenCount: approximateTokenCount(content),
    });
  }
  await markBriefingAcknowledged({
    workspaceDir,
    channelId: typeof event.context.channelId === "string" ? event.context.channelId : undefined,
    conversationId:
      typeof event.context.conversationId === "string" ? event.context.conversationId : undefined,
  });
}

export function registerTactiHooks(workspaceDir: string): void {
  const normalizedWorkspace = path.resolve(workspaceDir);
  if (REGISTERED_WORKSPACES.has(normalizedWorkspace)) {
    return;
  }
  REGISTERED_WORKSPACES.add(normalizedWorkspace);

  registerInternalHook("message:sent", async (event) => {
    try {
      await handleMessageSent(normalizedWorkspace, event);
    } catch {
      // Keep hooks observational only.
    }
  });

  registerInternalHook("message:received", async (event) => {
    try {
      await handleMessageReceived(normalizedWorkspace, event);
    } catch {
      // Keep hooks observational only.
    }
  });
}
