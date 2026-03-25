# Codex Implementation Tasks — Wiring Flourishing into the Runtime

_Created: 2026-03-25_
_Depends on: `flourishing_system_roadmap.md`, `flourishing_backlog_implementation.md`_
_Evaluates against: `compute_happiness_meaning_rubric.md`_

---

## What This Is

This document contains concrete, file-level implementation tasks for an autonomous coding agent (Codex). Each task specifies exactly what to build, where to put it, what to test, and how it integrates with the existing codebase.

The system has a mature TypeScript runtime (`src/`, 4,774 files, 3,485 tests) and a flourishing/soul layer that is mostly design documents and unconnected code. These tasks wire them together.

## Ground Rules

1. **Never let flourishing code break the core pipeline.** Every integration is wrapped in try/catch. If it fails, the system works exactly as before.
2. **Follow existing patterns.** Read nearby test files before writing new ones. Match import style, mocking patterns, assertion conventions.
3. **No new databases.** Use JSONL append-only files or existing SQLite. No Postgres, no Redis, no new services.
4. **No config proliferation.** Things that should just work should just work. Config is for things the user actually needs to change.
5. **Summarize aggressively in prompts.** The system prompt is already long. Every new section must earn its tokens.
6. **Python stays in `workspace/`.** TypeScript calls Python via subprocess when needed. Don't rewrite Python modules in TypeScript.
7. **Build & test commands:** `pnpm build`, `pnpm test:unit` (vitest), `pnpm lint` (oxlint).
8. **Test every new file.** Filename pattern: `<module>.test.ts` alongside the module.

---

## Codebase Map (Read These First)

Before starting any task, read and understand these files:

### Flourishing layer (what exists)

- `src/flourishing/phase1.ts` — FlourishingAxisSchema, FeltSenseState, ProjectStateSnapshot, FlourishingMetricRecord, summarizeFlourishing()
- `src/flourishing/phase1.test.ts` — existing test patterns
- `src/flourishing/anti-fragmentation.ts` — AntiFragmentationSignal, assessFragmentation()
- `src/flourishing/thread-continuity.ts` — ThreadTouch, scoreConnectionToWhatMatters(), detectFragmentationPressure(), buildThreadContinuityReport()

### Response shaping (partially integrated)

- `src/agents/flourishing-response-shaping.ts` — scoreMeaningDensity(), recommendResponseMode(), shouldOpenRepairLoop(), buildFlourishingPromptSection()

### System prompt (the main integration point)

- `src/agents/system-prompt.ts` — buildAgentSystemPrompt(), already imports buildFlourishingPromptSection at line 7, accepts flourishingPromptConfig at ~line 192

### Memory (working, needs extension)

- `src/memory/manager.ts` — MemoryIndexManager, searchVector(), searchKeyword(), mergeHybridResults()
- `src/agents/memory-search.ts` — resolveMemorySearchConfig()

### Hooks (event system, underused)

- `src/hooks/internal-hooks.ts` — registerInternalHook(), triggerInternalHook(), event types: agent:bootstrap, message:received, message:sent, message:preprocessed

### Cron (working)

- `src/cron/isolated-agent/run.ts` — runCronAgentTurn()
- `src/cron/service.ts` — MemoryScheduleService
- `src/cron/types.ts` — CronJob, CronRunOutcome

### Agent execution

- `src/agents/cli-runner.ts` — runCliAgent(), calls buildAgentSystemPrompt()
- `src/agents/agent-scope.ts` — resolveAgentConfig()

### TACTI (Python, standalone)

- `workspace/memory/tacti_core.py` — TacticCore class, get_core() singleton
- `workspace/memory/arousal_tracker.py` — arousal state JSON schema
- `workspace/memory/relationship_tracker.py` — relationship state JSON schema
- State files: `workspace/memory/arousal_state.json`, `workspace/memory/relationship.json`

### Evolution (Python, manual)

- `workspace/evolution/fitness.py` — structural self-assessment, traffic-light signals
- `workspace/evolution/memory_health.py` — shared memory audit helpers

---

## TASK GROUP A: Continuity Bundle (F1 from backlog)

This is the single highest-leverage integration. Ship this first.

### A1: Build the continuity bundle assembler

**Create:** `src/memory/continuity-bundle.ts`

