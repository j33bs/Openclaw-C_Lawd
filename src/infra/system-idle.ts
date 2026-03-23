import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SYSTEM_IDLE_CACHE_TTL_MS = 5_000;

let lastCheckedAt = 0;
let lastIdleMs: number | null = null;

export async function getSystemIdleMs(): Promise<number | null> {
  const now = Date.now();
  if (now - lastCheckedAt < SYSTEM_IDLE_CACHE_TTL_MS) {
    return lastIdleMs;
  }

  lastCheckedAt = now;

  if (process.platform !== "darwin") {
    lastIdleMs = null;
    return lastIdleMs;
  }

  try {
    const { stdout } = await execFileAsync("/usr/sbin/ioreg", ["-c", "IOHIDSystem"], {
      encoding: "utf8",
      timeout: 2_000,
      maxBuffer: 1024 * 1024,
    });
    const match = stdout.match(/"HIDIdleTime"\s*=\s*(\d+)/);
    if (!match) {
      lastIdleMs = null;
      return lastIdleMs;
    }
    const idleNs = Number(match[1]);
    lastIdleMs = Number.isFinite(idleNs) ? Math.max(0, Math.floor(idleNs / 1_000_000)) : null;
    return lastIdleMs;
  } catch {
    lastIdleMs = null;
    return lastIdleMs;
  }
}

export function resetSystemIdleCacheForTests(): void {
  lastCheckedAt = 0;
  lastIdleMs = null;
}
