#!/usr/bin/env python3
"""Evaluate proposal lifecycle status and write a JSON summary."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

REPO_ROOT = Path(__file__).resolve().parents[2]
PROPOSALS_RELATIVE_PATH = Path("workspace/evolution/PROPOSALS.md")
STATE_RELATIVE_PATH = Path("workspace/state/proposal-status.json")
PROPOSAL_HEADING_RE = re.compile(r"^### \[(P-\d+)\] (.+)$", re.MULTILINE)
FIELD_RE = re.compile(r"^\*\*(Status|Created|What|Why|How|Outcome):\*\*\s*(.+?)\s*$", re.MULTILINE)
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
COMMIT_RE = re.compile(r"\b[0-9a-f]{7,40}\b", re.IGNORECASE)
CreatedAtResolver = Callable[[Path, int], str | None]


def _utc_now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _parse_date(value: str | None) -> datetime | None:
    text = (value or "").strip()
    if not text:
        return None
    match = DATE_RE.search(text)
    if not match:
        return None
    try:
        return datetime.strptime(match.group(0), "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _run_git(repo_root: Path, args: list[str]) -> str:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=repo_root,
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
    except Exception:
        return ""
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def _resolve_created_at_from_blame(proposals_path: Path, line_number: int) -> str | None:
    repo_root = proposals_path.parents[2]
    output = _run_git(
        repo_root,
        [
            "blame",
            "--date=short",
            "-L",
            f"{line_number},{line_number}",
            "--",
            str(proposals_path.relative_to(repo_root)),
        ],
    )
    match = DATE_RE.search(output)
    return match.group(0) if match else None


def _extract_linked_commit(section: str) -> str | None:
    match = COMMIT_RE.search(section)
    return match.group(0) if match else None


def _iter_proposal_sections(text: str) -> list[tuple[str, int]]:
    matches = list(PROPOSAL_HEADING_RE.finditer(text))
    sections: list[tuple[str, int]] = []
    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        line_number = text.count("\n", 0, start) + 1
        sections.append((text[start:end].strip(), line_number))
    return sections


def _build_proposal_record(
    *,
    proposals_path: Path,
    section: str,
    line_number: int,
    now: datetime,
    created_at_resolver: CreatedAtResolver,
) -> dict | None:
    heading = PROPOSAL_HEADING_RE.search(section)
    if not heading:
        return None

    proposal_id = heading.group(1).strip()
    title = heading.group(2).strip()
    fields = {match.group(1).lower(): match.group(2).strip() for match in FIELD_RE.finditer(section)}
    status = fields.get("status", "unknown").strip().lower()

    created_at = _parse_date(fields.get("created"))
    created_at_source = "field"
    if created_at is None:
        resolved = created_at_resolver(proposals_path, line_number)
        created_at = _parse_date(resolved)
        created_at_source = "blame" if created_at is not None else "file-mtime"
    if created_at is None:
        created_at = datetime.fromtimestamp(proposals_path.stat().st_mtime, tz=timezone.utc)

    linked_commit = _extract_linked_commit(section)
    age_days = max(0, (now - created_at).days)
    flags: list[str] = []
    if status == "draft" and age_days > 7:
        flags.append("stale")
    if status == "approved" and age_days > 3 and not linked_commit:
        flags.append("blocked")

    return {
        "id": proposal_id,
        "title": title,
        "status": status,
        "created_at": created_at.date().isoformat(),
        "created_at_source": created_at_source,
        "age_days": age_days,
        "what": fields.get("what"),
        "why": fields.get("why"),
        "how": fields.get("how"),
        "outcome": fields.get("outcome"),
        "linked_commit": linked_commit,
        "flags": flags,
    }


def collect_proposal_lifecycle_status(
    *,
    repo_root: Path = REPO_ROOT,
    now: datetime | None = None,
    created_at_resolver: CreatedAtResolver | None = None,
) -> dict:
    current_time = now or _utc_now()
    proposals_path = repo_root / PROPOSALS_RELATIVE_PATH
    state_path = repo_root / STATE_RELATIVE_PATH
    if not proposals_path.exists():
        raise FileNotFoundError(f"{proposals_path} not found")

    resolver = created_at_resolver or _resolve_created_at_from_blame
    text = proposals_path.read_text(encoding="utf-8")
    proposals = [
        record
        for section, line_number in _iter_proposal_sections(text)
        if (
            record := _build_proposal_record(
                proposals_path=proposals_path,
                section=section,
                line_number=line_number,
                now=current_time,
                created_at_resolver=resolver,
            )
        )
        is not None
    ]

    stale = [proposal for proposal in proposals if "stale" in proposal["flags"]]
    blocked = [proposal for proposal in proposals if "blocked" in proposal["flags"]]
    report = {
        "ok": True,
        "generated_at": current_time.isoformat(),
        "summary": {
            "total": len(proposals),
            "stale_drafts": len(stale),
            "blocked_approved": len(blocked),
            "attention_required": len(stale) + len(blocked),
        },
        "stale_count": len(stale),
        "blocked_count": len(blocked),
        "output_path": str(STATE_RELATIVE_PATH),
        "proposals": proposals,
        "stale": [proposal["id"] for proposal in stale],
        "blocked": [proposal["id"] for proposal in blocked],
    }

    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(f"{json.dumps(report, indent=2)}\n", encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="Print the summary as JSON.")
    args = parser.parse_args()

    try:
        report = collect_proposal_lifecycle_status()
    except Exception as exc:
        print(f"proposal_lifecycle.py failed: {exc}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        summary = report["summary"]
        print(
            f"proposal lifecycle: {summary['total']} proposals, "
            f"{summary['stale_drafts']} stale, {summary['blocked_approved']} blocked"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