```typescript
export interface ContinuityBundleEntry {
  source: string; // file path or "semantic-search"
  content: string; // trimmed content
  kind: "daily-note" | "pinned-doctrine" | "session-snippet";
  date?: string; // for daily notes
  score?: number; // for semantic results
}

export interface ContinuityBundle {
  entries: ContinuityBundleEntry[];
  assembledAt: string; // ISO timestamp
  confidence: "full" | "partial" | "minimal";
  // "full" = today + yesterday notes + pinned doctrine found
  // "partial" = some sources missing
  // "minimal" = only semantic search available or nothing found
}

export interface AssembleContinuityBundleParams {
  workspaceDir: string;
  memoryManager?: {
    searchVector(embedding: number[]): Promise<any[]>;
    searchKeyword(query: string): Promise<any[]>;
  };
  query?: string;
  maxTokens?: number; // default 400, cap total bundle size
}

export async function assembleContinuityBundle(
  params: AssembleContinuityBundleParams,
): Promise<ContinuityBundle>;
```

**Implementation steps:**

1. Compute today and yesterday dates (use system timezone, respect `Australia/Brisbane` if timezone util exists)
2. Try to read `memory/YYYY-MM-DD.md` for both dates from `params.workspaceDir`. Use `fs.readFile` with graceful failure.
3. Try to read pinned doctrine: glob `nodes/*/MEMORY.md` and `nodes/*/CONVERSATION_KERNEL.md` under `params.workspaceDir`. Read first match for each.
4. If `params.query` and `params.memoryManager` are provided, run `searchKeyword(query)` for top 3 results (skip results that duplicate daily notes already included).
5. Trim each entry to fit within a per-entry token budget (roughly `maxTokens / entryCount`). Prefer keeping the beginning of daily notes (most recent entries are at the bottom, but the header/context is at the top).
6. Set `confidence` based on what was found:
   - "full": at least today's note + at least one pinned doc
   - "partial": some but not all of the above
   - "minimal": none of the local sources found (only semantic or empty)
7. Return the bundle. Never throw — return `{ entries: [], confidence: "minimal", assembledAt }` on total failure.

**Create:** `src/memory/continuity-bundle.test.ts`

Test cases:

- Both daily notes exist, pinned doctrine exists → confidence "full"
- Only today's note exists → confidence "partial"
- No daily notes, no doctrine → confidence "minimal"
- With query and mock memoryManager → includes semantic results
- Without query → skips semantic search
- Content exceeds maxTokens → entries are trimmed
- File read failures don't throw

---

### A2: Build the continuity prompt section

**Create:** `src/agents/continuity-prompt.ts`

```typescript
export function buildContinuityPromptSection(bundle: ContinuityBundle): string;
```

**Implementation:**

Produce a concise system prompt section. Target: under 500 tokens total.

Format:

```
## Recent Context [confidence: {bundle.confidence}]

### Today ({date})
{first 150 tokens of today's daily note, focusing on headings and key bullets}

### Yesterday ({date})
{first 100 tokens of yesterday's daily note}

### Active Doctrine
{first 100 tokens of pinned doctrine, focusing on active blockers and decisions}

### Related Sessions
{top 2-3 one-line snippets with source attribution}
```

If confidence is "minimal", instead output:

```
## Recent Context [confidence: minimal]
Recent daily notes and pinned doctrine were not found. State uncertainty explicitly when answering questions about recent work.
```

**Create:** `src/agents/continuity-prompt.test.ts`

Test cases:

- Full bundle → produces all sections
- Minimal bundle → produces uncertainty notice
- Empty entries → no crash, produces minimal section
- Output stays under 500 tokens (approximate — count words \* 1.3)

---

### A3: Inject continuity bundle into system prompt

**Modify:** `src/agents/system-prompt.ts`

1. Add import: `import { buildContinuityPromptSection } from "./continuity-prompt.js"`
2. Add param to `buildAgentSystemPrompt()`: `continuityBundle?: ContinuityBundle`
3. After the flourishing section (which already exists), add:

```typescript
if (params.continuityBundle && params.continuityBundle.entries.length > 0) {
  sections.push(buildContinuityPromptSection(params.continuityBundle));
}
```

**Important:** Find where `buildAgentSystemPrompt` is called for direct-chat sessions in `src/agents/cli-runner.ts` (or equivalent). Add `assembleContinuityBundle()` call there, passing the result to the prompt builder.

**Guard:** Only assemble for direct-chat / main sessions. Check session type or agent scope. Do NOT assemble for:

