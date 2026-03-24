# Knowledge Base Home

This directory is the repo-local landing spot for cutover-compatible knowledge data.

- `data/entities.jsonl` is the refreshed compatibility corpus built from durable local docs.
- Current backend status: local Ollama embeddings plus a rebuildable sqlite vector store.
- `python3 workspace/knowledge_base/refresh_seed.py --json` rebuilds the compatibility corpus and
  updates `last_sync.txt`.
- `python3 workspace/knowledge_base/kb.py sync --json` refreshes the corpus and rebuilds
  `data/kb.sqlite3`.
- `python3 workspace/knowledge_base/kb.py search "query" --json` queries the local backend.
- `python3 workspace/knowledge_base/kb.py status --json` reports the embedding runtime and vector
  store receipt.
- `data/kb.sqlite3` and `data/last_sync.txt` are local rebuildable artifacts, not durable tracked
  source.
- Operator check: run `python3 workspace/evolution/kb_status.py --json` for the current repo-local
  KB health signal.
