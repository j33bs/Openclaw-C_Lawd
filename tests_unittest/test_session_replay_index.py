"""Tests for workspace/evolution/session_replay_index.py."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
EVOLUTION_DIR = REPO_ROOT / "workspace" / "evolution"
if str(EVOLUTION_DIR) not in sys.path:
    sys.path.insert(0, str(EVOLUTION_DIR))

from session_replay_index import (  # noqa: E402
    build_session_replay_index,
    query_session_replay,
)


def _seed_logs(root: Path) -> None:
    memory_dir = root / "memory"
    memory_dir.mkdir(parents=True, exist_ok=True)
    (memory_dir / "2026-03-23.md").write_text(
        "# MLX Embeddings\n\nSource UI remains active.\n",
        encoding="utf-8",
    )
    (memory_dir / "2026-03-21.md").write_text(
        "# Discord Routing\n\nChecked Discord bridge health.\n",
        encoding="utf-8",
    )


class TestSessionReplayIndex(unittest.TestCase):
    def test_builds_entries_for_daily_logs(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _seed_logs(root)
            index = build_session_replay_index(repo_root=root)
            self.assertEqual(index["count"], 2)
            self.assertEqual(index["entries"][0]["date"], "2026-03-23")

    def test_extracts_topics(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _seed_logs(root)
            index = build_session_replay_index(repo_root=root)
            self.assertIn("Embeddings", index["entries"][0]["topics"])
            self.assertIn("Source", index["entries"][0]["topics"])

    def test_query_matches_topics_and_excerpt_case_insensitively(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _seed_logs(root)
            index = build_session_replay_index(repo_root=root)
            self.assertEqual(len(query_session_replay(index, "mlx")), 1)
            self.assertEqual(len(query_session_replay(index, "discord")), 1)

    def test_empty_query_returns_all_entries(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _seed_logs(root)
            index = build_session_replay_index(repo_root=root)
            self.assertEqual(len(query_session_replay(index, "")), 2)


if __name__ == "__main__":
    unittest.main()
