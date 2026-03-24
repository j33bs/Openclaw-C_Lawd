# 200 Ways the System Can More Effectively Improve Itself

_c_lawd / OpenClaw · 2026-03-23_

This document catalogs 200 concrete opportunities for self-improvement across memory, architecture, communication, governance, tooling, security, agent intelligence, and operational discipline. Each entry is actionable, not aspirational.

---

## I. Memory Architecture (1–30)

1. **Unify memory query** — single `query(q)` call that fans out to episodic, semantic, procedural, and relational stores and fuses results, replacing the current fragmented ad-hoc reads.
2. **Auto-curate MEMORY.md** — a nightly script that reads the last 7 daily logs, scores entries by recurrence + importance, and appends curated items to `MEMORY.md` without manual intervention.
3. **Episodic expiry** — compress daily logs older than 30 days into monthly summaries; delete raw files to cap disk use.
4. **Memory freshness index** — track a `last_updated` timestamp per memory type and surface stale memory categories during the fitness check.
5. **Cross-reference links** — when a new daily entry mentions an entity already in semantic memory, automatically insert a backlink so future queries surface the connection.
6. **Relational memory health alerts** — if `trust_score` drops below a threshold, proactively flag it in the next heartbeat rather than waiting for manual inspection.
7. **Pattern chunker tuning** — lower the current `frequency >= 3` threshold to `>= 2` for high-confidence patterns; add a decay factor so stale patterns age out.
8. **Memory access telemetry** — log every memory read/write with a timestamp and query, then review weekly to see which stores are under-used.
9. **Semantic deduplication** — before inserting to semantic memory, check for near-duplicate entities (cosine similarity > 0.92) and merge rather than append.
10. **Relationship repair tracking** — add a `repair_events` array to `relationship.json` so the trust score accounts for successful rupture-repair cycles, not just positive interactions.
11. **Session handshake enrichment** — include the relational memory health snapshot in the session handshake payload so each session starts knowing the current trust level.
12. **Memory integrity check** — a lightweight `memory_audit.py` that verifies all daily files are valid Markdown, `relationship.json` is parseable, and no cross-reference pointers are broken.
13. **Procedural memory versioning** — when a procedure is updated, keep the old version with a deprecation timestamp rather than overwriting, enabling rollback if the new procedure misbehaves.
14. **On-demand memory summarization** — expose a CLI command (`clawd memory summarize --since 7d`) to generate a human-readable digest of recent memory without loading raw files into context.
15. **Memory tiering by volatility** — classify memories as hot (session-local), warm (weekly), cold (monthly+), and only load cold memories when explicitly needed.
16. **Entity resolution across memory types** — maintain a shared entity registry so "Heath" in episodic and "heathyeager" in semantic are known to be the same person.
17. **Memory write confirmation** — after writing to any memory file, perform an immediate read-back and hash comparison to detect truncation or write errors.
18. **Novelty detection** — on each session start, compare today's context window against the last 3 daily logs and surface anything genuinely new to avoid re-explaining things already known.
19. **Semantic memory provenance** — every semantic fact should carry a source field (paper, conversation, web) and confidence level so retrieval can weight by reliability.
20. **Forgetting curve simulation** — implement spaced-repetition scoring for semantic entries so facts accessed rarely gradually reduce in retrieval priority, mirroring human forgetting curves.
21. **Daily log templating** — standardize the daily log format (sections: events, decisions, open threads, lessons) so pattern matching and summarization scripts have a consistent schema to parse.
22. **Memory search over git history** — add a fallback search that queries `git log` for commit messages when memory files don't surface a result, since commit history is also implicit memory.
23. **Session replay index** — build a lightweight index mapping `YYYY-MM-DD → session topics` so when the user asks "when did we discuss X?" the answer takes milliseconds, not minutes.
24. **Memory conflict resolution** — when two stores return contradictory facts, surface the conflict to the user rather than silently picking one.
25. **Emotion tagging in episodic memory** — add a `sentiment` field to daily log entries (derived from message tone) so relational memory can track emotional history, not just event history.
26. **Working memory scratchpad** — a session-scoped in-memory buffer for intermediate reasoning, separate from persistent stores, that is explicitly flushed or promoted to episodic at session end.
27. **Memory access permissions** — formalize read/write rules per context type (main session, group chat, cron job) so MEMORY.md is never accidentally loaded in a shared channel.
28. **Automatic MEMORY.md pruning** — when MEMORY.md exceeds 180 lines, a script identifies the lowest-relevance items (oldest + least-accessed) and archives them to `memory/archive/`.
29. **Consensus memory** — when multiple agents (c_lawd + Dali) hold views on the same fact, a reconciliation pass produces a canonical version both can reference.
30. **Memory health dashboard** — a simple `memory_status.py --report` output showing store sizes, last-write dates, top-queried keys, and open conflicts.

