from __future__ import annotations

import json
import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from interbeing_contract.submit_task_v0 import (
    CANONICAL_CONTRACT_VALIDATION_MODE,
    CANONICAL_CONTRACT_VALIDATION_SOURCE,
    CANONICAL_SCHEMA_VALIDATION_MODE,
    DEFAULT_OPERATION,
    DEFAULT_SCHEMA_ENV_VAR,
    DEFAULT_ROOT_ENV_VAR,
    DEFAULT_SCHEMA_VERSION,
    build_submit_task_envelope,
    build_submit_task_envelope_file,
    resolve_submit_task_validation_provenance,
    resolve_task_envelope_schema_path,
    validate_submit_task_envelope_shape,
)


class SubmitTaskEnvelopeV0Tests(unittest.TestCase):
    def test_default_schema_version_is_canonical_v0(self) -> None:
        self.assertEqual(DEFAULT_SCHEMA_VERSION, "v0")
        self.assertNotEqual(DEFAULT_SCHEMA_VERSION, "task-envelope.v0")

    def test_resolve_task_envelope_schema_path_uses_expected_precedence(self) -> None:
        with TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            explicit_schema = temp_root / "explicit-task-envelope.v0.json"
            env_schema = temp_root / "env-task-envelope.v0.json"
            env_root = temp_root / "interbeing-root"
            env_root_schema = env_root / "schemas" / "task-envelope.v0.json"
            for schema_path in (explicit_schema, env_schema, env_root_schema):
                schema_path.parent.mkdir(parents=True, exist_ok=True)
                schema_path.write_text("{}", encoding="utf-8")

            env = {
                DEFAULT_SCHEMA_ENV_VAR: str(env_schema),
                DEFAULT_ROOT_ENV_VAR: str(env_root),
            }
            with mock.patch.dict(os.environ, env, clear=False):
                self.assertEqual(resolve_task_envelope_schema_path(explicit_schema), explicit_schema.resolve())
                self.assertEqual(resolve_task_envelope_schema_path(), env_schema.resolve())

            with mock.patch.dict(os.environ, {DEFAULT_ROOT_ENV_VAR: str(env_root)}, clear=False):
                with mock.patch.dict(os.environ, {DEFAULT_SCHEMA_ENV_VAR: ""}, clear=False):
                    self.assertEqual(resolve_task_envelope_schema_path(), env_root_schema.resolve())

    def test_build_submit_task_envelope_uses_schema_file_when_available(self) -> None:
        with TemporaryDirectory() as temp_dir:
            schema_path = Path(temp_dir) / "task-envelope.v0.json"
            schema_path.write_text(
                json.dumps(
                    {
                        "type": "object",
                        "required": [
                            "schema_version",
                            "operation",
                            "task_id",
                            "requestor",
                            "target_node",
                            "correlation_id",
                            "created_at",
                            "payload",
                        ],
                        "properties": {
                            "schema_version": {"const": DEFAULT_SCHEMA_VERSION},
                            "operation": {"const": DEFAULT_OPERATION},
                            "task_id": {"type": "string"},
                            "requestor": {"type": "string"},
                            "target_node": {"type": "string"},
                            "correlation_id": {"type": "string"},
                            "created_at": {"type": "string", "format": "date-time"},
                            "payload": {"type": "object"},
                        },
                    },
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )

            self.assertEqual(resolve_task_envelope_schema_path(schema_path), schema_path.resolve())
            envelope = build_submit_task_envelope(
                requestor="c_lawd",
                target_node="dali",
                task_id="task-schema-123",
                correlation_id="corr-schema-123",
                created_at="2026-03-18T00:00:00Z",
                payload={"intent": "delegate"},
                schema_path=schema_path,
            )
            provenance = resolve_submit_task_validation_provenance(schema_path)
            self.assertEqual(provenance.mode, CANONICAL_SCHEMA_VALIDATION_MODE)
            self.assertEqual(provenance.source, str(schema_path.resolve()))
            self.assertEqual(validate_submit_task_envelope_shape(envelope, schema_path=schema_path), envelope)

    def test_validation_provenance_defaults_to_in_repo_contract_validation(self) -> None:
        provenance = resolve_submit_task_validation_provenance()
        self.assertEqual(provenance.mode, CANONICAL_CONTRACT_VALIDATION_MODE)
        self.assertEqual(provenance.source, CANONICAL_CONTRACT_VALIDATION_SOURCE)
        self.assertIsNone(provenance.schema_path)

    def test_build_submit_task_envelope_has_required_v0_shape(self) -> None:
        envelope = build_submit_task_envelope(
            requestor="c_lawd",
            target_node="dali",
            task_id="task-123",
            correlation_id="corr-123",
            created_at="2026-03-18T00:00:00Z",
            payload={
                "intent": "delegate",
                "title": "Summarize research thread",
                "instructions": "Synthesize the attached notes.",
            },
        )

        self.assertEqual(envelope["schema_version"], DEFAULT_SCHEMA_VERSION)
        self.assertEqual(envelope["schema_version"], "v0")
        self.assertNotEqual(envelope["schema_version"], "task-envelope.v0")
        self.assertEqual(envelope["operation"], DEFAULT_OPERATION)
        self.assertEqual(envelope["requestor"], "c_lawd")
        self.assertEqual(envelope["target_node"], "dali")
        self.assertEqual(envelope["task_id"], "task-123")
        self.assertEqual(envelope["correlation_id"], "corr-123")
        self.assertEqual(envelope["created_at"], "2026-03-18T00:00:00Z")
        self.assertEqual(envelope["payload"]["intent"], "delegate")
        self.assertEqual(validate_submit_task_envelope_shape(envelope), envelope)

    def test_build_submit_task_envelope_file_supports_handoff_path(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "handoff"
            written = build_submit_task_envelope_file(
                handoff_path=output_dir,
                requestor="c_lawd",
                target_node="dali",
                task_id="task-456",
                correlation_id="corr-456",
                created_at="2026-03-18T01:02:03Z",
                payload={"intent": "delegate", "title": "Check status"},
            )
            self.assertEqual(written, output_dir / "task-envelope.v0.json")
            payload = json.loads(written.read_text(encoding="utf-8"))
            self.assertEqual(payload["schema_version"], "v0")
            self.assertEqual(payload["task_id"], "task-456")
            self.assertEqual(payload["correlation_id"], "corr-456")
            self.assertEqual(validate_submit_task_envelope_shape(payload), payload)

    def test_legacy_task_envelope_schema_version_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "schema_version must be 'v0'"):
            build_submit_task_envelope(
                requestor="c_lawd",
                target_node="dali",
                task_id="task-legacy-123",
                correlation_id="corr-legacy-123",
                created_at="2026-03-18T00:00:00Z",
                schema_version="task-envelope.v0",
                payload={"intent": "delegate"},
            )

    def test_validate_submit_task_envelope_uses_contract_validation_when_schema_missing(self) -> None:
        missing_schema = Path("/tmp/nonexistent-task-envelope.v0.json")
        envelope = build_submit_task_envelope(
            requestor="c_lawd",
            target_node="dali",
            task_id="task-fallback-123",
            correlation_id="corr-fallback-123",
            created_at="2026-03-18T00:00:00Z",
            payload={"intent": "delegate"},
            schema_path=missing_schema,
        )
        provenance = resolve_submit_task_validation_provenance(missing_schema)
        self.assertEqual(provenance.mode, CANONICAL_CONTRACT_VALIDATION_MODE)
        self.assertEqual(provenance.source, CANONICAL_CONTRACT_VALIDATION_SOURCE)
        self.assertIsNone(resolve_task_envelope_schema_path(missing_schema))
        self.assertEqual(validate_submit_task_envelope_shape(envelope, schema_path=missing_schema), envelope)


if __name__ == "__main__":
    unittest.main()
