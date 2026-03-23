"""Tests for workspace/evolution/knowledge_base_health.py helper functions."""
from __future__ import annotations

import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
EVOLUTION_DIR = REPO_ROOT / "workspace" / "evolution"
if str(EVOLUTION_DIR) not in sys.path:
    sys.path.insert(0, str(EVOLUTION_DIR))

from knowledge_base_health import (  # noqa: E402
    build_knowledge_base_health_signal,
    collect_knowledge_base_status,
)


def _seed_seed_only_repo(root: Path) -> None:
    kb_data = root / "workspace" / "knowledge_base" / "data"
    kb_data.mkdir(parents=True, exist_ok=True)
    (root / "workspace" / "knowledge_base" / "README.md").write_text(
        "# Knowledge Base Home\n",
        encoding="utf-8",
    )
    (kb_data / "entities.jsonl").write_text('{"id":"doctrine"}\n', encoding="utf-8")
    (kb_data / "last_sync.txt").write_text("", encoding="utf-8")


def _seed_pipeline_repo(root: Path) -> None:
    _seed_seed_only_repo(root)
    kb_root = root / "workspace" / "knowledge_base"
    (kb_root / "embeddings").mkdir(parents=True, exist_ok=True)
    for rel_path in (
        "indexer.py",
        "retrieval.py",
        "chunking.py",
        "kb.py",
        "vector_store_lancedb.py",
        "embeddings/driver_mlx.py",
    ):
        path = kb_root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("# stub\n", encoding="utf-8")
    (kb_root / "data" / "entities.jsonl").write_text(
        '{"id":"doctrine"}\n{"id":"memory-health"}\n',
        encoding="utf-8",
    )
    (kb_root / "data" / "last_sync.txt").write_text("2026-03-24T08:00:00+00:00", encoding="utf-8")


class TestKnowledgeBaseHealth(unittest.TestCase):
    def test_seed_only_status_when_only_compat_seed_exists(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _seed_seed_only_repo(root)
            report = collect_knowledge_base_status(
                repo_root=root,
                now=datetime(2026, 3, 24, 12, 0, tzinfo=timezone.utc),
                mlx_probe_func=lambda _root: {"status": "venv_missing"},
            )
            self.assertEqual(report["status"], "seed_only")
            self.assertEqual(report["entities"]["line_count"], 1)
            self.assertEqual(len(report["mlx_pipeline"]["present_files"]), 0)
            self.assertIn("knowledge base entity corpus is still at the seed-row stage", report["warnings"])
            self.assertIn("knowledge base last_sync timestamp missing or invalid", report["warnings"])

    def test_warning_when_pipeline_exists_but_runtime_missing(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _seed_pipeline_repo(root)
            report = collect_knowledge_base_status(
                repo_root=root,
                now=datetime(2026, 3, 24, 12, 0, tzinfo=timezone.utc),
                mlx_probe_func=lambda _root: {"status": "package_missing"},
            )
            self.assertEqual(report["status"], "warning")
            self.assertIn("MLX runtime not ready: package_missing", report["warnings"])

    def test_green_signal_when_pipeline_and_runtime_are_ready(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _seed_pipeline_repo(root)
            signal = build_knowledge_base_health_signal(
                repo_root=root,
                now=datetime(2026, 3, 24, 12, 0, tzinfo=timezone.utc),
                mlx_probe_func=lambda _root: {"status": "ready"},
            )
            self.assertEqual(signal["status"], "healthy")
            self.assertEqual(signal["severity"], "green")


if __name__ == "__main__":
    unittest.main()
