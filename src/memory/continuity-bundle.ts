import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export interface ContinuityBundleEntry {
  source: string;
  content: string;
  kind: "daily-note" | "pinned-doctrine" | "session-snippet";
  date?: string;
  score?: number;
}

export interface ContinuityBundle {
  entries: ContinuityBundleEntry[];
  assembledAt: string;
  confidence: "full" | "partial" | "minimal";
}

export interface AssembleContinuityBundleParams {
  workspaceDir: string;
  memoryManager?: {
    searchVector?(embedding: number[]): Promise<unknown[]>;
    searchKeyword(query: string): Promise<unknown[]>;
  };
  query?: string;
  maxTokens?: number;
}

type SearchResultLike = {
  path?: string;
  snippet?: string;
  text?: string;
  content?: string;
  body?: string;
  score?: number;
};

const DEFAULT_MAX_TOKENS = 400;
const DEFAULT_TIME_ZONE = "Australia/Brisbane";

function getDateParts(now: Date = new Date()): { today: string; yesterday: string } {
  try {
    const formatDate = (date: Date) => {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: DEFAULT_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(date);
      const year = parts.find((part) => part.type === "year")?.value;
      const month = parts.find((part) => part.type === "month")?.value;
      const day = parts.find((part) => part.type === "day")?.value;
      if (!year || !month || !day) {
        throw new Error("missing date parts");
      }
      return `${year}-${month}-${day}`;
    };
    const today = formatDate(now);
    const yesterday = formatDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    return { today, yesterday };
  } catch {
    const fallback = new Date(now);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return {
      today: fallback.toISOString().slice(0, 10),
      yesterday: yesterday.toISOString().slice(0, 10),
    };
  }
}

function toAbsolutePath(workspaceDir: string, candidate: string): string {
  if (!candidate) {
    return "";
  }
  return path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(workspaceDir, candidate);
}

function toWorkspaceRelativePath(workspaceDir: string, candidate: string): string {
  const abs = toAbsolutePath(workspaceDir, candidate);
  const rel = path.relative(path.resolve(workspaceDir), abs).replace(/\\/g, "/");
  return rel.startsWith("..") ? abs.replace(/\\/g, "/") : rel;
}

function approximateTokenCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/u).length;
}

function trimToApproxTokens(text: string, maxTokens: number): string {
  const limit = Math.max(1, Math.floor(maxTokens));
  const words = text.trim().split(/\s+/u);
  if (words.length <= limit) {
    return text.trim();
  }
  return `${words.slice(0, limit).join(" ")} ...`;
}

