# C_Lawd Extraction Classification

## Scope and inputs

- Target repo audited: current `openclaw-c_lawd` working tree.
- Authority used for ownership: the repo split manifest and summary supplied by the operator.
- Source/reference verification was performed against the separate `clawd` monorepo provided for comparison.

## Key result

- The manifest-listed canonical C_Lawd roots are verified in the source/reference repo but are not yet present in this target repo: `nodes/c_lawd/`, `IDENTITY.md`, `USER.md`, `SOUL.md`, `MEMORY.md`, `memory/`, and provisional `workspace/memory/`.
- The current target repo is therefore primarily retained upstream/shared OpenClaw platform substrate plus downstream governance and audit material.
- No direct `foreign_dali` subtree is currently present in this target repo.
- No `runtime_generated` residue from the quarantined path set was observed in this target repo during this pass.

## Top-level classification

| Path | Classification | Notes |
| --- | --- | --- |
| `README.md` | `keep_c_lawd` | Canonical local landing doc with downstream posture overlay. |
| `UPSTREAM.md` | `keep_c_lawd` | Canonical local provenance and update policy. |
| `ROLE.md` | `keep_c_lawd` | Canonical local role statement. |
| `ARCHITECTURE.md` | `keep_c_lawd` | Canonical local boundary document. |
| `interbeing_contract/` | `keep_c_lawd` | Canonical local placeholder for the explicit C_Lawd/Dali contract. |
| `workspace/` | `keep_c_lawd` | Present target subtree is only audit evidence; manifest-owned `workspace/memory/` is still absent. |
| `.github/` | `shared_unresolved` | Repo governance and CI remain inherited from upstream but may need downstream-specific decisions later. |
| `.agent/`, `.agents/`, `.pi/`, `.vscode/`, `AGENTS.md`, `CLAUDE.md` | `shared_unresolved` | Local operator/tooling instructions exist, but they are not manifest-listed canonical C_Lawd extraction roots. |
| `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`, `SECURITY.md`, `VISION.md`, `docs.acp.md`, `appcast.xml` | `shared_unresolved` | Repo-governance and release docs are inherited from upstream today, but their final home depends on how narrow the downstream extraction becomes. |
| Root build/package/config files (`.detect-secrets.cfg`, `.dockerignore`, `.env.example`, `.gitattributes`, `.gitignore`, `.jscpd.json`, `.mailmap`, `.markdownlint-cli2.jsonc`, `.npmignore`, `.npmrc`, `.oxfmtrc.jsonc`, `.oxlintrc.json`, `.pre-commit-config.yaml`, `.prettierignore`, `.secrets.baseline`, `.shellcheckrc`, `.swiftformat`, `.swiftlint.yml`, `Dockerfile*`, `docker-compose.yml`, `fly*.toml`, `knip.config.ts`, `openclaw.mjs`, `openclaw.podman.env`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `pyproject.toml`, `render.yaml`, `setup-podman.sh`, `tsconfig*.json`, `tsdown.config.ts`, `vitest*.ts`, `zizmor.yml`) | `foreign_source` | Upstream/shared platform build substrate; retained for compatibility, not canonical C_Lawd ownership. |
| `apps/` | `foreign_source` | Upstream platform application surfaces. |
| `assets/` | `foreign_source` | Upstream/shared packaging and UI assets. |
| `changelog/` | `foreign_source` | Upstream/shared release bookkeeping. |
| `docs/` | `foreign_source` | Upstream/shared documentation tree. |
| `experiments/` | `foreign_source` | Upstream/shared experiments and plans. |
| `extensions/` | `foreign_source` | Upstream/shared provider/plugin ecosystem. |
| `git-hooks/` | `foreign_source` | Upstream/shared developer tooling. |
| `packages/` | `foreign_source` | Upstream/shared packages. |
| `patches/` | `foreign_source` | Upstream/shared patch set. |
| `scripts/` | `foreign_source` | Upstream/shared runtime, release, and developer scripts. |
| `skills/` | `foreign_source` | Upstream/shared skill catalog. |
| `src/` | `foreign_source` | Upstream/shared runtime implementation. |
| `Swabble/` | `foreign_source` | Upstream/shared bundled project. |
| `test/` | `foreign_source` | Upstream/shared test suite. |
| `test-fixtures/` | `foreign_source` | Upstream/shared test data. |
| `ui/` | `foreign_source` | Upstream/shared control UI. |
| `vendor/` | `foreign_source` | Upstream/shared vendored code/assets. |
| Source/reference blockers documented in `coupling-blockers.md` | `coupling_blocker` | Not present in this target tree, but they still block a clean hard extraction of canonical C_Lawd roots. |
| Quarantined runtime-generated path set | `runtime_generated` | None observed in this target repo during this pass. |

## Major subtree classification

| Path | Classification | Notes |
| --- | --- | --- |
| `src/agents/` | `foreign_source` | Shared agent runtime, not the manifest-owned `nodes/c_lawd/` extraction root. |
| `src/channels/` | `foreign_source` | Shared channel integrations. |
| `src/cli/` | `foreign_source` | Shared CLI and operator tooling. |
| `src/config/` | `foreign_source` | Shared platform configuration schema and defaults. |
| `src/cron/` | `foreign_source` | Shared automation/timer subsystem; not part of canonical C_Lawd ownership. |
| `src/gateway/` | `foreign_source` | Shared control-plane runtime. |
| `src/memory/` | `foreign_source` | Shared memory engine; distinct from manifest-owned root `memory/` and provisional `workspace/memory/`. |
| `src/plugins/` | `foreign_source` | Shared plugin/runtime integration layer. |
| `extensions/memory-core/` | `foreign_source` | Shared optional memory capability. |
| `extensions/memory-lancedb/` | `foreign_source` | Shared heavier memory backend; isolate if retained later. |
| `workspace/audit/` | `keep_c_lawd` | Canonical local evidence trail for governed split work. |

## Manifest-owned C_Lawd roots verified in source but absent here

| Manifest path | Source/reference status | Target repo status | Notes |
| --- | --- | --- | --- |
| `nodes/c_lawd/` | present | absent | Includes `CONVERSATION_KERNEL.md`, `IDENTITY.md`, `MEMORY.md`, and local docs in the reference repo. |
| `IDENTITY.md` | present | absent | Root identity file verified in the reference repo. |
| `USER.md` | present | absent | Root user profile file verified in the reference repo. |
| `SOUL.md` | present | absent | Root soul/persona file verified in the reference repo. |
| `MEMORY.md` | present | absent | Root long-term memory file verified in the reference repo. |
| `memory/` | present | absent | Root memory corpus verified in the reference repo. |
| `workspace/memory/` | present | absent | Provisional C_Lawd ownership; still needs later engine/policy review before a hard keep/remove split. |

## Notes for the next pass

- The next extraction step should import canonical C_Lawd-owned roots only after the path-coupled blockers in shared/source code stop assuming a monorepo-local `nodes/c_lawd` and `nodes/dali` layout.
- Until then, most of the target repo should be treated as foreign/shared substrate retained for compatibility, not as evidence of canonical C_Lawd ownership.
