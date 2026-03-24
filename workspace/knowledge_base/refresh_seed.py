#!/usr/bin/env python3
"""Write a compatibility KB snapshot from local durable sources only."""
from __future__ import annotations

import argparse
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[2]
KB_DATA_DIR = Path("workspace/knowledge_base/data")
ENTITIES_PATH = KB_DATA_DIR / "entities.jsonl"
LAST_SYNC_PATH = KB_DATA_DIR / "last_sync.txt"
SOURCE_PATTERNS: tuple[str, ...] = (
    "MEMORY.md",
    "SOUL.md",
    "IDENTITY.md",
    "USER.md",
    "nodes/c_lawd/*.md",
    "workspace/governance/**/*.md",
    "workspace/profile/**/*.md",
    "workspace/research/**/*.md",
    "workspace/memory/*.md",
    "workspace/knowledge_base/README.md",
)


def _utc_now(now: datetime | None = None) -> datetime:
    if now is None:
        return datetime.now(tz=timezone.utc)
    if now.tzinfo is None:
        return now.replace(tzinfo=timezone.utc)
    return now.astimezone(timezone.utc)


def _format_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "document"


def _discover_source_files(repo_root: Path) -> list[Path]:
    found: dict[str, Path] = {}
    for pattern in SOURCE_PATTERNS:
        for path in repo_root.glob(pattern):
            if not path.is_file():
                continue
            if path.suffix.lower() != ".md":
                continue
            rel = path.relative_to(repo_root).as_posix()
            found[rel] = path
    return [found[key] for key in sorted(found)]


def _extract_markdown_summary(path: Path, text: str) -> tuple[str, str]:
    lines = [line.rstrip() for line in text.splitlines()]
    title = path.stem.replace("_", " ").strip().title()
    body_start = 0

    for index, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            title = stripped.lstrip("#").strip() or title
            body_start = index + 1
        else:
            body_start = index
        break

    excerpt_parts: list[str] = []
    for line in lines[body_start:]:
        stripped = line.strip()
        if not stripped:
            continue
        excerpt_parts.append(stripped)
        if len(" ".join(excerpt_parts)) >= 280:
            break

    excerpt = re.sub(r"\s+", " ", " ".join(excerpt_parts)).strip()
    return title, excerpt or title


def _entity_type_for_path(rel_path: Path) -> str:
    parts = rel_path.parts
    if parts[:2] == ("nodes", "c_lawd"):
        return "node_doc"
    if parts and parts[0] == "workspace" and len(parts) > 1:
        return f"{parts[1].replace('-', '_')}_doc"
    return "doc"


def _build_entities(repo_root: Path, now: datetime | None = None) -> tuple[list[dict], str, list[Path], int]:
    snapshot_at = _format_utc(_utc_now(now))
    source_files = _discover_source_files(repo_root)
    entities: list[dict] = []
    skipped = 0

    for path in source_files:
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            skipped += 1
            continue
        rel_path = path.relative_to(repo_root)
        title, excerpt = _extract_markdown_summary(path, text)
        entities.append(
            {
                "id": f"kb-{_slugify(rel_path.as_posix())}",
                "name": title,
                "entity_type": _entity_type_for_path(rel_path),
                "content": excerpt,
                "created_at": snapshot_at,
                "source_path": rel_path.as_posix(),
            }
        )

    if not entities:
        raise RuntimeError("No durable source documents were available for the KB snapshot")

    return entities, snapshot_at, source_files, skipped


def _atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temp_path = Path(temp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)
    finally:
        if temp_path.exists():
            try:
                temp_path.unlink()
            except FileNotFoundError:
                pass


def write_compatibility_snapshot(*, repo_root: Path | str = REPO_ROOT, now: datetime | None = None) -> dict:
    root = Path(repo_root)
    entities, snapshot_at, source_files, skipped = _build_entities(root, now=now)
    entities_path = root / ENTITIES_PATH
    last_sync_path = root / LAST_SYNC_PATH

    jsonl = "".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in entities)
    _atomic_write_text(entities_path, jsonl)
    _atomic_write_text(last_sync_path, f"{snapshot_at}\n")

    return {
        "status": "ok",
        "snapshot_at": snapshot_at,
        "entities_written": len(entities),
        "sources_considered": len(source_files),
        "skipped_sources": skipped,
        "entities_path": ENTITIES_PATH.as_posix(),
        "last_sync_path": LAST_SYNC_PATH.as_posix(),
    }


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Write the compatibility knowledge-base snapshot")
    parser.add_argument("--json", action="store_true", help="Print a concise JSON summary")
    parser.add_argument(
        "--repo-root",
        default=None,
        help="Override the repository root for testing or alternate worktrees",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    repo_root = Path(args.repo_root).resolve() if args.repo_root else REPO_ROOT
    summary = write_compatibility_snapshot(repo_root=repo_root)
    if args.json:
        print(json.dumps(summary, ensure_ascii=False, separators=(",", ":")))
    else:
        print(
            f"wrote {summary['entities_written']} entities from {summary['sources_considered']} "
            f"sources; last_sync={summary['snapshot_at']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
