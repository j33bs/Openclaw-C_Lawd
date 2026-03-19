#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Mapping

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from interbeing_contract.submit_task_v0 import (  # noqa: E402
    DEFAULT_FILENAME,
    build_submit_task_envelope,
    resolve_submit_task_validation_provenance,
    write_submit_task_envelope,
)

DEFAULT_REQUESTOR = "c_lawd"
DEFAULT_TARGET_NODE = "dali"
DEFAULT_INTENT = "delegate"


def _require_mapping(payload: Any, source: str) -> dict[str, Any]:
    if payload is None:
        return {}
    if not isinstance(payload, Mapping):
        raise TypeError(f"{source} must decode to a JSON object")
    return dict(payload)


def load_extra_payload(
    *,
    payload_json: str | None = None,
    payload_file: Path | str | None = None,
) -> dict[str, Any]:
    if payload_json and payload_file:
        raise ValueError("payload_json and payload_file are mutually exclusive")
    if payload_json:
        return _require_mapping(json.loads(payload_json), "payload_json")
    if payload_file:
        payload_path = Path(payload_file)
        return _require_mapping(json.loads(payload_path.read_text(encoding="utf-8")), str(payload_path))
    return {}


def build_handoff_payload(
    *,
    title: str,
    instructions: str,
    extra_payload: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    payload = dict(extra_payload or {})
    payload.setdefault("intent", DEFAULT_INTENT)
    payload["title"] = title
    payload["instructions"] = instructions
    return payload


def _path_token(value: str, *, fallback: str) -> str:
    token = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip())
    token = token.strip("-.")
    return token or fallback


def _created_at_token(created_at: str) -> str:
    return _path_token(created_at.replace("+00:00", "Z"), fallback="created-at")


def default_handoff_directory(
    *,
    repo_root: Path,
    target_node: str,
    archive: bool,
) -> Path:
    bucket = "archive" if archive else "outgoing"
    return repo_root / "handoff" / bucket / target_node


def default_handoff_output_path(
    *,
    repo_root: Path,
    target_node: str,
    task_id: str,
    created_at: str,
    archive: bool,
) -> Path:
    filename = f"{_created_at_token(created_at)}--{_path_token(task_id, fallback='task')}.{DEFAULT_FILENAME}"
    return default_handoff_directory(repo_root=repo_root, target_node=target_node, archive=archive) / filename


def resolve_handoff_paths(
    *,
    repo_root: Path,
    target_node: str,
    task_id: str,
    created_at: str,
    output_path: Path | str | None = None,
    output_dir: Path | str | None = None,
    archive: bool = True,
) -> tuple[Path, Path | None]:
    if output_path is not None and output_dir is not None:
        raise ValueError("output_path and output_dir are mutually exclusive")
    default_outgoing_path = default_handoff_output_path(
        repo_root=repo_root,
        target_node=target_node,
        task_id=task_id,
        created_at=created_at,
        archive=False,
    )
    if output_path is not None:
        outgoing_path = Path(output_path)
    elif output_dir is not None:
        outgoing_path = Path(output_dir) / default_outgoing_path.name
    else:
        outgoing_path = default_outgoing_path
    archive_path = None
    if archive:
        archive_path = default_handoff_output_path(
            repo_root=repo_root,
            target_node=target_node,
            task_id=task_id,
            created_at=created_at,
            archive=True,
        )
    return outgoing_path, archive_path


def resolve_validation_provenance(schema_path: Path | str | None = None):
    return resolve_submit_task_validation_provenance(schema_path)


def _assert_writable(path: Path, *, allow_overwrite: bool) -> None:
    if path.exists() and not allow_overwrite:
        raise FileExistsError(f"refusing to overwrite existing handoff file: {path}")


