from __future__ import annotations

from pathlib import Path

WORKSPACE_DIR = Path("workspace")
WORKSPACE_MEMORY_DIR = WORKSPACE_DIR / "memory"
STATE_RUNTIME_MEMORY_DIR = Path("workspace") / "state_runtime" / "memory"
MEMORY_ARCHIVE_DIR = Path("memory")


def resolve_repo_relative(target: Path | str, *, repo_root: Path | str | None = None) -> Path:
    path = Path(target)
    if path.is_absolute() or repo_root is None:
        return path
    return Path(repo_root) / path


def resolve_workspace_memory_path(*parts: str, repo_root: Path | str | None = None) -> Path:
    return resolve_repo_relative(WORKSPACE_MEMORY_DIR.joinpath(*parts), repo_root=repo_root)


def resolve_workspace_path(*parts: str, repo_root: Path | str | None = None) -> Path:
    return resolve_repo_relative(WORKSPACE_DIR.joinpath(*parts), repo_root=repo_root)


def resolve_state_runtime_memory_path(*parts: str, repo_root: Path | str | None = None) -> Path:
    return resolve_repo_relative(STATE_RUNTIME_MEMORY_DIR.joinpath(*parts), repo_root=repo_root)


def resolve_memory_archive_path(*parts: str, repo_root: Path | str | None = None) -> Path:
    return resolve_repo_relative(MEMORY_ARCHIVE_DIR.joinpath(*parts), repo_root=repo_root)


def resolve_identity_doc_path(name: str, *, repo_root: Path | str | None = None) -> Path:
    doc_name = str(name)
    candidates = (Path(doc_name), WORKSPACE_DIR / doc_name)
    for candidate in candidates:
        resolved = resolve_repo_relative(candidate, repo_root=repo_root)
        if resolved.exists():
            return resolved
    return resolve_repo_relative(Path(doc_name), repo_root=repo_root)
