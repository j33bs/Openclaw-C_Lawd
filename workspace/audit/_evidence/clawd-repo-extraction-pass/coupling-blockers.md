# Coupling Blockers

## Scope

The blocker files below were verified in the source/shared reference tree. The current `openclaw-c_lawd` target repo does not contain these exact paths, which is why this pass documents them instead of refactoring runtime behavior here.

## Blockers

| Path | Lines | Hard-coded assumption | Why it blocks clean split | Low-risk replacement direction |
| --- | --- | --- | --- | --- |
| `plugins/openclaw_surface_router_plugin/index.js` | `18-20`, `174-176`, `195-201` | Resolves a repo root from plugin location, then reads `nodes/c_lawd/CONVERSATION_KERNEL.md`, root `USER.md`, and root `MEMORY.md` by monorepo path. | A shared/source plugin cannot remain portable if it directly reads downstream-owned C_Lawd files from a fixed monorepo layout. | Pass an explicit kernel packet or explicit file paths through config/env, and treat C_Lawd-owned prompt material as downstream-owned input instead of shared-plugin filesystem knowledge. |
| `workspace/policy/system_map.json` | `3`, `11-12`, `21-22` | Sets `dali` as the default node and hard-codes `workspace_root` and `memory_root` to `nodes/dali` and `nodes/c_lawd`. | Node identity and storage location are bound to one repo layout, so C_Lawd cannot be extracted without breaking shared callers and tests. | Move path resolution behind a logical node registry contract where downstream repos provide their own workspace and memory roots. |
| `workspace/runtime_hardening/src/telegram_route_provenance.mjs` | `53-60`, `81-86` | Resolves a workspace root, then assumes C_Lawd prompt files live at `nodes/c_lawd/CONVERSATION_KERNEL.md`, root `USER.md`, and root `MEMORY.md`. | Runtime hardening code still depends on monorepo-local C_Lawd prompt assets, which prevents a clean downstream extraction. | Feed provenance code a contract-supplied prompt packet or explicit path set rather than reconstructing C_Lawd state from a repo layout assumption. |
| `tests/node_identity.test.js` | `17-22`, `34-38` | Asserts `dali` is the default node and that `system2` resolves to `nodes/c_lawd` for both workspace and memory roots. | The test suite encodes the monorepo node map as a behavioral invariant, so extracting C_Lawd changes test truth rather than only wiring. | Rework tests around logical node identities and injected fixtures instead of repo-relative paths. |
| `tests/unified_memory_query.test.js` | `5` | Imports the shared query implementation from `../workspace/memory/unified_query`. | The test assumes `workspace/memory/` is a shared monorepo location, but that subtree is provisionally C_Lawd-owned and not yet present in this target repo. | Extract a shared package/module boundary for the query engine or move tests to the eventual owner after the split decision is made. |
| `tests/system2_http_edge.test.js` | `265`, `294` | Uses a developer-local absolute entrypoint path for `system2_http_edge.js`. | Machine-local absolute paths make the test layout-specific and non-portable even before the repo split is complete. | Build the path from repo-relative fixtures or assert only the normalized basename/shape exposed by the runtime. |

## Target-repo status

- Search in the current `openclaw-c_lawd` target repo for `nodes/c_lawd`, `nodes/dali`, and `CONVERSATION_KERNEL.md` found no equivalent runtime blocker paths; matches were limited to historical audit evidence and generic workspace bootstrap references.
- The blocking assumptions therefore remain upstream/shared concerns that must be addressed before a hard extraction of canonical C_Lawd-owned roots can be considered safe.