def emit_dali_handoff(
    *,
    title: str,
    instructions: str,
    requestor: str = DEFAULT_REQUESTOR,
    target_node: str = DEFAULT_TARGET_NODE,
    extra_payload: Mapping[str, Any] | None = None,
    task_id: str | None = None,
    correlation_id: str | None = None,
    output_path: Path | str | None = None,
    output_dir: Path | str | None = None,
    schema_path: Path | str | None = None,
    allow_overwrite: bool = False,
    archive: bool = True,
    repo_root: Path | None = None,
    created_at: str | None = None,
) -> dict[str, Any]:
    root = Path(repo_root) if repo_root is not None else REPO_ROOT
    validation_provenance = resolve_validation_provenance(schema_path)
    envelope = build_submit_task_envelope(
        requestor=requestor,
        target_node=target_node,
        payload=build_handoff_payload(title=title, instructions=instructions, extra_payload=extra_payload),
        task_id=task_id,
        correlation_id=correlation_id,
        created_at=created_at,
        schema_path=validation_provenance.schema_path,
    )
    outgoing_path, archive_path = resolve_handoff_paths(
        repo_root=root,
        target_node=target_node,
        task_id=envelope["task_id"],
        created_at=envelope["created_at"],
        output_path=output_path,
        output_dir=output_dir,
        archive=archive,
    )
    _assert_writable(outgoing_path, allow_overwrite=allow_overwrite)
    if archive_path is not None:
        _assert_writable(archive_path, allow_overwrite=allow_overwrite)

    final_outgoing_path = write_submit_task_envelope(
        envelope,
        output_path=outgoing_path,
        schema_path=validation_provenance.schema_path,
    )
    final_archive_path = None
    if archive_path is not None:
        final_archive_path = write_submit_task_envelope(
            envelope,
            output_path=archive_path,
            schema_path=validation_provenance.schema_path,
        )
    return {
        "envelope": envelope,
        "outgoing_path": final_outgoing_path,
        "archive_path": final_archive_path,
        "validation_mode": validation_provenance.mode,
        "validation_source": validation_provenance.source,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Emit a local interbeing v0 submit_task handoff envelope for Dali.",
    )
    parser.add_argument("--title", required=True, help="Short task title for the emitted payload.")
    parser.add_argument("--instructions", required=True, help="Task instructions for the emitted payload.")
    parser.add_argument("--requestor", default=DEFAULT_REQUESTOR, help="Submitting node id. Default: c_lawd.")
    parser.add_argument("--target-node", default=DEFAULT_TARGET_NODE, help="Target node id. Default: dali.")
    payload_group = parser.add_mutually_exclusive_group()
    payload_group.add_argument("--payload-json", help="Additional payload fields as a JSON object string.")
    payload_group.add_argument("--payload-file", help="Path to a JSON file containing additional payload fields.")
    parser.add_argument("--task-id", help="Optional explicit task id.")
    parser.add_argument("--correlation-id", help="Optional explicit correlation id.")
    parser.add_argument("--output-path", help="Optional explicit output file path.")
    parser.add_argument("--schema-path", help="Optional explicit canonical schema file path.")
    parser.add_argument(
        "--archive",
        dest="archive",
        action="store_true",
        default=True,
        help="Also write an archive copy under handoff/archive/<target-node>/ (default).",
    )
    parser.add_argument(
        "--no-archive",
        dest="archive",
        action="store_false",
        help="Skip the archive copy.",
    )
    parser.add_argument(
        "--allow-overwrite",
        action="store_true",
        help="Allow overwriting an existing outgoing or archive file.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        extra_payload = load_extra_payload(payload_json=args.payload_json, payload_file=args.payload_file)
        result = emit_dali_handoff(
            title=args.title,
            instructions=args.instructions,
            requestor=args.requestor,
            target_node=args.target_node,
            extra_payload=extra_payload,
            task_id=args.task_id,
            correlation_id=args.correlation_id,
            output_path=args.output_path,
            schema_path=args.schema_path,
            allow_overwrite=args.allow_overwrite,
            archive=args.archive,
        )
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    envelope = result["envelope"]
    print(f"validation_mode={result['validation_mode']}")
    print(f"validation_source={result['validation_source']}")
    print(f"outgoing_path={result['outgoing_path']}")
    if result["archive_path"] is not None:
        print(f"archive_path={result['archive_path']}")
    print(f"task_id={envelope['task_id']}")
    print(f"correlation_id={envelope['correlation_id']}")
    print(f"requestor={envelope['requestor']}")
    print(f"target_node={envelope['target_node']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
