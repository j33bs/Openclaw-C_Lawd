from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

if __package__:
    from .io_utils import write_json_atomic_verified
    from .paths import resolve_memory_archive_path, resolve_repo_relative
else:  # pragma: no cover - script/local import compatibility
    from io_utils import write_json_atomic_verified
    from paths import resolve_memory_archive_path, resolve_repo_relative

DEFAULT_STATE_PATH = resolve_memory_archive_path("heartbeat-state.json")


def _resolve_path(repo_root: Path | str, state_path: Path | None = None) -> Path:
    target = Path(state_path) if state_path is not None else DEFAULT_STATE_PATH
    return resolve_repo_relative(target, repo_root=repo_root)


def _default_state() -> dict[str, Any]:
    return {"lastChecks": {}}


def load_state(*, repo_root: Path | str, state_path: Path | None = None) -> dict[str, Any]:
    path = _resolve_path(repo_root, state_path=state_path)
    if not path.exists():
        return _default_state()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return _default_state()
    if not isinstance(payload, dict):
        return _default_state()
    last_checks = payload.get("lastChecks")
    if not isinstance(last_checks, dict):
        payload["lastChecks"] = {}
    return payload


def save_state(state: dict[str, Any], *, repo_root: Path | str, state_path: Path | None = None) -> Path:
    path = _resolve_path(repo_root, state_path=state_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    return write_json_atomic_verified(path, state, indent=2, ensure_ascii=True)


def touch_check(
    name: str,
    *,
    repo_root: Path | str,
    checked_at: int | None = None,
    state_path: Path | None = None,
) -> dict[str, Any]:
    key = str(name).strip()
    if not key:
        raise ValueError("check name must be non-empty")
    state = load_state(repo_root=repo_root, state_path=state_path)
    last_checks = state.setdefault("lastChecks", {})
    timestamp = int(checked_at) if checked_at is not None else int(datetime.now(tz=timezone.utc).timestamp())
    last_checks[key] = timestamp
    path = save_state(state, repo_root=repo_root, state_path=state_path)
    return {"ok": True, "path": str(path), "check": key, "checked_at": timestamp}


def get_last_check(
    name: str,
    *,
    repo_root: Path | str,
    state_path: Path | None = None,
) -> int | None:
    state = load_state(repo_root=repo_root, state_path=state_path)
    value = state.get("lastChecks", {}).get(str(name))
    return int(value) if isinstance(value, (int, float)) else None


def needs_check(
    name: str,
    interval_seconds: int,
    *,
    repo_root: Path | str,
    now_ts: int | None = None,
    state_path: Path | None = None,
) -> bool:
    last_check = get_last_check(name, repo_root=repo_root, state_path=state_path)
    if last_check is None:
        return True
    current = int(now_ts) if now_ts is not None else int(datetime.now(tz=timezone.utc).timestamp())
    return (current - last_check) >= int(interval_seconds)


def _print_human(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage memory/heartbeat-state.json")
    subparsers = parser.add_subparsers(dest="command", required=True)

    status_parser = subparsers.add_parser("status", help="Print full heartbeat state")
    status_parser.add_argument("--json", action="store_true", help="Print JSON output")

    get_parser = subparsers.add_parser("get", help="Get the last timestamp for a check")
    get_parser.add_argument("name", help="Check name")
    get_parser.add_argument("--json", action="store_true", help="Print JSON output")

    touch_parser = subparsers.add_parser("touch", help="Update a check timestamp")
    touch_parser.add_argument("name", help="Check name")
    touch_parser.add_argument("--at", type=int, help="Explicit unix timestamp")
    touch_parser.add_argument("--json", action="store_true", help="Print JSON output")

    needs_parser = subparsers.add_parser("needs-check", help="Test whether a check is overdue")
    needs_parser.add_argument("name", help="Check name")
    needs_parser.add_argument("--interval", type=int, required=True, help="Age threshold in seconds")
    needs_parser.add_argument("--now", type=int, help="Explicit current unix timestamp")
    needs_parser.add_argument("--json", action="store_true", help="Print JSON output")

    args = parser.parse_args()
    repo_root = Path.cwd()

    if args.command == "status":
        payload = load_state(repo_root=repo_root)
    elif args.command == "get":
        payload = {"check": args.name, "last_check": get_last_check(args.name, repo_root=repo_root)}
    elif args.command == "touch":
        payload = touch_check(args.name, repo_root=repo_root, checked_at=args.at)
    else:
        payload = {
            "check": args.name,
            "interval": args.interval,
            "needs_check": needs_check(
                args.name,
                args.interval,
                repo_root=repo_root,
                now_ts=args.now,
            ),
        }

    if getattr(args, "json", False):
        print(json.dumps(payload, indent=2))
        return
    _print_human(payload)


if __name__ == "__main__":
    main()
