#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

SEND_HELPER_PATH = REPO_ROOT / "scripts" / "dev" / "send_to_dali_v0.py"
DEFAULT_DALI_REPO_NAME = "openclaw-dali"
DEFAULT_INTERBEING_REPO_NAME = "openclaw-interbeing"
DEFAULT_INTAKE_ENV = "OPENCLAW_DALI_INTAKE_DIR"
EVIDENCE_DIR_RELATIVE = Path("workspace") / "audit" / "_evidence" / "interbeing-emitter-v0"
EVIDENCE_FILENAME = "last-run.json"


def load_send_helper_module():
    spec = importlib.util.spec_from_file_location("send_to_dali_v0", SEND_HELPER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load send helper from {SEND_HELPER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


SEND_TO_DALI = load_send_helper_module()


@dataclass(frozen=True)
class PathResolution:
    path: Path
    source: str


def default_dali_intake_dir(*, repo_root: Path) -> Path:
    return repo_root.parent / DEFAULT_DALI_REPO_NAME / "handoff" / "incoming" / "dali"


def default_interbeing_schema_path(*, repo_root: Path) -> Path | None:
    candidate = repo_root.parent / DEFAULT_INTERBEING_REPO_NAME / "schemas" / "task-envelope.v0.json"
    return candidate if candidate.exists() else None


def evidence_path(*, repo_root: Path) -> Path:
    return repo_root / EVIDENCE_DIR_RELATIVE / EVIDENCE_FILENAME


def _resolve_existing_dir(path_value: str | Path, *, field_name: str) -> Path:
    candidate = Path(path_value).expanduser()
    candidate = candidate.resolve()
    if not candidate.exists():
        raise FileNotFoundError(f"{field_name} does not exist: {candidate}")
    if not candidate.is_dir():
        raise NotADirectoryError(f"{field_name} must be a directory: {candidate}")
    if not os.access(candidate, os.W_OK):
        raise PermissionError(f"{field_name} is not writable: {candidate}")
    return candidate


def resolve_local_intake_dir(
    *,
    intake_dir: str | None,
    repo_root: Path,
) -> PathResolution | None:
    if intake_dir:
        return PathResolution(
            path=_resolve_existing_dir(intake_dir, field_name="intake dir"),
            source="cli --intake-dir",
        )

    env_intake_dir = os.getenv(DEFAULT_INTAKE_ENV)
    if env_intake_dir:
        return PathResolution(
            path=_resolve_existing_dir(env_intake_dir, field_name=DEFAULT_INTAKE_ENV),
            source=DEFAULT_INTAKE_ENV,
        )

    sibling_intake_dir = default_dali_intake_dir(repo_root=repo_root)
    if sibling_intake_dir.exists():
        return PathResolution(
            path=_resolve_existing_dir(sibling_intake_dir, field_name="default sibling Dali intake"),
            source=f"default sibling {DEFAULT_DALI_REPO_NAME}",
        )

    return None


def resolve_schema_path(
    *,
    schema_path: str | None,
    repo_root: Path,
) -> PathResolution | None:
    if schema_path:
        candidate = Path(schema_path).expanduser()
        candidate = candidate.resolve()
        if not candidate.exists():
            raise FileNotFoundError(f"schema path does not exist: {candidate}")
        return PathResolution(path=candidate, source="cli --schema-path")

    sibling_schema = default_interbeing_schema_path(repo_root=repo_root)
    if sibling_schema is not None:
        return PathResolution(path=sibling_schema, source=f"default sibling {DEFAULT_INTERBEING_REPO_NAME}")

    return None


def _default_title(*, prompt: str, task_id: str | None) -> str:
    if task_id:
        return task_id
    normalized = " ".join(prompt.split())
    if len(normalized) <= 72:
        return normalized
    return f"{normalized[:69].rstrip()}..."


def _local_dispatch_requested(args: argparse.Namespace) -> bool:
    return any(
        value is not None
        for value in (
            args.source_role,
            args.target_role,
            args.parent_task_id,
            args.chain_id,
            args.hop_count,
            args.max_hops,
        )
    )


def _write_evidence(
    *,
    repo_root: Path,
    payload: Mapping[str, Any],
) -> Path:
    destination = evidence_path(repo_root=repo_root)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    return destination


def _emit_envelope(
    *,
    emitted_title: str,
    prompt: str,
    requestor: str,
    target_node: str,
    event_type: str | None,
    include_local_dispatch: bool,
    source_role: str | None,
    target_role: str | None,
    parent_task_id: str | None,
    chain_id: str | None,
    hop_count: int | None,
    max_hops: int | None,
    payload_json: str | None,
    payload_file: str | None,
    task_id: str | None,
    correlation_id: str | None,
    output_dir: str | None,
    schema_path: PathResolution | None,
    allow_overwrite: bool,
    repo_root: Path,
) -> tuple[dict[str, Any], Path, dict[str, Any], str]:
    emission = SEND_TO_DALI.emit_local_envelope(
        title=emitted_title,
        instructions=prompt,
        requestor=requestor,
        target_node=target_node,
        event_type=event_type,
        target_role=target_role if include_local_dispatch else None,
        source_role=source_role if include_local_dispatch else None,
        chain_id=chain_id if include_local_dispatch else None,
        parent_task_id=parent_task_id if include_local_dispatch else None,
        hop_count=hop_count if include_local_dispatch else None,
        max_hops=max_hops if include_local_dispatch else None,
        task_class=None,
        acceptance_criteria=None,
        review_mode=None,
        worker_limit=None,
        execution_notes=None,
        payload_json=payload_json,
        payload_file=payload_file,
        task_id=task_id,
        correlation_id=correlation_id,
        output_path=None,
        output_dir=output_dir,
        schema_path=str(schema_path.path) if schema_path else None,
        allow_overwrite=allow_overwrite,
        archive=False,
        repo_root=repo_root,
    )
    envelope_path = Path(emission["outgoing_path"])
    envelope = SEND_TO_DALI.validate_local_envelope_file(
        envelope_path,
        schema_path=str(schema_path.path) if schema_path else None,
    )
    sha256 = SEND_TO_DALI.compute_sha256(envelope_path)
    return emission, envelope_path, envelope, sha256


def emit_interbeing_task(
    *,
    prompt: str,
    title: str | None,
    requestor: str,
    target_node: str,
    task_id: str | None,
    correlation_id: str | None,
    intake_dir: str | None,
    schema_path: str | None,
    payload_json: str | None,
    payload_file: str | None,
    event_type: str | None,
    include_local_dispatch: bool,
    source_role: str | None,
    target_role: str | None,
    parent_task_id: str | None,
    chain_id: str | None,
    hop_count: int | None,
    max_hops: int | None,
    child_task_id: str | None,
    allow_overwrite: bool,
    remote_host: str | None,
    remote_user: str | None,
    remote_port: int | None,
    remote_dir: str | None,
    remote_path: str | None,
    dry_run: bool,
    repo_root: Path = REPO_ROOT,
) -> dict[str, Any]:
    resolved_intake_dir = resolve_local_intake_dir(intake_dir=intake_dir, repo_root=repo_root)
    resolved_schema = resolve_schema_path(schema_path=schema_path, repo_root=repo_root)
    emitted_title = title or _default_title(prompt=prompt, task_id=task_id)
    emission, envelope_path, envelope, sha256 = _emit_envelope(
        emitted_title=emitted_title,
        prompt=prompt,
        requestor=requestor,
        target_node=target_node,
        event_type=event_type,
        include_local_dispatch=include_local_dispatch,
        source_role=source_role,
        target_role=target_role,
        parent_task_id=parent_task_id,
        chain_id=chain_id,
        hop_count=hop_count,
        max_hops=max_hops,
        payload_json=payload_json,
        payload_file=payload_file,
        task_id=task_id,
        correlation_id=correlation_id,
        output_dir=str(resolved_intake_dir.path) if resolved_intake_dir else None,
        schema_path=resolved_schema,
        allow_overwrite=allow_overwrite,
        repo_root=repo_root,
    )

    delivery_mode = "local_intake_write"
    transfer_result = "direct-write"
    remote_target = None
    remote_host_source = None
    remote_path_source = None
    remote_port_source = None

    if resolved_intake_dir is None:
        remote_path_value = remote_dir or remote_path
        remote_path_source = "cli --remote-dir" if remote_dir else ("cli --remote-path" if remote_path else None)
        target = SEND_TO_DALI.resolve_remote_target(
            remote_host=remote_host,
            remote_user=remote_user,
            remote_port=remote_port,
            remote_path=remote_path_value,
            remote_path_source_override=remote_path_source,
            repo_root=repo_root,
        )
        SEND_TO_DALI.check_remote_intake(target)
        remote_target = SEND_TO_DALI.transfer_envelope(envelope_path, target=target, dry_run=dry_run)
        delivery_mode = "remote_scp"
        transfer_result = "dry-run" if dry_run else "success"
        remote_host_source = target.host_source
        remote_path_source = target.path_source
        remote_port_source = target.port_source

    evidence = {
        "task_id": envelope["task_id"],
        "correlation_id": envelope["correlation_id"],
        "requestor": envelope["requestor"],
        "target_node": envelope["target_node"],
        "delivery_mode": delivery_mode,
        "transfer_result": transfer_result,
        "output_path": str(envelope_path),
        "intake_path": str(envelope_path) if resolved_intake_dir else None,
        "intake_dir_source": resolved_intake_dir.source if resolved_intake_dir else None,
        "remote_target": remote_target,
        "remote_host_source": remote_host_source,
        "remote_path_source": remote_path_source,
        "remote_port_source": remote_port_source,
        "validation_mode": emission["validation_mode"],
        "validation_source": emission["validation_source"],
        "schema_path": str(resolved_schema.path) if resolved_schema else None,
        "schema_path_source": resolved_schema.source if resolved_schema else None,
        "include_local_dispatch": include_local_dispatch,
        "child_task_id": child_task_id,
        "sha256": sha256,
    }
    final_evidence_path = _write_evidence(repo_root=repo_root, payload=evidence)

    return {
        "task_id": envelope["task_id"],
        "correlation_id": envelope["correlation_id"],
        "output_path": envelope_path,
        "sha256": sha256,
        "delivery_mode": delivery_mode,
        "transfer_result": transfer_result,
        "validation_mode": emission["validation_mode"],
        "validation_source": emission["validation_source"],
        "intake_dir": resolved_intake_dir.path if resolved_intake_dir else None,
        "intake_dir_source": resolved_intake_dir.source if resolved_intake_dir else None,
        "remote_target": remote_target,
        "remote_host_source": remote_host_source,
        "remote_path_source": remote_path_source,
        "remote_port_source": remote_port_source,
        "schema_path": resolved_schema.path if resolved_schema else None,
        "schema_path_source": resolved_schema.source if resolved_schema else None,
        "evidence_path": final_evidence_path,
        "envelope": envelope,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Emit a local Interbeing v0 task envelope directly into the Dali intake lane.",
    )
    parser.add_argument("--prompt", required=True, help="Task prompt/instructions for Dali.")
    parser.add_argument("--title", help="Optional task title. Defaults to the task id or a prompt-derived label.")
    parser.add_argument("--task-id", help="Optional explicit task id.")
    parser.add_argument("--correlation-id", help="Optional explicit correlation id.")
    parser.add_argument("--requestor", default="c_lawd", help="Submitting node id. Default: c_lawd.")
    parser.add_argument("--target-node", default="dali", help="Target node id. Default: dali.")
    parser.add_argument("--intake-dir", help="Absolute or relative local Dali intake directory override.")
    parser.add_argument("--schema-path", help="Optional explicit schema path.")
    parser.add_argument("--payload-json", help="Additional payload fields as a JSON object string.")
    parser.add_argument("--payload-file", help="Path to a JSON file containing additional payload fields.")
    parser.add_argument("--event-type", default="task.submitted", help="Optional payload event type annotation.")
    parser.add_argument(
        "--include-local-dispatch",
        action="store_true",
        help="Include adapter-local planner/executor lineage fields under payload.local_dispatch.",
    )
    parser.add_argument("--source-role", choices=SEND_TO_DALI.ROLE_CHOICES, help="Adapter-local source role.")
    parser.add_argument("--target-role", choices=SEND_TO_DALI.ROLE_CHOICES, help="Adapter-local target role.")
    parser.add_argument("--parent-task-id", help="Adapter-local parent task id.")
    parser.add_argument("--chain-id", help="Adapter-local chain id.")
    parser.add_argument("--hop-count", type=int, help="Adapter-local hop count.")
    parser.add_argument("--max-hops", type=int, help="Adapter-local max hops.")
    parser.add_argument(
        "--child-task-id",
        help="Local-only child task id recorded in audit evidence, not emitted into the canonical envelope.",
    )
    parser.add_argument(
        "--allow-overwrite",
        action="store_true",
        help="Allow overwriting an existing local task file.",
    )
    parser.add_argument("--remote-host", help="Remote ssh host or alias for Dali fallback delivery.")
    parser.add_argument("--remote-user", help="Optional remote ssh username for Dali fallback delivery.")
    parser.add_argument("--remote-port", type=int, help="Optional remote ssh/scp port for Dali fallback delivery.")
    parser.add_argument("--remote-dir", help="Remote Dali intake directory override for ssh/scp delivery.")
    parser.add_argument("--remote-path", help=argparse.SUPPRESS)
    parser.add_argument("--dry-run", action="store_true", help="Resolve and validate remote ssh/scp delivery without transferring the file.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if _local_dispatch_requested(args) and not args.include_local_dispatch:
        parser.error("local dispatch fields require --include-local-dispatch")
    if args.remote_dir and args.remote_path:
        parser.error("--remote-dir and --remote-path are mutually exclusive")

    try:
        result = emit_interbeing_task(
            prompt=args.prompt,
            title=args.title,
            requestor=args.requestor,
            target_node=args.target_node,
            task_id=args.task_id,
            correlation_id=args.correlation_id,
            intake_dir=args.intake_dir,
            schema_path=args.schema_path,
            payload_json=args.payload_json,
            payload_file=args.payload_file,
            event_type=args.event_type,
            include_local_dispatch=args.include_local_dispatch,
            source_role=args.source_role,
            target_role=args.target_role,
            parent_task_id=args.parent_task_id,
            chain_id=args.chain_id,
            hop_count=args.hop_count,
            max_hops=args.max_hops,
            child_task_id=args.child_task_id,
            allow_overwrite=args.allow_overwrite,
            remote_host=args.remote_host,
            remote_user=args.remote_user,
            remote_port=args.remote_port,
            remote_dir=args.remote_dir,
            remote_path=args.remote_path,
            dry_run=args.dry_run,
        )
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(f"task_id={result['task_id']}")
    print(f"correlation_id={result['correlation_id']}")
    print(f"delivery_mode={result['delivery_mode']}")
    print(f"output_path={result['output_path']}")
    print(f"sha256={result['sha256']}")
    print(f"validation_mode={result['validation_mode']}")
    print(f"validation_source={result['validation_source']}")
    if result["intake_dir"] is not None:
        print(f"intake_dir={result['intake_dir']}")
        print(f"intake_dir_source={result['intake_dir_source']}")
    if result["remote_target"] is not None:
        print(f"remote_target={result['remote_target']}")
        print(f"remote_host_source={result['remote_host_source']}")
        print(f"remote_path_source={result['remote_path_source']}")
        print(f"remote_port_source={result['remote_port_source']}")
        print(f"transfer={result['transfer_result']}")
    else:
        print(f"transfer={result['transfer_result']}")
    if result["schema_path"] is not None:
        print(f"schema_path={result['schema_path']}")
        print(f"schema_path_source={result['schema_path_source']}")
    print(f"evidence_path={result['evidence_path']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
