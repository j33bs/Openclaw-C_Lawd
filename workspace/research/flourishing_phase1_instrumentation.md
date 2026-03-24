# Flourishing Phase 1 Instrumentation

_Last updated: 2026-03-24_

This is the smallest real vertical slice for the flourishing mission.

## What landed

Implementation lives in `src/flourishing/phase1.ts` with tests in `src/flourishing/phase1.test.ts`.

It covers three primitives:

1. **Felt-sense / session-boundary logging**
   - `FeltSenseStateSchema`
   - `createFeltSenseState(...)`
   - captures `session_open`, `session_close`, or `check_in`
   - stores energy, clarity, emotional load, felt shift, texture tags, body anchor, and note

2. **Incubation vs drift project-state tracking**
   - `ProjectStateSnapshotSchema`
   - `classifyProjectPhase(...)`
   - distinguishes:
     - `incubating`: still has pull, but clarity/progress are not yet there and there is a live incubation question
     - `active`: momentum + clarity + evidence are all present
     - `drifting`: multiple drift signals or too long since meaningful touch with low momentum
     - `stalled`: not moving, but not clearly drift

3. **Minimal flourishing metrics model**
   - `FlourishingMetricRecordSchema`
   - `summarizeFlourishing(...)`
   - keyed to the five target dimensions:
     - coherence
     - vitality
     - agency
     - truth_contact
     - connection

## Why this shape

This slice is intentionally narrow:

- enough structure to log real observations
- enough classification logic to separate incubation from drift
- enough metrics shape to compare sessions or interventions later
- not yet tied to storage, cron, or UI surfaces

That keeps Phase 1 testable before we wire it into the rest of the system.

## Example payloads

### Felt-sense session boundary

```ts
createFeltSenseState({
  boundary: "session_open",
  timestamp: "2026-03-24T11:00:00.000Z",
  feltShift: 1,
  energy: 6,
  clarity: 7,
  emotionalLoad: 3,
  textures: ["alive", "clear"],
  bodyAnchor: "chest warm, jaw loose",
  note: "came in with real curiosity",
});
```

### Project-state snapshot

```ts
classifyProjectPhase({
  projectKey: "flourishing-mission",
  timestamp: "2026-03-24T11:00:00.000Z",
  lastMeaningfulTouch: "2026-03-23T11:00:00.000Z",
  momentum: 4,
  clarity: 4,
  pull: 8,
  evidenceOfProgress: 3,
  driftSignals: [],
  incubationQuestion: "What is the smallest believable metric slice?",
});
```

### Flourishing metric record

```ts
summarizeFlourishing({
  metricKey: "session-2026-03-24-open",
  timestamp: "2026-03-24T11:00:00.000Z",
  source: "session_observation",
  scores: {
    coherence: 7,
    vitality: 5,
    agency: 8,
    truth_contact: 4,
    connection: 6,
  },
  evidence: ["named a real uncertainty instead of smoothing over it"],
});
```

## Runnable check

```bash
pnpm exec vitest run src/flourishing/phase1.test.ts
```

## Obvious next steps

- persist these records under `workspace/state/` or a dedicated flourishing journal
- wire session-boundary logging into bootstrap/session-close paths
- add rollups over time (trend, delta, intervention impact)
- connect project-state snapshots to backlog / roadmap surfaces
