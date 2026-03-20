from __future__ import annotations

import importlib.util
import io
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from interbeing_contract.submit_task_v0 import build_submit_task_envelope_file

SCRIPT_PATH = Path(__file__).resolve().with_name("send_to_dali_v0.py")


def load_script_module():
    spec = importlib.util.spec_from_file_location("send_to_dali_v0", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load script module from {SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


SEND_TO_DALI = load_script_module()


class SendToDaliV0Tests(unittest.TestCase):
    def test_build_local_dispatch_metadata_rejects_zero_max_hops(self) -> None:
        with self.assertRaisesRegex(ValueError, "max hops must be greater than or equal to 1"):
            SEND_TO_DALI.build_local_dispatch_metadata(
                target_role="executor",
                source_role="planner",
                chain_id="chain-123",
                parent_task_id="parent-123",
                hop_count=0,
                max_hops=0,
                task_class=None,
                acceptance_criteria=None,
                review_mode=None,
                worker_limit=None,
                execution_notes=None,
            )

    def test_build_local_dispatch_metadata_rejects_hop_overflow(self) -> None:
        with self.assertRaisesRegex(ValueError, "hop count cannot exceed max hops"):
            SEND_TO_DALI.build_local_dispatch_metadata(
                target_role="executor",
                source_role="planner",
                chain_id="chain-123",
                parent_task_id="parent-123",
                hop_count=3,
                max_hops=2,
                task_class=None,
                acceptance_criteria=None,
                review_mode=None,
                worker_limit=None,
                execution_notes=None,
            )

    def test_emit_local_envelope_rejects_task_contract_conflict_with_payload(self) -> None:
        with TemporaryDirectory() as temp_dir:
            with self.assertRaisesRegex(ValueError, "task_class conflict"):
                SEND_TO_DALI.emit_local_envelope(
                    title="Conflict",
                    instructions="This should fail.",
                    requestor="c_lawd",
                    target_node="dali",
                    event_type=None,
                    target_role=None,
                    source_role=None,
                    chain_id=None,
                    parent_task_id=None,
                    hop_count=None,
                    max_hops=None,
                    task_class="executor_work",
                    acceptance_criteria=None,
                    review_mode=None,
                    worker_limit=None,
                    execution_notes=None,
                    payload_json='{"local_dispatch":{"task_contract":{"task_class":"review_work"}}}',
                    payload_file=None,
                    task_id="task-conflict-001",
                    correlation_id="corr-conflict-001",
                    output_path=None,
                    output_dir=str(Path(temp_dir)),
                    schema_path=None,
                    allow_overwrite=False,
                    archive=False,
                    repo_root=SCRIPT_PATH.parents[2],
                )

    def test_resolve_remote_target_uses_discovered_alias_and_default_path(self) -> None:
        with mock.patch.object(SEND_TO_DALI, "_first_config_value", return_value=(None, None)), mock.patch.object(
            SEND_TO_DALI, "discover_default_dali_alias", return_value="dali"
        ):
            target = SEND_TO_DALI.resolve_remote_target(
                remote_host=None,
                remote_user=None,
                remote_port=None,
                remote_path=None,
                remote_path_source_override=None,
                repo_root=SCRIPT_PATH.parents[2],
            )
        self.assertEqual(target.host, "dali")
        self.assertEqual(target.intake_path, "handoff/incoming/dali/")
        self.assertIn("discovered ssh alias", target.host_source)
        self.assertEqual(target.scp_target("sample.task-envelope.v0.json"), "dali:handoff/incoming/dali/sample.task-envelope.v0.json")
        self.assertIsNone(target.port)
        self.assertEqual(target.port_source, "ssh-default-or-config")

    def test_resolve_remote_target_prefers_cli_values(self) -> None:
        target = SEND_TO_DALI.resolve_remote_target(
            remote_host="cli-host",
            remote_user="runner",
            remote_port=2200,
            remote_path="/srv/handoff/incoming/dali/",
            remote_path_source_override="cli --remote-dir",
            repo_root=SCRIPT_PATH.parents[2],
        )
        self.assertEqual(target.ssh_target(), "runner@cli-host")
        self.assertEqual(target.intake_path, "/srv/handoff/incoming/dali/")
        self.assertEqual(target.host_source, "cli --remote-host")
        self.assertEqual(target.path_source, "cli --remote-dir")
        self.assertEqual(target.port, 2200)
        self.assertEqual(target.port_source, "cli --remote-port")

    def test_emit_mode_reuses_existing_emitter_flow(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "emit"
            stdout = io.StringIO()
            with mock.patch.object(SEND_TO_DALI, "check_remote_intake"), mock.patch.object(
                SEND_TO_DALI, "transfer_envelope", return_value="dali:handoff/incoming/dali/emit.task-envelope.v0.json"
            ), mock.patch.object(SEND_TO_DALI, "discover_default_dali_alias", return_value="dali"), redirect_stdout(stdout):
                exit_code = SEND_TO_DALI.main(
                    [
                        "--emit",
                        "--title",
                        "Emit then send",
                        "--instructions",
                        "Use the existing emitter flow.",
                        "--event-type",
                        "task.submitted",
                        "--source-role",
                        "planner",
                        "--target-role",
                        "executor",
                        "--chain-id",
                        "chain-123",
                        "--parent-task-id",
                        "parent-456",
                        "--hop-count",
                        "1",
                        "--max-hops",
                        "4",
                        "--output-dir",
                        str(output_dir),
                        "--dry-run",
                    ]
                )
            self.assertEqual(exit_code, 0)
            created_files = list(output_dir.glob("*.task-envelope.v0.json"))
            self.assertEqual(len(created_files), 1)
            payload = SEND_TO_DALI.validate_local_envelope_file(created_files[0])
            self.assertEqual(payload["schema_version"], "v0")
            self.assertEqual(payload["payload"]["event_type"], "task.submitted")
            self.assertEqual(
                payload["payload"]["local_dispatch"],
                {
                    "source_role": "planner",
                    "target_role": "executor",
                    "chain_id": "chain-123",
                    "parent_task_id": "parent-456",
                    "hop_count": 1,
                    "max_hops": 4,
                },
            )
            output = stdout.getvalue()
            self.assertIn("sha256=", output)
            self.assertIn("validation_mode=canonical_contract_validation", output)
            self.assertIn("validation_source=interbeing_contract.submit_task_v0", output)
            self.assertIn("source_role=planner", output)
            self.assertIn("target_role=executor", output)
            self.assertIn("chain_id=chain-123", output)
            self.assertIn("parent_task_id=parent-456", output)
            self.assertIn("hop_count=1", output)
            self.assertIn("max_hops=4", output)

    def test_emit_mode_includes_concrete_task_contract_fields(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "emit-contract"
            stdout = io.StringIO()
            with mock.patch.object(SEND_TO_DALI, "check_remote_intake"), mock.patch.object(
                SEND_TO_DALI, "transfer_envelope", return_value="dali:handoff/incoming/dali/emit-contract.task-envelope.v0.json"
            ), mock.patch.object(SEND_TO_DALI, "discover_default_dali_alias", return_value="dali"), redirect_stdout(stdout):
                exit_code = SEND_TO_DALI.main(
                    [
                        "--emit",
                        "--title",
                        "Concrete contract",
                        "--instructions",
                        "Emit a contract-rich handoff.",
                        "--task-class",
                        "executor_work",
                        "--acceptance-criterion",
                        "produce summary",
                        "--acceptance-criterion",
                        "cite evidence",
                        "--review-mode",
                        "peer_review",
                        "--worker-limit",
                        "2",
                        "--execution-notes",
                        "Prefer concise operator-visible output.",
                        "--output-dir",
                        str(output_dir),
                        "--dry-run",
                    ]
                )
            self.assertEqual(exit_code, 0)
            created_files = list(output_dir.glob("*.task-envelope.v0.json"))
            self.assertEqual(len(created_files), 1)
            payload = SEND_TO_DALI.validate_local_envelope_file(created_files[0])
            self.assertEqual(
                payload["payload"]["local_dispatch"]["task_contract"],
                {
                    "task_class": "executor_work",
                    "acceptance_criteria": ["produce summary", "cite evidence"],
                    "review_mode": "peer_review",
                    "worker_limit": 2,
                    "execution_notes": "Prefer concise operator-visible output.",
                },
            )
            output = stdout.getvalue()
            self.assertIn("task_class=executor_work", output)
            self.assertIn('acceptance_criteria_json=["produce summary", "cite evidence"]', output)
            self.assertIn("review_mode=peer_review", output)
            self.assertIn("worker_limit=2", output)
            self.assertIn("execution_notes=Prefer concise operator-visible output.", output)

    def test_validate_local_envelope_file_rejects_missing_path(self) -> None:
        missing = Path("/tmp/nonexistent-send-to-dali-v0.task-envelope.v0.json")
        with self.assertRaisesRegex(FileNotFoundError, "missing local envelope file"):
            SEND_TO_DALI.validate_local_envelope_file(missing)

    def test_file_mode_dry_run_checks_existing_envelope(self) -> None:
        with TemporaryDirectory() as temp_dir:
            source_path = Path(temp_dir) / "existing.task-envelope.v0.json"
            build_submit_task_envelope_file(
                output_path=source_path,
                requestor="c_lawd",
                target_node="dali",
                task_id="task-file-123",
                correlation_id="corr-file-123",
                created_at="2026-03-19T00:00:00Z",
                payload={"intent": "delegate", "title": "File mode", "instructions": "Send existing envelope."},
            )
            with mock.patch.object(SEND_TO_DALI, "check_remote_intake"), mock.patch.object(
                SEND_TO_DALI, "transfer_envelope", return_value=f"dali:handoff/incoming/dali/{source_path.name}"
            ), mock.patch.object(SEND_TO_DALI, "discover_default_dali_alias", return_value="dali"):
                stdout = io.StringIO()
                with redirect_stdout(stdout):
                    exit_code = SEND_TO_DALI.main(["--file", str(source_path), "--dry-run"])
            self.assertEqual(exit_code, 0)
            output = stdout.getvalue()
            self.assertIn("validation_mode=canonical_contract_validation", output)
            self.assertIn("validation_source=interbeing_contract.submit_task_v0", output)

    def test_check_remote_intake_uses_explicit_remote_port(self) -> None:
        target = SEND_TO_DALI.RemoteTarget(
            host="cli-host",
            user="runner",
            intake_path="/srv/handoff/incoming/dali/",
            host_source="cli --remote-host",
            path_source="cli --remote-dir",
            port=2200,
            port_source="cli --remote-port",
        )
        with mock.patch.object(SEND_TO_DALI, "_ensure_command_available"), mock.patch.object(
            SEND_TO_DALI, "run_checked"
        ) as mocked_run_checked:
            SEND_TO_DALI.check_remote_intake(target)
        command = mocked_run_checked.call_args.kwargs.get("command") or mocked_run_checked.call_args.args[0]
        self.assertIn("-p", command)
        self.assertIn("2200", command)
        self.assertIn("runner@cli-host", command)

    def test_transfer_envelope_uses_explicit_remote_port(self) -> None:
        target = SEND_TO_DALI.RemoteTarget(
            host="cli-host",
            user="runner",
            intake_path="/srv/handoff/incoming/dali/",
            host_source="cli --remote-host",
            path_source="cli --remote-dir",
            port=2200,
            port_source="cli --remote-port",
        )
        with TemporaryDirectory() as temp_dir:
            source_path = Path(temp_dir) / "existing.task-envelope.v0.json"
            source_path.write_text("{}", encoding="utf-8")
            with mock.patch.object(SEND_TO_DALI, "_ensure_command_available"), mock.patch.object(
                SEND_TO_DALI, "run_checked"
            ) as mocked_run_checked:
                remote_target = SEND_TO_DALI.transfer_envelope(source_path, target=target, dry_run=False)
        command = mocked_run_checked.call_args.kwargs.get("command") or mocked_run_checked.call_args.args[0]
        self.assertIn("-P", command)
        self.assertIn("2200", command)
        self.assertEqual(remote_target, f"runner@cli-host:/srv/handoff/incoming/dali/{source_path.name}")

    def test_file_mode_rejects_emit_only_adapter_fields(self) -> None:
        stderr = io.StringIO()
        with redirect_stderr(stderr), self.assertRaises(SystemExit) as exc:
            SEND_TO_DALI.main(
                [
                    "--file",
                    "/tmp/example.task-envelope.v0.json",
                    "--task-class",
                    "executor_work",
                ]
            )
        self.assertNotEqual(exc.exception.code, 0)


if __name__ == "__main__":
    unittest.main()