- Cron job isolated agents
- Subagents spawned by other agents
- Webhook-triggered runs

Look at how the call site distinguishes session types — there should be a session kind, agent scope type, or similar discriminator.

---

### A4: Wire continuity confidence into response shaping

**Modify:** `src/agents/flourishing-response-shaping.ts`

1. Add to `ResponseModeInput` (find the interface):

```typescript
continuityConfidence?: "full" | "partial" | "minimal";
```

2. In `recommendResponseMode()`, add logic:

- If `continuityConfidence === "minimal"` and the conversation involves recall-sensitive topics, bias toward explicit uncertainty. Don't change the mode, but add to the returned metadata/reasons: `"continuity confidence is minimal — prefer stating uncertainty over confabulating"`

3. Add test case in the corresponding test file.

---

## TASK GROUP B: TACTI State Integration

Wire the Python TACTI trackers into TypeScript response generation.

### B1: Create TypeScript TACTI state reader

**Create:** `src/flourishing/tacti-state.ts`

```typescript
export interface TactiSnapshot {
  arousal: number; // 0.0 - 1.0
  trustScore: number; // 0.0 - 1.0
  attunementIndex: number; // 0.0 - 1.0
  interactionCount: number;
  unresolvedThreads: string[];
  lastUpdated: string; // ISO timestamp
  stale: boolean; // true if lastUpdated > 1 hour ago
}

export async function readTactiSnapshot(workspaceDir: string): Promise<TactiSnapshot | null>;
```

**Implementation:**

1. Read `{workspaceDir}/workspace/memory/arousal_state.json`. Parse as JSON. Extract:
   - `arousal`: average across all sessions, or latest session's arousal
   - Schema is `{ schema: 1, updated_at, sessions: { [id]: { arousal, user_events, assistant_events, ... } } }`
2. Read `{workspaceDir}/workspace/memory/relationship.json`. Parse as JSON. Extract:
   - `trustScore`, `attunementIndex` from latest session entry
   - `unresolvedThreads` from latest session entry (may be array or empty)
   - Schema is `{ schema: 1, updated_at, sessions: { [id]: { trust_score, attunement_index, unresolved_threads, ... } } }`
3. Compute `interactionCount` as sum of user_events + assistant_events across all sessions
4. Compute `lastUpdated` as the most recent `updated_at` from either file
5. Set `stale = true` if `lastUpdated` is more than 1 hour ago
6. If either file is missing, partially fill from what's available. If both missing, return `null`.
7. Never throw. Catch JSON parse errors, return `null`.

**Create:** `src/flourishing/tacti-state.test.ts`

Test cases:

- Both files present with valid data → full snapshot
- Only arousal file → partial snapshot (trust defaults to 1.0)
- Only relationship file → partial snapshot (arousal defaults to 0.5)
- Neither file → null
- Corrupt JSON → null
- Stale timestamp → stale: true
- Fresh timestamp → stale: false

---

### B2: Feed TACTI snapshot into response shaping

**Modify:** `src/agents/flourishing-response-shaping.ts`

1. Add to `ResponseModeInput`:

```typescript
tactiSnapshot?: TactiSnapshot | null;
```

2. In `recommendResponseMode()`, add:

- If `tactiSnapshot` exists and is not stale:
  - `arousal > 0.8` → add reason `"high arousal detected — prefer shorter, calmer responses"`, bias toward `"tight_execute"` mode
  - `trustScore < 0.5` → add reason `"low trust score — prefer repair mode"`, recommend `"repair"` mode
  - `unresolvedThreads.length > 3` → add reason `"multiple unresolved threads — consider surfacing them"`
- If `tactiSnapshot` is null or stale → ignore entirely (no TACTI data is better than stale data)

3. Add test cases for each condition.

---

### B3: Create TACTI interaction recorder

**Create:** `src/flourishing/tacti-recorder.ts`

```typescript
export interface TactiInteractionParams {
  workspaceDir: string;
  sessionId: string;
  role: "user" | "assistant";
  tokenCount: number;
  toolCalls?: number;
  toolFailures?: number;
}

export async function recordTactiInteraction(params: TactiInteractionParams): Promise<void>;
```

**Implementation:**

1. First, check if `workspace/memory/tacti_core.py` exists. If not, return silently.
2. Check if a thin CLI wrapper exists at `workspace/memory/tacti_cli.py`. If not, create it:

