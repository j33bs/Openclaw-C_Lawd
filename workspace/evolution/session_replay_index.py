#!/usr/bin/env python3
"""Build a lightweight date-to-topic index for daily memory logs."""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
DAILY_LOG_RE = re.compile(r"^(?P<date>\d{4}-\d{2}-\d{2})\.md$")
TOPIC_SKIP = {
    "Added",
    "Created",
    "From",
    "How",
    "That",
    "The",
    "This",
    "Updated",
    "Using",
    "What",
    "When",
    "Where",
    "Why",
    "With",
}


def _daily_logs(repo_root: Path | str = REPO_ROOT) -> list[Path]:
    root = Path(repo_root)
    memory_dir = root / "memory"
    logs = []
    if not memory_dir.exists():
        return logs
    for path in sorted(memory_dir.glob("*.md"), reverse=True):
        if DAILY_LOG_RE.fullmatch(path.name):
            logs.append(path)
    return logs


def _extract_topics(text: str, *, limit: int = 8) -> list[str]:
    words = re.findall(r"\b[A-Z][A-Za-z0-9_-]+\b", text)
    filtered = [word for word in words if word not in TOPIC_SKIP and len(word) > 3]
    counts = Counter(filtered)
    return [topic for topic, _ in counts.most_common(limit)]


def _excerpt(text: str, *, max_chars: int = 220) -> str:
    lines = [line.strip().lstrip("-#>* ").strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return ""
    excerpt = " ".join(lines[:2]).strip()
    if len(excerpt) <= max_chars:
        return excerpt
    return excerpt[: max_chars - 1].rstrip() + "…"


def build_session_replay_index(
    *,
    repo_root: Path | str = REPO_ROOT,
    topic_limit: int = 8,
) -> dict[str, Any]:
    root = Path(repo_root)
    entries: list[dict[str, Any]] = []
    for path in _daily_logs(root):
        text = path.read_text(encoding="utf-8", errors="replace")
        entries.append(
            {
                "date": path.stem,
                "path": str(path.relative_to(root)),
                "topics": _extract_topics(text, limit=topic_limit),
                "excerpt": _excerpt(text),
            }
        )
    return {
        "assessed_at": datetime.now(tz=timezone.utc).isoformat(),
        "entries": entries,
        "count": len(entries),
    }


def query_session_replay(index: dict[str, Any], query: str) -> list[dict[str, Any]]:
    needle = str(query or "").strip().lower()
    if not needle:
        return list(index.get("entries", []))
    matches: list[dict[str, Any]] = []
    for entry in index.get("entries", []):
        haystack = " ".join(entry.get("topics", [])) + " " + entry.get("excerpt", "")
        if needle in haystack.lower():
            matches.append(entry)
    return matches


def _print_human(entries: list[dict[str, Any]], *, query: str | None = None) -> None:
    title = "Session Replay Index"
    if query:
        title += f" — query={query}"
    print(f"\n=== {title} ===\n")
    if not entries:
        print("No matching indexed sessions.\n")
        return
    for entry in entries:
        topics = ", ".join(entry["topics"]) if entry["topics"] else "(no strong topics)"
        print(f"- {entry['date']} [{topics}]")
        print(f"  {entry['excerpt']}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="Index daily logs by date, topics, and excerpt")
    parser.add_argument("--query", help="Case-insensitive topic/excerpt search term")
    parser.add_argument("--topic-limit", type=int, default=8, help="Maximum topics per day")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON output")
    args = parser.parse_args()

    index = build_session_replay_index(topic_limit=args.topic_limit)
    entries = query_session_replay(index, args.query or "")

    if args.json:
        payload = {
            "assessed_at": index["assessed_at"],
            "query": args.query or "",
            "count": len(entries),
            "entries": entries,
        }
        print(json.dumps(payload, indent=2))
        return

    _print_human(entries, query=args.query)


if __name__ == "__main__":
    main()
