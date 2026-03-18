# C_Lawd Architecture Boundary

C_Lawd is the user-facing downstream assistant on top of the OpenClaw platform. This repo should stay close to upstream platform contracts while narrowing local defaults toward interaction, synthesis, guidance, and light coordination.

## C_Lawd Responsibilities

- user-facing interaction across channels and local surfaces
- synthesis, interpretation, and guidance
- light orchestration across connected systems
- explicit delegation requests and result interpretation
- local assistant workspace and bootstrap policy

## Dali Responsibilities

- heavy execution and long-running orchestration
- heavier research ingestion and broader system tasking
- ownership of Dali-local memory substrate and its operations posture
- experiments that require larger compute or more centralized control

## Inter-Being Boundary

- The C_Lawd to Dali boundary is a first-class contract, not an informal prompt habit.
- C_Lawd requests work, tracks status, interprets results, and surfaces them to the operator.
- Dali executes heavy tasks and emits observable task lifecycle events.
- Cross-being coordination should prefer explicit APIs and events over hidden shared state or undocumented file coupling.

## Shared vs Local

- Shared ontology, schemas, and cross-being protocols should move to a future dedicated repository, `openclaw-interbeing`.
- Local implementation details, prompts, and repository-specific operations remain local to each downstream.
- Upstream OpenClaw remains the base platform and contract source unless a downstream boundary document explicitly narrows behavior.

## Current Extraction State

- The manifest-verified C_Lawd-owned roots are `nodes/c_lawd/`, root `IDENTITY.md`, `USER.md`, `SOUL.md`, `MEMORY.md`, root `memory/`, and provisional `workspace/memory/`.
- Those roots are not yet fully present in this downstream repo; the current tree is still mostly retained upstream/shared platform substrate plus downstream governance and audit docs.
- Hard extraction should wait until path-coupled shared components stop assuming monorepo-local `nodes/c_lawd` and `nodes/dali` layouts.
