"""Tests for workspace/memory/heartbeat_state.py."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
MEMORY_DIR = REPO_ROOT / "workspace" / "memory"
if str(MEMORY_DIR) not in sys.path:
    sys.path.insert(0, str(MEMORY_DIR))

from heartbeat_state import (  # noqa: E402
    _default_state,
    get_last_check,
    load_state,
    needs_check,
    save_state,
    touch_check,
)


class TestDefaultState(unittest.TestCase):
    def test_has_last_checks_map(self) -> None:
        self.assertEqual(_default_state(), {"lastChecks": {}})


class TestLoadSaveState(unittest.TestCase):
    def test_missing_file_returns_default(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            state = load_state(repo_root=td)
            self.assertEqual(state, {"lastChecks": {}})

    def test_round_trip(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "heartbeat-state.json"
            payload = {"lastChecks": {"email": 1700000000}}
            save_state(payload, repo_root=td, state_path=path)
            loaded = load_state(repo_root=td, state_path=path)
            self.assertEqual(loaded, payload)

    def test_invalid_json_returns_default(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "heartbeat-state.json"
            path.write_text("{not-json}", encoding="utf-8")
            loaded = load_state(repo_root=td, state_path=path)
            self.assertEqual(loaded, {"lastChecks": {}})


class TestTouchAndNeedsCheck(unittest.TestCase):
    def test_touch_updates_timestamp(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "heartbeat-state.json"
            result = touch_check("email", repo_root=td, checked_at=1700000100, state_path=path)
            self.assertEqual(result["checked_at"], 1700000100)
            self.assertEqual(get_last_check("email", repo_root=td, state_path=path), 1700000100)

    def test_needs_check_when_missing(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            self.assertTrue(needs_check("calendar", 1800, repo_root=td, now_ts=1700001000))

    def test_needs_check_when_stale(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "heartbeat-state.json"
            path.write_text(json.dumps({"lastChecks": {"weather": 1700000000}}), encoding="utf-8")
            self.assertTrue(
                needs_check("weather", 1800, repo_root=td, now_ts=1700003601, state_path=path)
            )

    def test_does_not_need_check_when_recent(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "heartbeat-state.json"
            path.write_text(json.dumps({"lastChecks": {"weather": 1700000000}}), encoding="utf-8")
            self.assertFalse(
                needs_check("weather", 1800, repo_root=td, now_ts=1700001000, state_path=path)
            )


if __name__ == "__main__":
    unittest.main()