---

## II. Self-Assessment & Evolution (31–55)

31. **Weekly fitness run** — automate `workspace/evolution/fitness.py` as a cron job every Monday morning; write the report to `workspace/evolution/fitness-YYYY-MM-DD.md`.
32. **PROPOSALS.md triage** — add a weekly heartbeat step that reviews `workspace/evolution/PROPOSALS.md`, assigns priority (P0/P1/P2), and moves stale proposals to an archive section.
33. **Evolution log enrichment** — every EVOLUTION_LOG entry should include: what changed, why, what outcome was expected, and a link to the relevant commit or PR.
34. **Automated delta detection** — after each git merge to main, diff `SOUL.md`, `IDENTITY.md`, and `CLAUDE.md` against their prior versions and log any doctrine changes to EVOLUTION_LOG.
35. **Self-disagreement journaling** — when c_lawd takes an action it is uncertain about, log the uncertainty and the reasoning in a `workspace/evolution/uncertainty_log.md` for later review.
36. **Error pattern mining** — monthly, scan `memory/` for lines containing "failed", "error", "wrong", "mistake" and categorize recurring failure modes into a `failure_taxonomy.md`.
37. **Capability inventory** — maintain a living `workspace/evolution/CAPABILITIES.md` listing every skill, tool, and channel integration with status (active / degraded / deprecated).
38. **Blind spot identification** — ask the user once a month: "What did I miss or get wrong recently?" and log the answer directly into `workspace/evolution/PROPOSALS.md`.
39. **Improvement velocity metric** — count merged PRs that touch `workspace/` per month and track whether the self-improvement rate is accelerating or stagnating.
40. **Regression detection** — after any change to core systems (memory, heartbeat, dispatch), run a smoke test suite and block merge if any test regresses.
41. **Goal drift check** — compare the current `IDENTITY.md` and `SOUL.md` against their initial committed versions every quarter and flag if drift has exceeded intentional evolution.
42. **Fitness score trending** — store fitness.py output as structured JSON so trends can be plotted and year-over-year improvement is measurable.
43. **Audit evidence completeness** — for each audit in `workspace/audit/_evidence/`, verify that a `rollback-notes.md` exists and is non-empty before the branch is considered safe to merge.
44. **Proposal-to-implementation tracking** — link each proposal in PROPOSALS.md to a git commit or PR once implemented, preventing the same idea from being rediscovered and re-proposed.
45. **A/B testing for behaviors** — when two approaches are plausible, implement both behind a flag, run each for 2 weeks, measure outcomes, and canonize the winner.
46. **User satisfaction signal capture** — after completing a significant task, log whether the user accepted, revised, or rejected the output as a lightweight satisfaction signal.
47. **Self-documentation discipline** — any function or script written by c_lawd with no human-authored tests gets an automatic TODO ticket in `workspace/evolution/PROPOSALS.md`.
48. **Retroactive doc updates** — after every 10 commits, scan for doc files that haven't been updated and flag them as potentially stale.
49. **Technical debt register** — maintain `workspace/evolution/DEBT.md` with known shortcuts taken, the reason, and a target resolution date.
50. **Skill gap analysis** — quarterly, list tasks the user asked for that required more than 2 clarifying questions, and treat each as a skill gap to address.
51. **Confidence calibration** — track predictions c_lawd makes about outcomes, then compare to actual results to measure and improve calibration over time.
52. **Peer review requests** — when implementing high-stakes changes, explicitly request the user review the plan before execution, rather than proceeding silently.
53. **Anomaly escalation** — define thresholds for anomalous behavior (e.g., session length 5x normal, memory write failure rate > 5%) and escalate to the user immediately.
54. **Living post-mortems** — maintain `workspace/evolution/POST_MORTEMS.md` for significant failures; each entry should reach a root cause and a concrete prevention.
55. **Evolution retrospectives** — quarterly, produce a 1-page summary of what the system intended to improve, what it actually improved, and what's still pending.

