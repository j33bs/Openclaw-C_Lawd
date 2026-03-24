#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from interbeing_contract.submit_task_v0 import validate_submit_task_envelope_shape  # noqa: E402
from interbeing_contract.submit_task_v0 import resolve_submit_task_validation_provenance  # noqa: E402

EMITTER_SCRIPT_PATH = REPO_ROOT / "scripts" / "dev" / "emit_dali_handoff.py"
EXPECTED_FILENAME_SUFFIX = ".task-envelope.v0.json"
DEFAULT_REMOTE_PATH = "handoff/incoming/dali/"
DEFAULT_REMOTE_HOST_ALIAS = "dali"
ENV_REMOTE_HOST = "OPENCLAW_INTERBEING_DALI_REMOTE_HOST"
ENV_REMOTE_USER = "OPENCLAW_INTERBEING_DALI_REMOTE_USER"
ENV_REMOTE_PORT = "OPENCLAW_INTERBEING_DALI_REMOTE_PORT"
ENV_REMOTE_PATH = "OPENCLAW_INTERBEING_DALI_INTAKE_PATH"
ROLE_CHOICES = ("planner", "executor", "reviewer")
LOCAL_DISPATCH_KEY = "local_dispatch"
TASK_CONTRACT_KEY = "task_contract"
LOCAL_DISPATCH_FIELDS = (
    "target_role",
    "source_role",
    "chain_id",
    "parent_task_id",
    "hop_count",
    "max_hops",
)
TASK_CONTRACT_FIELDS = (
    "task_class",
    "acceptance_criteria",
    "review_mode",
    "worker_limit",
    "execution_notes",
)


