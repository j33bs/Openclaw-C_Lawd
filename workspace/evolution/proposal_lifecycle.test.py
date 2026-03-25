"""Tests for workspace/evolution/proposal_lifecycle.py."""
from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from proposal_lifecycle import collect_proposal_lifecycle_status


def _write_proposals(root: Path, content: str) -> Path:
    proposals_path = root / "workspace" / "evolution" / "PROPOSALS.md"
    proposals_path.parent.mkdir(parents=True, exist_ok=True)
    proposals_path.write_text(content, encoding="utf-8")
    return proposals_path


class TestProposalLifecycle(unittest.TestCase):
    def test_flags_stale_and_blocked_proposals_and_writes_state_file(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _write_proposals(
                root,
                """# PROPOSALS.md

### [P-001] Old draft
**Status:** draft
**Created:** 2026-03-17
**What:** This is stale.
**Why:** It has been sitting too long.
**How:** Do the thing.

### [P-002] Approved no commit
**Status:** approved
**Created:** 2026-03-21
**What:** This is blocked.
**How:** Ship it.

### [P-003] Approved with commit
**Status:** approved
**Created:** 2026-03-21
**What:** This is already linked.
**Outcome:** merged in commit 1234567
""",
            )

            report = collect_proposal_lifecycle_status(
                repo_root=root,
                now=datetime(2026, 3, 25, 12, 0, tzinfo=timezone.utc),
                created_at_resolver=lambda _path, _line: None,
            )

            self.assertTrue(report["ok"])
            self.assertEqual(report["summary"]["total"], 3)
            self.assertEqual(report["summary"]["stale_drafts"], 1)
            self.assertEqual(report["summary"]["blocked_approved"], 1)
            self.assertEqual(report["summary"]["attention_required"], 2)

            proposals = {proposal["id"]: proposal for proposal in report["proposals"]}
            self.assertEqual(proposals["P-001"]["flags"], ["stale"])
            self.assertEqual(proposals["P-002"]["flags"], ["blocked"])
            self.assertEqual(proposals["P-003"]["flags"], [])
            self.assertEqual(proposals["P-003"]["linked_commit"], "1234567")

            state_path = root / "workspace" / "state" / "proposal-status.json"
            self.assertTrue(state_path.exists())
            persisted = json.loads(state_path.read_text(encoding="utf-8"))
            self.assertEqual(persisted["summary"]["total"], 3)
            self.assertEqual(persisted["proposals"][0]["id"], "P-001")

    def test_uses_created_at_resolver_when_field_missing(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _write_proposals(
                root,
                """# PROPOSALS.md

### [P-010] Draft without explicit date
**Status:** draft
**What:** No created date is present in the file.
""",
            )

            report = collect_proposal_lifecycle_status(
                repo_root=root,
                now=datetime(2026, 3, 25, 12, 0, tzinfo=timezone.utc),
                created_at_resolver=lambda _path, _line: "2026-03-15",
            )

            self.assertTrue(report["ok"])
            self.assertEqual(report["proposals"][0]["created_at"], "2026-03-15")
            self.assertEqual(report["proposals"][0]["flags"], ["stale"])


if __name__ == "__main__":
    unittest.main()
