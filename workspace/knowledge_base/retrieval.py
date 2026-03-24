#!/usr/bin/env python3
"""Search helpers for the local KB backend."""
from __future__ import annotations

from collections import OrderedDict
from pathlib import Path
from typing import Any

try:
    from .embeddings.driver_ollama import build_ollama_driver
    from .indexer import REPO_ROOT, VECTOR_STORE_PATH
    from .vector_store import SearchHit, SqliteVectorStore
except ImportError:  # pragma: no cover - script/local import compatibility
    from embeddings.driver_ollama import build_ollama_driver
    from indexer import REPO_ROOT, VECTOR_STORE_PATH
    from vector_store import SearchHit, SqliteVectorStore


def _snippet(text: str, limit: int = 240) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1].rstrip() + "…"


def search_index(
    query: str,
    *,
    repo_root: Path | str = REPO_ROOT,
    store_path: Path | str | None = None,
    limit: int = 5,
    model: str | None = None,
    base_url: str | None = None,
) -> dict[str, Any]:
    root = Path(repo_root)
    driver = build_ollama_driver(base_url=base_url, model=model)
    query_embedding = driver.embed(query)
    store = SqliteVectorStore(store_path or (root / VECTOR_STORE_PATH))
    hits = store.search(query_embedding, limit=max(1, limit) * 4)

    grouped: "OrderedDict[str, SearchHit]" = OrderedDict()
    for hit in hits:
        current = grouped.get(hit.document_id)
        if current is None or hit.score > current.score:
            grouped[hit.document_id] = hit
    ranked = sorted(grouped.values(), key=lambda item: item.score, reverse=True)[: max(1, limit)]

    return {
        "query": query,
        "limit": limit,
        "embedding": driver.status(),
        "results": [
            {
                **hit.as_dict(),
                "snippet": _snippet(hit.text),
            }
            for hit in ranked
        ],
        "store": store.status(),
    }