@dataclass(frozen=True)
class RemoteTarget:
    host: str
    user: str | None
    intake_path: str
    host_source: str
    path_source: str
    port: int | None = None
    port_source: str = "ssh-default-or-config"

    def ssh_target(self) -> str:
        return f"{self.user}@{self.host}" if self.user else self.host

    def scp_target(self, filename: str) -> str:
        remote_dir = self.intake_path.rstrip("/")
        return f"{self.ssh_target()}:{remote_dir}/{filename}"

    def ssh_command_prefix(self) -> list[str]:
        command = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes"]
        if self.port is not None:
            command.extend(["-p", str(self.port)])
        command.append(self.ssh_target())
        return command

    def scp_command_prefix(self) -> list[str]:
        command = ["scp", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes"]
        if self.port is not None:
            command.extend(["-P", str(self.port)])
        return command


def _ensure_command_available(command_name: str) -> str:
    resolved = shutil.which(command_name)
    if not resolved:
        raise FileNotFoundError(f"required command is not available on PATH: {command_name}")
    return resolved


def _load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and value:
            values[key] = value
    return values


def _config_sources(repo_root: Path) -> list[tuple[str, dict[str, str]]]:
    return [
        ("process env", dict(os.environ)),
        (f"{repo_root / '.env'}", _load_env_file(repo_root / ".env")),
        (f"{Path.home() / '.openclaw' / '.env'}", _load_env_file(Path.home() / ".openclaw" / ".env")),
    ]


def _first_config_value(name: str, *, repo_root: Path) -> tuple[str | None, str | None]:
    for source, values in _config_sources(repo_root):
        value = values.get(name, "").strip()
        if value:
            return value, source
    return None, None


def discover_default_dali_alias(ssh_config_path: Path = Path.home() / ".ssh" / "config") -> str | None:
    if not ssh_config_path.exists():
        return None
    for raw_line in ssh_config_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or not line.lower().startswith("host "):
            continue
        host_tokens = [token.strip() for token in line.split()[1:]]
        if DEFAULT_REMOTE_HOST_ALIAS in host_tokens:
            return DEFAULT_REMOTE_HOST_ALIAS
    return None


def _assert_safe_remote_host(value: str) -> str:
    if not value or any(ch.isspace() for ch in value):
        raise ValueError("remote host must be a non-empty ssh host or alias without whitespace")
    allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._:")
    if any(ch not in allowed for ch in value):
        raise ValueError("remote host contains unsupported characters")
    return value


def _assert_safe_remote_user(value: str) -> str:
    if not value or any(ch.isspace() for ch in value):
        raise ValueError("remote user must be a non-empty username without whitespace")
    allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._")
    if any(ch not in allowed for ch in value):
        raise ValueError("remote user contains unsupported characters")
    return value


def _assert_safe_remote_path(value: str) -> str:
    if not value or any(ch.isspace() for ch in value):
        raise ValueError("remote path must be a non-empty path without whitespace")
    allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~/")
    if any(ch not in allowed for ch in value):
        raise ValueError("remote path contains unsupported characters")
    return value


def _assert_safe_remote_port(value: str | int) -> int:
    try:
        port = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("remote port must be an integer between 1 and 65535") from exc
    if port < 1 or port > 65535:
        raise ValueError("remote port must be an integer between 1 and 65535")
    return port


def _non_empty_string(value: str | None, *, field_name: str) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{field_name} must be a non-empty string")
    return normalized


def _non_negative_int(value: int | None, *, field_name: str) -> int | None:
    if value is None:
        return None
    if value < 0:
        raise ValueError(f"{field_name} must be greater than or equal to 0")
    return value


def _positive_int(value: int | None, *, field_name: str) -> int | None:
    if value is None:
        return None
    if value < 1:
        raise ValueError(f"{field_name} must be greater than or equal to 1")
    return value


def _non_empty_string_list(values: list[str] | None, *, field_name: str) -> list[str] | None:
    if values is None:
        return None
    normalized_values: list[str] = []
    for value in values:
        normalized_value = value.strip()
        if not normalized_value:
            raise ValueError(f"{field_name} must not contain empty strings")
        normalized_values.append(normalized_value)
    if not normalized_values:
        raise ValueError(f"{field_name} must contain at least one value when provided")
    return normalized_values


def build_local_dispatch_metadata(
    *,
    target_role: str | None,
    source_role: str | None,
    chain_id: str | None,
    parent_task_id: str | None,
    hop_count: int | None,
    max_hops: int | None,
    task_class: str | None,
    acceptance_criteria: list[str] | None,
    review_mode: str | None,
    worker_limit: int | None,
    execution_notes: str | None,
) -> dict[str, Any]:
    local_dispatch: dict[str, Any] = {}
    task_contract: dict[str, Any] = {}

    normalized_target_role = _non_empty_string(target_role, field_name="target role")
    normalized_source_role = _non_empty_string(source_role, field_name="source role")
    normalized_chain_id = _non_empty_string(chain_id, field_name="chain id")
    normalized_parent_task_id = _non_empty_string(parent_task_id, field_name="parent task id")
    normalized_hop_count = _non_negative_int(hop_count, field_name="hop count")
    normalized_max_hops = _non_negative_int(max_hops, field_name="max hops")
    normalized_task_class = _non_empty_string(task_class, field_name="task class")
    normalized_acceptance_criteria = _non_empty_string_list(
        acceptance_criteria, field_name="acceptance criteria"
    )
    normalized_review_mode = _non_empty_string(review_mode, field_name="review mode")
    normalized_worker_limit = _positive_int(worker_limit, field_name="worker limit")
    normalized_execution_notes = _non_empty_string(execution_notes, field_name="execution notes")

    if normalized_max_hops == 0:
        raise ValueError("max hops must be greater than or equal to 1 when provided")
    if normalized_hop_count is not None and normalized_max_hops is not None and normalized_hop_count > normalized_max_hops:
        raise ValueError("hop count cannot exceed max hops")

    if normalized_target_role is not None:
        local_dispatch["target_role"] = normalized_target_role
    if normalized_source_role is not None:
        local_dispatch["source_role"] = normalized_source_role
    if normalized_chain_id is not None:
        local_dispatch["chain_id"] = normalized_chain_id
    if normalized_parent_task_id is not None:
        local_dispatch["parent_task_id"] = normalized_parent_task_id
    if normalized_hop_count is not None:
        local_dispatch["hop_count"] = normalized_hop_count
    if normalized_max_hops is not None:
        local_dispatch["max_hops"] = normalized_max_hops
    if normalized_task_class is not None:
        task_contract["task_class"] = normalized_task_class
    if normalized_acceptance_criteria is not None:
        task_contract["acceptance_criteria"] = normalized_acceptance_criteria
    if normalized_review_mode is not None:
        task_contract["review_mode"] = normalized_review_mode
    if normalized_worker_limit is not None:
        task_contract["worker_limit"] = normalized_worker_limit
    if normalized_execution_notes is not None:
        task_contract["execution_notes"] = normalized_execution_notes
    if task_contract:
        local_dispatch[TASK_CONTRACT_KEY] = task_contract

    return local_dispatch


def merge_local_dispatch_metadata(
    extra_payload: dict[str, Any],
    *,
    local_dispatch_metadata: Mapping[str, Any],
) -> dict[str, Any]:
    if not local_dispatch_metadata:
        return extra_payload

    existing_local_dispatch = extra_payload.get(LOCAL_DISPATCH_KEY)
    if existing_local_dispatch is None:
        extra_payload[LOCAL_DISPATCH_KEY] = dict(local_dispatch_metadata)
        return extra_payload
    if not isinstance(existing_local_dispatch, Mapping):
        raise ValueError(f"{LOCAL_DISPATCH_KEY} must be a mapping when provided via payload")

    merged_local_dispatch = dict(existing_local_dispatch)
    for field_name, value in local_dispatch_metadata.items():
        existing_value = merged_local_dispatch.get(field_name)
        if field_name == TASK_CONTRACT_KEY:
            if existing_value is None:
                merged_local_dispatch[field_name] = dict(value)
                continue
            if not isinstance(existing_value, Mapping):
                raise ValueError(f"{TASK_CONTRACT_KEY} must be a mapping when provided via payload")
            merged_task_contract = dict(existing_value)
            for contract_field_name, contract_value in value.items():
                existing_contract_value = merged_task_contract.get(contract_field_name)
                if existing_contract_value is not None and existing_contract_value != contract_value:
                    raise ValueError(
                        f"{contract_field_name} conflict: payload already defines {contract_field_name} with a different value"
                    )
                merged_task_contract[contract_field_name] = contract_value
            merged_local_dispatch[field_name] = merged_task_contract
            continue
        if existing_value is not None and existing_value != value:
            raise ValueError(
                f"{field_name} conflict: payload already defines {field_name} with a different value"
            )
        merged_local_dispatch[field_name] = value

    extra_payload[LOCAL_DISPATCH_KEY] = merged_local_dispatch
    return extra_payload


def extract_local_dispatch_metadata(envelope: Mapping[str, Any]) -> dict[str, Any]:
    payload = envelope.get("payload")
    if not isinstance(payload, Mapping):
        return {}
    local_dispatch = payload.get(LOCAL_DISPATCH_KEY)
    if not isinstance(local_dispatch, Mapping):
        return {}
    return dict(local_dispatch)


def iter_local_dispatch_output_fields(envelope: Mapping[str, Any]) -> list[tuple[str, Any]]:
    local_dispatch = extract_local_dispatch_metadata(envelope)
    output_fields: list[tuple[str, Any]] = []
    for field_name in LOCAL_DISPATCH_FIELDS:
        if field_name in local_dispatch:
            output_fields.append((field_name, local_dispatch[field_name]))

    task_contract = local_dispatch.get(TASK_CONTRACT_KEY)
    if isinstance(task_contract, Mapping):
        for field_name in TASK_CONTRACT_FIELDS:
            if field_name not in task_contract:
                continue
            if field_name == "acceptance_criteria":
                output_fields.append(
                    ("acceptance_criteria_json", json.dumps(task_contract[field_name], ensure_ascii=True))
                )
            else:
                output_fields.append((field_name, task_contract[field_name]))
    return output_fields


def resolve_remote_target(
    *,
    remote_host: str | None,
    remote_user: str | None,
    remote_port: int | str | None,
    remote_path: str | None,
    remote_path_source_override: str | None,
    repo_root: Path,
) -> RemoteTarget:
    if remote_host:
        host_value = _assert_safe_remote_host(remote_host)
        host_source = "cli --remote-host"
    else:
        env_host, env_host_source = _first_config_value(ENV_REMOTE_HOST, repo_root=repo_root)
        if env_host:
            host_value = _assert_safe_remote_host(env_host)
            host_source = env_host_source or ENV_REMOTE_HOST
        else:
            discovered_alias = discover_default_dali_alias()
            if not discovered_alias:
                raise ValueError(
                    "missing remote host: pass --remote-host, set "
                    f"{ENV_REMOTE_HOST}, or define a local SSH alias named {DEFAULT_REMOTE_HOST_ALIAS!r}"
                )
            host_value = discovered_alias
            host_source = f"discovered ssh alias {discovered_alias!r}"

    if remote_user:
        user_value = _assert_safe_remote_user(remote_user)
    else:
        env_user, _env_user_source = _first_config_value(ENV_REMOTE_USER, repo_root=repo_root)
        user_value = _assert_safe_remote_user(env_user) if env_user else None

    if remote_port is not None:
        port_value = _assert_safe_remote_port(remote_port)
        port_source = "cli --remote-port"
    else:
        env_port, env_port_source = _first_config_value(ENV_REMOTE_PORT, repo_root=repo_root)
        if env_port:
            port_value = _assert_safe_remote_port(env_port)
            port_source = env_port_source or ENV_REMOTE_PORT
        else:
            port_value = None
            port_source = "ssh-default-or-config"

    if remote_path:
        path_value = _assert_safe_remote_path(remote_path)
        path_source = remote_path_source_override or "cli --remote-path"
    else:
        env_path, env_path_source = _first_config_value(ENV_REMOTE_PATH, repo_root=repo_root)
        if env_path:
            path_value = _assert_safe_remote_path(env_path)
            path_source = env_path_source or ENV_REMOTE_PATH
        else:
            path_value = DEFAULT_REMOTE_PATH
            path_source = "default watched intake"

    return RemoteTarget(
        host=host_value,
        user=user_value,
        intake_path=path_value,
        host_source=host_source,
        path_source=path_source,
        port=port_value,
        port_source=port_source,
    )


def _load_emitter_module(script_path: Path = EMITTER_SCRIPT_PATH):
    if not script_path.exists():
        raise FileNotFoundError(f"missing emitter path: {script_path}")
    spec = importlib.util.spec_from_file_location("emit_dali_handoff", script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load emitter module from {script_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def emit_local_envelope(
    *,
    title: str,
    instructions: str,
    requestor: str,
    target_node: str,
    event_type: str | None,
    target_role: str | None,
    source_role: str | None,
    chain_id: str | None,
    parent_task_id: str | None,
    hop_count: int | None,
    max_hops: int | None,
    task_class: str | None,
    acceptance_criteria: list[str] | None,
    review_mode: str | None,
    worker_limit: int | None,
    execution_notes: str | None,
    payload_json: str | None,
    payload_file: str | None,
    task_id: str | None,
    correlation_id: str | None,
    output_path: str | None,
    output_dir: str | None,
    schema_path: str | None,
    allow_overwrite: bool,
    archive: bool,
    repo_root: Path,
) -> dict[str, Any]:
    # Load the emitter from this checkout. `repo_root` describes the handoff
    # layout for emitted artifacts, not an alternate source tree for helpers.
    emitter = _load_emitter_module(EMITTER_SCRIPT_PATH)
    if not hasattr(emitter, "load_extra_payload") or not hasattr(emitter, "emit_dali_handoff"):
        raise RuntimeError("existing emitter script does not expose the expected helper functions")
    extra_payload = emitter.load_extra_payload(payload_json=payload_json, payload_file=payload_file)
    if event_type is not None:
        normalized_event_type = event_type.strip()
        if not normalized_event_type:
            raise ValueError("event type must be a non-empty string")
        existing_event_type = extra_payload.get("event_type")
        if existing_event_type is not None and existing_event_type != normalized_event_type:
            raise ValueError(
                "event_type conflict: payload already defines event_type with a different value"
            )
        extra_payload["event_type"] = normalized_event_type
    extra_payload = merge_local_dispatch_metadata(
        extra_payload,
        local_dispatch_metadata=build_local_dispatch_metadata(
            target_role=target_role,
            source_role=source_role,
            chain_id=chain_id,
            parent_task_id=parent_task_id,
            hop_count=hop_count,
            max_hops=max_hops,
            task_class=task_class,
            acceptance_criteria=acceptance_criteria,
            review_mode=review_mode,
            worker_limit=worker_limit,
            execution_notes=execution_notes,
        ),
    )
    return emitter.emit_dali_handoff(
        title=title,
        instructions=instructions,
        requestor=requestor,
        target_node=target_node,
        extra_payload=extra_payload,
        task_id=task_id,
        correlation_id=correlation_id,
        output_path=output_path,
        output_dir=output_dir,
        schema_path=schema_path,
        allow_overwrite=allow_overwrite,
        archive=archive,
        repo_root=repo_root,
    )


def validate_local_envelope_file(path: Path, *, schema_path: str | None = None) -> dict[str, Any]:
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"missing local envelope file: {path}")
    if path.suffix.lower() != ".json":
        raise ValueError(f"local envelope file must be JSON: {path}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"local envelope file is not valid JSON: {path}") from exc
    if not isinstance(payload, Mapping):
        raise ValueError(f"local envelope file must contain a JSON object: {path}")
    normalized = validate_submit_task_envelope_shape(payload, schema_path=schema_path)
    if not path.name.endswith(EXPECTED_FILENAME_SUFFIX) and normalized.get("operation") != "submit_task":
        raise ValueError(
            f"local envelope filename does not match {EXPECTED_FILENAME_SUFFIX} and payload is not a submit_task envelope"
        )
    return normalized


def run_checked(command: list[str], *, action: str) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        stderr = completed.stderr.strip()
        stdout = completed.stdout.strip()
        details = stderr or stdout or f"{action} exited with status {completed.returncode}"
        raise RuntimeError(f"{action} failed: {details}")
    return completed


def compute_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def check_remote_intake(target: RemoteTarget) -> None:
    _ensure_command_available("ssh")
    try:
        run_checked(
            [*target.ssh_command_prefix(), "test", "-d", target.intake_path],
            action=f"remote intake check for {target.ssh_target()}:{target.intake_path}",
        )
    except RuntimeError as exc:
        raise RuntimeError(
            f"remote intake path is unavailable at {target.ssh_target()}:{target.intake_path}; "
            f"pass --remote-dir or set {ENV_REMOTE_PATH} to the exact Dali watcher intake directory. "
            f"Original error: {exc}"
        ) from exc


def transfer_envelope(source_path: Path, *, target: RemoteTarget, dry_run: bool) -> str:
    remote_target = target.scp_target(source_path.name)
    if dry_run:
        return remote_target
    _ensure_command_available("scp")
    run_checked(
        [*target.scp_command_prefix(), str(source_path), remote_target],
        action=f"scp transfer to {remote_target}",
    )
    return remote_target


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Emit and/or send a C_Lawd interbeing v0 handoff envelope to Dali via scp.",
    )
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument("--emit", action="store_true", help="Emit a new local envelope before sending it.")
    source_group.add_argument("--file", help="Send an existing local envelope file.")

    parser.add_argument("--title", help="Task title for emit mode.")
    parser.add_argument("--instructions", help="Task instructions for emit mode.")
    parser.add_argument("--requestor", default="c_lawd", help="Submitting node id for emit mode.")
    parser.add_argument("--target-node", default="dali", help="Target node id for emit mode.")
    parser.add_argument(
        "--event-type",
        help="Optional payload event_type annotation for emit mode. This stays inside payload and does not alter the canonical top-level envelope schema.",
    )
    parser.add_argument("--target-role", choices=ROLE_CHOICES, help="Optional adapter-local target role for emit mode.")
    parser.add_argument("--source-role", choices=ROLE_CHOICES, help="Optional adapter-local source role for emit mode.")
    parser.add_argument("--chain-id", help="Optional adapter-local chain id for emit mode.")
    parser.add_argument("--parent-task-id", help="Optional adapter-local parent task id for emit mode.")
    parser.add_argument("--hop-count", type=int, help="Optional adapter-local hop count for emit mode.")
    parser.add_argument("--max-hops", type=int, help="Optional adapter-local max hops for emit mode.")
    parser.add_argument("--task-class", help="Optional adapter-local task class for emit mode.")
    parser.add_argument(
        "--acceptance-criterion",
        dest="acceptance_criteria",
        action="append",
        help="Repeatable adapter-local acceptance criterion for emit mode.",
    )
    parser.add_argument("--review-mode", help="Optional adapter-local review mode for emit mode.")
    parser.add_argument("--worker-limit", type=int, help="Optional adapter-local worker limit for emit mode.")
    parser.add_argument("--execution-notes", help="Optional adapter-local execution notes for emit mode.")
    payload_group = parser.add_mutually_exclusive_group()
    payload_group.add_argument("--payload-json", help="Additional payload fields as a JSON object string.")
    payload_group.add_argument("--payload-file", help="Path to a JSON file containing additional payload fields.")
    parser.add_argument("--task-id", help="Optional explicit task id for emit mode.")
    parser.add_argument("--correlation-id", help="Optional explicit correlation id for emit mode.")
    parser.add_argument("--output-path", help="Optional explicit local output file path for emit mode.")
    parser.add_argument("--output-dir", help="Optional explicit local output directory for emit mode.")
    parser.add_argument("--schema-path", help="Optional explicit schema path for local validation.")
    parser.add_argument("--allow-overwrite", action="store_true", help="Allow overwriting an emitted local file.")
    parser.add_argument("--archive", dest="archive", action="store_true", default=True, help="Archive the emitted local file (default).")
    parser.add_argument("--no-archive", dest="archive", action="store_false", help="Skip the local archive copy during emit mode.")

    parser.add_argument("--remote-host", help="Remote ssh host or alias.")
    parser.add_argument("--remote-user", help="Optional remote ssh username.")
    parser.add_argument("--remote-port", type=int, help="Optional remote ssh/scp port. Defaults to ssh config or port 22 behavior.")
    parser.add_argument("--remote-dir", help="Remote intake directory. Defaults to handoff/incoming/dali/.")
    parser.add_argument("--remote-path", help=argparse.SUPPRESS)
    parser.add_argument("--dry-run", action="store_true", help="Perform all checks except the actual scp transfer.")
    return parser


def _require_emit_args(parser: argparse.ArgumentParser, args: argparse.Namespace) -> None:
    if args.emit and not args.title:
        parser.error("--title is required with --emit")
    if args.emit and not args.instructions:
        parser.error("--instructions is required with --emit")
    if args.output_dir and args.output_path:
        parser.error("--output-dir and --output-path are mutually exclusive")
    if args.remote_dir and args.remote_path:
        parser.error("--remote-dir and --remote-path are mutually exclusive")
    if args.file and args.output_dir:
        parser.error("--output-dir is only supported with --emit")
    if args.file and args.event_type:
        parser.error("--event-type is only supported with --emit")
    if args.file and args.target_role:
        parser.error("--target-role is only supported with --emit")
    if args.file and args.source_role:
        parser.error("--source-role is only supported with --emit")
    if args.file and args.chain_id:
        parser.error("--chain-id is only supported with --emit")
    if args.file and args.parent_task_id:
        parser.error("--parent-task-id is only supported with --emit")
    if args.file and args.hop_count is not None:
        parser.error("--hop-count is only supported with --emit")
    if args.file and args.max_hops is not None:
        parser.error("--max-hops is only supported with --emit")
    if args.file and args.task_class:
        parser.error("--task-class is only supported with --emit")
    if args.file and args.acceptance_criteria:
        parser.error("--acceptance-criterion is only supported with --emit")
    if args.file and args.review_mode:
        parser.error("--review-mode is only supported with --emit")
    if args.file and args.worker_limit is not None:
        parser.error("--worker-limit is only supported with --emit")
    if args.file and args.execution_notes:
        parser.error("--execution-notes is only supported with --emit")


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    _require_emit_args(parser, args)

    local_path: Path | None = None
    envelope: Mapping[str, Any] | None = None
    emission: dict[str, Any] | None = None
    target: RemoteTarget | None = None
    planned_remote_target: str | None = None
    local_sha256: str | None = None
    validation_mode: str | None = None
    validation_source: str | None = None
    remote_path = args.remote_dir or args.remote_path
    remote_path_source = "cli --remote-dir" if args.remote_dir else ("cli --remote-path" if args.remote_path else None)

    try:
        target = resolve_remote_target(
            remote_host=args.remote_host,
            remote_user=args.remote_user,
            remote_port=args.remote_port,
            remote_path=remote_path,
            remote_path_source_override=remote_path_source,
            repo_root=REPO_ROOT,
        )
        if args.emit:
            emission = emit_local_envelope(
                title=args.title,
                instructions=args.instructions,
                requestor=args.requestor,
                target_node=args.target_node,
                event_type=args.event_type,
                target_role=args.target_role,
                source_role=args.source_role,
                chain_id=args.chain_id,
                parent_task_id=args.parent_task_id,
                hop_count=args.hop_count,
                max_hops=args.max_hops,
                task_class=args.task_class,
                acceptance_criteria=args.acceptance_criteria,
                review_mode=args.review_mode,
                worker_limit=args.worker_limit,
                execution_notes=args.execution_notes,
                payload_json=args.payload_json,
                payload_file=args.payload_file,
                task_id=args.task_id,
                correlation_id=args.correlation_id,
                output_path=args.output_path,
                output_dir=args.output_dir,
                schema_path=args.schema_path,
                allow_overwrite=args.allow_overwrite,
                archive=args.archive,
                repo_root=REPO_ROOT,
            )
            local_path = Path(emission["outgoing_path"])
            validation_mode = emission["validation_mode"]
            validation_source = emission["validation_source"]
        else:
            local_path = Path(args.file)

        envelope = validate_local_envelope_file(local_path, schema_path=args.schema_path)
        if validation_mode is None or validation_source is None:
            validation_provenance = resolve_submit_task_validation_provenance(args.schema_path)
            validation_mode = validation_provenance.mode
            validation_source = validation_provenance.source
        local_sha256 = compute_sha256(local_path)
        planned_remote_target = target.scp_target(local_path.name)
        check_remote_intake(target)
        remote_target = transfer_envelope(local_path, target=target, dry_run=args.dry_run)
    except Exception as exc:
        if local_path is not None:
            print(f"local_path={local_path}", file=sys.stderr)
        if local_sha256 is not None:
            print(f"sha256={local_sha256}", file=sys.stderr)
        if validation_mode is not None:
            print(f"validation_mode={validation_mode}", file=sys.stderr)
        if validation_source is not None:
            print(f"validation_source={validation_source}", file=sys.stderr)
        if envelope is not None:
            print(f"schema_version={envelope['schema_version']}", file=sys.stderr)
            for field_name, value in iter_local_dispatch_output_fields(envelope):
                print(f"{field_name}={value}", file=sys.stderr)
        if planned_remote_target is not None:
            print(f"remote_target={planned_remote_target}", file=sys.stderr)
        if target is not None:
            print(f"remote_host_source={target.host_source}", file=sys.stderr)
            print(f"remote_path_source={target.path_source}", file=sys.stderr)
            print(f"remote_port_source={target.port_source}", file=sys.stderr)
        print("transfer=failure", file=sys.stderr)
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(f"local_path={local_path}")
    print(f"sha256={local_sha256}")
    print(f"validation_mode={validation_mode}")
    print(f"validation_source={validation_source}")
    print(f"schema_version={envelope['schema_version']}")
    for field_name, value in iter_local_dispatch_output_fields(envelope):
        print(f"{field_name}={value}")
    print(f"remote_target={remote_target}")
    print(f"remote_host_source={target.host_source}")
    print(f"remote_path_source={target.path_source}")
    print(f"remote_port_source={target.port_source}")
    print(f"transfer={'dry-run' if args.dry_run else 'success'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
