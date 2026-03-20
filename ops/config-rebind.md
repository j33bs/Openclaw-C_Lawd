# Config Rebind

Use this file when making this repo the active C_Lawd workspace. Rebuild config and env explicitly; do not copy old runtime state wholesale.

## Workspace Binding

- Point the active agent workspace at this repo via `agents.defaults.workspace` or the per-agent workspace override.
- Confirm the runtime is actually reading this repo before trusting any prompt or memory changes.
- Clear any legacy `env.vars.OPENCLAW_HOME` value that still points at the old repo.
- Rebind any per-agent `agents.list[].workspace` override that still points at the old repo.

## Memory Binding

- Default searchable memory remains `MEMORY.md` plus `memory/**/*.md`.
- If `nodes/c_lawd/MEMORY.md` should be searchable through `memory_search`, add it through `agents.defaults.memorySearch.extraPaths`.
- Keep `workspace/memory/` as a compatibility layer until its modules are intentionally moved.

## Dali Binding

- Set `OPENCLAW_INTERBEING_DALI_REMOTE_HOST`.
- Set `OPENCLAW_INTERBEING_DALI_REMOTE_USER`.
- Set `OPENCLAW_INTERBEING_DALI_REMOTE_PORT` when needed.
- Set `OPENCLAW_INTERBEING_DALI_INTAKE_PATH` to the exact watched intake path.
- Do not rely on SSH-alias or repo-root fallback behavior for cutover.

## Source UI Binding

- Keep the active Source UI / Dali endpoint out of tracked prompt docs.
- Store the current endpoint in operator-local config, env, or local notes.
- Only claim Source UI state with a verified backend receipt or id.

## Secrets and Plugins

- Re-enter secrets through env or user-level config only.
- Reinstall or re-enable only the plugins and channels you actually want in the new repo.
- Rebind `skills.load.extraDirs` if it still points at a legacy repo-local `skills/` tree.
- Rebuild `plugins.load.paths` and `plugins.installs.*.{sourcePath,installPath}` so no plugin is still sourced from the old repo.
- Clean stale `plugins.entries` and set `plugins.allow` explicitly when you want to block legacy auto-loaded plugins.
- Treat model defaults, cron jobs, and node config as explicit rebinding tasks, not passive carry-over.
