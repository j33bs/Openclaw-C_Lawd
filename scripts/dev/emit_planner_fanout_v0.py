#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

SEND_HELPER_PATH = Path(__file__).resolve().with_name("send_to_dali_v0.py")
DEFAULT_CHILD_TARGET_ROLE = "executor"
MAX_CHILDREN = 8


def load_send_helper_module():
    spec = importlib.util.spec_from_file_location("send_to_dali_v0", SEND_HELPER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load send helper from {SEND_HELPER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


SEND_TO_DALI = load_send_helper_module()


def _non_empty_string(value: str | None, *, field_name: str) -> str:
    if value is None:
        raise ValueError(f"{field_name} is required")
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{field_name} must be a non-empty string")
    return normalized


def _created_at_token(created_at: str) -> str:
    token = re.sub(r"[^A-Za-z0-9._-]+", "-", created_at.replace("+00:00", "Z").strip())
    return token.strip("-.") or "created-at"


def _path_token(value: str, *, fallback: str) -> str:
    token = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip())
    token = token.strip("-.")
    return token or fallback


def utc_now_rfc3339() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def default_output_directory(*, repo_root: Path, target_node: str) -> Path:
    return repo_root / "handoff" / "outgoing" / target_node


def default_manifest_path(
    *,
    output_dir: Path,
    parent_task_id: str,
    created_at: str,
) -> Path:
    filename = (
        f"{_created_at_token(created_at)}--"
        f"{_path_token(parent_task_id, fallback='parent')}"
        ".planner-manifest.v0.json"
    )
    return output_dir / filename


def _assert_writable(path: Path, *, allow_overwrite: bool) -> None:
    if path.exists() and not allow_overwrite:
        raise FileExistsError(f"refusing to overwrite existing fan-out artifact: {path}")


def load_child_specs(path: Path | str, *, default_target_role: str) -> list[dict[str, Any]]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise TypeError("child specs file must decode to a JSON array")
    if not payload:
        raise ValueError("child specs file must contain at least one child spec")
    if len(payload) > MAX_CHILDREN:
        raise ValueError(f"child spec count exceeds safety cap of {MAX_CHILDREN}")

    normalized_specs: list[dict[str, Any]] = []
    for index, item in enumerate(payload, start=1):
        if not isinstance(item, Mapping):
            raise TypeError(f"child spec #{index} must be a JSON object")
        title = _non_empty_string(item.get("title"), field_name=f"child spec #{index} title")
        instructions = _non_empty_string(
            item.get("instructions"), field_name=f"child spec #{index} instructions"
        )
        target_role = item.get("target_role", default_target_role)
        if target_role not in SEND_TO_DALI.ROLE_CHOICES:
            raise ValueError(f"child spec #{index} target_role must be one of {SEND_TO_DALI.ROLE_CHOICES}")
        if target_role == "planner":
            raise ValueError("planner fan-out does not allow planner-target children by default")
        payload_value = item.get("payload")
        if payload_value is not None and not isinstance(payload_value, Mapping):
            raise TypeError(f"child spec #{index} payload must be a JSON object when provided")
        acceptance_criteria = item.get("acceptance_criteria")
        if acceptance_criteria is not None and not isinstance(acceptance_criteria, list):
            raise TypeError(f"child spec #{index} acceptance_criteria must be a JSON array when provided")

        normalized_specs.append(
            {
                "title": title,
                "instructions": instructions,
                "target_role": target_role,
                "task_id": item.get("task_id"),
                "correlation_id": item.get("correlation_id"),
                "event_type": item.get("event_type"),
                "task_class": item.get("task_class"),
                "acceptance_criteria": acceptance_criteria,
                "review_mode": item.get("review_mode"),
                "worker_limit": item.get("worker_limit"),
                "execution_notes": item.get("execution_notes"),
                "payload": dict(payload_value) if isinstance(payload_value, Mapping) else None,
            }
        )
    return normalized_specs


def emit_planner_fanout(
    *,
    parent_task_id: str,
    chain_id: str,
    child_specs: list[Mapping[str, Any]],
    requestor: str,
    target_node: str,
    default_target_role: str,
    hop_count: int,
    max_hops: int,
    output_dir: Path | None,
    manifest_path: Path | None,
    schema_path: str | None,
    allow_overwrite: bool,
    send: bool,
    dry_run: bool,
    remote_host: str | None,
    remote_user: str | None,
    remote_port: int | None,
    remote_dir: str | None,
) -> dict[str, Any]:
    created_at = utc_now_rfc3339()
    final_output_dir = output_dir or default_output_directory(repo_root=REPO_ROOT, target_node=target_node)
    final_manifest_path = manifest_path or default_manifest_path(
        output_dir=final_output_dir,
        parent_task_id=parent_task_id,
        created_at=created_at,
    )
    _assert_writable(final_manifest_path, allow_overwrite=allow_overwrite)

    remote_path_source = "cli --remote-dir" if remote_dir else None
    target = None
    if send:
        target = SEND_TO_DALI.resolve_remote_target(
            remote_host=remote_host,
            remote_user=remote_user,
            remote_port=remote_port,
            remote_path=remote_dir,
            remote_path_source_override=remote_path_source,
            repo_root=REPO_ROOT,
        )
        SEND_TO_DALI.check_remote_intake(target)

    emitted_children: list[dict[str, Any]] = []
    validation_mode: str | None = None
    validation_source: str | None = None
    for child_spec in child_specs:
        target_role = child_spec.get("target_role", default_target_role)
        if target_role not in SEND_TO_DALI.ROLE_CHOICES:
            raise ValueError(f"child target_role must be one of {SEND_TO_DALI.ROLE_CHOICES}")
        if target_role == "planner":
            raise ValueError("planner fan-out does not allow planner-target children by default")
        payload_json = (
            json.dumps(child_spec["payload"], separators=(",", ":"), ensure_ascii=True)
            if child_spec.get("payload") is not None
            else None
        )
        emission = SEND_TO_DALI.emit_local_envelope(
            title=child_spec["title"],
            instructions=child_spec["instructions"],
            requestor=requestor,
            target_node=target_node,
            event_type=child_spec.get("event_type"),
            target_role=target_role,
            source_role="planner",
            chain_id=chain_id,
            parent_task_id=parent_task_id,
            hop_count=hop_count,
            max_hops=max_hops,
            task_class=child_spec.get("task_class"),
            acceptance_criteria=child_spec.get("acceptance_criteria"),
            review_mode=child_spec.get("review_mode"),
            worker_limit=child_spec.get("worker_limit"),
            execution_notes=child_spec.get("execution_notes"),
            payload_json=payload_json,
            payload_file=None,
            task_id=child_spec.get("task_id"),
            correlation_id=child_spec.get("correlation_id"),
            output_path=None,
            output_dir=str(final_output_dir),
            schema_path=schema_path,
            allow_overwrite=allow_overwrite,
            archive=False,
            repo_root=REPO_ROOT,
        )
        if validation_mode is None:
            validation_mode = emission["validation_mode"]
            validation_source = emission["validation_source"]
        outgoing_path = Path(emission["outgoing_path"])
        envelope = SEND_TO_DALI.validate_local_envelope_file(outgoing_path, schema_path=schema_path)
        sha256 = SEND_TO_DALI.compute_sha256(outgoing_path)
        remote_target = None
        if target is not None:
            remote_target = SEND_TO_DALI.transfer_envelope(outgoing_path, target=target, dry_run=dry_run)
        emitted_children.append(
            {
                "task_id": envelope["task_id"],
                "correlation_id": envelope["correlation_id"],
                "filename": outgoing_path.name,
                "output_path": str(outgoing_path),
                "sha256": sha256,
                "target_role": target_role,
                "task_class": child_spec.get("task_class"),
                "remote_target": remote_target,
            }
        )

    manifest = {
        "manifest_type": "planner_fanout_v0",
        "created_at": created_at,
        "parent_task_id": parent_task_id,
        "chain_id": chain_id,
        "source_role": "planner",
        "target_node": target_node,
        "hop_count": hop_count,
        "max_hops": max_hops,
        "send_mode": "dry-run" if send and dry_run else ("send" if send else "local-only"),
        "validation_mode": validation_mode,
        "validation_source": validation_source,
        "child_count": len(emitted_children),
        "children": emitted_children,
    }
    final_manifest_path.parent.mkdir(parents=True, exist_ok=True)
    final_manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    return {
        "manifest": manifest,
        "manifest_path": final_manifest_path,
        "output_dir": final_output_dir,
        "remote_target": target.ssh_target() if target is not None else None,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Emit a bounded planner fan-out of executor/reviewer task envelopes from C_Lawd.",
    )
    parser.add_argument("--parent-task-id", required=True, help="Parent planner task id for all emitted children.")
    parser.add_argument("--chain-id", required=True, help="Chain id shared by all emitted children.")
    parser.add_argument("--child-specs-file", required=True, help="Path to a JSON array of child task specs.")
    parser.add_argument("--requestor", default="c_lawd", help="Submitting node id for emitted children.")
    parser.add_argument("--target-node", default="dali", help="Target node id for emitted children.")
    parser.add_argument(
        "--default-target-role",
        default=DEFAULT_CHILD_TARGET_ROLE,
        choices=("executor", "reviewer"),
        help="Default target role for child specs that do not set target_role.",
    )
    parser.add_argument("--hop-count", type=int, default=1, help="Adapter-local hop count for emitted children.")
    parser.add_argument("--max-hops", type=int, required=True, help="Adapter-local max hops for emitted children.")
    parser.add_argument("--output-dir", help="Optional local output directory for child envelopes.")
    parser.add_argument("--manifest-path", help="Optional explicit local manifest path.")
    parser.add_argument("--schema-path", help="Optional explicit schema path for local validation.")
    parser.add_argument("--allow-overwrite", action="store_true", help="Allow overwriting emitted files or manifest.")
    parser.add_argument("--send", action="store_true", help="Also send each emitted child via the existing C_Lawd send path.")
    parser.add_argument("--remote-host", help="Remote ssh host or alias when --send is used.")
    parser.add_argument("--remote-user", help="Optional remote ssh username when --send is used.")
    parser.add_argument("--remote-port", type=int, help="Optional remote ssh/scp port when --send is used.")
    parser.add_argument("--remote-dir", help="Remote intake directory when --send is used.")
    parser.add_argument("--dry-run", action="store_true", help="Emit locally but do not scp children when --send is set.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        child_specs = load_child_specs(
            args.child_specs_file,
            default_target_role=args.default_target_role,
        )
        result = emit_planner_fanout(
            parent_task_id=args.parent_task_id,
            chain_id=args.chain_id,
            child_specs=child_specs,
            requestor=args.requestor,
            target_node=args.target_node,
            default_target_role=args.default_target_role,
            hop_count=args.hop_count,
            max_hops=args.max_hops,
            output_dir=Path(args.output_dir) if args.output_dir else None,
            manifest_path=Path(args.manifest_path) if args.manifest_path else None,
            schema_path=args.schema_path,
            allow_overwrite=args.allow_overwrite,
            send=args.send,
            dry_run=args.dry_run,
            remote_host=args.remote_host,
            remote_user=args.remote_user,
            remote_port=args.remote_port,
            remote_dir=args.remote_dir,
        )
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(f"manifest_path={result['manifest_path']}")
    print(f"parent_task_id={args.parent_task_id}")
    print(f"chain_id={args.chain_id}")
    print(f"validation_mode={result['manifest']['validation_mode']}")
    print(f"validation_source={result['manifest']['validation_source']}")
    print(f"child_count={result['manifest']['child_count']}")
    print(
        "child_filenames_json="
        + json.dumps([child["filename"] for child in result["manifest"]["children"]], ensure_ascii=True)
    )
    print(
        "child_sha256_json="
        + json.dumps(
            {child["filename"]: child["sha256"] for child in result["manifest"]["children"]},
            ensure_ascii=True,
            sort_keys=True,
        )
    )
    if result["remote_target"] is not None:
        print(f"remote_host={result['remote_target']}")
    print(f"send_mode={result['manifest']['send_mode']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
