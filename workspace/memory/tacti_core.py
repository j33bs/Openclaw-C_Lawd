#!/usr/bin/env python3
"""
TACTI Core - Unified Memory and State Management
Integrates all TACTI modules into a cohesive system.
"""
import sys
from importlib import import_module
from pathlib import Path

# Compatibility note: this module now depends on the explicit tracker adapter
# contract in `tracker_adapters.py` rather than implicit class shapes inside the
# tracker state modules.


def _import_memory_module(module_name: str):
    if __package__:
        return import_module(f"{__package__}.{module_name}")
    module_dir = str(Path(__file__).parent)
    if module_dir not in sys.path:  # pragma: no cover - direct script compatibility
        sys.path.insert(0, module_dir)
    return import_module(module_name)


def _resolve_local_symbol(module_name: str, symbol_name: str):
    module = _import_memory_module(module_name)
    symbol = getattr(module, symbol_name, None)
    if symbol is None:
        raise ImportError(
            f"{Path(__file__).name} requires {symbol_name} to remain available from "
            f"{module_name}.py until the tracker adapter contract is extracted."
        )
    return symbol

class TacticCore:
    """Unified interface for TACTI state management."""
    
    def __init__(self, *, repo_root: Path | str | None = None, session_id: str = "tacti_core"):
        relationship_cls = _resolve_local_symbol("tracker_adapters", "RelationshipTracker")
        arousal_cls = _resolve_local_symbol("tracker_adapters", "ArousalTracker")
        pattern_chunker_cls = _resolve_local_symbol("pattern_chunker", "PatternChunker")
        self.relationship = relationship_cls(repo_root=repo_root, session_id=session_id)
        self.arousal = arousal_cls(repo_root=repo_root, session_id=session_id)
        self.chunker = pattern_chunker_cls(repo_root=repo_root)
    
    # === RELATIONSHIP ===
    
    def record_interaction(self, type, sentiment=0.5, resolution="success"):
        """Record an interaction with the user."""
        self.relationship.record_interaction(type, sentiment, resolution)
    
    def record_insight(self, insight):
        """Record an insight about the relationship."""
        self.relationship.record_insight(insight)
    
    def get_relationship_health(self):
        """Get current relationship health."""
        return self.relationship.get_health()
    
    # === AROUSAL ===
    
    def update_arousal(self, token_count=0, tool_calls=0, tool_failures=0):
        """Update arousal state based on activity."""
        self.arousal.record_message(token_count, tool_calls, tool_failures)
    
    def get_arousal_state(self):
        """Get current arousal state."""
        return self.arousal.get_state()
    
    # === PATTERNS ===
    
    def find_patterns(self, min_freq=2):
        """Find patterns in recent sessions."""
        return self.chunker.find_patterns(min_frequency=min_freq)
    
    def match_shortcut(self, text):
        """Check if text matches a shortcut."""
        return self.chunker.match_shortcut(text)
    
    # === INTEGRATION ===
    
    def full_status(self):
        """Get full system status."""
        return {
            "relationship": self.get_relationship_health(),
            "arousal": self.get_arousal_state(),
            "patterns_found": len(self.find_patterns()),
            "shortcuts": len(self.chunker.list_shortcuts())
        }


# Singleton instance
_core = None

def get_core():
    global _core
    if _core is None:
        _core = TacticCore()
    return _core


if __name__ == "__main__":
    core = get_core()
    print("TACTI Core Status:")
    import json
    print(json.dumps(core.full_status(), indent=2))
