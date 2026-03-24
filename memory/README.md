# Memory

This directory is the daily-memory home for C_Lawd.

## Canonical Layers

- Long-term prompt-loaded memory: `../MEMORY.md`
- Daily/session memory: `./*.md`
- Node-pinned doctrine and blocker memory: `../nodes/c_lawd/MEMORY.md`
- Compatibility engine/state layer: `../workspace/memory/`

## Runtime Notes

- `memory_search` and `memory_get` default to `MEMORY.md`, `memory/**/*.md`, and pinned node doctrine files such as `nodes/*/MEMORY.md`, `nodes/*/IDENTITY.md`, and `nodes/*/CONVERSATION_KERNEL.md`.
- `nodes/c_lawd/MEMORY.md` remains important doctrine, but updated runtimes no longer need a manual `agents.defaults.memorySearch.extraPaths` entry for it.
- `workspace/memory/` stays in place as a compatibility layer until path-coupled modules are made movable.
- `memory/*-daemon.log` files are runtime watcher artifacts, not durable memory; durable summaries belong in normal daily notes like `memory/YYYY-MM-DD.md`.

## What Belongs Here

- Daily notes
- Distillations
- Durable session logs worth recall

## What Does Not

- Secrets
- Generated caches
- Archived legacy snapshots
