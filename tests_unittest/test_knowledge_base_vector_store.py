"""Tests for the local knowledge-base vector-store backend."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
KB_DIR = REPO_ROOT / "workspace" / "knowledge_base"
if str(KB_DIR) not in sys.path:
    sys.path.insert(0, str(KB_DIR))

from indexer import build_index_documents  # noqa: E402
from vector_store import SqliteVectorStore  # noqa: E402


class TestKnowledgeBaseVectorStore(unittest.TestCase):
    def test_build_index_documents_chunks_entities(self) -> None:
        entity = {
            "id": "doc-1",
            "name": "Doc One",
            "entity_type": "knowledge_base_doc",
            "source_path": "workspace/docs/doc-one.md",
            "created_at": "2026-03-24T00:00:00+00:00",
            "content": "Alpha section.\n\nBeta section.\n\nGamma section.",
        }
        documents = build_index_documents([entity], chunk_size=32, overlap_chars=0)
        self.assertEqual(len(documents), 1)
        self.assertEqual(documents[0]["document_id"], "doc-1")
        self.assertGreaterEqual(documents[0]["chunk_count"], 2)
        self.assertTrue(all(chunk["token_count"] >= 1 for chunk in documents[0]["chunks"]))

    def test_sqlite_vector_store_rebuild_and_search(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            store = SqliteVectorStore(Path(td) / "kb.sqlite3")
            status = store.rebuild(
                documents=[
                    {
                        "document_id": "doc-1",
                        "source_path": "memory/doc-1.md",
                        "title": "Doc One",
                        "entity_type": "memory_doc",
                        "created_at": "2026-03-24T00:00:00+00:00",
                        "updated_at": "2026-03-24T00:00:00+00:00",
                        "content": "orchard apples citrus",
                        "content_hash": "hash-1",
                        "chunk_count": 1,
                        "chunks": [
                            {
                                "chunk_index": 0,
                                "start_char": 0,
                                "end_char": 21,
                                "token_count": 3,
                                "content": "orchard apples citrus",
                                "embedding": [1.0, 0.0],
                                "embedding_dim": 2,
                            }
                        ],
                    },
                    {
                        "document_id": "doc-2",
                        "source_path": "memory/doc-2.md",
                        "title": "Doc Two",
                        "entity_type": "memory_doc",
                        "created_at": "2026-03-24T00:00:00+00:00",
                        "updated_at": "2026-03-24T00:00:00+00:00",
                        "content": "server sockets kernel",
                        "content_hash": "hash-2",
                        "chunk_count": 1,
                        "chunks": [
                            {
                                "chunk_index": 0,
                                "start_char": 0,
                                "end_char": 21,
                                "token_count": 3,
                                "content": "server sockets kernel",
                                "embedding": [0.0, 1.0],
                                "embedding_dim": 2,
                            }
                        ],
                    },
                ],
                metadata={"embedding_model": "test-model"},
            )
            self.assertTrue(status["exists"])
            self.assertEqual(status["document_count"], 2)
            self.assertEqual(status["chunk_count"], 2)

            hits = store.search([0.9, 0.1], limit=1)
            self.assertEqual(len(hits), 1)
            self.assertEqual(hits[0].document_id, "doc-1")


if __name__ == "__main__":
    unittest.main()
