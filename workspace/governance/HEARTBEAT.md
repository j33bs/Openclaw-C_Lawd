# Heartbeat

- Check the cutover validator before changing prompt or memory surfaces.
- Keep any new rule additions small and receipt-backed.
- Prefer repo-relative paths over machine-local absolutes.

## Self-Evolution Checks

Run periodically (every few days / when something feels off):

```bash
python workspace/evolution/fitness.py
```

Red signals get a proposal in `workspace/evolution/PROPOSALS.md`. Proposals that have sat at `ready` for >3 days should be surfaced to jeebs.

When something meaningful changes (architecture, doctrine, a lesson learned), add an entry to `workspace/evolution/EVOLUTION_LOG.md`. Format: date, what changed, why it mattered, what was learned.

Review `PROPOSALS.md` — close stale ones, promote ready ones.
