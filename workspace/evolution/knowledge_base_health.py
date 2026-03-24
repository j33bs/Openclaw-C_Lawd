#!/usr/bin/env python3
"""Shared helpers for knowledge-base backend health reporting."""
from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib import error, request

REPO_ROOT = Path(__file__).resolve().parents[2]
KB_ROOT = Path("workspace/knowledge_base")
BACKEND_EXPECTED_FILES: tuple[str, ...] = (
    "indexer.py",
    "retrieval.py",
    "chunking.py",
    "kb.py",
    "vector_store.py",
    "vector_store_lancedb.py",
    "embeddings/driver_ollama.py",
)
VECTOR_STORE_PATH = KB_ROOT / "data" / "kb.sqlite3"
DEFAULT_OLLAMA_MODEL = "nomic-embed-text"
DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434"
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


def _normalize_ollama_base_url(value: str | None) -> str:
    base_url = (value or DEFAULT_OLLAMA_BASE_URL).strip()
    if base_url and "://" not in base_url:
        base_url = f"http://{base_url}"
    base_url = base_url.rstrip("/")
    if base_url.endswith("/v1"):
        base_url = base_url[:-3]
    return base_url or DEFAULT_OLLAMA_BASE_URL


def _env_default(*names: str) -> str | None:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    return None


def _load_vector_store_status(path: Path, *, repo_root: Path) -> dict[str, Any]:
    if not path.exists():
        return {
            "status": "missing",
            "path": _relative(path, repo_root),
            "exists": False,
            "document_count": 0,
            "chunk_count": 0,
            "metadata": {},
        }
    try:
        with sqlite3.connect(path) as conn:
            document_count = conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
            chunk_count = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
            metadata = {
                row[0]: row[1]
                for row in conn.execute("SELECT key, value FROM metadata ORDER BY key")
            }
    except sqlite3.Error as exc:
        return {
            "status": "error",
            "path": _relative(path, repo_root),
            "exists": True,
            "document_count": 0,
            "chunk_count": 0,
            "metadata": {},
            "error": str(exc),
        }
    return {
        "status": "ready" if document_count and chunk_count else "empty",
        "path": _relative(path, repo_root),
        "exists": True,
        "document_count": int(document_count),
        "chunk_count": int(chunk_count),
        "metadata": metadata,
    }


def collect_knowledge_base_status(
    *,
    repo_root: Path | str = REPO_ROOT,
    now: datetime | None = None,
    runtime_probe_func: Callable[[Path], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    root = Path(repo_root)
    current = _utc_now(now)
    kb_root = root / KB_ROOT
    entities_path = kb_root / "data" / "entities.jsonl"
    last_sync_path = kb_root / "data" / "last_sync.txt"
    vector_store_path = root / VECTOR_STORE_PATH
    expected_paths = [(kb_root / rel) for rel in BACKEND_EXPECTED_FILES]
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
    embedding_runtime = (runtime_probe_func or probe_embedding_runtime)(root)
    vector_store = _load_vector_store_status(vector_store_path, repo_root=root)

    warnings: list[str] = []
    if not kb_root.exists():
        status = "missing"
        warnings.append("workspace/knowledge_base is missing")
    elif not present:
        status = "seed_only"
        warnings.append("knowledge base contains compatibility data but no local backend files")
    else:
        status = "healthy"
        if missing:
            status = "warning"
            warnings.append(
                "missing backend files: "
                + ", ".join(_relative(path, root) for path in missing)
            )
        if embedding_runtime.get("status") != "ready":
            status = "warning"
            warnings.append(f"embedding runtime not ready: {embedding_runtime.get('status')}")
        if last_sync_dt is None:
            status = "warning"
            warnings.append("knowledge base last_sync timestamp missing or invalid")
        elif last_sync_age_days is not None and last_sync_age_days > SYNC_WARN_DAYS:
            status = "warning"
            warnings.append(f"knowledge base last_sync is aging ({last_sync_age_days}d)")
        if last_sync_age_days is not None and last_sync_age_days > SYNC_STALE_DAYS:
            status = "stale"
            warnings.append("knowledge base sync is stale")
        if not vector_store["exists"]:
            status = "warning"
            warnings.append("knowledge base vector store is missing")
        elif vector_store["status"] == "error":
            status = "warning"
            warnings.append(f"knowledge base vector store unreadable: {vector_store.get('error')}")
        elif vector_store["document_count"] <= 0 or vector_store["chunk_count"] <= 0:
            status = "warning"
            warnings.append("knowledge base vector store is empty")

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
        "backend_files": {
            "expected_files": [_relative(path, root) for path in expected_paths],
            "present_files": [_relative(path, root) for path in present],
            "missing_files": [_relative(path, root) for path in missing],
        },
        "embedding_runtime": embedding_runtime,
        "vector_store": vector_store,
        "mlx_pipeline": {
            "expected_files": [_relative(path, root) for path in expected_paths],
            "present_files": [_relative(path, root) for path in present],
            "missing_files": [_relative(path, root) for path in missing],
        },
        "mlx_runtime": embedding_runtime,
        "warnings": warnings,
    }


def build_knowledge_base_health_signal(
    *,
    repo_root: Path | str = REPO_ROOT,
    now: datetime | None = None,
    runtime_probe_func: Callable[[Path], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    report = collect_knowledge_base_status(
        repo_root=repo_root,
        now=now,
        runtime_probe_func=runtime_probe_func,
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


def probe_embedding_runtime(repo_root: Path | str = REPO_ROOT) -> dict[str, Any]:
    del repo_root  # runtime probe uses local Ollama env/config rather than repo files
    base_url = _normalize_ollama_base_url(_env_default("OLLAMA_BASE_URL", "OLLAMA_HOST"))
    model = (_env_default("OLLAMA_EMBEDDING_MODEL") or DEFAULT_OLLAMA_MODEL).strip()
    tags_url = f"{base_url}/api/tags"
    req = request.Request(tags_url, method="GET")
    try:
        with request.urlopen(req, timeout=5) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        return {
            "status": "http_error",
            "base_url": base_url,
            "model": model,
            "error": detail or exc.reason,
        }
    except OSError as exc:
        return {
            "status": "unavailable",
            "base_url": base_url,
            "model": model,
            "error": str(exc),
        }
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        return {
            "status": "invalid_response",
            "base_url": base_url,
            "model": model,
            "error": str(exc),
        }
    model_names: list[str] = []
    models = payload.get("models")
    if isinstance(models, list):
        for item in models:
            if isinstance(item, dict):
                name = item.get("name") or item.get("model")
                if name:
                    model_names.append(str(name))
    return {
        "status": "ready",
        "base_url": base_url,
        "model": model,
        "available_models": model_names,
    }
