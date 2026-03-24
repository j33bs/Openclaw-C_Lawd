#!/usr/bin/env python3
"""
fitness.py — Structural self-assessment for the openclaw-c_lawd organism.

Answers: "How healthy am I right now, and where do I need attention?"

Usage:
    python workspace/evolution/fitness.py
    python workspace/evolution/fitness.py --json
    python workspace/evolution/fitness.py --quiet   # exit 1 if any signal is red
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

if __package__:
    from .memory_health import build_memory_freshness_index
    from .knowledge_base_health import build_knowledge_base_health_signal
else:  # pragma: no cover - script/local import compatibility
    from memory_health import build_memory_freshness_index
    from knowledge_base_health import build_knowledge_base_health_signal

REPO_ROOT = Path(__file__).parent.parent.parent


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run(cmd: list[str], cwd: Path = REPO_ROOT) -> str:
    try:
        result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=30)
        return result.stdout.strip()
    except Exception:
        return ""


def _count_lines(path: Path) -> int:
    try:
        return len(path.read_text(encoding="utf-8", errors="replace").splitlines())
    except Exception:
        return 0


# ---------------------------------------------------------------------------
# Signal: Git activity (hot files = where the pain lives)
# ---------------------------------------------------------------------------

def git_activity(n_commits: int = 100) -> dict:
    """Find the most-changed files in recent history."""
    log = _run(["git", "log", f"-{n_commits}", "--name-only", "--pretty=format:"])
    files = [line for line in log.splitlines() if line.strip() and not line.startswith("commit")]
    counter = Counter(files)
    hot = [{"file": f, "changes": c} for f, c in counter.most_common(10)]
    return {
        "commits_scanned": n_commits,
        "unique_files_touched": len(counter),
        "hot_files": hot,
    }


# ---------------------------------------------------------------------------
# Signal: Proposals (open improvement items)
# ---------------------------------------------------------------------------

def proposals_status() -> dict:
    """Count proposals by status in PROPOSALS.md."""
    proposals_path = REPO_ROOT / "workspace" / "evolution" / "PROPOSALS.md"
    if not proposals_path.exists():
        return {"error": "PROPOSALS.md not found"}
    text = proposals_path.read_text(encoding="utf-8")
    status_counts: Counter = Counter()
    for match in re.finditer(r"\*\*Status:\*\*\s*(\w+)", text):
        status_counts[match.group(1)] += 1
    total = sum(status_counts.values())
    return {
        "total": total,
        "by_status": dict(status_counts),
        "ready_for_review": status_counts.get("ready", 0) + status_counts.get("approved", 0),
    }


# ---------------------------------------------------------------------------
# Signal: Evolution log recency (when did we last grow?)
# ---------------------------------------------------------------------------

def evolution_recency() -> dict:
    """How long since the last evolution log entry?"""
    log_path = REPO_ROOT / "workspace" / "evolution" / "EVOLUTION_LOG.md"
    if not log_path.exists():
        return {"error": "EVOLUTION_LOG.md not found", "days_since_last_entry": None}
    text = log_path.read_text(encoding="utf-8")
    dates = re.findall(r"### (\d{4}-\d{2}-\d{2})", text)
    if not dates:
        return {"entries": 0, "days_since_last_entry": None}
    latest = sorted(dates)[-1]
    try:
        last_dt = datetime.strptime(latest, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        now = datetime.now(tz=timezone.utc)
        days = (now - last_dt).days
    except Exception:
        days = None
    return {"entries": len(dates), "last_entry": latest, "days_since_last_entry": days}


# ---------------------------------------------------------------------------
# Signal: TACTI state
# ---------------------------------------------------------------------------

def tacti_state() -> dict:
    """Read live TACTI state files."""
    out: dict = {}
    arousal_path = REPO_ROOT / "workspace" / "memory" / "arousal_state.json"
    relationship_path = REPO_ROOT / "workspace" / "memory" / "relationship.json"

    if arousal_path.exists():
        try:
            data = json.loads(arousal_path.read_text(encoding="utf-8"))
            sessions = data.get("sessions", {})
            if sessions:
                last_key = sorted(sessions.keys())[-1]
                last = sessions[last_key]
                out["arousal"] = {
                    "last_session": last_key,
                    "level": last.get("arousal_level"),
                    "token_count": last.get("token_count"),
                }
        except Exception as e:
            out["arousal"] = {"error": str(e)}
    else:
        out["arousal"] = {"status": "no state file"}

    if relationship_path.exists():
        try:
            data = json.loads(relationship_path.read_text(encoding="utf-8"))
            out["relationship"] = {
                "trust_score": data.get("trust_score"),
                "interaction_count": len(data.get("interactions", [])),
                "last_interaction": data.get("last_interaction"),
            }
        except Exception as e:
            out["relationship"] = {"error": str(e)}
    else:
        out["relationship"] = {"status": "no state file"}

    return out


# ---------------------------------------------------------------------------
# Signal: Dead code (knip)
# ---------------------------------------------------------------------------

def dead_code_estimate() -> dict:
    """Check if knip config exists and optionally count unused exports."""
    knip_config = REPO_ROOT / "knip.config.ts"
    if not knip_config.exists():
        return {"knip": False}
    # Don't run knip here (slow); just confirm it's configured
    return {
        "knip": True,
        "config": "knip.config.ts",
        "note": "Run `pnpm knip` for full dead-code report",
    }


# ---------------------------------------------------------------------------
# Signal: Memory coverage (daily logs present?)
# ---------------------------------------------------------------------------

def memory_coverage() -> dict:
    """Check recency and density of daily memory logs."""
    memory_dir = REPO_ROOT / "memory"
    if not memory_dir.exists():
        return {"error": "memory/ not found"}
    logs = sorted(memory_dir.glob("*.md"))
    if not logs:
        return {"daily_logs": 0}
    dates = []
    for log in logs:
        m = re.match(r"(\d{4}-\d{2}-\d{2})", log.name)
        if m:
            dates.append(m.group(1))
    dates_sorted = sorted(dates)
    today = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")
    last = dates_sorted[-1] if dates_sorted else None
    try:
        last_dt = datetime.strptime(last, "%Y-%m-%d").replace(tzinfo=timezone.utc) if last else None
        now = datetime.now(tz=timezone.utc)
        days_gap = (now - last_dt).days if last_dt else None
    except Exception:
        days_gap = None
    return {
        "daily_logs": len(dates_sorted),
        "first": dates_sorted[0] if dates_sorted else None,
        "last": last,
        "days_since_last": days_gap,
        "today": today,
    }


# ---------------------------------------------------------------------------
# Signal: Capability inventory (extensions and skills)
# ---------------------------------------------------------------------------

def capability_inventory() -> dict:
    """Count extensions and skills; note which have tests."""
    extensions_dir = REPO_ROOT / "extensions"
    skills_dir = REPO_ROOT / "skills"

    def _count_with_tests(d: Path) -> dict:
        if not d.exists():
            return {"total": 0, "with_tests": 0}
        modules = [p for p in d.iterdir() if p.is_dir() and not p.name.startswith(".")]
        with_tests = sum(
            1 for m in modules
            if any(m.glob("**/*.test.*")) or any(m.glob("**/*.spec.*"))
        )
        return {"total": len(modules), "with_tests": with_tests, "without_tests": len(modules) - with_tests}

    return {
        "extensions": _count_with_tests(extensions_dir),
        "skills": _count_with_tests(skills_dir),
    }


# ---------------------------------------------------------------------------
# Signal: Branch drift (how many commits ahead of main?)
# ---------------------------------------------------------------------------

def branch_drift() -> dict:
    current = _run(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    if current in ("main", ""):
        return {"branch": current, "ahead_of_main": 0}
    ahead = _run(["git", "rev-list", "--count", "main..HEAD"])
    behind = _run(["git", "rev-list", "--count", "HEAD..main"])
    return {
        "branch": current,
        "ahead_of_main": int(ahead) if ahead.isdigit() else None,
        "behind_main": int(behind) if behind.isdigit() else None,
    }


# ---------------------------------------------------------------------------
# Assemble fitness report
# ---------------------------------------------------------------------------

def run_assessment() -> dict:
    return {
        "assessed_at": datetime.now(tz=timezone.utc).isoformat(),
        "git_activity": git_activity(),
        "proposals": proposals_status(),
        "evolution_recency": evolution_recency(),
        "tacti_state": tacti_state(),
        "dead_code": dead_code_estimate(),
        "memory_coverage": memory_coverage(),
        "memory_freshness": build_memory_freshness_index(repo_root=REPO_ROOT),
        "knowledge_base": build_knowledge_base_health_signal(repo_root=REPO_ROOT),
        "capabilities": capability_inventory(),
        "branch_drift": branch_drift(),
    }


def _traffic_light(report: dict) -> list[str]:
    """Return human-readable signals with red/yellow/green indicators."""
    lines = []

    # Memory recency
    mc = report["memory_coverage"]
    gap = mc.get("days_since_last")
    if gap is None:
        lines.append("🔴 memory: no daily logs found")
    elif gap == 0:
        lines.append(f"🟢 memory: logged today ({mc['daily_logs']} total logs)")
    elif gap <= 2:
        lines.append(f"🟡 memory: last log {gap}d ago ({mc['daily_logs']} total)")
    else:
        lines.append(f"🔴 memory: no log in {gap} days")

    # Memory freshness by category
    freshness = report.get("memory_freshness", {})
    stale_categories = freshness.get("stale_categories", [])
    warning_categories = freshness.get("warning_categories", [])
    if stale_categories:
        lines.append(f"🔴 memory freshness: stale/missing -> {', '.join(stale_categories)}")
    elif warning_categories:
        lines.append(f"🟡 memory freshness: attention -> {', '.join(warning_categories)}")
    else:
        lines.append("🟢 memory freshness: all tracked stores are within freshness targets")

    # Knowledge base backend status
    kb = report.get("knowledge_base", {})
    kb_status = kb.get("status")
    kb_warnings = kb.get("warnings", [])
    if kb_status == "healthy":
        lines.append("🟢 knowledge base: local KB backend and embedding runtime look ready")
    elif kb_status == "warning":
        detail = kb_warnings[0] if kb_warnings else "knowledge-base attention required"
        lines.append(f"🟡 knowledge base: {detail}")
    elif kb_status in {"seed_only", "missing", "stale"}:
        detail = kb_warnings[0] if kb_warnings else f"knowledge-base status is {kb_status}"
        lines.append(f"🔴 knowledge base: {detail}")

    # Evolution recency
    er = report["evolution_recency"]
    d = er.get("days_since_last_entry")
    entries = er.get("entries", 0)
    if d is None:
        lines.append("🟡 evolution: no log entries yet")
    elif d <= 7:
        lines.append(f"🟢 evolution: last entry {d}d ago ({entries} total)")
    elif d <= 30:
        lines.append(f"🟡 evolution: last entry {d}d ago — consider a new entry")
    else:
        lines.append(f"🔴 evolution: {d} days since last growth entry")

    # Proposals
    p = report["proposals"]
    ready = p.get("ready_for_review", 0)
    total = p.get("total", 0)
    if ready > 0:
        lines.append(f"🟡 proposals: {ready} ready for review ({total} total)")
    elif total == 0:
        lines.append("🟢 proposals: queue empty (good, or nothing surfaced yet)")
    else:
        lines.append(f"🟢 proposals: {total} tracked, none urgent")

    # Capabilities
    cap = report["capabilities"]
    ext = cap.get("extensions", {})
    sk = cap.get("skills", {})
    ext_cov = ext.get("with_tests", 0) / max(ext.get("total", 1), 1)
    sk_cov = sk.get("with_tests", 0) / max(sk.get("total", 1), 1)
    lines.append(
        f"{'🟢' if ext_cov > 0.5 else '🟡'} extensions: "
        f"{ext.get('total', 0)} total, {ext.get('with_tests', 0)} with tests ({ext_cov:.0%})"
    )
    lines.append(
        f"{'🟢' if sk_cov > 0.5 else '🟡'} skills: "
        f"{sk.get('total', 0)} total, {sk.get('with_tests', 0)} with tests ({sk_cov:.0%})"
    )

    # Branch drift
    bd = report["branch_drift"]
    ahead = bd.get("ahead_of_main")
    if ahead and ahead > 20:
        lines.append(f"🟡 branch: {ahead} commits ahead of main — consider merging soon")
    elif ahead:
        lines.append(f"🟢 branch: {ahead} commits ahead of main")

    return lines


def _print_report(report: dict, quiet: bool = False) -> int:
    signals = _traffic_light(report)
    reds = [s for s in signals if s.startswith("🔴")]

    if not quiet:
        print(f"\n=== Fitness Report — {report['assessed_at'][:10]} ===\n")
        for s in signals:
            print(f"  {s}")

        # Hot files
        hot = report["git_activity"].get("hot_files", [])
        if hot:
            print(f"\n  Hot files (last {report['git_activity']['commits_scanned']} commits):")
            for f in hot[:5]:
                print(f"    {f['changes']:>3}x  {f['file']}")

        # TACTI snapshot
        tacti = report["tacti_state"]
        arousal = tacti.get("arousal", {})
        rel = tacti.get("relationship", {})
        if "level" in arousal:
            print(f"\n  TACTI arousal: {arousal.get('level')} (session: {arousal.get('last_session', '?')})")
        if "trust_score" in rel:
            print(f"  TACTI relationship: trust={rel.get('trust_score')}, interactions={rel.get('interaction_count')}")

        print()

    return 1 if reds else 0


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="openclaw-c_lawd fitness assessment")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    parser.add_argument("--quiet", action="store_true", help="Silent; exit 1 if any red signals")
    args = parser.parse_args()

    report = run_assessment()

    if args.json:
        print(json.dumps(report, indent=2, default=str))
        sys.exit(0)

    exit_code = _print_report(report, quiet=args.quiet)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
