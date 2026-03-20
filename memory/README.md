# Memory

This directory is the daily-memory home for C_Lawd.

## Canonical Layers

- Long-term prompt-loaded memory: `../MEMORY.md`
- Daily/session memory: `./*.md`
- Node-pinned doctrine and blocker memory: `../nodes/c_lawd/MEMORY.md`
- Compatibility engine/state layer: `../workspace/memory/`

## Runtime Notes

- `memory_search` and `memory_get` default to `MEMORY.md` and `memory/**/*.md`.
- `nodes/c_lawd/MEMORY.md` is important doctrine, but it is not part of default memory-tool search unless you add it through `agents.defaults.memorySearch.extraPaths`.
- `workspace/memory/` stays in place as a compatibility layer until path-coupled modules are made movable.

## What Belongs Here

- Daily notes
- Distillations
- Durable session logs worth recall

## What Does Not

- Secrets
- Generated caches
- Archived legacy snapshots