```python
#!/usr/bin/env python3
"""Thin CLI for TACTI core — called by TypeScript runtime."""
import sys, json
from tacti_core import get_core

def main():
    data = json.loads(sys.stdin.read())
    cmd = data.get("command")
    core = get_core()
    if cmd == "record_interaction":
        core.record_interaction(
            type=data.get("type", "message"),
            sentiment=data.get("sentiment", "neutral"),
            resolution=data.get("resolution", "complete")
        )
    elif cmd == "update_arousal":
        core.update_arousal(
            token_count=data.get("token_count", 0),
            tool_calls=data.get("tool_calls", 0),
            tool_failures=data.get("tool_failures", 0)
        )
    elif cmd == "status":
        print(json.dumps(core.full_status()))
    else:
        print(json.dumps({"error": f"unknown command: {cmd}"}))

if __name__ == "__main__":
    main()
```

3. Spawn Python subprocess: `python3 workspace/memory/tacti_cli.py` with JSON on stdin.
4. Use `child_process.spawn` — fire and forget. Set a 5-second timeout. Don't await completion.
5. Log errors to stderr but never throw.

**Create:** `src/flourishing/tacti-recorder.test.ts`

Test cases:

- Mock subprocess spawn — verify correct JSON sent to stdin
- Missing tacti_core.py → returns silently
- Subprocess timeout → logs warning, doesn't throw
- Subprocess error → logs warning, doesn't throw

---

### B4: Hook TACTI recording into message lifecycle

**Create:** `src/hooks/tacti-hooks.ts`

```typescript
import { registerInternalHook } from "./internal-hooks.js";
import { recordTactiInteraction } from "../flourishing/tacti-recorder.js";

export function registerTactiHooks(workspaceDir: string): void {
  registerInternalHook("message:sent", async (event) => {
    try {
      await recordTactiInteraction({
        workspaceDir,
        sessionId: event.sessionId ?? "unknown",
        role: "assistant",
        tokenCount: event.usage?.tokensOut ?? event.tokenCount ?? 0,
        toolCalls: event.toolCallCount ?? 0,
        toolFailures: event.toolFailureCount ?? 0,
      });
    } catch {
      // never break message flow
    }
  });

  registerInternalHook("message:received", async (event) => {
    try {
      await recordTactiInteraction({
        workspaceDir,
        sessionId: event.sessionId ?? "unknown",
        role: "user",
        tokenCount: event.tokenCount ?? 0,
      });
    } catch {
      // never break message flow
    }
  });
}
```

**Important:** Check the actual event type shapes in `internal-hooks.ts`. The field names above (sessionId, usage, tokenCount, toolCallCount, toolFailureCount) are approximate. Match the real types. If some fields don't exist on the event, remove them from the call.

**Integration:** Find where hooks are registered at startup (look for other `registerInternalHook` calls in the codebase). Add `registerTactiHooks(workspaceDir)` at the same location.

---

### B5: Read TACTI snapshot at session start

**Modify:** `src/agents/cli-runner.ts` (or wherever `buildAgentSystemPrompt` is called for direct-chat)

1. Import `readTactiSnapshot` from `src/flourishing/tacti-state.ts`
2. Before calling `buildAgentSystemPrompt()`, call `readTactiSnapshot(workspaceDir)`
3. Pass the snapshot through to the response shaping config

This should happen in the same place where the continuity bundle is assembled (Task A3). Both are "pre-session context gathering" steps.

---

## TASK GROUP C: Anti-Fragmentation as Live Signal

### C1: Build the fragmentation signal collector

**Create:** `src/flourishing/fragmentation-collector.ts`

```typescript
import { AntiFragmentationSignal } from "./anti-fragmentation.js";

export async function collectFragmentationSignals(
  workspaceDir: string,
): Promise<AntiFragmentationSignal>;
```

**Implementation:**

Read the `AntiFragmentationSignal` type from `anti-fragmentation.ts` and populate each field:

