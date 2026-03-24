# Flourishing Response Shaping — Practical Foundation

_Last updated: 2026-03-24_

This is a modest implementation slice for the broader flourishing mission.

It does **not** pretend to solve flourishing in one pass. It gives us a real, testable base for three things:

1. **meaning-density preflight** before execution
2. **agency-first response-mode scaffolding** under uncertainty or loop pressure
3. **repair-loop hooks** when relational misalignment shows up

## What landed

### Code

- `src/agents/flourishing-response-shaping.ts`
  - `scoreMeaningDensity(...)`
  - `recommendResponseMode(...)`
  - `shouldOpenRepairLoop(...)`
  - `buildFlourishingPromptSection(...)`

### Tests

- `src/agents/flourishing-response-shaping.test.ts`
- `src/agents/system-prompt.test.ts`

### Prompt wiring

`buildAgentSystemPrompt(...)` now accepts an optional `flourishingPromptConfig` block.

If enabled, it injects a **Flourishing Response Shaping** section into the system prompt.

## Why this shape

This is intentionally deterministic and legible.

Instead of introducing another vague judge model, the helper uses explicit boolean-ish signals:

- does the next move directly serve the user goal?
- does it improve truth-contact?
- does it preserve agency?
- does it protect relationship quality?
- is it drifting into decorative output?
- are we seeing confusion, repeated failure, or relational strain?

That makes the first version easier to reason about, test, and tune.

## Current response modes

### `tight_execute`

Use when intent is clear and the move is reversible enough to just do the work.

Shape:

- execute directly
- keep chatter low
- report receipts

### `agency_first`

Use when uncertainty, irreversible weight, confusion, or collapse pressure is present.

Shape:

- state the situation plainly
- offer 1-3 concrete options or the smallest next step
- reduce branching and over-driving

### `repair`

Use when there is clear relational mismatch or overreach.

Shape:

- name the mismatch briefly
- own the likely miss
- restate the user's apparent aim
- offer one corrected next step

## Example prompt config

```ts
const prompt = buildAgentSystemPrompt({
  workspaceDir: "/repo",
  flourishingPromptConfig: {
    enabled: true,
    meaningDensity: {
      enabled: true,
      executionMinScore: 2,
    },
    responseMode: {
      enabled: true,
      defaultMode: "agency_first",
      collapseFailureThreshold: 2,
    },
    repairLoop: {
      enabled: true,
    },
  },
});
```

## What this enables right now

- caller-level experiments without invasive runtime surgery
- consistent prompt language for agency-preserving behavior
- a shared helper for future tool-call gating or transcript review logic

## Obvious next moves

1. wire `flourishingPromptConfig` from real runtime config instead of only caller params
2. apply meaning-density checks specifically to tool execution and irreversible actions
3. log repair-loop openings so we can review false positives vs real saves
4. compare `agency_first` vs `tight_execute` outcomes on real transcripts

## Open questions

- Should meaning density gate **all** tool calls, or only irreversible / high-cost ones?
- Should repeated failure be counted per turn, per task, or per recent window?
- What is the lightest useful evidence trail for repair-loop events without creating bureaucracy?
- When does agency-first become timid instead of protective?
