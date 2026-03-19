#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import importlib.util
import json
import subprocess
import sys
from pathlib import Path, PurePosixPath
from typing import Any, Mapping

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

SEND_HELPER_PATH = Path(__file__).resolve().with_name("send_to_dali_v0.py")
EXPECTED_RECEIPT_SUFFIX = ".task-envelope.v0.receipt.json"
EXPECTED_ENVELOPE_SUFFIX = ".task-envelope.v0.json"
REMOTE_LOOKUP_SCRIPT = r"""
from __future__ import annotations

import base64
import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Mapping


def compute_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_chain_id(payload: Mapping[str, Any]) -> str | None:
    local_dispatch = payload.get("local_dispatch")
    if isinstance(local_dispatch, Mapping):
        chain_id = local_dispatch.get("chain_id")
        if isinstance(chain_id, str) and chain_id.strip():
            return chain_id.strip()
    chain_id = payload.get("chain_id")
    if isinstance(chain_id, str) and chain_id.strip():
        return chain_id.strip()
    return None


def local_dispatch_field(payload: Mapping[str, Any], field_name: str) -> Any:
    local_dispatch = payload.get("local_dispatch")
    if isinstance(local_dispatch, Mapping):
        return local_dispatch.get(field_name)
    return None


def candidate_matches(candidate: Mapping[str, Any], query: Mapping[str, Any]) -> bool:
    for field_name, expected_value in query.items():
        if expected_value is None:
            continue
        if candidate.get(field_name) != expected_value:
            return False
    return True


processed_dir = Path(sys.argv[1])
failed_dir = Path(sys.argv[2])
query = json.loads(base64.b64decode(sys.argv[3]).decode("utf-8"))
matches: list[dict[str, Any]] = []

for disposition, directory in (("processed", processed_dir), ("failed", failed_dir)):
    for envelope_path in sorted(directory.glob("*.json")):
        if envelope_path.name.endswith(".receipt.json"):
            continue
        envelope = load_json(envelope_path)
        if not isinstance(envelope, Mapping):
            raise TypeError(f"envelope must be a mapping: {envelope_path}")
        payload = envelope.get("payload", {})
        if not isinstance(payload, Mapping):
            raise TypeError(f"payload must be a mapping: {envelope_path}")

        receipt_path = envelope_path.with_name(envelope_path.name[:-5] + ".receipt.json")
        receipt = None
        if receipt_path.exists():
            receipt = load_json(receipt_path)
            if not isinstance(receipt, Mapping):
                raise TypeError(f"receipt must be a mapping: {receipt_path}")

        sha256 = None
        if isinstance(receipt, Mapping):
            receipt_sha256 = receipt.get("sha256")
            if isinstance(receipt_sha256, str) and receipt_sha256.strip():
                sha256 = receipt_sha256.strip()
        if sha256 is None:
            sha256 = compute_sha256(envelope_path)

        candidate = {
            "filename": envelope_path.name,
            "disposition": receipt.get("final_disposition") if isinstance(receipt, Mapping) else disposition,
            "file_path": str(envelope_path),
            "receipt_path": str(receipt_path) if receipt_path.exists() else None,
            "reason_code": receipt.get("reason_code") if isinstance(receipt, Mapping) else None,
            "reason_detail": receipt.get("reason_detail") if isinstance(receipt, Mapping) else None,
            "sha256": sha256,
            "task_id": envelope.get("task_id"),
            "chain_id": normalize_chain_id(payload),
            "parent_task_id": local_dispatch_field(payload, "parent_task_id"),
            "source_role": local_dispatch_field(payload, "source_role"),
            "target_role": local_dispatch_field(payload, "target_role"),
            "hop_count": local_dispatch_field(payload, "hop_count"),
            "max_hops": local_dispatch_field(payload, "max_hops"),
        }
        if candidate_matches(candidate, query):
            matches.append(candidate)

print(json.dumps(matches))
"""


