#!/usr/bin/env python3
"""Validate the current memory surfaces and report integrity issues."""
from __future__ import annotations

import argparse
import json
import sys

if __package__:
    from .memory_health import collect_memory_audit
else:  # pragma: no cover - script/local import compatibility
    from memory_health import collect_memory_audit


def _print_human(report: dict) -> None:
    print(f"\n=== Memory Audit — {report['assessed_at'][:10]} ===\n")
    print(f"status: {'PASS' if report['ok'] else 'FAIL'}")
    print(f"stores checked: {report['summary']['stores_checked']}")
    print(f"daily logs checked: {report['summary']['daily_logs_checked']}")
    print(f"failures: {report['summary']['failures']}")
    print(f"warnings: {report['summary']['warnings']}")
    if report["failures"]:
        print("\nFailures:")
        for failure in report["failures"]:
            print(f"  - [{failure['check']}] {failure['message']}")
    if report["warnings"]:
        print("\nWarnings:")
        for warning in report["warnings"]:
            print(f"  - [{warning['check']}] {warning['message']}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit memory integrity and freshness prerequisites")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON output")
    args = parser.parse_args()

    report = collect_memory_audit()
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        _print_human(report)
    sys.exit(0 if report["ok"] else 1)


if __name__ == "__main__":
    main()