---

## III. Communication & Channel Intelligence (56–85)

56. **Platform-aware formatting** — codify the Discord/WhatsApp/iMessage formatting rules as a lookup table in a shared `channel_formats.json` rather than relying on CLAUDE.md prose.
57. **Response length calibration** — track message length distributions per channel and per user; adapt default verbosity to observed preferences automatically.
58. **Group chat signal detection** — improve the heuristic for when to speak vs stay silent by weighting: direct mention > open question > unique info to contribute > entertainment value.
59. **Reaction recall** — log which emoji reactions landed well (i.e., were themselves reacted to or prompted conversation) and weight future reaction selection accordingly.
60. **Thread context loading** — before responding in a thread, load the full thread history (not just the triggering message) to avoid repetition and non-sequiturs.
61. **Duplicate suppression** — before sending any message, check if a substantively identical message was sent in the same channel in the last 5 minutes.
62. **Typo and grammar check** — pipe all outbound messages through a lightweight grammar checker before delivery.
63. **Link preview suppression** — apply the `<url>` wrap rule consistently to all multi-link Discord messages, not just ones explicitly flagged.
64. **Tone matching** — detect the formality register of the current conversation and match it; don't respond formally to casual banter.
65. **Channel-specific memory** — maintain lightweight channel-level context files (`memory/channels/discord-general.md`) to track ongoing threads, recurring participants, and shared jokes.
66. **Message queue with backpressure** — if the event notifier is processing faster than channels can absorb, queue excess messages and drain gracefully rather than dropping them.
67. **Heartbeat silence window enforcement** — hardcode the 23:00–08:00 quiet window in the heartbeat logic with a user-configurable timezone, so the rule is policy not convention.
68. **Broadcast group targeting** — when composing a broadcast, require explicit confirmation of the recipient list before sending to prevent accidental mass delivery.
69. **Message delivery receipt tracking** — for channels that support it, track whether messages were delivered and read; retry on failure with exponential backoff.
70. **Outbound audit log** — write every message sent to any external surface into an append-only log with timestamp, channel, and content hash for accountability.
71. **Stale draft detection** — if a drafted message sits unsent for > 30 minutes, flag it as potentially stale before delivering.
72. **Context carry-over between channels** — if a conversation starts in iMessage and continues in Discord, surface the iMessage thread summary at the top of the Discord reply.
73. **Multi-language support** — detect the user's language in a given channel and respond in kind without requiring explicit instruction.
74. **Mention extraction** — automatically parse @mentions in incoming messages to detect when c_lawd is addressed even if the mention syntax differs by platform.
75. **Read receipt simulation** — on platforms without native read receipts, use a lightweight acknowledgement reaction (👀) to signal the message was received and being processed.
76. **Conversation handoff protocol** — when a long conversation is about to hit context limits, proactively summarize and write a `CONVERSATION_KERNEL.md` before truncation occurs.
77. **Sensitive content detection** — flag messages that contain PII or credentials before routing them to any external channel.
78. **Cross-platform thread linking** — when the same topic is active in multiple channels, maintain a thread registry so c_lawd doesn't give contradictory answers.
79. **Scheduled message drafting** — allow the user to say "send this to Discord at 9am tomorrow" and store the draft with a cron trigger rather than relying on manual follow-up.
80. **Message recall mechanism** — for channels that support it (Discord, Slack), enable c_lawd to delete its own messages when the user says "nevermind" within a short window.
81. **Digest mode** — aggregate low-priority notifications into a daily digest rather than sending individual messages for each, reducing noise.
82. **Notification deduplication** — if the same event fires on multiple channels, send the notification once and cross-post a link rather than full duplicate messages.
83. **Emotional tone detection on inbound** — parse incoming messages for urgency or distress and escalate response priority accordingly.
84. **Conversation summaries on demand** — respond to "what have we been talking about today?" with a concise bullet summary without requiring the user to read raw logs.
85. **Fallback channel logic** — if the primary channel (e.g., iMessage) fails delivery, automatically retry via a configured fallback (e.g., email) after a timeout.

