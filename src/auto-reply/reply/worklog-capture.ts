import fs from "node:fs/promises";
import path from "node:path";
import { resolveCronStyleNow } from "../../agents/current-time.js";
import { isLikelyMutatingToolName } from "../../agents/tool-mutation.js";
import type { OpenClawConfig } from "../../config/config.js";
import { isInternalMessageChannel } from "../../utils/message-channel.js";
import { SILENT_REPLY_TOKEN } from "../tokens.js";
import { type ReplyPayload } from "../types.js";
import { resolveMemoryFlushRelativePathForRun } from "./memory-flush.js";
import { resolveOriginMessageProvider } from "./origin-routing.js";
const MAX_REQUEST_CHARS = 240;
const MAX_OUTCOME_CHARS = 320;
const MAX_TOOL_META_CHARS = 160;
const MAX_TOOL_LINES = 6;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function resolveTimeLabel(cfg: OpenClawConfig, nowMs: number): string {
  const { userTimezone } = resolveCronStyleNow(cfg, nowMs);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: userTimezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(nowMs));
}

function normalizePayloadText(payloads: ReplyPayload[]): string | undefined {
  const texts = payloads
    .filter((payload) => payload.isError !== true)
    .map((payload) => collapseWhitespace(payload.text ?? ""))
    .filter((text) => text && text !== SILENT_REPLY_TOKEN);
  if (texts.length === 0) {
    return undefined;
  }
  return truncate(texts.join(" "), MAX_OUTCOME_CHARS);
}

function summarizeToolMetas(toolMetas: Array<{ toolName?: string; meta?: string }>): string[] {
  const summaries: string[] = [];
  const seen = new Set<string>();
  for (const entry of toolMetas) {
    const toolName = entry.toolName?.trim().toLowerCase();
    if (!toolName || !isLikelyMutatingToolName(toolName)) {
      continue;
    }
    const meta = collapseWhitespace(entry.meta ?? "");
    const summary = meta ? `${toolName}: ${truncate(meta, MAX_TOOL_META_CHARS)}` : toolName;
    if (seen.has(summary)) {
      continue;
    }
    seen.add(summary);
    summaries.push(summary);
    if (summaries.length >= MAX_TOOL_LINES) {
      break;
    }
  }
  return summaries;
}

function shouldCaptureWorklog(params: {
  channel?: string;
  chatType?: string;
  senderIsOwner?: boolean;
  toolSummaries: string[];
}): boolean {
  if (params.senderIsOwner !== true) {
    return false;
  }
  if ((params.chatType ?? "").trim().toLowerCase() !== "direct") {
    return false;
  }
  const channel = params.channel?.trim().toLowerCase();
  if (!channel || isInternalMessageChannel(channel)) {
    return false;
  }
  return params.toolSummaries.length > 0;
}

function formatEntry(params: {
  channel: string;
  nowMs: number;
  timeLabel: string;
  requestSummary?: string;
  outcome?: string;
  toolSummaries: string[];
  sessionKey?: string;
}): string {
  const lines = [`### ${params.timeLabel} ${params.channel} work`];
  if (params.requestSummary) {
    lines.push(`Request: ${params.requestSummary}`);
  }
  lines.push(`Outcome: ${params.outcome ?? "(no user-facing reply)"}`);
  lines.push("Changes:");
  for (const summary of params.toolSummaries) {
    lines.push(`- ${summary}`);
  }
  if (params.sessionKey) {
    lines.push(`Session: ${params.sessionKey}`);
  }
  return lines.join("\n");
}

export async function captureWorklogIfNeeded(params: {
  cfg: OpenClawConfig;
  workspaceDir: string;
  sessionKey?: string;
  chatType?: string;
  originatingChannel?: string;
  messageProvider?: string;
  senderIsOwner?: boolean;
  promptSummary?: string;
  payloads: ReplyPayload[];
  toolMetas?: Array<{ toolName?: string; meta?: string }>;
  nowMs?: number;
}): Promise<{ written: boolean; path?: string }> {
  const nowMs = Number.isFinite(params.nowMs) ? (params.nowMs as number) : Date.now();
  const channel = resolveOriginMessageProvider({
    originatingChannel: params.originatingChannel,
    provider: params.messageProvider,
  });
  const toolSummaries = summarizeToolMetas(params.toolMetas ?? []);
  const outcome = normalizePayloadText(params.payloads);
  if (
    !shouldCaptureWorklog({
      channel,
      chatType: params.chatType,
      senderIsOwner: params.senderIsOwner,
      toolSummaries,
    })
  ) {
    return { written: false };
  }

  const relativePath = resolveMemoryFlushRelativePathForRun({
    cfg: params.cfg,
    nowMs,
  });
  const absPath = path.join(params.workspaceDir, relativePath);
  const dateStamp = path.basename(relativePath, ".md");
  const timeLabel = resolveTimeLabel(params.cfg, nowMs);
  const requestSummary = collapseWhitespace(params.promptSummary ?? "");
  const entry = formatEntry({
    channel: channel ?? "direct",
    nowMs,
    timeLabel,
    requestSummary: requestSummary ? truncate(requestSummary, MAX_REQUEST_CHARS) : undefined,
    outcome: outcome!,
    toolSummaries,
    sessionKey: params.sessionKey,
  });

  await fs.mkdir(path.dirname(absPath), { recursive: true });
  let prefix = "\n\n";
  try {
    await fs.access(absPath);
  } catch {
    prefix = `# ${dateStamp}\n\n`;
  }
  await fs.appendFile(absPath, `${prefix}${entry}\n`, "utf-8");
  return { written: true, path: absPath };
}

export const __testing = {
  normalizePayloadText,
  summarizeToolMetas,
  shouldCaptureWorklog,
};
