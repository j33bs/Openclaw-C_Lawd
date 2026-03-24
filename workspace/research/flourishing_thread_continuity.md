# Flourishing Thread Continuity Slice

_Last updated: 2026-03-24_

This is the smallest useful local system for **meaning/thread continuity** in the flourishing mission.

It adds three concrete surfaces:

1. **connection-to-what-matters tracking**
2. **novelty gradient scoring for interaction**
3. **anti-fragmentation detection**

## What landed

### Code

- `src/flourishing/thread-continuity.ts`
- `src/flourishing/thread-continuity.test.ts`
- `scripts/flourishing-thread-report.ts`

### Main primitives

#### 1) Thread touches

`ThreadTouchSchema` records the meaningful moments inside a live thread:

- `kind`: `anchor | progress | repair | drift`
- `anchor`: the explicit thing that matters
- `salience`, `coherence`, `novelty`
- `evidence`
- `tags`
- `openLoops`

This is the local data structure for asking:

> are we still connected to what matters, or just moving?

#### 2) Connection-to-what-matters score

`scoreConnectionToWhatMatters(...)` evaluates a bounded thread snapshot using:

- recency of the last anchor
- average salience / coherence of recent touches
- whether a recent `progress` or `repair` touch exists
- whether unresolved open loops are starting to pile up

Output:

- score `0..10`
- band: `low | watch | healthy | strong`
- reasons

#### 3) Novelty gradient

`scoreNoveltyGradient(...)` compares the current interaction fingerprint against recent ones.

It looks at:

- repeated intent
- tag overlap
- anchor overlap
- depth shift

Output:

- score `0..10`
- band: `flat | steady | fresh | spiky`
- reasons

This gives a local signal for whether interaction has become stale/repetitive or is opening a useful new angle.

#### 4) Anti-fragmentation detector

`detectFragmentationPressure(...)` scores fragmentation pressure from:

- continuity coverage
- duplicate clarification rate
- unresolved thread count
- drift signals
- days since meaningful touch
- cross-surface mismatch count
- context switching

Output:

- pressure score
- severity: `low | elevated | high | critical`
- reasons
- next actions

This is observation-mode infrastructure for catching continuity failure _before_ the user has to say “you’re fragmenting again.”

## Integrated report

`buildThreadContinuityReport(...)` combines the three pieces into one report object.

A small CLI/report wrapper is included:

```bash
node --import tsx scripts/flourishing-thread-report.ts /path/to/input.json
```

Expected input shape:

```json
{
  "snapshot": {
    "timestamp": "2026-03-24T11:00:00.000Z",
    "threadKey": "flourishing-mission",
    "activeProjects": ["flourishing-mission"],
    "touches": [
      {
        "threadKey": "flourishing-mission",
        "timestamp": "2026-03-24T10:00:00.000Z",
        "kind": "anchor",
        "anchor": "Keep compute pointed at authentic flourishing.",
        "salience": 8,
        "coherence": 8,
        "novelty": 5,
        "evidence": ["named the mission directly"],
        "tags": ["mission"],
        "openLoops": ["thread continuity slice"]
      }
    ]
  },
  "novelty": {
    "current": {
      "timestamp": "2026-03-24T11:00:00.000Z",
      "intent": "implementation",
      "anchor": "turn the roadmap into a tiny working system",
      "tags": ["implementation", "continuity"],
      "depth": 7
    },
    "recent": [
      {
        "timestamp": "2026-03-24T09:00:00.000Z",
        "intent": "planning",
        "anchor": "identify the right flourishing slice",
        "tags": ["planning", "mission"],
        "depth": 4
      }
    ]
  },
  "fragmentation": {
    "timestamp": "2026-03-24T11:00:00.000Z",
    "continuityCoverage": 7,
    "duplicateClarificationRate": 0.1,
    "unresolvedThreads": 1,
    "driftSignals": [],
    "daysSinceMeaningfulTouch": 0,
    "crossSurfaceMismatchCount": 0,
    "contextSwitches": 2
  }
}
```

## Tests

Run:

```bash
pnpm exec vitest run src/flourishing/thread-continuity.test.ts
```

Current test coverage checks:

- strong meaning-thread connection
- flat/repetitive novelty gradient
- critical fragmentation detection
- integrated report assembly

## How to use this next

The intended near-term use is **observation mode**, not automatic behavior changes yet.

Good next wiring points:

- direct-chat continuity bundle/reporting
- heartbeat or briefing surfaces that need a “what matters / what is drifting” summary
- flourishing instrumentation rollups
- anti-fragmentation warnings inside response shaping

## Why this is the right size

This slice is deliberately small:

- real data structures
- real scoring helpers
- real report surface
- real tests
- no fake precision
- no premature storage/UI architecture

It gives the repo a local, testable continuity vocabulary that future wiring can build on.
