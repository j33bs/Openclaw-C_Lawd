#!/usr/bin/env python3
"""Small CLI for the local knowledge-base backend."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

try:
    from .embeddings.driver_ollama import build_ollama_driver
    from .indexer import REPO_ROOT, VECTOR_STORE_PATH, load_entities, load_last_sync, sync_index
    from .retrieval import search_index
    from .vector_store import SqliteVectorStore
except ImportError:  # pragma: no cover - script/local import compatibility
    from embeddings.driver_ollama import build_ollama_driver
    from indexer import REPO_ROOT, VECTOR_STORE_PATH, load_entities, load_last_sync, sync_index
    from retrieval import search_index
    from vector_store import SqliteVectorStore


def _default_store_path(repo_root: Path) -> Path:
    return repo_root / VECTOR_STORE_PATH


def _print_status(report: dict) -> None:
    print(f"status: {report['status']}")
    print(f"repo_root: {report['repo_root']}")
    print(f"entities: {report['source_entities']} refreshed rows")
    print(f"documents_indexed: {report['documents_indexed']}")
    print(f"chunks_indexed: {report['chunks_indexed']}")
    embedding = report["embedding"]
    print(
        f"embedding: {embedding['status']} model={embedding['model']} "
        f"base_url={embedding['base_url']}"
    )
    store = report["vector_store"]
    print(
        f"store: {store['path']} exists={store['exists']} "
        f"documents={store['document_count']} chunks={store['chunk_count']}"
    )
    print(f"last_sync: {report['last_sync']}")


def _print_search(report: dict) -> None:
    print(f"query: {report['query']}")
    print(f"embedding: {report['embedding']['status']} model={report['embedding']['model']}")
    print(f"results: {len(report['results'])}")
    for hit in report["results"]:
        print(
            f"- score={hit['score']:.4f} source={hit['source_path']} "
            f"chunk={hit['chunk_index']} title={hit['title']}"
        )
        print(f"  {hit['snippet']}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Local knowledge-base backend")
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--repo-root", default=None, help="Override the repository root")
    common.add_argument("--store-path", default=None, help="Override the sqlite vector-store path")
    common.add_argument("--base-url", default=None, help="Override the Ollama base URL")
    common.add_argument("--model", default=None, help="Override the Ollama embedding model")
    subparsers = parser.add_subparsers(dest="command", required=True)

    sync_parser = subparsers.add_parser("sync", help="Refresh entities and rebuild the vector store", parents=[common])
    sync_parser.add_argument("--json", action="store_true", help="Print machine-readable JSON output")

    search_parser = subparsers.add_parser("search", help="Search the local KB", parents=[common])
    search_parser.add_argument("query", help="Search query text")
    search_parser.add_argument("--limit", type=int, default=5, help="Maximum number of results")
    search_parser.add_argument("--json", action="store_true", help="Print machine-readable JSON output")

    status_parser = subparsers.add_parser("status", help="Report KB status", parents=[common])
    status_parser.add_argument("--json", action="store_true", help="Print machine-readable JSON output")

    args = parser.parse_args(argv)
    repo_root = Path(args.repo_root).resolve() if args.repo_root else REPO_ROOT
    store_path = Path(args.store_path).resolve() if args.store_path else _default_store_path(repo_root)

    if args.command == "sync":
        report = sync_index(
            repo_root=repo_root,
            base_url=args.base_url,
            model=args.model,
            store_path=store_path,
        )
        if args.json:
            print(json.dumps(report, indent=2, ensure_ascii=False))
        else:
            _print_status(report)
        return 0

    if args.command == "search":
        report = search_index(
            args.query,
            repo_root=repo_root,
            store_path=store_path,
            limit=args.limit,
            base_url=args.base_url,
            model=args.model,
        )
        if args.json:
            print(json.dumps(report, indent=2, ensure_ascii=False))
        else:
            _print_search(report)
        return 0

    if args.command == "status":
        store = SqliteVectorStore(store_path)
        entities = load_entities(repo_root)
        embedding = build_ollama_driver(base_url=args.base_url, model=args.model).status()
        status = "ready" if store.exists and embedding["status"] == "ready" else "warning" if store.exists else "empty"
        report = {
            "status": status,
            "repo_root": str(repo_root),
            "entities_path": str(repo_root / "workspace" / "knowledge_base" / "data" / "entities.jsonl"),
            "last_sync": str(repo_root / "workspace" / "knowledge_base" / "data" / "last_sync.txt"),
            "source_entities": len(entities),
            "last_sync_value": load_last_sync(repo_root),
            "embedding": embedding,
            "vector_store": store.status(),
        }
        if args.json:
            print(json.dumps(report, indent=2, ensure_ascii=False))
        else:
            print(f"status: {report['status']}")
            print(f"repo_root: {report['repo_root']}")
            print(f"entities_path: {report['entities_path']}")
            print(f"entities: {report['source_entities']}")
            print(f"last_sync_path: {report['last_sync']}")
            print(f"last_sync_value: {report['last_sync_value']}")
            print(
                f"embedding: {report['embedding']['status']} model={report['embedding']['model']} "
                f"base_url={report['embedding']['base_url']}"
            )
            print(
                f"store: {report['vector_store']['path']} exists={report['vector_store']['exists']} "
                f"documents={report['vector_store']['document_count']} chunks={report['vector_store']['chunk_count']}"
            )
        return 0

    raise AssertionError(f"unknown command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