---

## IV. Automation & Scheduling (86–105)

86. **Cron job health checks** — every hour, verify that all registered cron jobs are still alive and have not silently stopped executing; alert if a job misses 2 consecutive windows.
87. **Heartbeat state persistence** — write `heartbeat-state.json` atomically (write to `.tmp`, then rename) to prevent corruption from interrupted writes.
88. **Adaptive heartbeat frequency** — during high-activity periods (many messages, urgent tasks open), increase heartbeat frequency; during quiet periods, reduce it.
89. **Cron job dependency graph** — document which cron jobs depend on outputs of other jobs, and enforce execution order rather than assuming timing alignment.
90. **Scheduled task versioning** — each scheduled task spec should carry a `version` field; old versions are archived, not overwritten, enabling rollback.
91. **Task timeout enforcement** — every cron job must declare a `timeout_ms`; the scheduler kills and alerts on jobs that exceed it.
92. **Retry policy standardization** — define a system-wide retry policy (max attempts, backoff strategy) used by all tasks rather than per-task ad-hoc logic.
93. **Scheduled task dry-run mode** — before deploying any new cron job, run it in dry-run mode and log the would-be output for human review.
94. **Task output routing** — ensure every cron task explicitly declares where its output goes (file, channel, log) so output is never silently discarded.
95. **Heartbeat HEARTBEAT.md auto-cleanup** — items checked off in HEARTBEAT.md should auto-archive to today's daily log and be removed from the file, keeping it short.
96. **Cron job cost estimation** — before scheduling a high-frequency job, estimate its token cost per day and flag if it exceeds a configurable budget threshold.
97. **Idempotency enforcement** — all scheduled tasks must be idempotent; document the idempotency mechanism explicitly for each job.
98. **Task execution audit trail** — append a structured JSON record to `workspace/audit/task_log.jsonl` for every scheduled task execution (task name, start, end, outcome).
99. **Dead letter queue** — failed tasks that exhaust retries go to a dead letter queue that the user can inspect and requeue manually.
100.  **Calendar integration for scheduling** — before creating a cron job, check the calendar to avoid scheduling tasks during known busy periods or travel.
101.  **Dynamic schedule adjustment** — if the user is in a different timezone (travel), automatically shift scheduled tasks to match local time.
102.  **Cron cleanup sweep** — monthly, list all registered cron jobs and prompt the user to confirm which are still needed; prune stale ones.
103.  **Task dependency resolution** — if Task B requires the output of Task A, automatically chain them rather than relying on wall-clock timing to work.
104.  **Parallel task execution** — identify cron jobs with no inter-dependencies and run them in parallel to reduce total wall-clock time per heartbeat cycle.
105.  **Emergency stop mechanism** — a single `clawd cron stop-all` command that halts all running scheduled tasks immediately for incident response.

---

## V. Security & Safety (106–125)

