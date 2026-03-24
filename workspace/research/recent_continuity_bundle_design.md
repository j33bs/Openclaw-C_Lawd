# Recent Continuity Bundle — Design Note

_Last updated: 2026-03-24_

This is the first concrete implementation target for the flourishing mission.

## Purpose

Answer continuity-sensitive questions with a small, truthful context bundle instead of relying on a single semantic search hit or raw prompt memory.

## Trigger conditions

Use the bundle when the user asks about:

- prior work
- what changed recently
- what happened overnight / today / yesterday
- current decisions or active direction
- whether the system remembers a thread / task / preference

Also use it when the system is about to make a continuity-heavy claim and local confidence is low.

## Retrieval order

1. `memory/<today>.md`
2. `memory/<yesterday>.md`
3. pinned node docs under `nodes/*/(MEMORY.md|CONVERSATION_KERNEL.md|IDENTITY.md)`
4. recent relevant session snippets
5. semantic memory matches

This is an **evidence ladder**, not a bag of sources.

## Source weighting

### Highest confidence

- explicit recent daily-note entries
- pinned doctrine / node memory

### Medium confidence

- recent session transcript snippets

### Lower confidence

- semantic matches without strong local corroboration

## Output contract

The bundle should return a bounded object with:

- `question_type`
- `sources[]`
- `summary`
- `known_facts[]`
- `open_uncertainties[]`
- `mode` (`local-first`, `session-backed`, `semantic-only`)

## Response contract on top of the bundle

For user-facing answers, prefer:

- **What I found:** 1-3 bullets
- **What I infer:** optional, only if needed
- **What is still uncertain:** optional, only if real

Do not dump raw memory excerpts unless asked.

## Failure / fallback behavior

If the bundle cannot find enough local support:

- say that you checked
- avoid acting certain
- name the thin spot (`I found semantic matches, but not a strong recent local note`)
- ask one focused clarifying question only if needed

## Token discipline

The bundle must be compact.

Suggested limits:

- 4-6 source items max
- summary under ~700 chars before prompt injection
- prefer citations/paths over long excerpts

## First implementation touchpoints

- `src/agents/tools/memory-tool.ts`
- `src/agents/workspace.ts`
- `src/agents/system-prompt.ts`
- related tests in `src/agents/workspace.test.ts` and memory-tool tests

## Non-goals for v1

- perfect global recall
- cross-channel omniscience
- full project-state synthesis
- sentiment inference or psychological overreach

The v1 goal is smaller:

> reduce fragmentation in direct chat with a bounded, truthful continuity helper
