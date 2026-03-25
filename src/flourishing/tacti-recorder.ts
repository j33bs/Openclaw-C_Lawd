import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export interface TactiInteractionParams {
  workspaceDir: string;
  sessionId: string;
  role: "user" | "assistant";
  tokenCount: number;
  toolCalls?: number;
  toolFailures?: number;
}

const TACTI_CLI_WRAPPER = `#!/usr/bin/env python3
"""Thin CLI for TACTI core called by the TypeScript runtime."""

from __future__ import annotations

import json
import sys

from tacti_core import TacticCore


def _coerce_float(value, default: float) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _coerce_int(value, default: int) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _emit(payload: dict) -> None:
    print(json.dumps(payload))


def main() -> int:
    raw = sys.stdin.read()
    try:
        data = json.loads(raw or "{}")
    except Exception as err:
        sys.stderr.write(f"[tacti-cli] invalid json: {err}\\n")
        _emit({"error": f"invalid json: {err}"})
        return 1

    command = str(data.get("command") or "").strip()
    session_id = str(data.get("session_id") or "tacti_core")
    core = TacticCore(session_id=session_id)

    if command == "record_interaction":
        core.record_interaction(
            type=str(data.get("type") or f"{data.get('role') or 'message'}_message"),
            sentiment=_coerce_float(data.get("sentiment"), 0.5),
            resolution=str(data.get("resolution") or "complete"),
        )
        if any(key in data for key in ("token_count", "tool_calls", "tool_failures")):
            core.update_arousal(
                token_count=_coerce_int(data.get("token_count"), 0),
                tool_calls=_coerce_int(data.get("tool_calls"), 0),
                tool_failures=_coerce_int(data.get("tool_failures"), 0),
            )
        _emit({"ok": True, "command": command, "session_id": session_id})
        return 0

    if command == "update_arousal":
        core.update_arousal(
            token_count=_coerce_int(data.get("token_count"), 0),
            tool_calls=_coerce_int(data.get("tool_calls"), 0),
            tool_failures=_coerce_int(data.get("tool_failures"), 0),
        )
        _emit({"ok": True, "command": command, "session_id": session_id})
        return 0

    if command == "status":
        _emit(core.full_status())
        return 0

    sys.stderr.write(f"[tacti-cli] unknown command: {command}\\n")
    _emit({"error": f"unknown command: {command}"})
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
`;

function writeStderrLine(message: string): void {
  try {
    process.stderr.write(`${message}\n`);
  } catch {
    // Never let logging break the caller.
  }
}

function spawnTactiCli(params: { workspaceDir: string; payload: Record<string, unknown> }): void {
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn("python3", [path.join("workspace", "memory", "tacti_cli.py")], {
      cwd: params.workspaceDir,
      stdio: ["pipe", "ignore", "pipe"],
    });
  } catch (err) {
    writeStderrLine(`[tacti-recorder] failed to start tacti CLI: ${String(err)}`);
    return;
  }

  const timeout = setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch {
      // Ignore kill failures; the process is best-effort only.
    }
    writeStderrLine("[tacti-recorder] tacti CLI timed out after 5000ms");
  }, 5000);
  timeout.unref?.();

  child.once("close", (code, signal) => {
    clearTimeout(timeout);
    if (code && code !== 0) {
      writeStderrLine(
        `[tacti-recorder] tacti CLI exited with code ${code}${signal ? ` signal ${signal}` : ""}`,
      );
    }
  });

  child.once("error", (err) => {
    clearTimeout(timeout);
    writeStderrLine(`[tacti-recorder] tacti CLI error: ${String(err)}`);
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8").trim();
    if (text) {
      writeStderrLine(`[tacti-recorder] ${text}`);
    }
  });

  try {
    child.stdin?.write(`${JSON.stringify(params.payload)}\n`);
    child.stdin?.end();
  } catch (err) {
    clearTimeout(timeout);
    writeStderrLine(`[tacti-recorder] failed to write tacti payload: ${String(err)}`);
  }
}

async function ensureTactiCliWrapper(workspaceDir: string): Promise<void> {
  const cliPath = path.join(workspaceDir, "workspace", "memory", "tacti_cli.py");
  try {
    await fs.access(cliPath);
  } catch {
    await fs.mkdir(path.dirname(cliPath), { recursive: true });
    await fs.writeFile(cliPath, TACTI_CLI_WRAPPER, { encoding: "utf8", mode: 0o755 });
  }
}

export async function recordTactiInteraction(params: TactiInteractionParams): Promise<void> {
  try {
    const tactiCorePath = path.join(params.workspaceDir, "workspace", "memory", "tacti_core.py");
    await fs.access(tactiCorePath);
    await ensureTactiCliWrapper(params.workspaceDir);

    spawnTactiCli({
      workspaceDir: params.workspaceDir,
      payload: {
        command: "record_interaction",
        session_id: params.sessionId,
        role: params.role,
        type: `${params.role}_message`,
        sentiment: 0.5,
        resolution: "complete",
        token_count: params.tokenCount,
        tool_calls: params.toolCalls ?? 0,
        tool_failures: params.toolFailures ?? 0,
      },
    });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "ENOENT"
    ) {
      return;
    }
    writeStderrLine(`[tacti-recorder] tacti interaction failed: ${String(err)}`);
  }
}
