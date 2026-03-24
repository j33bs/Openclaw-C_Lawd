# OpenClaw Docs Inventory

Last synced: 2026-03-24 11:03 Australia/Brisbane (2026-03-24 01:03 UTC)
Source index: https://docs.openclaw.ai/llms.txt

## Sync status

- Previous inventory file: not found
- Action taken: initialized new inventory from current docs index
- Comparison result: baseline created; all entries below are first-recorded in this workspace inventory

## Focus changes captured this sync

### ACP updates

#### ACP Agents

- URL: https://docs.openclaw.ai/tools/acp-agents.md
- Status: present in current docs index; added to inventory baseline
- Key points:
  - OpenClaw routes requests like “run this in Codex/Claude Code/Gemini CLI” to `runtime: "acp"`, not native sub-agents.
  - New/explicit thread-bound ACP session model for supported adapters.
  - Current built-in thread support called out for Discord threads/channels and Telegram topics.
  - `sessions_spawn` ACP interface documents:
    - `runtime: "acp"`
    - `agentId`
    - `thread`
    - `mode: "run" | "session"`
    - `resumeSessionId`
    - `streamTo: "parent"`
  - `mode: "session"` requires `thread: true`.
  - Resume semantics are explicit: prior ACP conversation history is replayed via `session/load`.
  - Operator smoke-test flow documented for validating live ACP spawn after deploys.

#### ACP CLI reference

- URL: https://docs.openclaw.ai/cli/acp.md
- Status: present in current docs index
- Note: discovered in index during this sync; content not fetched because focus doc above already captured the ACP behavior changes.

### New tools / capabilities

#### Agent Send

- URL: https://docs.openclaw.ai/tools/agent-send.md
- Status: present in current docs index; added to inventory baseline
- Key points:
  - `openclaw agent` runs a single agent turn from CLI without inbound chat.
  - Can target:
    - a configured agent via `--agent`
    - a destination via `--to`
    - an existing session via `--session-id`
  - Can deliver output directly to channels with `--deliver`, `--reply-channel`, `--reply-to`, `--reply-account`.
  - Gateway-first behavior with local fallback is documented.
  - Thinking/verbose flags persist into session state.

#### Tools and Plugins index

- URL: https://docs.openclaw.ai/tools/index.md
- Status: present in current docs index; added to inventory baseline
- Key points:
  - Built-in tools table includes `exec/process`, `browser`, `web_search/web_fetch`, `read/write/edit`, `apply_patch`, `message`, `canvas`, `nodes`, `cron/gateway`, `image/image_generate`, and `sessions_*` / `agents_list`.
  - Plugin-provided examples called out explicitly:
    - Lobster
    - LLM Task
    - Diffs
    - OpenProse
  - Tool profiles documented: `full`, `coding`, `messaging`, `minimal`.
  - Tool groups documented: `group:runtime`, `group:fs`, `group:sessions`, `group:memory`, `group:web`, `group:ui`, `group:automation`, `group:messaging`, `group:nodes`, `group:openclaw`.
  - Provider-specific tool restrictions via `tools.byProvider` are documented.

#### Multi-Agent Sandbox & Tools

- URL: https://docs.openclaw.ai/tools/multi-agent-sandbox-tools.md
- Status: present in current docs index; added to inventory baseline
- Key points:
  - Per-agent sandbox overrides are explicitly documented.
  - Tool filtering precedence is fully spelled out from profile → provider profile → global policy → provider policy → agent policy → sandbox policy → subagent policy.
  - Auth isolation per agent is explicit (`agentDir` auth stores are separate).
  - Calls out per-agent elevated exec restrictions and `group:*` shorthand behavior.
  - Documents migration path from legacy single-agent config to `agents.defaults` + `agents.list`.

### Lobster

#### Lobster

- URL: https://docs.openclaw.ai/tools/lobster.md
- Status: present in current docs index; added to inventory baseline
- Key points:
  - Lobster is described as a deterministic workflow shell with explicit approval checkpoints and resumable state.
  - One-call orchestration pattern replaces many tool round-trips.
  - Approval flow returns a compact `resumeToken`; workflows can be resumed with explicit approve/deny.
  - Supports inline pipelines and `.lobster` workflow files.
  - `llm-task` integration is documented for JSON-only structured LLM steps inside deterministic pipelines.
  - Tool is optional and plugin-provided; recommended enablement is additive via `tools.alsoAllow: ["lobster"]`.
  - Safety model is documented: local subprocess only, no secrets management, sandbox-aware, timeout/output caps.

## Focus docs discovered in llms.txt

### Tools

- https://docs.openclaw.ai/tools/acp-agents.md
- https://docs.openclaw.ai/tools/agent-send.md
- https://docs.openclaw.ai/tools/lobster.md
- https://docs.openclaw.ai/tools/multi-agent-sandbox-tools.md
- https://docs.openclaw.ai/tools/llm-task.md
- https://docs.openclaw.ai/tools/diffs.md
- https://docs.openclaw.ai/tools/subagents.md
- https://docs.openclaw.ai/tools/browser.md
- https://docs.openclaw.ai/tools/exec.md
- https://docs.openclaw.ai/tools/web-fetch.md
- https://docs.openclaw.ai/tools/web.md
- https://docs.openclaw.ai/tools/tts.md

### CLI / ACP-related

- https://docs.openclaw.ai/cli/acp.md
- https://docs.openclaw.ai/cli/agent.md
- https://docs.openclaw.ai/cli/agents.md
- https://docs.openclaw.ai/cli/sessions.md

## Full index snapshot notes

The current `llms.txt` includes broad coverage across:

- automation
- channels
- CLI reference
- concepts
- gateway
- help
- install
- nodes
- platforms
- plugins
- providers
- reference
- start/onboarding
- tools
- web

## Next sync guidance

On the next cron run:

1. Compare `llms.txt` against this file.
2. Flag any newly added URLs, renamed titles, or removed pages.
3. Fetch newly added pages in these focus areas first:
   - ACP
   - tools
   - Lobster
   - multi-agent / sandbox / session capabilities
4. Append concise deltas under a new dated sync section instead of replacing prior findings.
