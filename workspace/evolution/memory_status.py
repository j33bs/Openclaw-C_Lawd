#!/usr/bin/env python3
"""Report memory store sizes, freshness, and conflicts."""
from __future__ import annotations

import argparse
import json

if __package__:
    from .memory_health import collect_memory_status
else:  # pragma: no cover - script/local import compatibility
    from memory_health import collect_memory_status


def _print_human(report: dict) -> None:
    print(f"\n=== Memory Status — {report['assessed_at'][:10]} ===\n")
    for store in report["stores"]:
        updated = store["last_updated"][:10] if store["last_updated"] else "n/a"
        selected = store["selected_path"] or "(missing)"
        print(
            f"{store['status']:<7} {store['name']:<20} updated={updated:<10} "
            f"files={store['files']:<2} bytes={store['bytes']:<8} source={selected}"
        )
    conflicts = report["summary"]["open_conflicts"]
    print(f"\nopen conflicts: {len(conflicts)}")
    if conflicts:
        for conflict in conflicts:
            print(f"  - {conflict['name']}: {', '.join(conflict['paths'])}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="Report memory store status and freshness")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON output")
    args = parser.parse_args()

    report = collect_memory_status()
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        _print_human(report)


if __name__ == "__main__":
    main()
