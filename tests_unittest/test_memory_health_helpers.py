"""Tests for workspace/evolution/memory_health.py helper functions."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
EVOLUTION_DIR = REPO_ROOT / "workspace" / "evolution"
if str(EVOLUTION_DIR) not in sys.path:
    sys.path.insert(0, str(EVOLUTION_DIR))

from memory_health import (  # noqa: E402
    build_memory_freshness_index,
    build_memory_summary,
    collect_memory_audit,
    collect_memory_status,
    parse_since,
)


def _seed_repo(root: Path) -> None:
    (root / "MEMORY.md").write_text("# MEMORY\n\n_Last updated: 2026-03-20_\n", encoding="utf-8")
    (root / "memory").mkdir(parents=True, exist_ok=True)
    (root / "memory" / "2026-03-22.md").write_text(
        "2026-03-22 - Checked runtime health.\n", encoding="utf-8"
    )
    (root / "memory" / "2026-03-23.md").write_text(
        "2026-03-23 - Added memory health tooling.\n", encoding="utf-8"
    )
    (root / "memory" / "heartbeat-state.json").write_text(
        json.dumps({"lastChecks": {"email": 1711185600}}),
        encoding="utf-8",
    )
    (root / "memory" / "sessions-export-2026-03-23_1100.md").write_text(
        "# OpenClaw Sessions Export\nGenerated: 2026-03-23T11:00:00+00:00\n",
        encoding="utf-8",
    )
    (root / "nodes" / "c_lawd").mkdir(parents=True, exist_ok=True)
    (root / "nodes" / "c_lawd" / "MEMORY.md").write_text("# Node memory\n", encoding="utf-8")
    (root / "nodes" / "c_lawd" / "CONVERSATION_KERNEL.md").write_text(
        "# Kernel\n", encoding="utf-8"
    )
    (root / "workspace" / "knowledge_base" / "data").mkdir(parents=True, exist_ok=True)
    (root / "workspace" / "knowledge_base" / "data" / "entities.jsonl").write_text(
        '{"id":"user"}\n', encoding="utf-8"
    )
    (root / "workspace" / "memory").mkdir(parents=True, exist_ok=True)
    (root / "workspace" / "memory" / "relationship.json").write_text(
        json.dumps(
            {
                "created": "2026-03-20",
                "interactions": [{"timestamp": "2026-03-23T10:15:00+00:00"}],
                "trust_score": 0.9,
            }
        ),
        encoding="utf-8",
    )
    (root / "workspace" / "memory" / "arousal_state.json").write_text(
        json.dumps({"last_update": "2026-03-23T11:00:00+00:00", "metrics": {"messages": 2}}),
        encoding="utf-8",
    )


class TestParseSince(unittest.TestCase):
    def test_days(self) -> None:
        self.assertEqual(parse_since("7d").days, 7)

    def test_weeks(self) -> None:
        self.assertEqual(parse_since("2w").days, 14)

    def test_invalid(self) -> None:
        with self.assertRaises(ValueError):
            parse_since("tomorrow")


class TestMemoryHealthReports(unittest.TestCase):
    def test_freshness_index_tracks_store_status(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _seed_repo(root)
            report = build_memory_freshness_index(
                repo_root=root,
                now=datetime(2026, 3, 23, 12, 0, tzinfo=timezone.utc),
            )
            self.assertIn("daily_logs", [store["name"] for store in report["stores"]])
            self.assertEqual(report["by_status"].get("fresh"), 8)
            self.assertEqual(report["stale_categories"], ["knowledge_base"])
            kb_store = next(store for store in report["stores"] if store["name"] == "knowledge_base")
            self.assertEqual(kb_store["status"], "stale")
            self.assertEqual(kb_store["details"]["kb_status"], "seed_only")

    def test_memory_status_reports_conflicts(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _seed_repo(root)
            legacy = root / "workspace" / "memory" / "relationship.json"
            canonical = root / "workspace" / "state_runtime" / "memory" / "relationship_state.json"
            canonical.parent.mkdir(parents=True, exist_ok=True)
            canonical.write_text(
                json.dumps({"updated_at": "2026-03-23T09:00:00+00:00", "sessions": {}}),
                encoding="utf-8",
            )
            status = collect_memory_status(
                repo_root=root,
                now=datetime(2026, 3, 23, 12, 0, tzinfo=timezone.utc),
            )
            self.assertEqual(len(status["summary"]["open_conflicts"]), 1)
            self.assertEqual(status["summary"]["open_conflicts"][0]["name"], "relationship_state")

    def test_memory_audit_fails_on_invalid_json(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _seed_repo(root)
            (root / "workspace" / "memory" / "relationship.json").write_text(
                "{not-json}", encoding="utf-8"
            )
            audit = collect_memory_audit(
                repo_root=root,
                now=datetime(2026, 3, 23, 12, 0, tzinfo=timezone.utc),
            )
            self.assertFalse(audit["ok"])
            self.assertEqual(audit["summary"]["failures"], 1)

    def test_memory_audit_tracks_session_exports(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _seed_repo(root)
            audit = collect_memory_audit(
                repo_root=root,
                now=datetime(2026, 3, 23, 12, 0, tzinfo=timezone.utc),
            )
            self.assertTrue(audit["ok"])
            self.assertEqual(audit["summary"]["session_exports_checked"], 1)
            self.assertEqual(audit["summary"]["warnings"], 3)
            warning_checks = {warning["check"] for warning in audit["warnings"]}
            self.assertIn("knowledge_base", warning_checks)

    def test_memory_summary_filters_window(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _seed_repo(root)
            summary = build_memory_summary(
                repo_root=root,
                since="24h",
                now=datetime(2026, 3, 23, 12, 0, tzinfo=timezone.utc),
            )
            self.assertEqual(summary["files_considered"], 1)
            self.assertEqual(summary["entries"][0]["date"], "2026-03-23")
            self.assertIn("memory health tooling", summary["entries"][0]["excerpt"].lower())


if __name__ == "__main__":
    unittest.main()
