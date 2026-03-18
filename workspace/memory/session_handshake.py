from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

if __package__:
    from .paths import (
        resolve_identity_doc_path,
        resolve_state_runtime_memory_path,
        resolve_workspace_path,
    )
    from .relationship_tracker import load_state as load_relationship_state
    from .relationship_tracker import record_session_close, record_session_open
else:  # pragma: no cover - script/local import compatibility
    from paths import resolve_identity_doc_path, resolve_state_runtime_memory_path, resolve_workspace_path
    from relationship_tracker import load_state as load_relationship_state
    from relationship_tracker import record_session_close, record_session_open

try:
    from tacti.events import emit as tacti_emit
except Exception:  # pragma: no cover
    tacti_emit = None


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _hash_file(path: Path) -> str:
    if not path.exists():
        return ""
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except Exception:
        return ""


def _resolve_handshake_dir(repo_root: Path | str) -> Path:
    return resolve_state_runtime_memory_path("handshakes", repo_root=repo_root)


def _path_ref(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def _latest_summary_path(summary_file: Path) -> Path | None:
    if summary_file.exists():
        return summary_file
    summary_dir = summary_file.parent
    if not summary_dir.exists():
        return None
    candidates = [p for p in summary_dir.glob("*.md") if p.is_file()]
    if not candidates:
        return None
    return sorted(candidates, key=lambda p: p.stat().st_mtime, reverse=True)[0]


def _identity_snapshot(root: Path) -> dict[str, Any]:
    snapshot: dict[str, Any] = {}
    soul_text = ""
    for name in ("SOUL.md", "USER.md", "MEMORY.md"):
        path = resolve_identity_doc_path(name, repo_root=root)
        key = name.lower().replace(".md", "")
        snapshot[key] = {
            "ref": _path_ref(path, root),
            "present": path.exists(),
            "hash": _hash_file(path),
        }
        if name == "SOUL.md" and path.exists():
            try:
                soul_text = path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                soul_text = ""
    snapshot["session_start_protocol_present"] = "## Session Start Protocol" in soul_text
    return snapshot


def _orientation_snapshot(root: Path) -> dict[str, Any]:
    try:
        from store.orient import build_orientation  # noqa: WPS433

        orientation = build_orientation(
            author="c_lawd",
            verify=True,
            workspace_root=resolve_workspace_path(repo_root=root),
        )
        orientation["command"] = 'python3 workspace/store/orient.py --author "c_lawd" --verify'
        return orientation
    except Exception:
        return {}


def _emit_session_event(event_name: str, payload: dict[str, Any], *, session_id: str) -> None:
    if callable(tacti_emit):
        tacti_emit(event_name, payload, session_id=str(session_id))


def load_session_handshake(
    *,
    repo_root: Path | str,
    session_id: str,
    summary_file: Path,
    outstanding_threads: list[str] | None = None,
    source: str = "teamchat",
) -> dict[str, Any]:
    root = Path(repo_root)
    ts_utc = _utc_now()
    rel_state = load_relationship_state(repo_root=root)
    session_rel = dict(rel_state.get("sessions", {}).get(str(session_id), {}))
    latest_summary = _latest_summary_path(Path(summary_file))
    summary_ref = ""
    summary_hash = ""
    if latest_summary is not None:
        try:
            summary_ref = str(latest_summary.relative_to(root))
        except ValueError:
            summary_ref = str(latest_summary)
        summary_hash = _hash_file(latest_summary)
    thread_list = [str(item) for item in list(outstanding_threads or [])]
    record_session_open(session_id, repo_root=root, ts_utc=ts_utc, outstanding_threads=len(thread_list))
    payload = {
        "ts_utc": ts_utc,
        "type": "handshake_loaded",
        "session_id": str(session_id),
        "source": str(source),
        "meta": {
            "summary_ref": summary_ref,
            "summary_hash": summary_hash,
            "relationship_state": {
                "trust_score": session_rel.get("trust_score", 0.5),
                "attunement_index": session_rel.get("attunement_index", 0.5),
                "open_count": session_rel.get("open_count", 0),
                "close_count": session_rel.get("close_count", 0),
            },
            "identity": _identity_snapshot(root),
            "orientation": _orientation_snapshot(root),
            "outstanding_threads": thread_list,
        },
    }
    out_dir = _resolve_handshake_dir(root)
    out_dir.mkdir(parents=True, exist_ok=True)
    artifact = out_dir / f"{session_id}_open.json"
    artifact.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    _emit_session_event("tacti_cr.session.handshake_loaded", payload, session_id=str(session_id))
    payload["artifact_path"] = str(artifact)
    return payload


def close_session_handshake(
    *,
    repo_root: Path | str,
    session_id: str,
    summary_file: Path,
    status: str,
    outstanding_threads: list[str] | None = None,
    source: str = "teamchat",
) -> dict[str, Any]:
    root = Path(repo_root)
    ts_utc = _utc_now()
    thread_list = [str(item) for item in list(outstanding_threads or [])]
    summary_ref = ""
    try:
        summary_ref = str(Path(summary_file).relative_to(root))
    except ValueError:
        summary_ref = str(summary_file)
    summary_hash = _hash_file(Path(summary_file))
    record_session_close(
        str(session_id),
        repo_root=root,
        ts_utc=ts_utc,
        unresolved_threads=len(thread_list),
        summary_ref=summary_ref,
    )
    payload = {
        "ts_utc": ts_utc,
        "type": "session_closed",
        "session_id": str(session_id),
        "source": str(source),
        "meta": {
            "status": str(status),
            "summary_ref": summary_ref,
            "summary_hash": summary_hash,
            "unresolved_threads": thread_list,
        },
    }
    out_dir = _resolve_handshake_dir(root)
    out_dir.mkdir(parents=True, exist_ok=True)
    artifact = out_dir / f"{session_id}_close.json"
    artifact.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    _emit_session_event("tacti_cr.session.session_closed", payload, session_id=str(session_id))
    payload["artifact_path"] = str(artifact)
    return payload


__all__ = ["close_session_handshake", "load_session_handshake"]
