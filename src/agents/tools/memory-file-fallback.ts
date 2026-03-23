import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../../config/config.js";
import { listMemoryFiles } from "../../memory/internal.js";
import type { MemorySearchResult } from "../../memory/types.js";
import { resolveAgentWorkspaceDir } from "../agent-scope.js";
import { resolveMemorySearchConfig } from "../memory-search.js";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "with",
  "this",
  "from",
  "have",
  "what",
  "when",
  "your",
  "about",
  "into",
  "there",
  "were",
  "them",
  "they",
  "then",
  "than",
  "just",
]);
const SNIPPET_WINDOW_LINES = 2;

function tokenizeQuery(query: string): string[] {
  const normalized = query
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
  return Array.from(new Set(normalized));
}

function scoreLine(line: string, tokens: string[], fullQuery: string): number {
  const normalized = line.toLowerCase();
  let score = 0;
  if (fullQuery && normalized.includes(fullQuery)) {
    score += 5;
  }
  for (const token of tokens) {
    if (normalized.includes(token)) {
      score += token.length >= 6 ? 2 : 1;
    }
  }
  return score;
}

function buildSnippet(
  lines: string[],
  lineIndex: number,
): {
  snippet: string;
  startLine: number;
  endLine: number;
} {
  const start = Math.max(0, lineIndex - SNIPPET_WINDOW_LINES);
  const end = Math.min(lines.length - 1, lineIndex + SNIPPET_WINDOW_LINES);
  return {
    snippet: lines
      .slice(start, end + 1)
      .join("\n")
      .trim(),
    startLine: start + 1,
    endLine: end + 1,
  };
}

export async function searchLocalMemoryFiles(params: {
  workspaceDir: string;
  extraPaths?: string[];
  query: string;
  maxResults?: number;
}): Promise<MemorySearchResult[]> {
  const fullQuery = params.query.trim().toLowerCase();
  if (!fullQuery) {
    return [];
  }
  const tokens = tokenizeQuery(params.query);
  const files = await listMemoryFiles(params.workspaceDir, params.extraPaths);
  const matches: Array<MemorySearchResult & { mtimeMs: number }> = [];

  for (const absPath of files) {
    let content: string;
    let stat;
    try {
      [content, stat] = await Promise.all([fs.readFile(absPath, "utf-8"), fs.stat(absPath)]);
    } catch {
      continue;
    }
    const lines = content.split("\n");
    let bestScore = 0;
    let bestLine = -1;
    for (let i = 0; i < lines.length; i += 1) {
      const score = scoreLine(lines[i] ?? "", tokens, fullQuery);
      if (score > bestScore) {
        bestScore = score;
        bestLine = i;
      }
    }
    if (bestLine < 0 || bestScore <= 0) {
      continue;
    }
    const snippet = buildSnippet(lines, bestLine);
    const relPath = path.relative(params.workspaceDir, absPath).replace(/\\/g, "/");
    matches.push({
      path: relPath,
      source: "memory",
      score: Math.min(1.5, bestScore / Math.max(3, tokens.length + 2)),
      mtimeMs: stat.mtimeMs,
      ...snippet,
    });
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return b.mtimeMs - a.mtimeMs;
  });
  return matches.slice(0, params.maxResults ?? 6).map(({ mtimeMs: _mtimeMs, ...entry }) => entry);
}

function resolveRequestedMemoryPath(
  workspaceDir: string,
  relPath: string,
): {
  absPath: string;
  normalizedRelPath: string;
} {
  const rawPath = relPath.trim();
  if (!rawPath) {
    throw new Error("path required");
  }
  const absPath = path.isAbsolute(rawPath)
    ? path.resolve(rawPath)
    : path.resolve(workspaceDir, rawPath);
  const normalizedRelPath = path.relative(workspaceDir, absPath).replace(/\\/g, "/");
  return { absPath, normalizedRelPath };
}

async function resolveAllowedLocalMemoryPath(params: {
  workspaceDir: string;
  extraPaths?: string[];
  relPath: string;
}): Promise<{ absPath: string; normalizedRelPath: string } | null> {
  const requested = resolveRequestedMemoryPath(params.workspaceDir, params.relPath);
  const files = await listMemoryFiles(params.workspaceDir, params.extraPaths);
  if (!files.includes(requested.absPath)) {
    return null;
  }
  return requested;
}

export async function readLocalMemoryFile(params: {
  workspaceDir: string;
  extraPaths?: string[];
  relPath: string;
  from?: number;
  lines?: number;
}): Promise<{ text: string; path: string }> {
  const allowed = await resolveAllowedLocalMemoryPath(params);
  if (!allowed) {
    throw new Error("path required");
  }
  let content: string;
  try {
    content = await fs.readFile(allowed.absPath, "utf-8");
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error?.code === "ENOENT") {
      return { text: "", path: allowed.normalizedRelPath };
    }
    throw err;
  }
  if (!params.from && !params.lines) {
    return { text: content, path: allowed.normalizedRelPath };
  }
  const lines = content.split("\n");
  const start = Math.max(1, params.from ?? 1);
  const count = Math.max(1, params.lines ?? lines.length);
  const slice = lines.slice(start - 1, start - 1 + count);
  return { text: slice.join("\n"), path: allowed.normalizedRelPath };
}

export async function searchLocalMemoryFilesForAgent(params: {
  cfg: OpenClawConfig;
  agentId: string;
  query: string;
  maxResults?: number;
}): Promise<MemorySearchResult[]> {
  const settings = resolveMemorySearchConfig(params.cfg, params.agentId);
  if (!settings || !settings.sources.includes("memory")) {
    return [];
  }
  const workspaceDir = resolveAgentWorkspaceDir(params.cfg, params.agentId);
  return await searchLocalMemoryFiles({
    workspaceDir,
    extraPaths: settings.extraPaths,
    query: params.query,
    maxResults: params.maxResults,
  });
}

export async function readLocalMemoryFileForAgent(params: {
  cfg: OpenClawConfig;
  agentId: string;
  relPath: string;
  from?: number;
  lines?: number;
}): Promise<{ text: string; path: string }> {
  const settings = resolveMemorySearchConfig(params.cfg, params.agentId);
  if (!settings || !settings.sources.includes("memory")) {
    throw new Error("path required");
  }
  const workspaceDir = resolveAgentWorkspaceDir(params.cfg, params.agentId);
  return await readLocalMemoryFile({
    workspaceDir,
    extraPaths: settings.extraPaths,
    relPath: params.relPath,
    from: params.from,
    lines: params.lines,
  });
}
