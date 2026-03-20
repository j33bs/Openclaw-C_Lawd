#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest import mock

SCRIPT_PATH = Path(__file__).resolve().with_name("emit_v0.py")


def load_script_module():
    spec = importlib.util.spec_from_file_location("interbeing_emit_v0", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load script module from {SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


EMIT_V0 = load_script_module()


SCHEMA = {
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
        "schema_version": {"type": "string", "const": "v0"},
        "operation": {"type": "string", "const": "submit_task"},
        "task_id": {"type": "string"},
        "requestor": {"type": "string"},
        "target_node": {"type": "string"},
        "correlation_id": {"type": "string"},
        "created_at": {"type": "string", "format": "date-time"},
        "payload": {"type": "object"},
    },
}


class EmitInterbeingV0Test(unittest.TestCase):
    def _make_repo_layout(self, root: Path) -> tuple[Path, Path]:
        repo_root = root / "clawd"
        intake_dir = root / "openclaw-dali" / "handoff" / "incoming" / "dali"
        schema_dir = root / "openclaw-interbeing" / "schemas"
        intake_dir.mkdir(parents=True, exist_ok=True)
        schema_dir.mkdir(parents=True, exist_ok=True)
        (schema_dir / "task-envelope.v0.json").write_text(
            json.dumps(SCHEMA, indent=2) + "\n",
            encoding="utf-8",
        )
        return repo_root, intake_dir

    def test_resolve_intake_dir_prefers_new_env_override(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            intake_dir = Path(tmp) / "incoming" / "dali"
            intake_dir.mkdir(parents=True, exist_ok=True)
            with mock.patch.dict(os.environ, {EMIT_V0.DEFAULT_INTAKE_ENV: str(intake_dir)}, clear=False):
                resolved = EMIT_V0.resolve_local_intake_dir(intake_dir=None, repo_root=Path(tmp) / "clawd")
        self.assertEqual(resolved.path, intake_dir.resolve())
        self.assertEqual(resolved.source, EMIT_V0.DEFAULT_INTAKE_ENV)

    def test_resolve_local_intake_dir_returns_none_without_local_lane(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            resolved = EMIT_V0.resolve_local_intake_dir(intake_dir=None, repo_root=Path(tmp) / "clawd")
        self.assertIsNone(resolved)

    def test_emit_interbeing_task_writes_to_sibling_dali_intake(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo_root, intake_dir = self._make_repo_layout(Path(tmp))
            result = EMIT_V0.emit_interbeing_task(
                prompt="Execute the bounded planner child task.",
                title=None,
                requestor="c_lawd",
                target_node="dali",
                task_id="task-demo-001",
                correlation_id="corr-demo-001",
                intake_dir=None,
                schema_path=None,
                payload_json='{"source":"test-suite"}',
                payload_file=None,
                event_type="task.submitted",
                include_local_dispatch=True,
                source_role="planner",
                target_role="executor",
                parent_task_id="task-plan-001",
                chain_id="chain-demo-001",
                hop_count=1,
                max_hops=3,
                task_class="executor_work",
                acceptance_criteria=["produce summary", "cite evidence"],
                review_mode="peer_review",
                worker_limit=2,
                execution_notes="Prefer concise operator-visible output.",
                child_task_id="child-local-001",
                allow_overwrite=False,
                remote_host=None,
                remote_user=None,
                remote_port=None,
                remote_dir=None,
                remote_path=None,
                dry_run=False,
                repo_root=repo_root,
            )

            output_path = Path(result["output_path"])
            self.assertTrue(output_path.exists())
            self.assertEqual(output_path.parent, intake_dir.resolve())
            self.assertEqual(result["validation_mode"], "canonical_schema_validation")

            envelope = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(envelope["task_id"], "task-demo-001")
            self.assertEqual(envelope["payload"]["title"], "task-demo-001")
            self.assertEqual(envelope["payload"]["instructions"], "Execute the bounded planner child task.")
            self.assertEqual(envelope["payload"]["event_type"], "task.submitted")
            self.assertEqual(envelope["payload"]["local_dispatch"]["source_role"], "planner")
            self.assertEqual(envelope["payload"]["local_dispatch"]["target_role"], "executor")
            self.assertEqual(
                envelope["payload"]["local_dispatch"]["task_contract"],
                {
                    "task_class": "executor_work",
                    "acceptance_criteria": ["produce summary", "cite evidence"],
                    "review_mode": "peer_review",
                    "worker_limit": 2,
                    "execution_notes": "Prefer concise operator-visible output.",
                },
            )
            self.assertNotIn("child_task_id", output_path.read_text(encoding="utf-8"))

            evidence_path = Path(result["evidence_path"])
            self.assertTrue(evidence_path.exists())
            evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
            self.assertEqual(evidence["child_task_id"], "child-local-001")
            self.assertEqual(evidence["intake_dir_source"], f"default sibling {EMIT_V0.DEFAULT_DALI_REPO_NAME}")
            self.assertEqual(evidence["schema_path_source"], f"default sibling {EMIT_V0.DEFAULT_INTERBEING_REPO_NAME}")

    def test_emit_interbeing_task_falls_back_to_remote_dali_delivery(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp) / "clawd"
            remote_target = EMIT_V0.SEND_TO_DALI.RemoteTarget(
                host="dali",
                user="jeebs",
                intake_path="/home/jeebs/src/openclaw-dali/handoff/incoming/dali/",
                host_source="process env",
                path_source=str(Path.home() / ".openclaw" / ".env"),
                port=None,
                port_source="ssh-default-or-config",
            )
            with mock.patch.object(EMIT_V0.SEND_TO_DALI, "resolve_remote_target", return_value=remote_target) as mocked_resolve, mock.patch.object(
                EMIT_V0.SEND_TO_DALI, "check_remote_intake"
            ) as mocked_check, mock.patch.object(
                EMIT_V0.SEND_TO_DALI,
                "transfer_envelope",
                side_effect=lambda source_path, *, target, dry_run: target.scp_target(source_path.name),
            ) as mocked_transfer:
                result = EMIT_V0.emit_interbeing_task(
                    prompt="Execute the bounded planner child task.",
                    title=None,
                    requestor="c_lawd",
                    target_node="dali",
                    task_id="task-remote-001",
                    correlation_id="corr-remote-001",
                    intake_dir=None,
                    schema_path=None,
                    payload_json='{"source":"test-suite"}',
                    payload_file=None,
                    event_type="task.submitted",
                    include_local_dispatch=True,
                    source_role="planner",
                    target_role="executor",
                    parent_task_id="task-plan-remote-001",
                    chain_id="chain-remote-001",
                    hop_count=1,
                    max_hops=3,
                    task_class="planner_child",
                    acceptance_criteria=["preserve lineage"],
                    review_mode="peer_review",
                    worker_limit=1,
                    execution_notes="Keep adapter-local task contract metadata.",
                    child_task_id="child-local-remote-001",
                    allow_overwrite=False,
                    remote_host=None,
                    remote_user=None,
                    remote_port=None,
                    remote_dir=None,
                    remote_path=None,
                    dry_run=False,
                    repo_root=repo_root,
                )

            mocked_resolve.assert_called_once()
            mocked_check.assert_called_once_with(remote_target)
            mocked_transfer.assert_called_once()

            output_path = Path(result["output_path"])
            self.assertTrue(output_path.exists())
            self.assertEqual(result["delivery_mode"], "remote_scp")
            self.assertEqual(result["transfer_result"], "success")
            self.assertEqual(result["remote_target"], remote_target.scp_target(output_path.name))
            self.assertEqual(result["remote_host_source"], "process env")
            self.assertIsNone(result["intake_dir"])

            envelope = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(envelope["task_id"], "task-remote-001")
            self.assertEqual(envelope["payload"]["local_dispatch"]["source_role"], "planner")
            self.assertEqual(
                envelope["payload"]["local_dispatch"]["task_contract"],
                {
                    "task_class": "planner_child",
                    "acceptance_criteria": ["preserve lineage"],
                    "review_mode": "peer_review",
                    "worker_limit": 1,
                    "execution_notes": "Keep adapter-local task contract metadata.",
                },
            )
            self.assertNotIn("child_task_id", output_path.read_text(encoding="utf-8"))

            evidence_path = Path(result["evidence_path"])
            evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
            self.assertEqual(evidence["delivery_mode"], "remote_scp")
            self.assertEqual(evidence["child_task_id"], "child-local-remote-001")
            self.assertEqual(evidence["remote_target"], remote_target.scp_target(output_path.name))

    def test_main_rejects_local_dispatch_fields_without_flag(self) -> None:
        stderr = io.StringIO()
        with redirect_stderr(stderr), self.assertRaises(SystemExit) as exc:
            EMIT_V0.main(
                [
                    "--prompt",
                    "Do the thing.",
                    "--source-role",
                    "planner",
                ]
            )
        self.assertEqual(exc.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
