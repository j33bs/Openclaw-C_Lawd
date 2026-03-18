from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

if __package__:
    from .arousal_tracker import load_state as load_arousal_state
    from .arousal_tracker import update_from_event as update_arousal_event
    from .relationship_tracker import load_state as load_relationship_state
    from .relationship_tracker import update_from_event as update_relationship_event
else:  # pragma: no cover - script/local import compatibility
    from arousal_tracker import load_state as load_arousal_state
    from arousal_tracker import update_from_event as update_arousal_event
    from relationship_tracker import load_state as load_relationship_state
    from relationship_tracker import update_from_event as update_relationship_event


DEFAULT_SESSION_ID = "tacti_core"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _content_hash(*parts: Any) -> str:
    payload = "|".join(str(part or "") for part in parts)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _relationship_tone(sentiment: float, resolution: str) -> str:
    resolution_text = str(resolution or "").strip().lower()
    if resolution_text in {"failed", "failure", "error", "blocked"}:
        return "negative"
    if float(sentiment) >= 0.66:
        return "positive"
    if float(sentiment) <= 0.33:
        return "negative"
    return "calm"


def _activity_tone(token_count: int, tool_calls: int, tool_failures: int) -> str:
    if int(tool_failures) > 0:
        return "urgent"
    if int(tool_calls) > 0 or int(token_count) >= 1200:
        return "excited"
    if int(token_count) <= 0:
        return "flat"
    return "calm"


class RelationshipTracker:
    """Compatibility adapter for the legacy class-shaped TACTI contract."""

    def __init__(self, *, repo_root: Path | str | None = None, session_id: str = DEFAULT_SESSION_ID):
        self.repo_root = Path(repo_root) if repo_root is not None else Path(".")
        self.session_id = str(session_id or DEFAULT_SESSION_ID)

    def record_interaction(self, interaction_type: str, sentiment: float = 0.5, resolution: str = "success") -> dict[str, Any]:
        event = {
            "session_id": self.session_id,
            "role": "assistant",
            "tone": _relationship_tone(sentiment, resolution),
            "ts_utc": _utc_now(),
            "content_hash": _content_hash("interaction", interaction_type, sentiment, resolution),
        }
        return update_relationship_event(event, repo_root=self.repo_root)

    def record_insight(self, insight: str) -> dict[str, Any]:
        event = {
            "session_id": self.session_id,
            "role": "assistant",
            "tone": "supportive",
            "ts_utc": _utc_now(),
            "content_hash": _content_hash("insight", insight),
        }
        return update_relationship_event(event, repo_root=self.repo_root)

    def get_health(self) -> dict[str, Any]:
        state = load_relationship_state(repo_root=self.repo_root)
        session_state = dict(state.get("sessions", {}).get(self.session_id, {}))
        return {
            "session_id": self.session_id,
            "trust_score": float(session_state.get("trust_score", 0.50)),
            "attunement_index": float(session_state.get("attunement_index", 0.50)),
            "open_count": int(session_state.get("open_count", 0)),
            "close_count": int(session_state.get("close_count", 0)),
            "unresolved_threads": int(session_state.get("unresolved_threads", 0)),
            "last_summary_ref": str(session_state.get("last_summary_ref", "")),
            "last_tone": str(session_state.get("last_tone", "unlabeled")),
            "updated_at": str(session_state.get("updated_at", state.get("updated_at", ""))),
        }


class ArousalTracker:
    """Compatibility adapter for the legacy class-shaped TACTI contract."""

    def __init__(self, *, repo_root: Path | str | None = None, session_id: str = DEFAULT_SESSION_ID):
        self.repo_root = Path(repo_root) if repo_root is not None else Path(".")
        self.session_id = str(session_id or DEFAULT_SESSION_ID)

    def record_message(self, token_count: int = 0, tool_calls: int = 0, tool_failures: int = 0) -> dict[str, Any]:
        event = {
            "session_id": self.session_id,
            "role": "assistant",
            "tone": _activity_tone(token_count, tool_calls, tool_failures),
            "ts_utc": _utc_now(),
            "content_hash": _content_hash("message", token_count, tool_calls, tool_failures),
        }
        return update_arousal_event(event, repo_root=self.repo_root)

    def get_state(self) -> dict[str, Any]:
        state = load_arousal_state(repo_root=self.repo_root)
        session_state = dict(state.get("sessions", {}).get(self.session_id, {}))
        vector = list(session_state.get("temporal_embedding", [0.50, 0.50, 0.50]))
        while len(vector) < 3:
            vector.append(0.50)
        return {
            "session_id": self.session_id,
            "arousal": float(session_state.get("arousal", 0.50)),
            "temporal_embedding": [float(vector[0]), float(vector[1]), float(vector[2])],
            "last_role": str(session_state.get("last_role", "")),
            "last_tone": str(session_state.get("last_tone", "unlabeled")),
            "updated_at": str(session_state.get("updated_at", state.get("updated_at", ""))),
        }


__all__ = ["ArousalTracker", "DEFAULT_SESSION_ID", "RelationshipTracker"]
