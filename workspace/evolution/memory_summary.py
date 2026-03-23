#!/usr/bin/env python3
"""Generate a recent-memory digest without loading raw logs into chat context."""
from __future__ import annotations

import argparse
import json

if __package__:
    from .memory_health import build_memory_summary
else:  # pragma: no cover - script/local import compatibility
    from memory_health import build_memory_summary


def _print_human(report: dict) -> None:
    print(f"\n=== Memory Summary — since {report['window']} ===\n")
    if not report["entries"]:
        print("No daily logs fell inside the requested window.\n")
        return
    for entry in report["entries"]:
        print(f"- {entry['date']}: {entry['excerpt']}")
    long_term = report["long_term_memory"]
    if long_term["present"]:
        stamp = long_term["last_updated"][:10] if long_term["last_updated"] else "unknown"
        print(f"\nLong-term memory last updated: {stamp}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="Summarize recent memory entries")
    parser.add_argument("--since", default="7d", help="Window such as 7d, 48h, or 2w")
    parser.add_argument("--limit", type=int, default=10, help="Maximum number of entries to emit")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON output")
    args = parser.parse_args()

    report = build_memory_summary(since=args.since, limit=args.limit)
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        _print_human(report)


if __name__ == "__main__":
    main()