1. `recallSuccessRate`: Default to 0.8 (we don't have real tracking yet). This is a placeholder — mark with a TODO.
2. `duplicateClarificationRate`: Default to 0.1. Placeholder — TODO.
3. `dailyNoteFreshnessHours`: Stat today's daily note file. If exists, compute hours since mtime. If not, return 999.
4. `continuityBundleAvailable`: Check if `memory/` dir has today's date file. Boolean.
5. `pinnedDoctrineAvailable`: Check if any `nodes/*/MEMORY.md` exists. Boolean.
6. `sessionMemoryAvailable`: Check if `workspace/state/` has session-related state files. Boolean.

For fields not listed above, check the actual `AntiFragmentationSignal` type and populate with sensible defaults.

**Create:** `src/flourishing/fragmentation-collector.test.ts`

Test with mock filesystem (use temp dirs or mocks).

---

### C2: Write fragmentation assessment to state

**Create:** `src/flourishing/fragmentation-writer.ts`

```typescript
export async function writeFragmentationAssessment(workspaceDir: string): Promise<void>;
```

1. Call `collectFragmentationSignals(workspaceDir)`
2. Call `assessFragmentation(signals)` from `anti-fragmentation.ts`
3. Write result + `collectedAt` timestamp to `{workspaceDir}/workspace/state/fragmentation-assessment.json`
4. If severity is "high" or "critical", append a warning to today's daily note (`memory/YYYY-MM-DD.md`)

---

### C3: Surface fragmentation in system prompt

**Modify:** `src/agents/system-prompt.ts`

1. Read `workspace/state/fragmentation-assessment.json` during prompt assembly (try/catch, skip if missing)
2. If severity >= "moderate", add one line to the system prompt:

```
[System health: fragmentation {severity}, score {score}. {recommendations[0]}]
```

3. If file is missing or stale (> 12 hours), skip.

---

## TASK GROUP D: Flourishing Metrics Collection

### D1: Create the metrics store

**Create:** `src/flourishing/metrics-store.ts`

```typescript
export interface StoredMetricRecord {
  id: string; // uuid
  recordedAt: string; // ISO timestamp
  source: "auto" | "manual" | "cron";
  metricKey: string; // from FlourishingMetricRecord
  scores: Record<string, number>; // axis name → score
  evidence: string;
  linkedProject?: string;
}

export class FlourishingMetricsStore {
  private storePath: string;

  constructor(workspaceDir: string) {
    this.storePath = path.join(workspaceDir, "workspace/state/flourishing-metrics.jsonl");
  }

  async record(metric: FlourishingMetricRecord, source: "auto" | "manual" | "cron"): Promise<void> {
    // Append one JSON line to storePath
    // Generate UUID for id, ISO timestamp for recordedAt
    // Ensure directory exists
  }

  async query(params: {
    since?: string; // ISO timestamp
    axis?: string; // filter by axis
    limit?: number; // max records
  }): Promise<StoredMetricRecord[]> {
    // Read JSONL, parse, filter, return
  }

  async summary(params: { since?: string }): Promise<{
    averageByAxis: Record<string, number>;
    weakestAxis: string;
    trend: "improving" | "stable" | "declining";
    recordCount: number;
  }> {
    // Query records, compute averages, detect trend by comparing
    // first half vs second half of the window
  }
}
```

**Storage format:** Append-only JSONL at `workspace/state/flourishing-metrics.jsonl`. One JSON object per line. No indexes needed — these files stay small.

**Create:** `src/flourishing/metrics-store.test.ts`

---

### D2: Auto-derive metrics from session signals

**Create:** `src/flourishing/auto-collect.ts`

```typescript
export function deriveSessionFlourishingMetrics(params: {
  tactiSnapshot: TactiSnapshot | null;
  fragmentationSeverity: string | null; // from assessment
  continuityConfidence: string | null; // from bundle
}): FlourishingMetricRecord;
```

**Derivation heuristics:**

| Axis          | Source                 | Logic                                 |
| ------------- | ---------------------- | ------------------------------------- |
| coherence     | fragmentation severity | low→3, moderate→2, high→1, critical→0 |
| vitality      | arousal                | 0.3-0.7→3, 0.2-0.8→2, else→1          |
| agency        | default                | 2 (no reliable auto signal yet)       |
| truth_contact | continuity confidence  | full→3, partial→2, minimal→1          |
| connection    | trust + attunement     | average of both, scaled to 0-3        |

Mark evidence as `"auto-derived-v1"` so manual assessments can supersede.

**Create:** `src/flourishing/auto-collect.test.ts`

---

### D3: Record metrics after sessions

**Modify:** Hook into session close (or add to the TACTI hooks from B4).

After an agent session completes (look for session lifecycle hooks or agent completion handlers):

1. Read current TACTI snapshot
2. Read current fragmentation assessment from state file
3. Read continuity confidence from the bundle (if it was assembled)
4. Call `deriveSessionFlourishingMetrics()`
5. Call `metricsStore.record(metrics, "auto")`

This should be fire-and-forget. Never block session completion.

---

## TASK GROUP E: Truthfulness Audit

### E1: Build the truthfulness checker

**Create:** `src/flourishing/truthfulness-audit.ts`

```typescript
export interface TruthfulnessCheck {
  claim: string;
  verified: boolean;
  evidence: string;
  checkedAt: string;
}

export async function runTruthfulnessAudit(workspaceDir: string): Promise<{
  checks: TruthfulnessCheck[];
  passRate: number;
  failures: string[];
}>;
```

**Checks to implement:**

1. **Daily note exists for today**
   - Claim: "Daily notes are current"
   - Check: `fs.access(memory/YYYY-MM-DD.md)`

2. **KB backend is responsive**
   - Claim: "Knowledge base is working"
   - Check: Run `python3 workspace/knowledge_base/kb.py status --json`, parse output, verify `status === "ready"`
   - Timeout: 10 seconds. If timeout, mark as failed.

3. **Ollama embeddings are available**
   - Claim: "Embedding service is running"
   - Check: HTTP GET to `http://127.0.0.1:11434/api/tags` with 5-second timeout
   - If response 200, pass. If timeout or error, fail.

4. **TACTI state is fresh**
   - Claim: "TACTI trackers are current"
   - Check: Read `workspace/memory/relationship.json`, verify `updated_at` < 24 hours ago

5. **Pinned doctrine exists**
   - Claim: "Node doctrine is available"
   - Check: `fs.access(nodes/c_lawd/MEMORY.md)`

6. **Fragmentation assessment is recent**
   - Claim: "Fragmentation monitoring is active"
   - Check: Read `workspace/state/fragmentation-assessment.json`, verify `collectedAt` < 12 hours

Compute `passRate = passing / total`. List failures as strings.

**Create:** `src/flourishing/truthfulness-audit.test.ts`

Mock filesystem and HTTP calls. Test: all pass, some fail, all fail, HTTP timeout, corrupt state files.

---

### E2: Schedule truthfulness audit

Find the cron job registration pattern in the codebase. Create a cron job that:

- Runs every 12 hours
- Calls `runTruthfulnessAudit(workspaceDir)`
- Writes results to `workspace/state/truthfulness-audit.json`
- If `passRate < 0.8`, appends a warning line to today's daily note

Match the existing cron job registration pattern exactly.

---

## TASK GROUP F: Evolution Loop Automation

### F1: Automate fitness assessment

Create a cron job (daily, early morning) that:

1. Runs `python3 workspace/evolution/fitness.py --json` via subprocess
2. Parses the JSON output
3. Writes to `workspace/state/fitness-assessment.json`
4. If any signal is red (look for `🔴` or equivalent in the JSON), append to today's daily note:
   `## Fitness Alert\n- {signal}: {description}`

**Create:** `src/cron/jobs/fitness-check.ts` (or equivalent location matching existing cron pattern)

Check if `fitness.py` supports `--json` output. If not, create a thin wrapper or parse the text output.

---

### F2: Proposal lifecycle checker

**Create:** `workspace/evolution/proposal_lifecycle.py`

Script that:

1. Reads `workspace/evolution/PROPOSALS.md`
2. Parses proposals (they have a status, created date, description)
3. Flags proposals that are "draft" for > 7 days → mark as "stale"
4. Flags proposals that are "approved" for > 3 days with no linked commit → mark as "blocked"
5. Writes summary to `workspace/state/proposal-status.json`

Run this from the same daily fitness cron job.

---

## TASK GROUP G: Unified System State

### G1: Create the unified state assembler

**Create:** `src/flourishing/system-state.ts`

```typescript
export interface SystemState {
  continuityConfidence: "full" | "partial" | "minimal" | "unknown";
  tactiSnapshot: TactiSnapshot | null;
  fragmentationSeverity: string | null;
  truthfulnessPassRate: number | null;
  flourishingWeakestAxis: string | null;
  flourishingTrend: string | null;
  staleSources: string[];
  assembledAt: string;
}

export async function assembleSystemState(workspaceDir: string): Promise<SystemState>;
```

**Implementation:**

Read from the state files written by previous tasks:

- `workspace/state/fragmentation-assessment.json`
- `workspace/state/truthfulness-audit.json`
- `workspace/state/fitness-assessment.json`
- `workspace/state/flourishing-metrics.jsonl` (via metrics store summary)
- `workspace/memory/arousal_state.json` and `relationship.json` (via readTactiSnapshot)

For each, try to read and parse. If missing or corrupt, set to null and add to `staleSources`.

---

### G2: Inject system state digest into agent context

**Modify:** `src/agents/system-prompt.ts`

Add a new optional section. Call `assembleSystemState()` during prompt assembly for direct-chat sessions.

Format as a single compact line:

```
[System: continuity={confidence}, arousal={x}, trust={x}, fragmentation={severity}, flourishing weakest={axis} ({score}), truthfulness={passRate}%]
```

Only include if at least 3 sources are non-null. If most sources are stale/unknown, skip entirely — an empty digest is better than a misleading one.

---

## TASK GROUP H: Sunset Protocol

### H1: Add review metadata to cron jobs

**Modify:** `src/cron/types.ts`

Add optional fields to `CronJob`:

```typescript
reviewDate?: string;      // ISO date — when this job should be evaluated
lastEvidenceDate?: string; // last time usefulness was demonstrated
```

These are optional and backward-compatible.

---

### H2: Create sunset checker

**Create:** `src/cron/jobs/sunset-check.ts` (or equivalent)

Weekly cron that:

1. Lists all active cron jobs (from the cron store)
2. For each job with a `reviewDate` that has passed:
   - If `lastEvidenceDate` is null or > 14 days ago, flag as "needs review"
3. Write flagged jobs to today's daily note:
   `## Automation Review\nThese jobs are past review date with no recent evidence of usefulness:\n- {job.id}: {job.task?.slice(0, 80)}`

Don't auto-disable — just surface for human decision.

---

## TASK GROUP I: Briefing Rewrite

### I1: Locate and modify the briefing cron

Search the codebase for the morning briefing cron job (keywords: "briefing", "7 AM", "daily_briefing"). Read the current prompt.

Modify the prompt to structure output as:

```
## What matters today
{derived from: active projects in daily notes, calendar if available, unresolved threads from TACTI}

## What's at risk of drift
{derived from: fragmentation assessment, stale state sources, thread continuity report}

## Recommended move
{single most impactful action today, derived from backlog priority + current state}

## System health
{one line: truthfulness pass rate, fragmentation severity, flourishing trend}
```

Remove: weather filler, generic greetings, boilerplate.

### I2: Track briefing acknowledgment

After the briefing is delivered, track whether jeebs responds within 2 hours. Store in a simple JSON file: `workspace/state/briefing-ack.json`:

```json
{
  "history": [
    { "date": "2026-03-25", "delivered": true, "acknowledged": false },
    { "date": "2026-03-24", "delivered": true, "acknowledged": true }
  ]
}
```

If 5 consecutive briefings get no acknowledgment, include a note in the next briefing: "These briefings haven't been acknowledged recently. Should I change the format or timing?"

---

## Execution Order

**Wave 1 (Foundation — do first, each independently valuable):**

- A1, A2, A3, A4 (continuity bundle)
- B1 (TACTI state reader)
- C1, C2 (fragmentation collector + writer)

**Wave 2 (Integration — connects Wave 1 to runtime):**

- B2 (TACTI → response shaping)
- B3, B4 (TACTI recording)
- C3 (fragmentation → system prompt)
- A3 integration into cli-runner

**Wave 3 (Measurement — closes the feedback loop):**

- D1, D2, D3 (metrics store + auto-collection)
- E1, E2 (truthfulness audit)
- G1, G2 (unified state)

**Wave 4 (Governance — keeps the system honest):**

- F1, F2 (evolution automation)
- H1, H2 (sunset protocol)
- I1, I2 (briefing rewrite)

Each wave is independently shippable. Wave 1 alone is worth deploying.

---

## Verification Checklist

After all tasks are complete, verify:

- [ ] `pnpm build` succeeds
- [ ] `pnpm test:unit` passes (including all new tests)
- [ ] `pnpm lint` passes
- [ ] Direct-chat sessions include continuity bundle in system prompt
- [ ] TACTI snapshot is read at session start (check with a debug log)
- [ ] Fragmentation assessment file exists after running the collector
- [ ] Truthfulness audit produces a result file
- [ ] Flourishing metrics JSONL file accumulates records after sessions
- [ ] System state digest appears in direct-chat system prompt
- [ ] No flourishing-layer failure crashes the core pipeline (test by deleting state files and running a session)
