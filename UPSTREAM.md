# Upstream Provenance

This repository is a downstream OpenClaw distribution for C_Lawd. It is not a standalone greenfield project.

## Canonical Repositories

- Local canonical downstream: `git@github.com:j33bs/Openclaw-C_Lawd.git`
- Upstream platform: `git@github.com:openclaw/openclaw.git`
- Sibling reference repo: `git@github.com:j33bs/openclaw-dali.git`

## Update Policy

- Base and platform updates come from `upstream/main`.
- Shared sibling adaptations may be selectively taken from `dali/main` when they are reusable and independently justified.
- This repo remains canonical for C_Lawd-specific behavior, role framing, and boundary documentation.

## Current Bootstrap Base

- Bootstrap was established on downstream commit `db692cf779fabe1295935b67e1d8f2855d2da92a`.
- At bootstrap time, downstream `HEAD` matched `dali/main`.
- After `git fetch --all --prune` on 2026-03-18, `upstream/main` had 8 commits not present in this downstream base, and this downstream base had 1 commit not present in `upstream/main`.
- That upstream advancement should remain pinned pending validation rather than being fast-forwarded blindly into the downstream.

## Provenance Discipline

- Preserve a direct tracking path to `openclaw/openclaw`.
- Prefer minimal, auditable downstream deltas.
- Keep Dali-derived changes explicit and reviewable instead of folding them into undocumented local divergence.
