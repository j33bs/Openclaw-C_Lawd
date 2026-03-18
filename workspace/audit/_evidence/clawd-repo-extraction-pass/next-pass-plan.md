# Next Pass Plan

## Directories and files that should remain in C_Lawd

- `README.md`
- `UPSTREAM.md`
- `ROLE.md`
- `ARCHITECTURE.md`
- `interbeing_contract/`
- `workspace/audit/`
- Canonical C_Lawd-owned roots once imported from the reference tree:
  `nodes/c_lawd/`, `IDENTITY.md`, `USER.md`, `SOUL.md`, `MEMORY.md`, `memory/`
- `workspace/memory/` provisionally, but only after a module-by-module review separates C_Lawd-local policy/state from shared engine code

## Directories and files that should be removed later from C_Lawd

- `apps/`
- `assets/`
- `changelog/`
- `docs/`
- `experiments/`
- `extensions/`
- `git-hooks/`
- `packages/`
- `patches/`
- `scripts/`
- `skills/`
- `src/`
- `Swabble/`
- `test/`
- `test-fixtures/`
- `ui/`
- `vendor/`
- Root platform build/package files once direct upstream-tracking strategy is replaced by a narrower extraction strategy:
  `.detect-secrets.cfg`, `.dockerignore`, `.env.example`, `.gitattributes`, `.gitignore`, `.jscpd.json`, `.mailmap`, `.markdownlint-cli2.jsonc`, `.npmignore`, `.npmrc`, `.oxfmtrc.jsonc`, `.oxlintrc.json`, `.pre-commit-config.yaml`, `.prettierignore`, `.secrets.baseline`, `.shellcheckrc`, `.swiftformat`, `.swiftlint.yml`, `Dockerfile*`, `docker-compose.yml`, `fly*.toml`, `knip.config.ts`, `openclaw.mjs`, `openclaw.podman.env`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `pyproject.toml`, `render.yaml`, `setup-podman.sh`, `tsconfig*.json`, `tsdown.config.ts`, `vitest*.ts`, `zizmor.yml`

## Unresolved/shared areas needing a separate decision

- `.github/`
- `.agent/`
- `.agents/`
- `.pi/`
- `.vscode/`
- `AGENTS.md`
- `CLAUDE.md`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `LICENSE`
- `SECURITY.md`
- `VISION.md`
- `docs.acp.md`
- `appcast.xml`
- `workspace/memory/` module split between C_Lawd-local behavior and shared engine code

## Blockers that must be fixed before hard extraction

- `plugins/openclaw_surface_router_plugin/index.js`
- `workspace/policy/system_map.json`
- `workspace/runtime_hardening/src/telegram_route_provenance.mjs`
- `tests/node_identity.test.js`
- `tests/unified_memory_query.test.js`
- `tests/system2_http_edge.test.js`

## Recommended order of operations

1. Replace shared/source hard-coded `nodes/c_lawd` and `nodes/dali` path reads with explicit config or contract inputs.
2. Remove monorepo-relative and machine-local layout assumptions from the affected tests.
3. Import the canonical C_Lawd-owned roots from the reference repo into this downstream repo without changing their semantics.
4. Re-audit `workspace/memory/` to split C_Lawd-local policy/state from any shared engine pieces before deciding its final home.
5. Re-run classification and runtime quarantine checks after the canonical roots exist in this repo.
6. Only then decide which retained foreign/shared platform directories can be removed without losing the direct upstream compatibility path that is currently preserving reversibility.

## Deferred on purpose in this pass

- No canonical roots were imported yet.
- No foreign platform directories were deleted.
- No runtime behavior or imports were changed.
- No remotes, auth settings, or upstream pins were altered.
