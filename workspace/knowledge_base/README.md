# Knowledge Base Home

This directory is the repo-local landing spot for cutover-compatible knowledge data.

- `data/entities.jsonl` is the minimal compatibility seed.
- Current backend status: compatibility seed only.
- Embeddings / vector-store status: none in this repo-local surface today.
- MLX pipeline status: not present here unless `indexer.py`, `retrieval.py`, `kb.py`, and
  `embeddings/driver_mlx.py` are added for real.
- Operator check: run `python3 workspace/evolution/kb_status.py --json` for the current
  repo-local KB/MLX health signal.
