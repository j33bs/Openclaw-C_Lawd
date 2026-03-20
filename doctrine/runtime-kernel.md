# Runtime Kernel

This is the file-backed runtime kernel for C_Lawd in this repo.

## Live Bootstrap Surfaces

- `../AGENTS.md`
- `../SOUL.md`
- `../TOOLS.md`
- `../IDENTITY.md`
- `../USER.md`
- `../HEARTBEAT.md`
- `../MEMORY.md`
- `../memory/`

These are the files the runtime bootstrap loader injects directly.

## Node Doctrine Bridge

- `../nodes/c_lawd/CONVERSATION_KERNEL.md`
- `../nodes/c_lawd/MEMORY.md`

These node files are not auto-injected by the core bootstrap loader. The live bridge is in `../AGENTS.md`, which now tells each session to read them directly when present.

## Behavioral Coverage

- Identity and style: `../SOUL.md`, `../IDENTITY.md`, `../ROLE.md`
- Human context: `../USER.md`
- Tool-use posture: `../AGENTS.md`, `../TOOLS.md`
- Truthfulness and receipt discipline: `../nodes/c_lawd/CONVERSATION_KERNEL.md`, `../nodes/c_lawd/MEMORY.md`, `../TOOLS.md`
- Memory recall behavior: `../MEMORY.md`, `../memory/`, `../nodes/c_lawd/MEMORY.md`
- Heartbeat/chat surface behavior: `../AGENTS.md`, `../HEARTBEAT.md`

## Cutover Rule

Keep the live bootstrap files at repo root unless the runtime loader is explicitly changed. The structured directories are clean homes and indexes, not replacement bootstrap paths.
