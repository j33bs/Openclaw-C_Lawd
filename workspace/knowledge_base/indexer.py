#!/usr/bin/env python3
"""Build the local KB vector index from refreshed entities."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Iterable

try:
    from .chunking import ChunkRecord, chunk_entities
    from .embeddings.driver_ollama import build_ollama_driver
    from .vector_store import SqliteVectorStore, count_tokens
except ImportError:  # pragma: no cover - script/local import compatibility
    from chunking import ChunkRecord, chunk_entities
    from embeddings.driver_ollama import build_ollama_driver
    from vector_store import SqliteVectorStore, count_tokens

REPO_ROOT = Path(__file__).resolve().parents[2]
KB_DATA_DIR = Path("workspace/knowledge_base/data")
ENTITIES_PATH = KB_DATA_DIR / "entities.jsonl"
LAST_SYNC_PATH = KB_DATA_DIR / "last_sync.txt"
VECTOR_STORE_PATH = KB_DATA_DIR / "kb.sqlite3"


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not path.exists():
        return rows
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            raw = line.strip()
            if not raw:
                continue
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                rows.append(parsed)
    return rows


def _read_last_sync(path: Path) -> str | None:
    if not path.exists():
        return None
    raw = path.read_text(encoding="utf-8", errors="replace").strip()
    return raw or None


def _fingerprint(entity: dict[str, Any]) -> str:
    payload = json.dumps(
        {
            "id": entity.get("id"),
            "name": entity.get("name"),
            "entity_type": entity.get("entity_type"),
            "content": entity.get("content"),
            "source_path": entity.get("source_path"),
            "created_at": entity.get("created_at"),
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def build_index_documents(
    entities: Iterable[dict[str, Any]],
    *,
    chunk_size: int = 1200,
    overlap_chars: int = 160,
) -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    for entity in entities:
        chunk_records = chunk_entities([entity], max_chars=chunk_size, overlap_chars=overlap_chars)
        if not chunk_records:
            continue
        chunk_payloads: list[dict[str, Any]] = []
        combined_text_parts: list[str] = []
        for chunk in chunk_records:
            text = chunk.text
            combined_text_parts.append(text)
            chunk_payloads.append(
                {
                    "chunk_index": chunk.chunk_index,
                    "start_char": chunk.start_char,
                    "end_char": chunk.end_char,
                    "token_count": count_tokens(text),
                    "content": text,
                }
            )
        documents.append(
            {
                "document_id": str(entity.get("id") or entity.get("source_path")),
                "source_path": str(entity.get("source_path") or entity.get("id") or ""),
                "title": str(entity.get("name") or entity.get("source_path") or ""),
                "entity_type": str(entity.get("entity_type") or "doc"),
                "created_at": entity.get("created_at"),
                "updated_at": entity.get("created_at") or "",
                "content": "\n\n".join(combined_text_parts),
                "content_hash": _fingerprint(entity),
                "chunk_count": len(chunk_payloads),
                "chunks": chunk_payloads,
            }
        )
    return documents


def sync_index(
    *,
    repo_root: Path | str = REPO_ROOT,
    base_url: str | None = None,
    model: str | None = None,
    store_path: Path | str | None = None,
) -> dict[str, Any]:
    root = Path(repo_root)
    try:
        from . import refresh_seed
    except ImportError:  # pragma: no cover - script/local import compatibility
        import refresh_seed

    refresh_summary = refresh_seed.write_compatibility_snapshot(repo_root=root)
    entities_path = root / ENTITIES_PATH
    entities = _read_jsonl(entities_path)
    if not entities:
        raise RuntimeError(f"No entities were found in {entities_path}")

    documents = build_index_documents(entities)
    if not documents:
        raise RuntimeError("No embeddable documents were produced from the refreshed entities")

    driver = build_ollama_driver(base_url=base_url, model=model)
    texts = [
        chunk["content"]
        for document in documents
        for chunk in document["chunks"]
    ]
    embeddings = driver.embed_many(texts)
    if len(embeddings) != len(texts):
        raise RuntimeError("Embedding count did not match the chunk count")

    embedding_iter = iter(embeddings)
    for document in documents:
        for chunk in document["chunks"]:
            embedding = next(embedding_iter)
            chunk["embedding"] = embedding
            chunk["embedding_dim"] = len(embedding)
        document["embedding_model"] = driver.model
        document["embedding_base_url"] = driver.embeddings_url.rsplit("/api/embeddings", 1)[0]
        document["embedding_count"] = len(document["chunks"])

    store = SqliteVectorStore(store_path or (root / VECTOR_STORE_PATH))
    status = store.rebuild(
        documents=documents,
        metadata={
            "embedding_model": driver.model,
            "embedding_base_url": driver.embeddings_url.rsplit("/api/embeddings", 1)[0],
            "last_sync": refresh_summary["snapshot_at"],
            "source_entities_path": str(entities_path),
        },
    )

    return {
        "status": "ok",
        "repo_root": str(root),
        "entities_path": str(entities_path),
        "last_sync": refresh_summary["snapshot_at"],
        "source_entities": len(entities),
        "documents_indexed": len(documents),
        "chunks_indexed": sum(document["chunk_count"] for document in documents),
        "vector_store": status,
        "embedding": driver.status(),
    }


def load_entities(repo_root: Path | str = REPO_ROOT) -> list[dict[str, Any]]:
    root = Path(repo_root)
    return _read_jsonl(root / ENTITIES_PATH)


def load_last_sync(repo_root: Path | str = REPO_ROOT) -> str | None:
    root = Path(repo_root)
    return _read_last_sync(root / LAST_SYNC_PATH)
