#!/usr/bin/env python3
"""Shared helpers for knowledge-base and MLX health reporting."""
from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

REPO_ROOT = Path(__file__).resolve().parents[2]
KB_ROOT = Path("workspace/knowledge_base")
MLX_EXPECTED_FILES: tuple[str, ...] = (
    "indexer.py",
    "retrieval.py",
    "chunking.py",
    "kb.py",
    "vector_store_lancedb.py",
    "embeddings/driver_mlx.py",
)
SYNC_WARN_DAYS = 7
SYNC_STALE_DAYS = 30


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
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _read_last_sync(path: Path) -> tuple[str | None, datetime | None]:
    if not path.exists():
        return None, None
    raw = path.read_text(encoding="utf-8", errors="replace").strip()
    if not raw:
        return "", None
    parsed = _parse_datetime(raw)
    return raw, parsed


def _count_lines(path: Path) -> int:
    if not path.exists():
        return 0
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        return sum(1 for _ in handle)


def _resolve_mlx_python(repo_root: Path) -> Path | None:
    candidates = (
        repo_root / "workspace" / "runtime" / "models" / ".venv_mlx" / "bin" / "python",
        repo_root / "workspace" / "runtime" / "models" / ".venv_mlx" / "Scripts" / "python.exe",
    )
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def probe_mlx_runtime(repo_root: Path | str = REPO_ROOT) -> dict[str, Any]:
    root = Path(repo_root)
    python_path = _resolve_mlx_python(root)
    if python_path is None:
        return {"status": "venv_missing", "python": None, "package": "mlx_embeddings"}

    check_script = (
        "import importlib.util, json;"
        "print(json.dumps({'available': bool(importlib.util.find_spec('mlx_embeddings'))}))"
    )
    try:
        result = subprocess.run(
            [str(python_path), "-c", check_script],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except Exception as exc:  # pragma: no cover - subprocess shape varies by platform
        return {
            "status": "probe_error",
            "python": str(python_path),
            "package": "mlx_embeddings",
            "error": str(exc),
        }

    try:
        payload = json.loads(result.stdout.strip() or "{}")
    except json.JSONDecodeError:
        payload = {}
    if payload.get("available") is True:
        return {"status": "ready", "python": str(python_path), "package": "mlx_embeddings"}
    return {
        "status": "package_missing",
        "python": str(python_path),
        "package": "mlx_embeddings",
        "stderr": result.stderr.strip() or None,
    }


def collect_knowledge_base_status(
    *,
    repo_root: Path | str = REPO_ROOT,
    now: datetime | None = None,
    mlx_probe_func: Callable[[Path], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    root = Path(repo_root)
    current = _utc_now(now)
    kb_root = root / KB_ROOT
    entities_path = kb_root / "data" / "entities.jsonl"
    last_sync_path = kb_root / "data" / "last_sync.txt"
    expected_paths = [(kb_root / rel) for rel in MLX_EXPECTED_FILES]
    present = [path for path in expected_paths if path.exists()]
    missing = [path for path in expected_paths if not path.exists()]
    top_level_entries = (
        sorted(
            child.name
            for child in kb_root.iterdir()
            if child.name not in {"__pycache__"} and not child.name.startswith(".")
        )
        if kb_root.exists()
        else []
    )
    last_sync_raw, last_sync_dt = _read_last_sync(last_sync_path)
    entity_line_count = _count_lines(entities_path)
    last_sync_age_days = (
        round((current - last_sync_dt).total_seconds() / 86400, 2)
        if last_sync_dt is not None
        else None
    )
    entities_age_days = (
        round(
            (
                current - datetime.fromtimestamp(entities_path.stat().st_mtime, tz=timezone.utc)
            ).total_seconds()
            / 86400,
            2,
        )
        if entities_path.exists()
        else None
    )
    mlx_probe = (mlx_probe_func or probe_mlx_runtime)(root)

    warnings: list[str] = []
    if not kb_root.exists():
        status = "missing"
        warnings.append("workspace/knowledge_base is missing")
    elif not present:
        status = "seed_only"
        warnings.append("knowledge base contains seed data but no MLX pipeline files")
    else:
        status = "healthy"
        if missing:
            status = "warning"
            warnings.append(
                "missing MLX pipeline files: "
                + ", ".join(_relative(path, root) for path in missing)
            )
        if mlx_probe.get("status") != "ready":
            status = "warning"
            warnings.append(f"MLX runtime not ready: {mlx_probe.get('status')}")
        if last_sync_dt is None:
            status = "warning"
            warnings.append("knowledge base last_sync timestamp missing or invalid")
        elif last_sync_age_days is not None and last_sync_age_days > SYNC_WARN_DAYS:
            status = "warning"
            warnings.append(f"knowledge base last_sync is aging ({last_sync_age_days}d)")
        if last_sync_age_days is not None and last_sync_age_days > SYNC_STALE_DAYS:
            status = "stale"
            warnings.append("knowledge base sync is stale")

    if entities_path.exists() and entity_line_count <= 1:
        warnings.append("knowledge base entity corpus is still at the seed-row stage")
        if status == "healthy":
            status = "warning"

    if kb_root.exists() and last_sync_dt is None:
        warnings.append("knowledge base last_sync timestamp missing or invalid")
        if status == "healthy":
            status = "warning"

    return {
        "assessed_at": current.isoformat(),
        "status": status,
        "knowledge_base_root": _relative(kb_root, root),
        "top_level_entries": top_level_entries,
        "entities": {
            "path": _relative(entities_path, root),
            "exists": entities_path.exists(),
            "line_count": entity_line_count,
            "bytes": entities_path.stat().st_size if entities_path.exists() else 0,
            "age_days": entities_age_days,
        },
        "last_sync": {
            "path": _relative(last_sync_path, root),
            "raw": last_sync_raw,
            "timestamp": last_sync_dt.isoformat() if last_sync_dt is not None else None,
            "age_days": last_sync_age_days,
        },
        "mlx_pipeline": {
            "expected_files": [_relative(path, root) for path in expected_paths],
            "present_files": [_relative(path, root) for path in present],
            "missing_files": [_relative(path, root) for path in missing],
        },
        "mlx_runtime": mlx_probe,
        "warnings": warnings,
    }


def build_knowledge_base_health_signal(
    *,
    repo_root: Path | str = REPO_ROOT,
    now: datetime | None = None,
    mlx_probe_func: Callable[[Path], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    report = collect_knowledge_base_status(
        repo_root=repo_root,
        now=now,
        mlx_probe_func=mlx_probe_func,
    )
    severity = {
        "healthy": "green",
        "warning": "yellow",
        "seed_only": "red",
        "stale": "red",
        "missing": "red",
    }.get(report["status"], "yellow")
    return {
        "assessed_at": report["assessed_at"],
        "status": report["status"],
        "severity": severity,
        "warnings": report["warnings"],
        "details": report,
    }
