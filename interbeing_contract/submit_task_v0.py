from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping
from uuid import uuid4

DEFAULT_SCHEMA_VERSION = "task-envelope.v0"
DEFAULT_OPERATION = "submit_task"
DEFAULT_FILENAME = "task-envelope.v0.json"
DEFAULT_SCHEMA_ENV_VAR = "OPENCLAW_INTERBEING_TASK_ENVELOPE_SCHEMA"
DEFAULT_ROOT_ENV_VAR = "OPENCLAW_INTERBEING_ROOT"
REQUIRED_STRING_FIELDS = (
    "schema_version",
    "operation",
    "task_id",
    "requestor",
    "target_node",
    "correlation_id",
    "created_at",
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _require_mapping(payload: Mapping[str, Any] | None) -> dict[str, Any]:
    if payload is None:
        return {}
    if not isinstance(payload, Mapping):
        raise TypeError("payload must be a mapping")
    return dict(payload)


def _validate_submit_task_envelope_practical(envelope: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(envelope, Mapping):
        raise TypeError("envelope must be a mapping")

    normalized = dict(envelope)
    for field_name in REQUIRED_STRING_FIELDS:
        value = normalized.get(field_name)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{field_name} must be a non-empty string")

    if normalized.get("operation") != DEFAULT_OPERATION:
        raise ValueError(f"operation must be {DEFAULT_OPERATION!r}")
    if not isinstance(normalized.get("payload"), Mapping):
        raise ValueError("payload must be a mapping")
    return normalized


def _default_schema_candidates() -> tuple[Path, ...]:
    sibling_schema = _repo_root().parent / "openclaw-interbeing" / "schemas" / DEFAULT_FILENAME
    return (
        sibling_schema,
        Path.home() / "src" / "openclaw-interbeing" / "schemas" / DEFAULT_FILENAME,
        Path.home() / "src" / "Openclaw-Interbeing" / "schemas" / DEFAULT_FILENAME,
    )


def resolve_task_envelope_schema_path(schema_path: Path | str | None = None) -> Path | None:
    candidates: list[Path] = []
    if schema_path is not None:
        candidates.append(Path(schema_path))

    env_schema_path = os.getenv(DEFAULT_SCHEMA_ENV_VAR)
    if env_schema_path:
        candidates.append(Path(env_schema_path))

    env_root_path = os.getenv(DEFAULT_ROOT_ENV_VAR)
    if env_root_path:
        candidates.append(Path(env_root_path) / "schemas" / DEFAULT_FILENAME)

    candidates.extend(_default_schema_candidates())

    seen: set[str] = set()
    for candidate in candidates:
        key = str(candidate)
        if key in seen:
            continue
        seen.add(key)
        if candidate.exists():
            return candidate.resolve()
    return None


def _load_task_envelope_schema(schema_path: Path | str | None = None) -> dict[str, Any] | None:
    resolved = resolve_task_envelope_schema_path(schema_path)
    if resolved is None:
        return None
    payload = json.loads(resolved.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("task envelope schema must be a JSON object")
    return payload


def _type_matches(value: Any, expected_type: str) -> bool:
    if expected_type == "object":
        return isinstance(value, Mapping)
    if expected_type == "array":
        return isinstance(value, list)
    if expected_type == "string":
        return isinstance(value, str)
    if expected_type == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected_type == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected_type == "boolean":
        return isinstance(value, bool)
    if expected_type == "null":
        return value is None
    return True


def _validate_string_format(value: str, schema: Mapping[str, Any], field_path: str) -> None:
    if schema.get("format") != "date-time":
        return
    try:
        datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{field_path} must be a valid date-time string") from exc


def _validate_against_schema(instance: Any, schema: Mapping[str, Any], field_path: str = "$") -> None:
    if not isinstance(schema, Mapping):
        raise TypeError("schema must be a mapping")

    if "const" in schema and instance != schema["const"]:
        raise ValueError(f"{field_path} must equal {schema['const']!r}")

    if "enum" in schema and instance not in schema["enum"]:
        raise ValueError(f"{field_path} must be one of {schema['enum']!r}")

    schema_type = schema.get("type")
    if isinstance(schema_type, str) and not _type_matches(instance, schema_type):
        raise ValueError(f"{field_path} must be of type {schema_type}")
    if isinstance(schema_type, list) and not any(_type_matches(instance, item) for item in schema_type if isinstance(item, str)):
        raise ValueError(f"{field_path} must match one of the allowed schema types")

    if isinstance(instance, str):
        _validate_string_format(instance, schema, field_path)

    if isinstance(instance, Mapping):
        required = schema.get("required", [])
        if isinstance(required, list):
            for field_name in required:
                if field_name not in instance:
                    raise ValueError(f"{field_path}.{field_name} is required by schema")

        properties = schema.get("properties", {})
        additional = schema.get("additionalProperties", True)
        for field_name, value in instance.items():
            child_path = f"{field_path}.{field_name}"
            if isinstance(properties, Mapping) and field_name in properties:
                _validate_against_schema(value, properties[field_name], child_path)
                continue
            if additional is False:
                raise ValueError(f"{child_path} is not allowed by schema")
            if isinstance(additional, Mapping):
                _validate_against_schema(value, additional, child_path)
        return

    if isinstance(instance, list) and isinstance(schema.get("items"), Mapping):
        for index, value in enumerate(instance):
            _validate_against_schema(value, schema["items"], f"{field_path}[{index}]")


def validate_submit_task_envelope_shape(
    envelope: Mapping[str, Any],
    *,
    schema_path: Path | str | None = None,
) -> dict[str, Any]:
    normalized = _validate_submit_task_envelope_practical(envelope)
    schema = _load_task_envelope_schema(schema_path)
    if schema is not None:
        _validate_against_schema(normalized, schema)
    return normalized


def resolve_submit_task_output_path(
    output_path: Path | str | None = None,
    *,
    handoff_path: Path | str | None = None,
) -> Path:
    if output_path is None and handoff_path is None:
        raise ValueError("output_path or handoff_path is required")
    if output_path is not None and handoff_path is not None:
        if Path(output_path) != Path(handoff_path):
            raise ValueError("output_path and handoff_path must match when both are provided")
        return Path(output_path)

    if output_path is not None:
        return Path(output_path)

    handoff = Path(handoff_path)  # type: ignore[arg-type]
    if handoff.suffix.lower() == ".json":
        return handoff
    return handoff / DEFAULT_FILENAME


def build_submit_task_envelope(
    *,
    requestor: str,
    target_node: str,
    payload: Mapping[str, Any] | None,
    task_id: str | None = None,
    correlation_id: str | None = None,
    created_at: str | None = None,
    schema_version: str = DEFAULT_SCHEMA_VERSION,
    schema_path: Path | str | None = None,
) -> dict[str, Any]:
    task_identifier = str(task_id or uuid4())
    correlation_identifier = str(correlation_id or task_identifier)
    envelope = {
        "schema_version": str(schema_version),
        "operation": DEFAULT_OPERATION,
        "task_id": task_identifier,
        "requestor": str(requestor),
        "target_node": str(target_node),
        "correlation_id": correlation_identifier,
        "created_at": str(created_at or _utc_now()),
        "payload": _require_mapping(payload),
    }
    return validate_submit_task_envelope_shape(envelope, schema_path=schema_path)


def write_submit_task_envelope(
    envelope: Mapping[str, Any],
    output_path: Path | str | None = None,
    *,
    handoff_path: Path | str | None = None,
    schema_path: Path | str | None = None,
) -> Path:
    normalized = validate_submit_task_envelope_shape(envelope, schema_path=schema_path)
    path = resolve_submit_task_output_path(output_path, handoff_path=handoff_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(normalized, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    return path


def build_submit_task_envelope_file(
    *,
    output_path: Path | str | None = None,
    handoff_path: Path | str | None = None,
    requestor: str,
    target_node: str,
    payload: Mapping[str, Any] | None,
    task_id: str | None = None,
    correlation_id: str | None = None,
    created_at: str | None = None,
    schema_version: str = DEFAULT_SCHEMA_VERSION,
    schema_path: Path | str | None = None,
) -> Path:
    envelope = build_submit_task_envelope(
        requestor=requestor,
        target_node=target_node,
        payload=payload,
        task_id=task_id,
        correlation_id=correlation_id,
        created_at=created_at,
        schema_version=schema_version,
        schema_path=schema_path,
    )
    return write_submit_task_envelope(
        envelope,
        output_path=output_path,
        handoff_path=handoff_path,
        schema_path=schema_path,
    )