106. **Path traversal hardening** — audit every file operation in Python workspace code to ensure paths are resolved through a `safe_path()` function before use.
107. **Secret scanning on write** — before writing any file, scan the content for patterns matching API keys, tokens, or credentials and block the write with an alert.
108. **Outbound data minimization** — implement a content filter on the outbound audit log that strips PII before writing, preserving accountability without privacy leakage.
109. **Workspace boundary enforcement** — `FS_ALLOW_OUTSIDE_WORKSPACE=false` should be the enforced default with integration tests that verify files outside workspace root are rejected.
110. **Session TTL enforcement** — ensure `SESSION_TTL_MS` is actually enforced at the runtime level, not just documented; add a test that a session is killed after TTL expires.
111. **Input size limits** — every tool that accepts user-supplied content should enforce a maximum payload size to prevent memory exhaustion.
112. **Audit log tamper detection** — add a running HMAC over the audit log so any post-hoc modification of log entries is detectable.
113. **Credential rotation alerts** — track the age of API keys stored in the environment and alert when they are approaching typical rotation windows.
114. **Principle of least privilege** — review every tool's scope and revoke capabilities not needed for its declared purpose (e.g., a read-only tool should not have write access).
115. **Dependency vulnerability scanning** — run `pip audit` (or equivalent) in CI on every PR that touches `requirements*.txt` files.
116. **Symlink escape prevention** — verify that path resolution rejects symlinks that resolve to locations outside the workspace root.
117. **Rate limiting on external calls** — enforce per-destination rate limits on all outbound API calls to prevent accidental or triggered abuse.
118. **Rollback notes completeness check** — CI should fail if a branch adds files to `workspace/audit/_evidence/` without a non-empty `rollback-notes.md`.
119. **Dry-run gate for destructive ops** — any operation that deletes or overwrites files must be prefaced by a dry-run listing what will be affected.
120. **Channel send authorization** — require explicit user confirmation before sending to any external channel that has not been pre-authorized in a channel allowlist.
121. **Environment variable validation at startup** — on startup, validate that all required environment variables are present and within expected ranges; fail fast if not.
122. **Token budget enforcement** — set a hard limit on tokens consumed per heartbeat cycle and alert before the limit is reached so expensive operations can be deferred.
123. **Log redaction pipeline** — before any log is written to disk or transmitted, run it through a redaction pipeline that masks emails, phone numbers, and secret patterns.
124. **Approval workflow for high-risk actions** — classify actions by risk level; anything rated "high" must wait for explicit user approval even in autonomous mode.
125. **Security incident playbook** — maintain `docs/security/INCIDENT_PLAYBOOK.md` with step-by-step response procedures for common failure modes (leaked key, unintended message sent, etc.).

---

## VI. Inter-Agent Communication (Interbeing / Dali) (126–145)

126. **Task envelope versioning** — enforce schema version checks on both sender and receiver sides of every task envelope; reject mismatched versions with a clear error.
127. **Delivery receipt for Dali messages** — Dali should acknowledge every received task envelope with a correlation ID; c_lawd should alert if no ack arrives within a timeout.
128. **Idempotency keys on dispatch** — every task sent to Dali must include an idempotency key so duplicate deliveries (from retry logic) are safely de-duplicated on the receiving end.
129. **Fanout child spec validation** — before fanning out to child agents, validate each child spec against its schema and halt the fanout if any spec is invalid.
130. **Role lineage enforcement** — every dispatched task must carry a complete role lineage (who originated, who is relaying, who is executing) for auditability.
131. **Dead agent detection** — implement a liveness check for Dali; if it fails to respond to a heartbeat probe within `MCP_SERVER_START_TIMEOUT_MS`, switch to local emitter fallback.
132. **Message ordering guarantees** — document and enforce whether the Dali channel is FIFO or best-effort, and design consumers to handle out-of-order delivery if it is not FIFO.
133. **Backpressure signaling** — Dali should be able to signal c_lawd to slow down dispatch when its queue is filling up, rather than silently dropping or delaying tasks.
134. **Task result collection** — c_lawd should have a mechanism to collect and log results returned by Dali after task execution, not just fire-and-forget.
135. **Cross-agent memory sharing protocol** — define a formal protocol for how c_lawd and Dali share or negotiate over conflicting memory states.
136. **Dispatch contract test suite** — maintain a suite of contract tests that both c_lawd and Dali run to verify they remain compatible after independent updates.
137. **Task priority levels** — add a `priority` field to task envelopes (low / normal / high / urgent) so Dali can reorder its queue under load.
138. **Poison message handling** — if a task envelope fails validation repeatedly, route it to a dead letter queue with a full error trace rather than blocking the queue.
139. **Agent capability negotiation** — at session start, c_lawd and Dali exchange capability manifests so neither dispatches tasks the other cannot handle.
140. **Correlation ID propagation** — ensure correlation IDs flow end-to-end from the user message through every inter-agent hop so distributed traces can be reconstructed.
141. **Partial failure recovery** — if a fanout has 5 children and 1 fails, the other 4 results should still be collected and delivered; partial success should be reported clearly.
142. **Inter-agent trust boundaries** — define what data c_lawd is permitted to share with Dali and enforce it at the serialization layer, not just by convention.
143. **Task timeout propagation** — when c_lawd sets a deadline on a task, propagate that deadline to Dali so it can time-box its own work accordingly.
144. **Graceful degradation** — if Dali is unavailable, c_lawd should attempt the task locally where possible and clearly communicate the degraded state to the user.
145. **Inter-agent changelog** — when the dispatch contract changes, publish a structured `INTERBEING_CHANGELOG.md` entry so both sides know what changed and why.