async function readOptionalText(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function findFirstPinnedDoc(
  workspaceDir: string,
  filename: "MEMORY.md" | "CONVERSATION_KERNEL.md",
): Promise<{ absPath: string; content: string } | null> {
  const nodesDir = path.join(workspaceDir, "nodes");
  let nodeEntries: Dirent[];
  try {
    nodeEntries = await fs.readdir(nodesDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const sortedNodeEntries = [...nodeEntries]
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .toSorted((a, b) => a.name.localeCompare(b.name));
  for (const nodeEntry of sortedNodeEntries) {
    const absPath = path.join(nodesDir, nodeEntry.name, filename);
    const content = await readOptionalText(absPath);
    if (content !== null) {
      return { absPath, content };
    }
  }
  return null;
}

function readSearchResultText(result: SearchResultLike): string {
  return (
    result.snippet?.trim() ||
    result.text?.trim() ||
    result.content?.trim() ||
    result.body?.trim() ||
    ""
  );
}

function normalizeSearchResult(result: unknown): SearchResultLike {
  if (!result || typeof result !== "object") {
    return {};
  }
  const candidate = result as Partial<SearchResultLike>;
  return {
    path: typeof candidate.path === "string" ? candidate.path : undefined,
    snippet: typeof candidate.snippet === "string" ? candidate.snippet : undefined,
    text: typeof candidate.text === "string" ? candidate.text : undefined,
    content: typeof candidate.content === "string" ? candidate.content : undefined,
    body: typeof candidate.body === "string" ? candidate.body : undefined,
    score: typeof candidate.score === "number" ? candidate.score : undefined,
  };
}

function buildEntry(
  params: {
    workspaceDir: string;
    source: string;
    content: string;
    kind: ContinuityBundleEntry["kind"];
    date?: string;
    score?: number;
  },
  tokenBudget: number,
): ContinuityBundleEntry {
  return {
    source: toWorkspaceRelativePath(params.workspaceDir, params.source),
    content: trimToApproxTokens(params.content, tokenBudget),
    kind: params.kind,
    ...(params.date ? { date: params.date } : {}),
    ...(typeof params.score === "number" ? { score: params.score } : {}),
  };
}

export async function assembleContinuityBundle(
  params: AssembleContinuityBundleParams,
): Promise<ContinuityBundle> {
  const assembledAt = new Date().toISOString();
  const workspaceDir = path.resolve(params.workspaceDir);
  const { today, yesterday } = getDateParts();
  const requestedMaxTokens = Math.max(1, Math.floor(params.maxTokens ?? DEFAULT_MAX_TOKENS));

  const entries: ContinuityBundleEntry[] = [];
  const includedSources = new Set<string>();
  const addEntry = (entry: ContinuityBundleEntry, absSource: string) => {
    const normalizedSource = path.resolve(absSource);
    if (includedSources.has(normalizedSource)) {
      return;
    }
    includedSources.add(normalizedSource);
    entries.push(entry);
  };

  const todayPath = path.join(workspaceDir, "memory", `${today}.md`);
  const yesterdayPath = path.join(workspaceDir, "memory", `${yesterday}.md`);

  const [todayContent, yesterdayContent] = await Promise.all([
    readOptionalText(todayPath),
    readOptionalText(yesterdayPath),
  ]);

  if (todayContent !== null) {
    addEntry(
      buildEntry(
        {
          workspaceDir,
          source: todayPath,
          content: todayContent,
          kind: "daily-note",
          date: today,
        },
        requestedMaxTokens,
      ),
      todayPath,
    );
  }

  if (yesterdayContent !== null) {
    addEntry(
      buildEntry(
        {
          workspaceDir,
          source: yesterdayPath,
          content: yesterdayContent,
          kind: "daily-note",
          date: yesterday,
        },
        requestedMaxTokens,
      ),
      yesterdayPath,
    );
  }

  const [pinnedMemoryDoc, pinnedKernelDoc] = await Promise.all([
    findFirstPinnedDoc(workspaceDir, "MEMORY.md"),
    findFirstPinnedDoc(workspaceDir, "CONVERSATION_KERNEL.md"),
  ]);

  if (pinnedMemoryDoc) {
    addEntry(
      buildEntry(
        {
          workspaceDir,
          source: pinnedMemoryDoc.absPath,
          content: pinnedMemoryDoc.content,
          kind: "pinned-doctrine",
        },
        requestedMaxTokens,
      ),
      pinnedMemoryDoc.absPath,
    );
  }

  if (pinnedKernelDoc) {
    addEntry(
      buildEntry(
        {
          workspaceDir,
          source: pinnedKernelDoc.absPath,
          content: pinnedKernelDoc.content,
          kind: "pinned-doctrine",
        },
        requestedMaxTokens,
      ),
      pinnedKernelDoc.absPath,
    );
  }

  if (params.query?.trim() && params.memoryManager?.searchKeyword) {
    try {
      const results = await params.memoryManager.searchKeyword(params.query.trim());
      const semanticEntries: ContinuityBundleEntry[] = [];
      for (const rawResult of results.slice(0, 3)) {
        const result = normalizeSearchResult(rawResult);
        const source = result.path?.trim();
        const content = readSearchResultText(result);
        if (!source || !content) {
          continue;
        }
        const absSource = toAbsolutePath(workspaceDir, source);
        if (includedSources.has(absSource)) {
          continue;
        }
        const entry = buildEntry(
          {
            workspaceDir,
            source,
            content,
            kind: "session-snippet",
            score: result.score,
          },
          requestedMaxTokens,
        );
        includedSources.add(absSource);
        semanticEntries.push(entry);
      }
      entries.push(...semanticEntries);
    } catch {
      // Semantic recall is optional; local reads are the primary path.
    }
  }

  const hasToday = todayContent !== null;
  const hasPinned = Boolean(pinnedMemoryDoc || pinnedKernelDoc);
  const hasAnyLocal = hasToday || yesterdayContent !== null || hasPinned;
  const confidence: ContinuityBundle["confidence"] =
    hasToday && hasPinned ? "full" : hasAnyLocal ? "partial" : "minimal";

  const perEntryBudget = Math.max(12, Math.floor(requestedMaxTokens / Math.max(1, entries.length)));
  const trimmedEntries = entries.map((entry) => ({
    ...entry,
    content:
      approximateTokenCount(entry.content) > perEntryBudget
        ? trimToApproxTokens(entry.content, perEntryBudget)
        : entry.content.trim(),
  }));

  return {
    entries: trimmedEntries,
    assembledAt,
    confidence,
  };
}
