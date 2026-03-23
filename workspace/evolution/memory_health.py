#!/usr/bin/env python3
"""Shared helpers for memory audit, status, and summary tooling."""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

if __package__:
    from .knowledge_base_health import collect_knowledge_base_status
else:  # pragma: no cover - script/local import compatibility
    from knowledge_base_health import collect_knowledge_base_status

REPO_ROOT = Path(__file__).resolve().parents[2]
DAILY_LOG_RE = re.compile(r"^(?P<date>\d{4}-\d{2}-\d{2})\.md$")
SESSION_EXPORT_RE = re.compile(
    r"^sessions-export-(?P<date>\d{4}-\d{2}-\d{2})_(?P<hour>\d{2})(?P<minute>\d{2})\.md$"
)
SINCE_RE = re.compile(r"^(?P<value>\d+)(?P<unit>[hdw])$")
MARKDOWN_UPDATED_RE = re.compile(r"last updated:\s*(\d{4}-\d{2}-\d{2})", re.IGNORECASE)
TIMESTAMP_KEYS = {
    "created",
    "last_interaction",
    "last_update",
    "timestamp",
    "ts",
    "ts_utc",
    "updated_at",
}
STORE_SPECS: tuple[dict[str, Any], ...] = (
    {
        "name": "long_term_memory",
        "label": "Long-term memory",
        "kind": "markdown_doc",
        "paths": ("MEMORY.md",),
        "required": True,
        "warn_days": 30,
        "stale_days": 90,
    },
    {
        "name": "daily_logs",
        "label": "Daily logs",
        "kind": "daily_logs",
        "required": True,
        "warn_days": 1,
        "stale_days": 3,
    },
    {
        "name": "node_memory",
        "label": "Node memory",
        "kind": "markdown_doc",
        "paths": ("nodes/c_lawd/MEMORY.md",),
        "required": True,
        "warn_days": 30,
        "stale_days": 90,
    },
    {
        "name": "conversation_kernel",
        "label": "Conversation kernel",
        "kind": "markdown_doc",
        "paths": ("nodes/c_lawd/CONVERSATION_KERNEL.md",),
        "required": True,
        "warn_days": 30,
        "stale_days": 90,
    },
    {
        "name": "knowledge_base",
        "label": "Knowledge base",
        "kind": "knowledge_base",
        "paths": (
            "workspace/knowledge_base/README.md",
            "workspace/knowledge_base/data/entities.jsonl",
            "workspace/knowledge_base/data/last_sync.txt",
        ),
        "required": False,
        "warn_days": 14,
        "stale_days": 45,
    },
    {
        "name": "heartbeat_state",
        "label": "Heartbeat state",
        "kind": "json_state",
        "paths": ("memory/heartbeat-state.json",),
        "required": False,
        "warn_days": 1,
        "stale_days": 3,
    },
    {
        "name": "session_exports",
        "label": "Session exports",
        "kind": "session_exports",
        "required": False,
        "warn_days": 7,
        "stale_days": 30,
    },
    {
        "name": "relationship_state",
        "label": "Relationship state",
        "kind": "json_state",
        "paths": (
            "workspace/state_runtime/memory/relationship_state.json",
            "workspace/memory/relationship.json",
        ),
        "required": True,
        "warn_days": 7,
        "stale_days": 30,
    },
    {
        "name": "arousal_state",
        "label": "Arousal state",
        "kind": "json_state",
        "paths": (
            "workspace/state_runtime/memory/arousal_state.json",
            "workspace/memory/arousal_state.json",
        ),
        "required": True,
        "warn_days": 7,
        "stale_days": 30,
    },
)


def _utc_now(now: datetime | None = None) -> datetime:
    if now is None:
        return datetime.now(tz=timezone.utc)
    if now.tzinfo is None:
        return now.replace(tzinfo=timezone.utc)
    return now.astimezone(timezone.utc)


def _relative(path: Path, repo_root: Path) -> str:
    try:
        return str(path.relative_to(repo_root))
    except ValueError:
        return str(path)


def _parse_datetime(value: str | None) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return datetime.fromisoformat(text).replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_since(spec: str) -> timedelta:
    match = SINCE_RE.fullmatch(str(spec).strip().lower())
    if not match:
        raise ValueError(f"Unsupported --since value: {spec!r}")
    value = int(match.group("value"))
    unit = match.group("unit")
    if unit == "h":
        return timedelta(hours=value)
    if unit == "w":
        return timedelta(weeks=value)
    return timedelta(days=value)


