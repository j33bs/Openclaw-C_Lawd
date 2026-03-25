import fs from "node:fs/promises";
import path from "node:path";
import type { AntiFragmentationSignal } from "./anti-fragmentation.js";

const BRISBANE_TIME_ZONE = "Australia/Brisbane";

const DEFAULT_SIGNAL: AntiFragmentationSignal = {
  recallSuccessRate: 0.8,
  duplicateClarificationRate: 0.1,
  dailyNoteFreshnessHours: 999,
  continuityBundleAvailable: false,
  pinnedDoctrineAvailable: false,
  sessionMemoryAvailable: false,
  unresolvedDriftSignals: 0,
  crossSurfaceMismatchCount: 0,
  toolFailureRate: 0,
};

export async function collectFragmentationSignals(
  workspaceDir: string,
): Promise<AntiFragmentationSignal> {
  try {
    const today = formatDateInTimeZone(new Date(), BRISBANE_TIME_ZONE);
    const memoryDir = path.join(workspaceDir, "memory");
    const nodesDir = path.join(workspaceDir, "nodes");
    const stateDir = path.join(workspaceDir, "workspace", "state");
    const dailyNotePath = path.join(memoryDir, `${today}.md`);

    const [
      dailyNoteExists,
      dailyNoteFreshnessHours,
      pinnedDoctrineAvailable,
      sessionMemoryAvailable,
    ] = await Promise.all([
      fileExists(dailyNotePath),
      getFreshnessHours(dailyNotePath),
      hasAnyPinnedDoctrine(nodesDir),
      hasSessionStateFiles(stateDir),
    ]);

    return {
      ...DEFAULT_SIGNAL,
      dailyNoteFreshnessHours,
      continuityBundleAvailable: dailyNoteExists,
      pinnedDoctrineAvailable,
      sessionMemoryAvailable,
    };
  } catch {
    return { ...DEFAULT_SIGNAL };
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getFreshnessHours(filePath: string): Promise<number> {
  try {
    const stat = await fs.stat(filePath);
    return Math.max(0, (Date.now() - stat.mtimeMs) / (60 * 60 * 1000));
  } catch {
    return 999;
  }
}

async function hasAnyPinnedDoctrine(nodesDir: string): Promise<boolean> {
  return (
    (await findFirstPinnedDoc(nodesDir, "MEMORY.md")) !== null ||
    (await findFirstPinnedDoc(nodesDir, "CONVERSATION_KERNEL.md")) !== null
  );
}

async function findFirstPinnedDoc(nodesDir: string, fileName: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(nodesDir, { withFileTypes: true });
    for (const entry of entries.toSorted((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) {
        continue;
      }
      const candidate = path.join(nodesDir, entry.name, fileName);
      if (await fileExists(candidate)) {
        return candidate;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function hasSessionStateFiles(stateDir: string): Promise<boolean> {
  return await scanForSessionStateFiles(stateDir);
}

async function scanForSessionStateFiles(rootDir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(rootDir, entry.name);
      if (/session/i.test(entry.name)) {
        return true;
      }
      if (entry.isDirectory()) {
        if (await scanForSessionStateFiles(entryPath)) {
          return true;
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}