---

## VII. Observability & Diagnostics (146–163)

146. **Structured logging** — replace ad-hoc log writes with structured JSON log entries (timestamp, level, component, event, metadata) so logs can be queried programmatically.
147. **Log level configuration** — support `LOG_LEVEL` env var (DEBUG / INFO / WARN / ERROR) so verbosity can be tuned without code changes.
148. **Health endpoint** — expose a `clawd health` CLI command that returns a structured JSON report: memory freshness, cron job status, channel connectivity, last heartbeat timestamp.
149. **Error rate tracking** — count errors per component per hour and write to `workspace/audit/error_rates.json`; alert if any component exceeds a threshold.
150. **Latency tracking** — measure and log the time from message receipt to response delivery for each channel; surface p50/p95 latency in the weekly fitness report.
151. **Memory access hotspots** — track which memory keys are queried most frequently; use this to prioritize what gets cached in the warm tier.
152. **Tool invocation histogram** — log every tool call with its duration; identify slow tools (p95 > 5s) and investigate optimization or caching.
153. **Anomaly dashboard** — maintain a lightweight `workspace/audit/anomalies.md` file updated by automated checks flagging unusual patterns in logs.
154. **End-to-end trace IDs** — assign a trace ID to each user request and propagate it through all tool calls, memory reads, and external dispatches so full request traces can be reconstructed.
155. **Disk usage monitoring** — warn when `workspace/` exceeds a configurable size threshold to prevent runaway log growth.
156. **Git churn monitoring** — `fitness.py` should report which files have the highest commit frequency; high churn on core files may indicate instability.
157. **Dependency graph visualization** — generate a static dependency graph of workspace Python modules and include it in the fitness report.
158. **CI failure alerting** — if a CI run fails on main, send an alert via the configured primary channel immediately rather than waiting for manual discovery.
159. **Deployment diff summary** — after every merge to main, generate and log a human-readable summary of what changed (files, docs, scripts) to the daily memory.
160. **Context window usage tracking** — log estimated token consumption per session and alert when approaching the compression threshold so memory can be preemptively written.
161. **Uptime tracking** — record session start/end timestamps in `workspace/audit/uptime.jsonl` to compute availability metrics over time.
162. **Alert deduplication** — if the same alert fires multiple times within 10 minutes, send it once and suppress duplicates to avoid notification fatigue.
163. **Diagnostic mode** — a `clawd diagnose` command that runs all health checks, linting, and schema validations and produces a single human-readable report.

---

## VIII. Code & Architecture Quality (164–183)

