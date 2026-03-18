# Submit Task Schema Alignment Smoke

Date: 2026-03-18
Branch: `codex/feat/clawd-submit-task-schema-alignment`

## Scope

`main` did not already contain the local `submit_task` emitter. This pass adds that emitter to the `main` baseline using the earlier C_Lawd-side implementation as the content baseline, then applies only the minimal schema-alignment improvements needed for conditional canonical validation and local handoff-path writing.

## Schema Availability

- No local `openclaw-interbeing` schema checkout was found at the expected sibling/home paths during this pass.
- Validation therefore ran in fallback practical mode for the smoke on this machine.
- The adapter now supports canonical schema validation conditionally through:
  - explicit `schema_path`
  - `OPENCLAW_INTERBEING_TASK_ENVELOPE_SCHEMA`
  - `OPENCLAW_INTERBEING_ROOT`
  - default sibling/home path detection

## Commands Run

- `python3 -m unittest interbeing_contract.test_submit_task_v0`
- `python3` smoke that built a `submit_task` envelope and wrote it to a handoff path
- `git diff --check`

## Outcomes

- Unittest suite passed: `Ran 4 tests ... OK`
- Smoke wrote a handoff-ready local artifact:
  - `workspace/audit/_evidence/clawd-submit-task-schema-alignment/handoff/task-envelope.v0.json`
- Smoke validation mode:
  - `fallback-practical-validation`
- Emitted top-level keys:
  - `schema_version`
  - `operation`
  - `task_id`
  - `requestor`
  - `target_node`
  - `correlation_id`
  - `created_at`
  - `payload`
- `git diff --check` completed cleanly.