def load_send_helper_module():
    spec = importlib.util.spec_from_file_location("send_to_dali_v0", SEND_HELPER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load send helper from {SEND_HELPER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


SEND_TO_DALI = load_send_helper_module()


def normalize_filename_selector(value: str) -> str:
    normalized = PurePosixPath(value.strip()).name
    if not normalized:
        raise ValueError("filename selector must be a non-empty basename")
    if normalized.endswith(EXPECTED_RECEIPT_SUFFIX):
        return normalized[: -len(".receipt.json")] + ".json"
    return normalized


def derive_remote_status_dirs(intake_path: str) -> tuple[str, str]:
    normalized = intake_path.rstrip("/")
    posix_path = PurePosixPath(normalized)
    if not normalized.startswith("/"):
        raise ValueError(
            "status helper requires an absolute remote intake path ending in /incoming/<target>/"
        )
    parts = posix_path.parts
    if len(parts) < 4 or parts[-2] != "incoming":
        raise ValueError(
            "remote intake path must end in /incoming/<target>/ so processed and failed paths can be derived safely"
        )
    handoff_root = PurePosixPath(*parts[:-2])
    target_node = parts[-1]
    processed_dir = str(handoff_root / "processed" / target_node)
    failed_dir = str(handoff_root / "failed" / target_node)
    return processed_dir, failed_dir


def build_lookup_query(
    *,
    filename: str | None,
    sha256: str | None,
    task_id: str | None,
    chain_id: str | None,
) -> dict[str, str]:
    query: dict[str, str] = {}
    if filename:
        query["filename"] = normalize_filename_selector(filename)
    if sha256:
        normalized_sha256 = sha256.strip().lower()
        if not normalized_sha256:
            raise ValueError("sha256 selector must be a non-empty string")
        query["sha256"] = normalized_sha256
    if task_id:
        normalized_task_id = task_id.strip()
        if not normalized_task_id:
            raise ValueError("task-id selector must be a non-empty string")
        query["task_id"] = normalized_task_id
    if chain_id:
        normalized_chain_id = chain_id.strip()
        if not normalized_chain_id:
            raise ValueError("chain-id selector must be a non-empty string")
        query["chain_id"] = normalized_chain_id
    if not query:
        raise ValueError("at least one selector is required: --filename, --sha256, --task-id, or --chain-id")
    return query


def build_remote_lookup_command(target, *, processed_dir: str, failed_dir: str, query: Mapping[str, Any]) -> list[str]:
    # Keep the remote query shell-safe by passing it as base64 instead of raw JSON argv.
    encoded_query = base64.b64encode(
        json.dumps(dict(query), separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    ).decode("ascii")
    return [
        *target.ssh_command_prefix(),
        "python3",
        "-",
        processed_dir,
        failed_dir,
        encoded_query,
    ]


def classify_matches(matches: list[Mapping[str, Any]]) -> tuple[str, Mapping[str, Any] | None]:
    if not matches:
        return "not_found", None
    if len(matches) > 1:
        return "ambiguous_multiple_matches", None
    match = matches[0]
    disposition = match.get("disposition")
    if disposition == "processed":
        return "processed", match
    if disposition == "failed":
        return "failed", match
    return "ambiguous_multiple_matches", None


def parse_remote_matches(stdout: str) -> list[dict[str, Any]]:
    payload = json.loads(stdout)
    if not isinstance(payload, list):
        raise TypeError("remote lookup must return a JSON list")
    for item in payload:
        if not isinstance(item, dict):
            raise TypeError("remote lookup results must be JSON objects")
    return payload


def check_remote_status_dirs(target, *, processed_dir: str, failed_dir: str) -> None:
    SEND_TO_DALI._ensure_command_available("ssh")
    SEND_TO_DALI.run_checked(
        [*target.ssh_command_prefix(), "test", "-d", processed_dir, "-a", "-d", failed_dir],
        action=f"remote status dir check for {processed_dir} and {failed_dir}",
    )


def run_remote_lookup(target, *, processed_dir: str, failed_dir: str, query: Mapping[str, Any]) -> subprocess.CompletedProcess[str]:
    SEND_TO_DALI._ensure_command_available("ssh")
    completed = subprocess.run(
        build_remote_lookup_command(
            target,
            processed_dir=processed_dir,
            failed_dir=failed_dir,
            query=query,
        ),
        input=REMOTE_LOOKUP_SCRIPT,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        stderr = completed.stderr.strip()
        stdout = completed.stdout.strip()
        details = stderr or stdout or f"remote lookup exited with status {completed.returncode}"
        raise RuntimeError(f"remote lookup via {target.ssh_target()} failed: {details}")
    return completed


def print_result(
    *,
    disposition: str,
    query: Mapping[str, Any],
    match: Mapping[str, Any] | None,
    matches: list[Mapping[str, Any]],
) -> None:
    print(f"disposition={disposition}")
    for field_name in ("filename", "sha256", "task_id", "chain_id"):
        if field_name in query:
            print(f"query_{field_name}={query[field_name]}")
    if match is None:
        if disposition == "ambiguous_multiple_matches":
            print(f"match_count={len(matches)}")
            print(f"matched_files={json.dumps([item.get('file_path') for item in matches], ensure_ascii=True)}")
        return
    for field_name in (
        "file_path",
        "receipt_path",
        "reason_code",
        "reason_detail",
        "sha256",
        "task_id",
        "chain_id",
        "parent_task_id",
        "source_role",
        "target_role",
        "hop_count",
        "max_hops",
    ):
        value = match.get(field_name)
        if value is not None:
            print(f"{field_name}={value}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Read-only lookup of Dali handoff disposition from the C_Lawd side.",
    )
    parser.add_argument("--filename", help="Exact envelope or receipt basename to locate.")
    parser.add_argument("--sha256", help="Envelope sha256 to locate.")
    parser.add_argument("--task-id", help="Envelope task_id to locate.")
    parser.add_argument("--chain-id", help="Adapter-local chain_id to locate.")
    parser.add_argument("--remote-host", help="Remote ssh host or alias.")
    parser.add_argument("--remote-user", help="Optional remote ssh username.")
    parser.add_argument("--remote-port", type=int, help="Optional remote ssh port.")
    parser.add_argument("--remote-dir", help="Absolute remote intake directory ending in /incoming/<target>/.")
    parser.add_argument("--remote-path", help=argparse.SUPPRESS)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.remote_dir and args.remote_path:
        parser.error("--remote-dir and --remote-path are mutually exclusive")

    try:
        query = build_lookup_query(
            filename=args.filename,
            sha256=args.sha256,
            task_id=args.task_id,
            chain_id=args.chain_id,
        )
        remote_path = args.remote_dir or args.remote_path
        remote_path_source = "cli --remote-dir" if args.remote_dir else ("cli --remote-path" if args.remote_path else None)
        target = SEND_TO_DALI.resolve_remote_target(
            remote_host=args.remote_host,
            remote_user=args.remote_user,
            remote_port=args.remote_port,
            remote_path=remote_path,
            remote_path_source_override=remote_path_source,
            repo_root=REPO_ROOT,
        )
        processed_dir, failed_dir = derive_remote_status_dirs(target.intake_path)
        check_remote_status_dirs(target, processed_dir=processed_dir, failed_dir=failed_dir)
        completed = run_remote_lookup(
            target,
            processed_dir=processed_dir,
            failed_dir=failed_dir,
            query=query,
        )
        matches = parse_remote_matches(completed.stdout)
        disposition, match = classify_matches(matches)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print_result(disposition=disposition, query=query, match=match, matches=matches)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
