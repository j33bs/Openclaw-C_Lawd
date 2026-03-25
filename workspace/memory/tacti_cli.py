#!/usr/bin/env python3
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
        sys.stderr.write(f"[tacti-cli] invalid json: {err}\n")
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

    sys.stderr.write(f"[tacti-cli] unknown command: {command}\n")
    _emit({"error": f"unknown command: {command}"})
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
