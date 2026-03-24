"""Tests for workspace/memory/io_utils.py atomic verified writes."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parents[1]
MEMORY_DIR = REPO_ROOT / "workspace" / "memory"
if str(MEMORY_DIR) not in sys.path:
    sys.path.insert(0, str(MEMORY_DIR))

from io_utils import write_json_atomic_verified, write_text_atomic_verified  # noqa: E402


class TestWriteTextAtomicVerified(unittest.TestCase):
    def test_creates_exact_file(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "state.txt"
            result = write_text_atomic_verified(path, "hello\n")
            self.assertEqual(result, path)
            self.assertEqual(path.read_text(encoding="utf-8"), "hello\n")

    def test_raises_on_verification_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "state.txt"
            with mock.patch("io_utils.Path.read_text", return_value="mismatch"):
                with self.assertRaises(OSError):
                    write_text_atomic_verified(path, "expected\n")
            tmp_files = list(path.parent.glob(f".{path.name}.*.tmp"))
            self.assertEqual(tmp_files, [])


class TestWriteJsonAtomicVerified(unittest.TestCase):
    def test_round_trip_json(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "state.json"
            payload = {"schema": 1, "items": ["a", "b"]}
            write_json_atomic_verified(path, payload)
            loaded = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(loaded, payload)
            self.assertTrue(path.read_text(encoding="utf-8").endswith("\n"))


if __name__ == "__main__":
    unittest.main()