def _daily_logs(repo_root: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    logs: list[dict[str, Any]] = []
    invalid: list[dict[str, Any]] = []
    memory_dir = repo_root / "memory"
    if not memory_dir.exists():
        return logs, invalid
    for path in sorted(memory_dir.glob("*.md")):
        match = DAILY_LOG_RE.fullmatch(path.name)
        if not match:
            continue
        parsed = _parse_datetime(match.group("date"))
        if parsed is None:
            invalid.append(
                {
                    "path": _relative(path, repo_root),
                    "reason": "filename matched daily-log pattern but date was invalid",
                }
            )
            continue
        logs.append({"path": path, "date": parsed})
    return logs, invalid


def _session_exports(repo_root: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    exports: list[dict[str, Any]] = []
    invalid: list[dict[str, Any]] = []
    memory_dir = repo_root / "memory"
    if not memory_dir.exists():
        return exports, invalid
    for path in sorted(memory_dir.glob("sessions-export-*.md")):
        match = SESSION_EXPORT_RE.fullmatch(path.name)
        if not match:
            invalid.append(
                {
                    "path": _relative(path, repo_root),
                    "reason": "filename did not match expected sessions-export timestamp pattern",
                }
            )
            continue
        parsed = _parse_datetime(
            f"{match.group('date')}T{match.group('hour')}:{match.group('minute')}:00+00:00"
        )
        if parsed is None:
            invalid.append(
                {
                    "path": _relative(path, repo_root),
                    "reason": "filename matched sessions-export pattern but timestamp was invalid",
                }
            )
            continue
        exports.append({"path": path, "date": parsed})
    return exports, invalid


def _read_json(path: Path) -> tuple[Any | None, str | None]:
    try:
        return json.loads(path.read_text(encoding="utf-8")), None
    except Exception as exc:  # pragma: no cover - error shape varies by runtime
        return None, str(exc)


def _collect_payload_timestamps(value: Any, found: list[datetime]) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if key in TIMESTAMP_KEYS and isinstance(child, str):
                parsed = _parse_datetime(child)
                if parsed is not None:
                    found.append(parsed)
            else:
                _collect_payload_timestamps(child, found)
    elif isinstance(value, list):
        for child in value:
            _collect_payload_timestamps(child, found)


def _markdown_last_updated(path: Path) -> datetime | None:
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        return None
    match = MARKDOWN_UPDATED_RE.search(text)
    if match:
        return _parse_datetime(match.group(1))
    return None


def _path_digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _file_excerpt(path: Path, max_chars: int = 220) -> str:
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = [line.strip().lstrip("-#>* ").strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return ""
    excerpt = " ".join(lines[:2]).strip()
    if len(excerpt) <= max_chars:
        return excerpt
    return excerpt[: max_chars - 1].rstrip() + "…"


def _store_record(spec: dict[str, Any], *, repo_root: Path, now: datetime) -> dict[str, Any]:
    kind = spec["kind"]
    candidate_paths = [repo_root / path for path in spec.get("paths", ())]
    available_paths = [path for path in candidate_paths if path.exists()]
    details: dict[str, Any] = {}
    selected_path: Path | None = None
    last_updated: datetime | None = None
    parse_error: str | None = None

    if kind == "daily_logs":
        logs, invalid = _daily_logs(repo_root)
        if logs:
            selected_path = logs[-1]["path"]
            last_updated = logs[-1]["date"]
        details["log_count"] = len(logs)
        details["invalid_logs"] = invalid
        total_bytes = sum(log["path"].stat().st_size for log in logs)
        file_count = len(logs)
    elif kind == "session_exports":
        exports, invalid = _session_exports(repo_root)
        if exports:
            selected_path = exports[-1]["path"]
            last_updated = exports[-1]["date"]
        details["export_count"] = len(exports)
        details["invalid_exports"] = invalid
        total_bytes = sum(entry["path"].stat().st_size for entry in exports)
        file_count = len(exports)
    elif kind == "knowledge_base":
        kb_report = collect_knowledge_base_status(repo_root=repo_root, now=now)
        entities_path = repo_root / kb_report["entities"]["path"]
        selected_path = entities_path if entities_path.exists() else None
        last_sync = kb_report["last_sync"].get("timestamp")
        if last_sync:
            last_updated = _parse_datetime(last_sync)
        elif selected_path is not None:
            last_updated = datetime.fromtimestamp(selected_path.stat().st_mtime, tz=timezone.utc)
        file_count = len(available_paths)
        total_bytes = sum(path.stat().st_size for path in available_paths if path.is_file())
        details = {
            "kb_status": kb_report["status"],
            "health_warnings": kb_report["warnings"],
            "top_level_entries": kb_report["top_level_entries"],
            "entity_line_count": kb_report["entities"]["line_count"],
            "entity_bytes": kb_report["entities"]["bytes"],
            "last_sync": kb_report["last_sync"],
            "mlx_pipeline": kb_report["mlx_pipeline"],
            "mlx_runtime": kb_report["mlx_runtime"],
        }
        status = {
            "healthy": "fresh",
            "warning": "warning",
            "seed_only": "stale",
            "stale": "stale",
            "missing": "missing",
        }.get(kb_report["status"], "warning")
    else:
        file_count = len(available_paths)
        total_bytes = sum(path.stat().st_size for path in available_paths)
        if available_paths:
            selected_path = max(available_paths, key=lambda path: path.stat().st_mtime)
            if kind == "json_state":
                payload, parse_error = _read_json(selected_path)
                if parse_error is None and not isinstance(payload, dict):
                    parse_error = "top-level JSON object expected"
                    payload = None
                if isinstance(payload, dict):
                    timestamps: list[datetime] = []
                    _collect_payload_timestamps(payload, timestamps)
                    last_updated = max(timestamps) if timestamps else None
                    details["top_level_keys"] = sorted(payload.keys())
                    if "interactions" in payload and isinstance(payload["interactions"], list):
                        details["interaction_count"] = len(payload["interactions"])
                    if "transitions" in payload and isinstance(payload["transitions"], list):
                        details["transition_count"] = len(payload["transitions"])
            elif kind == "markdown_doc":
                last_updated = _markdown_last_updated(selected_path)
        if selected_path is not None and last_updated is None:
            last_updated = datetime.fromtimestamp(selected_path.stat().st_mtime, tz=timezone.utc)

    if kind == "knowledge_base":
        age_days = round((now - last_updated).total_seconds() / 86400, 2) if last_updated else None
    elif selected_path is None:
        status = "missing"
        age_days = None
    else:
        age_days = round((now - last_updated).total_seconds() / 86400, 2) if last_updated else None
        if parse_error is not None:
            status = "warning"
        elif age_days is None:
            status = "warning"
        elif age_days <= spec["warn_days"]:
            status = "fresh"
        elif age_days <= spec["stale_days"]:
            status = "warning"
        else:
            status = "stale"

    conflict_paths: list[str] = []
    if kind != "knowledge_base" and len(available_paths) > 1:
        digests = {_path_digest(path) for path in available_paths}
        if len(digests) > 1:
            conflict_paths = [_relative(path, repo_root) for path in available_paths]

    return {
        "name": spec["name"],
        "label": spec["label"],
        "kind": kind,
        "required": bool(spec["required"]),
        "status": status,
        "warn_days": spec["warn_days"],
        "stale_days": spec["stale_days"],
        "candidate_paths": [_relative(path, repo_root) for path in candidate_paths],
        "available_paths": [_relative(path, repo_root) for path in available_paths],
        "selected_path": _relative(selected_path, repo_root) if selected_path is not None else None,
        "last_updated": last_updated.isoformat() if last_updated else None,
        "age_days": age_days,
        "files": file_count,
        "bytes": total_bytes,
        "parse_error": parse_error,
        "conflict_paths": conflict_paths,
        "details": details,
    }


def collect_store_inventory(
    *, repo_root: Path | str = REPO_ROOT, now: datetime | None = None
) -> list[dict[str, Any]]:
    root = Path(repo_root)
    current = _utc_now(now)
    return [_store_record(spec, repo_root=root, now=current) for spec in STORE_SPECS]


def build_memory_freshness_index(
    *, repo_root: Path | str = REPO_ROOT, now: datetime | None = None
) -> dict[str, Any]:
    current = _utc_now(now)
    stores = collect_store_inventory(repo_root=repo_root, now=current)
    counts = Counter(store["status"] for store in stores)
    stale = [store["name"] for store in stores if store["status"] in {"stale", "missing"}]
    warning = [store["name"] for store in stores if store["status"] == "warning"]
    return {
        "assessed_at": current.isoformat(),
        "by_status": dict(counts),
        "stale_categories": stale,
        "warning_categories": warning,
        "stores": stores,
    }


def collect_memory_status(
    *, repo_root: Path | str = REPO_ROOT, now: datetime | None = None
) -> dict[str, Any]:
    current = _utc_now(now)
    stores = collect_store_inventory(repo_root=repo_root, now=current)
    conflicts = [
        {"name": store["name"], "paths": store["conflict_paths"]}
        for store in stores
        if store["conflict_paths"]
    ]
    return {
        "assessed_at": current.isoformat(),
        "summary": {
            "store_count": len(stores),
            "total_files": sum(store["files"] for store in stores),
            "total_bytes": sum(store["bytes"] for store in stores),
            "stale_categories": [
                store["name"] for store in stores if store["status"] in {"stale", "missing"}
            ],
            "warning_categories": [store["name"] for store in stores if store["status"] == "warning"],
            "open_conflicts": conflicts,
        },
        "stores": stores,
    }


def collect_memory_audit(
    *, repo_root: Path | str = REPO_ROOT, now: datetime | None = None
) -> dict[str, Any]:
    current = _utc_now(now)
    root = Path(repo_root)
    stores = collect_store_inventory(repo_root=root, now=current)
    daily_logs, invalid_logs = _daily_logs(root)
    session_exports, invalid_exports = _session_exports(root)
    failures: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []

    for store in stores:
        if store["required"] and store["status"] == "missing":
            failures.append(
                {"check": store["name"], "message": f"required memory store missing: {store['label']}"}
            )
        if store["parse_error"]:
            failures.append(
                {
                    "check": store["name"],
                    "message": f"failed to parse {store['selected_path']}: {store['parse_error']}",
                }
            )
        if store["conflict_paths"]:
            warnings.append(
                {
                    "check": store["name"],
                    "message": f"conflicting candidate files present: {', '.join(store['conflict_paths'])}",
                }
            )
        if store["kind"] == "knowledge_base":
            for message in store["details"].get("health_warnings", []):
                warnings.append({"check": store["name"], "message": message})

    for invalid in invalid_logs:
        failures.append({"check": "daily_logs", "message": f"invalid daily log filename: {invalid['path']}"})

    for invalid in invalid_exports:
        failures.append(
            {"check": "session_exports", "message": f"invalid session export filename: {invalid['path']}"}
        )

    for log in daily_logs:
        try:
            text = log["path"].read_text(encoding="utf-8")
        except Exception as exc:  # pragma: no cover - platform-specific error text
            failures.append(
                {
                    "check": "daily_logs",
                    "message": f"failed to read { _relative(log['path'], root) }: {exc}",
                }
            )
            continue
        if not text.strip():
            warnings.append(
                {
                    "check": "daily_logs",
                    "message": f"daily log is empty: {_relative(log['path'], root)}",
                }
            )

    for export in session_exports:
        try:
            text = export["path"].read_text(encoding="utf-8")
        except Exception as exc:  # pragma: no cover - platform-specific error text
            failures.append(
                {
                    "check": "session_exports",
                    "message": f"failed to read {_relative(export['path'], root)}: {exc}",
                }
            )
            continue
        if not text.strip():
            warnings.append(
                {
                    "check": "session_exports",
                    "message": f"session export is empty: {_relative(export['path'], root)}",
                }
            )

    return {
        "assessed_at": current.isoformat(),
        "ok": not failures,
        "summary": {
            "stores_checked": len(stores),
            "daily_logs_checked": len(daily_logs),
            "session_exports_checked": len(session_exports),
            "failures": len(failures),
            "warnings": len(warnings),
        },
        "failures": failures,
        "warnings": warnings,
    }


def build_memory_summary(
    *,
    since: str = "7d",
    repo_root: Path | str = REPO_ROOT,
    now: datetime | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    current = _utc_now(now)
    window = parse_since(since)
    cutoff = current - window
    root = Path(repo_root)
    logs, _ = _daily_logs(root)
    entries: list[dict[str, Any]] = []
    for log in logs:
        if log["date"] < cutoff:
            continue
        excerpt = _file_excerpt(log["path"])
        entries.append(
            {
                "date": log["date"].date().isoformat(),
                "path": _relative(log["path"], root),
                "excerpt": excerpt,
            }
        )
    entries.sort(key=lambda entry: entry["date"], reverse=True)
    entries = entries[: max(limit, 0)]

    memory_path = root / "MEMORY.md"
    return {
        "assessed_at": current.isoformat(),
        "window": since,
        "cutoff": cutoff.isoformat(),
        "files_considered": len(entries),
        "entries": entries,
        "long_term_memory": {
            "path": "MEMORY.md",
            "present": memory_path.exists(),
            "last_updated": _markdown_last_updated(memory_path).isoformat()
            if memory_path.exists() and _markdown_last_updated(memory_path)
            else None,
        },
    }


__all__ = [
    "REPO_ROOT",
    "build_memory_freshness_index",
    "build_memory_summary",
    "collect_memory_audit",
    "collect_memory_status",
    "collect_store_inventory",
    "parse_since",
]