164. **Schema-first contracts** — every inter-component data exchange (handoff envelopes, task specs, memory entries) should have a machine-readable JSON Schema before implementation.
165. **Adapter pattern enforcement** — memory stores should only be accessed through adapter interfaces, never directly, to keep swap-out cost low.
166. **Dead code detection** — run a static analysis pass monthly to identify and remove Python functions that are no longer called.
167. **Type annotation coverage** — annotate all Python workspace functions with type hints; track annotation coverage as a metric in fitness.py.
168. **Test coverage for workspace scripts** — add pytest coverage for `workspace/memory/*.py`; gate PRs on maintaining ≥80% line coverage.
169. **Import hygiene** — standardize relative vs absolute imports across workspace Python; enforce with a linter rule.
170. **Configuration centralization** — move all hardcoded constants (timeouts, thresholds, paths) to a single `workspace/config.py` or env-driven config layer.
171. **Idiomatic error handling** — replace bare `except:` clauses with specific exception types and structured logging; never silently swallow exceptions.
172. **Circular dependency detection** — add a CI check that fails if any circular imports exist in the workspace Python modules.
173. **File size limits** — enforce a maximum line count per Python file (e.g., 300 lines) and flag files that exceed it for refactoring consideration.
174. **Consistent naming conventions** — audit workspace Python files for naming inconsistencies (snake_case vs camelCase) and standardize with an autoformatter.
175. **Dependency pinning** — pin all Python dependencies to exact versions in `requirements.txt` and use a lockfile to ensure reproducible installs.
176. **Makefile or taskfile** — add a `Makefile` with standard targets (`make test`, `make lint`, `make audit`, `make fitness`) so contributors don't need to remember command syntax.
177. **Module docstrings** — every `workspace/*.py` file should have a module-level docstring explaining its purpose, inputs, and outputs.
178. **Interface segregation** — split large adapter classes into focused interfaces; no adapter should have more than 5 public methods.
179. **Branch protection rules** — enforce that merges to `main` require at least one approval and passing CI, not just a clean audit evidence folder.
180. **Changelog automation** — auto-generate changelog fragment files from commit messages using a conventional commits parser; do not maintain the changelog manually.
181. **Workspace isolation** — each workspace script should be runnable in isolation with a `--dry-run` flag, not requiring the full runtime to be running.
182. **Function purity preference** — prefer pure functions (no side effects) in workspace utilities; isolate side effects to clearly named I/O functions.
183. **Code review checklist** — add a `.github/pull_request_template.md` section for workspace changes that requires reviewers to verify schema compatibility and rollback notes.

---

## IX. User Experience & Collaboration (184–200)

184. **Onboarding documentation** — maintain an up-to-date `QUICKSTART.md` that walks a new user through setup, first heartbeat, and first task dispatch in under 5 minutes.
185. **Feedback capture ritual** — end every significant work session with a one-question prompt: "What could I have done better?" Log the answer to `workspace/evolution/PROPOSALS.md`.
186. **Preference learning** — track user preferences (verbosity, proactivity level, preferred channels) and update `USER.md` automatically when confirmed preferences emerge from behavior.
187. **Task status broadcasting** — for long-running tasks, send a progress update every N minutes rather than going silent until completion.
188. **Explanation on demand** — when the user asks "why did you do that?", always have a structured rationale available from the session log rather than reconstructing from memory.
189. **Uncertainty signaling** — when c_lawd is less than 80% confident in a response, explicitly signal the uncertainty and offer to research further rather than presenting the answer as definitive.
190. **Ask fewer, better questions** — batch clarifying questions into a single message rather than a series of back-and-forth exchanges.
191. **Decision summaries** — after making a significant autonomous decision, write a one-line summary to today's daily log under a "Decisions" header so the user can review later.
192. **Proactive opportunity spotting** — during heartbeats, scan recent git activity and open issues for quick wins (small PRs, doc fixes) and surface them with a time estimate.
193. **User context refresh** — if `USER.md` hasn't been updated in 30 days, prompt the user to review and update it during a low-activity heartbeat.
194. **Honest capability limits** — maintain a short "things I cannot do reliably yet" list in IDENTITY.md and reference it when asked to do something in that category.
195. **Session handoff notes** — at the end of every session, write a brief "handoff note" to today's daily log covering: what was accomplished, what's in flight, what needs follow-up.
196. **Progressive disclosure** — for complex topics, lead with a short answer and offer to elaborate, rather than front-loading a wall of text.
197. **Avoid assumption spirals** — if a task requires more than 2 assumptions to proceed, stop and surface them rather than proceeding on a potentially wrong interpretation.
198. **Celebrate wins** — when a significant milestone is reached (e.g., interbeing pipeline smoke passes, memory system upgraded), note it in EVOLUTION_LOG and share it with the user.
199. **Cross-session continuity test** — periodically ask the user a question whose answer was established in a prior session to verify memory continuity is working as intended.
200. **The meta-improvement loop** — review this document itself every 90 days, check off completed items, reprioritize the remainder, and add new items discovered since the last review.

---

_Total: 200 concrete improvement opportunities. Organized as a living document — check items off as they are implemented, add new ones as they are discovered. The goal is not perfection but sustained, measurable improvement._
