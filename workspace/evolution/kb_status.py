#!/usr/bin/env python3
"""Report knowledge-base and MLX pipeline status."""
from __future__ import annotations

import argparse
import json

if __package__:
    from .knowledge_base_health import collect_knowledge_base_status
else:  # pragma: no cover - script/local import compatibility
    from knowledge_base_health import collect_knowledge_base_status


def _print_human(report: dict) -> None:
    print(f"\n=== Knowledge Base Status — {report['assessed_at'][:10]} ===\n")
    print(f"status: {report['status']}")
    print(f"root: {report['knowledge_base_root']}")
    print(f"top-level entries: {', '.join(report['top_level_entries']) or '(none)'}")
    entities = report["entities"]
    print(
        f"entities: exists={entities['exists']} lines={entities['line_count']} "
        f"bytes={entities['bytes']} age_days={entities['age_days']}"
    )
    last_sync = report["last_sync"]
    print(
        f"last_sync: raw={last_sync['raw']!r} timestamp={last_sync['timestamp']} "
        f"age_days={last_sync['age_days']}"
    )
    mlx = report["mlx_pipeline"]
    print(f"MLX files present: {len(mlx['present_files'])}/{len(mlx['expected_files'])}")
    if mlx["missing_files"]:
        print("missing MLX files:")
        for path in mlx["missing_files"]:
            print(f"  - {path}")
    runtime = report["mlx_runtime"]
    print(f"MLX runtime: {runtime['status']}")
    if runtime.get("python"):
        print(f"  python: {runtime['python']}")
    if report["warnings"]:
        print("warnings:")
        for warning in report["warnings"]:
            print(f"  - {warning}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="Report knowledge-base and MLX pipeline status")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON output")
    args = parser.parse_args()

    report = collect_knowledge_base_status()
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        _print_human(report)


if __name__ == "__main__":
    main()
