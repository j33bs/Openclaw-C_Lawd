#!/usr/bin/env python3
"""Compatibility shim for code that still imports the LanceDB module name."""
from __future__ import annotations

try:
    from .vector_store import *  # noqa: F401,F403
except ImportError:  # pragma: no cover - script/local import compatibility
    from vector_store import *  # noqa: F401,F403

