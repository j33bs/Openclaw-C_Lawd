"""Tests for workspace/knowledge_base/refresh_seed.py."""
from __future__ import annotations

import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[1]
KB_DIR = REPO_ROOT / "workspace" / "knowledge_base"
if str(KB_DIR) not in sys.path:
    sys.path.insert(0, str(KB_DIR))

import refresh_seed  # noqa: E402


def _seed_repo(root: Path) -> None:
    (root / "workspace" / "knowledge_base" / "data").mkdir(parents=True, exist_ok=True)
    (root / "workspace" / "knowledge_base" / "README.md").write_text(
        "# Knowledge Base Home\n\nCompatibility snapshot landing zone.\n",
        encoding="utf-8",
    )
    (root / "workspace" / "governance").mkdir(parents=True, exist_ok=True)
    (root / "workspace" / "governance" / "README.md").write_text(
        "# Governance Home\n\nStable governance notes.\n",
        encoding="utf-8",
    )
    (root / "workspace" / "research").mkdir(parents=True, exist_ok=True)
    (root / "workspace" / "research" / "README.md").write_text(
        "# Research Home\n\nStable research notes.\n",
        encoding="utf-8",
    )
    (root / "workspace" / "profile").mkdir(parents=True, exist_ok=True)
    (root / "workspace" / "profile" / "openclaw_docs_inventory.md").write_text(
        "# OpenClaw Docs Inventory\n\nFresh upstream docs findings.\n",
        encoding="utf-8",
    )
    (root / "nodes" / "c_lawd").mkdir(parents=True, exist_ok=True)
    (root / "nodes" / "c_lawd" / "CONVERSATION_KERNEL.md").write_text(
        "# Kernel\n\nDirect-user surface.\n",
        encoding="utf-8",
    )


class TestKnowledgeBaseRefreshSeed(unittest.TestCase):
    def test_write_snapshot_creates_multi_row_jsonl_and_uses_atomic_replace(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _seed_repo(root)
            calls: list[tuple[str, str]] = []
            real_replace = os.replace

            def recording_replace(src: str | os.PathLike[str], dst: str | os.PathLike[str]) -> None:
                calls.append((Path(src).name, Path(dst).name))
                real_replace(src, dst)

            with patch.object(refresh_seed.os, "replace", side_effect=recording_replace):
                summary = refresh_seed.write_compatibility_snapshot(
                    repo_root=root,
                    now=datetime(2026, 3, 24, 12, 0, tzinfo=timezone.utc),
                )

            entities_path = root / "workspace" / "knowledge_base" / "data" / "entities.jsonl"
            last_sync_path = root / "workspace" / "knowledge_base" / "data" / "last_sync.txt"
            rows = [
                json.loads(line)
                for line in entities_path.read_text(encoding="utf-8").splitlines()
                if line
            ]

            self.assertEqual(summary["status"], "ok")
            self.assertEqual(summary["entities_written"], 5)
            self.assertEqual(summary["sources_considered"], 5)
            self.assertEqual(summary["skipped_sources"], 0)
            self.assertEqual(len(rows), 5)
            self.assertTrue(all(row["created_at"] == summary["snapshot_at"] for row in rows))
            self.assertTrue(all("source_path" in row for row in rows))
            self.assertTrue(
                any(row["source_path"] == "workspace/profile/openclaw_docs_inventory.md" for row in rows)
            )
            self.assertEqual(last_sync_path.read_text(encoding="utf-8").strip(), summary["snapshot_at"])
            self.assertTrue(any(dst == "entities.jsonl" for _, dst in calls))
            self.assertTrue(any(dst == "last_sync.txt" for _, dst in calls))
            self.assertFalse(list((root / "workspace" / "knowledge_base" / "data").glob("*.tmp")))

    def test_json_cli_summary_is_concise_and_parseable(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _seed_repo(root)
            stdout = io.StringIO()
            with redirect_stdout(stdout):
                exit_code = refresh_seed.main(["--repo-root", str(root), "--json"])

            payload = json.loads(stdout.getvalue())
            self.assertEqual(exit_code, 0)
            self.assertEqual(payload["status"], "ok")
            self.assertEqual(payload["entities_written"], 5)
            self.assertEqual(payload["sources_considered"], 5)
            self.assertEqual(payload["entities_path"], "workspace/knowledge_base/data/entities.jsonl")
            self.assertEqual(payload["last_sync_path"], "workspace/knowledge_base/data/last_sync.txt")


if __name__ == "__main__":
    unittest.main()
