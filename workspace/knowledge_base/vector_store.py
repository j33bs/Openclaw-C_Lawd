#!/usr/bin/env python3
"""Stdlib-only sqlite-backed vector store for the local KB."""
from __future__ import annotations

from dataclasses import dataclass
import json
import math
import os
from pathlib import Path
import sqlite3
import tempfile
from typing import Any, Iterable, Sequence


@dataclass(slots=True)
class SearchHit:
    document_id: str
    source_path: str
    title: str
    entity_type: str
    chunk_index: int
    score: float
    text: str
    start_char: int
    end_char: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "document_id": self.document_id,
            "source_path": self.source_path,
            "title": self.title,
            "entity_type": self.entity_type,
            "chunk_index": self.chunk_index,
            "score": self.score,
            "text": self.text,
            "start_char": self.start_char,
            "end_char": self.end_char,
        }


def _cosine_similarity(lhs: Sequence[float], rhs: Sequence[float]) -> float:
    if len(lhs) != len(rhs) or not lhs:
        return 0.0
    dot = sum(a * b for a, b in zip(lhs, rhs))
    lhs_norm = math.sqrt(sum(value * value for value in lhs))
    rhs_norm = math.sqrt(sum(value * value for value in rhs))
    if lhs_norm == 0.0 or rhs_norm == 0.0:
        return 0.0
    return dot / (lhs_norm * rhs_norm)


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _connect(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


class SqliteVectorStore:
    """Small sqlite-backed vector store with atomic rebuilds."""

    def __init__(self, path: Path | str):
        self.path = Path(path)

    @property
    def exists(self) -> bool:
        return self.path.exists()

    def _create_schema(self, conn: sqlite3.Connection) -> None:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS documents (
                document_id TEXT PRIMARY KEY,
                source_path TEXT NOT NULL,
                title TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                created_at TEXT,
                updated_at TEXT NOT NULL,
                content TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                chunk_count INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS chunks (
                chunk_id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id TEXT NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
                chunk_index INTEGER NOT NULL,
                start_char INTEGER NOT NULL,
                end_char INTEGER NOT NULL,
                token_count INTEGER NOT NULL,
                content TEXT NOT NULL,
                embedding_json TEXT NOT NULL,
                embedding_dim INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
            CREATE INDEX IF NOT EXISTS idx_documents_source_path ON documents(source_path);
            """
        )

    def _write_snapshot(
        self,
        temp_path: Path,
        *,
        documents: Iterable[dict[str, Any]],
        metadata: dict[str, Any] | None = None,
    ) -> None:
        document_rows = list(documents)
        with _connect(temp_path) as conn:
            self._create_schema(conn)
            conn.execute("DELETE FROM chunks")
            conn.execute("DELETE FROM documents")
            conn.execute("DELETE FROM metadata")

            if metadata:
                for key, value in metadata.items():
                    conn.execute(
                        "INSERT INTO metadata(key, value) VALUES (?, ?)",
                        (str(key), json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value),
                    )

            for document in document_rows:
                conn.execute(
                    """
                    INSERT INTO documents(
                        document_id, source_path, title, entity_type,
                        created_at, updated_at, content, content_hash, chunk_count
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(document["document_id"]),
                        str(document["source_path"]),
                        str(document["title"]),
                        str(document["entity_type"]),
                        document.get("created_at"),
                        str(document["updated_at"]),
                        str(document["content"]),
                        str(document["content_hash"]),
                        int(document.get("chunk_count", 0)),
                    ),
                )
                for chunk in document["chunks"]:
                    conn.execute(
                        """
                        INSERT INTO chunks(
                            document_id, chunk_index, start_char, end_char,
                            token_count, content, embedding_json, embedding_dim
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            str(document["document_id"]),
                            int(chunk["chunk_index"]),
                            int(chunk["start_char"]),
                            int(chunk["end_char"]),
                            int(chunk["token_count"]),
                            str(chunk["content"]),
                            json.dumps(chunk["embedding"], ensure_ascii=False, separators=(",", ":")),
                            int(chunk["embedding_dim"]),
                        ),
                    )
            conn.execute(
                "INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)",
                ("document_count", str(len(document_rows))),
            )
            conn.commit()

    def rebuild(
        self,
        *,
        documents: list[dict[str, Any]],
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        _ensure_parent(self.path)
        with tempfile.NamedTemporaryFile(
            suffix=".sqlite3", prefix=f".{self.path.name}.", dir=self.path.parent, delete=False
        ) as handle:
            temp_path = Path(handle.name)
        try:
            self._write_snapshot(temp_path, documents=documents, metadata=metadata)
            os.replace(temp_path, self.path)
        finally:
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except FileNotFoundError:
                    pass
        return self.status()

    def _read_documents(self, conn: sqlite3.Connection) -> list[sqlite3.Row]:
        cursor = conn.execute(
            """
            SELECT document_id, source_path, title, entity_type, created_at,
                   updated_at, content, content_hash, chunk_count
            FROM documents
            ORDER BY source_path, document_id
            """
        )
        return list(cursor.fetchall())

    def _read_chunks(self, conn: sqlite3.Connection) -> list[sqlite3.Row]:
        cursor = conn.execute(
            """
            SELECT chunk_id, document_id, chunk_index, start_char, end_char,
                   token_count, content, embedding_json, embedding_dim
            FROM chunks
            ORDER BY document_id, chunk_index, chunk_id
            """
        )
        return list(cursor.fetchall())

    def load_status(self) -> dict[str, Any]:
        if not self.exists:
            return {
                "exists": False,
                "path": str(self.path),
                "document_count": 0,
                "chunk_count": 0,
                "metadata": {},
            }
        with _connect(self.path) as conn:
            self._create_schema(conn)
            document_count = conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
            chunk_count = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
            metadata = {
                row["key"]: row["value"]
                for row in conn.execute("SELECT key, value FROM metadata ORDER BY key")
            }
            return {
                "exists": True,
                "path": str(self.path),
                "document_count": int(document_count),
                "chunk_count": int(chunk_count),
                "metadata": metadata,
            }

    def status(self) -> dict[str, Any]:
        return self.load_status()

    def search(self, query_embedding: Sequence[float], *, limit: int = 5) -> list[SearchHit]:
        if not self.exists:
            return []
        with _connect(self.path) as conn:
            self._create_schema(conn)
            rows = self._read_chunks(conn)
            documents = {
                row["document_id"]: row
                for row in self._read_documents(conn)
            }

        scored: list[SearchHit] = []
        for row in rows:
            try:
                embedding = json.loads(row["embedding_json"])
            except json.JSONDecodeError:
                continue
            if not isinstance(embedding, list):
                continue
            try:
                vector = [float(value) for value in embedding]
            except (TypeError, ValueError):
                continue
            score = _cosine_similarity(query_embedding, vector)
            document = documents.get(row["document_id"])
            if document is None:
                continue
            scored.append(
                SearchHit(
                    document_id=str(row["document_id"]),
                    source_path=str(document["source_path"]),
                    title=str(document["title"]),
                    entity_type=str(document["entity_type"]),
                    chunk_index=int(row["chunk_index"]),
                    score=score,
                    text=str(row["content"]),
                    start_char=int(row["start_char"]),
                    end_char=int(row["end_char"]),
                )
            )

        scored.sort(key=lambda hit: hit.score, reverse=True)
        return scored[: max(0, int(limit))]


def count_tokens(text: str) -> int:
    return max(1, len(text.split()))


VectorStore = SqliteVectorStore
LocalVectorStore = SqliteVectorStore
