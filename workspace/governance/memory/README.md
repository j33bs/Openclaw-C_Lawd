# Memory Home

Canonical recall sources during cutover:

- `MEMORY.md`
- `profile/user_memory.jsonl`
- `workspace/knowledge_base/data/entities.jsonl` (compatibility corpus for the local KB backend)
- `workspace/knowledge_base/kb.py` + `workspace/knowledge_base/data/kb.sqlite3` (local Ollama + sqlite recall path; rebuildable from repo state)

This home is for durable context and compatibility references, not raw logs.
