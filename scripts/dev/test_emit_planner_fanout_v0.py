from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

SCRIPT_PATH = Path(__file__).resolve().with_name("emit_planner_fanout_v0.py")


def load_script_module():
    spec = importlib.util.spec_from_file_location("emit_planner_fanout_v0", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load script module from {SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


FANOUT = load_script_module()


class EmitPlannerFanoutV0Tests(unittest.TestCase):
    def test_load_child_specs_rejects_excess_count(self) -> None:
        with TemporaryDirectory() as temp_dir:
            child_specs_path = Path(temp_dir) / "child-specs.json"
            child_specs_path.write_text(
                json.dumps(
                    [
                        {"title": f"Child {index}", "instructions": "Do work."}
                        for index in range(FANOUT.MAX_CHILDREN + 1)
                    ]
                ),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "safety cap"):
                FANOUT.load_child_specs(child_specs_path, default_target_role="executor")

    def test_load_child_specs_rejects_planner_target(self) -> None:
        with TemporaryDirectory() as temp_dir:
            child_specs_path = Path(temp_dir) / "child-specs.json"
            child_specs_path.write_text(
                json.dumps(
                    [
                        {
                            "title": "Recursive child",
                            "instructions": "Do not spawn another planner.",
                            "target_role": "planner",
                        }
                    ]
                ),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "does not allow planner-target children"):
                FANOUT.load_child_specs(child_specs_path, default_target_role="executor")

    def test_emit_planner_fanout_writes_manifest_and_children(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "outgoing"
            manifest_path = Path(temp_dir) / "planner-manifest.v0.json"
            child_specs = [
                {
                    "title": "Executor child",
                    "instructions": "Produce a concise summary.",
                    "task_id": "task-child-001",
                    "task_class": "executor_work",
                    "acceptance_criteria": ["produce summary", "cite evidence"],
                    "review_mode": "peer_review",
                    "worker_limit": 2,
                    "execution_notes": "Prefer concise output.",
                },
                {
                    "title": "Reviewer child",
                    "instructions": "Review the summary.",
                    "task_id": "task-child-002",
                    "target_role": "reviewer",
                },
            ]
            result = FANOUT.emit_planner_fanout(
                parent_task_id="task-parent-001",
                chain_id="chain-001",
                child_specs=child_specs,
                requestor="c_lawd",
                target_node="dali",
                default_target_role="executor",
                hop_count=1,
                max_hops=3,
                output_dir=output_dir,
                manifest_path=manifest_path,
                schema_path=None,
                allow_overwrite=False,
                send=False,
                dry_run=True,
                remote_host=None,
                remote_user=None,
                remote_port=None,
                remote_dir=None,
            )

            self.assertEqual(result["manifest"]["send_mode"], "local-only")
            self.assertEqual(result["manifest"]["validation_mode"], "canonical_contract_validation")
            self.assertEqual(result["manifest"]["validation_source"], "interbeing_contract.submit_task_v0")
            self.assertEqual(result["manifest"]["child_count"], 2)
            self.assertTrue(manifest_path.exists())

            first_child = result["manifest"]["children"][0]
            first_envelope = FANOUT.SEND_TO_DALI.validate_local_envelope_file(Path(first_child["output_path"]))
            self.assertEqual(
                first_envelope["payload"]["local_dispatch"],
                {
                    "target_role": "executor",
                    "source_role": "planner",
                    "chain_id": "chain-001",
                    "parent_task_id": "task-parent-001",
                    "hop_count": 1,
                    "max_hops": 3,
                    "task_contract": {
                        "task_class": "executor_work",
                        "acceptance_criteria": ["produce summary", "cite evidence"],
                        "review_mode": "peer_review",
                        "worker_limit": 2,
                        "execution_notes": "Prefer concise output.",
                    },
                },
            )

            second_child = result["manifest"]["children"][1]
            second_envelope = FANOUT.SEND_TO_DALI.validate_local_envelope_file(Path(second_child["output_path"]))
            self.assertEqual(second_envelope["payload"]["local_dispatch"]["target_role"], "reviewer")
            self.assertIn("sha256", first_child)
            self.assertIn("sha256", second_child)

    def test_emit_planner_fanout_send_dry_run_reuses_existing_send_path(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "outgoing"
            manifest_path = Path(temp_dir) / "planner-manifest.v0.json"
            target = FANOUT.SEND_TO_DALI.RemoteTarget(
                host="dali",
                user="jeebs",
                intake_path="/home/jeebs/src/openclaw-dali/handoff/incoming/dali/",
                host_source="cli --remote-host",
                path_source="cli --remote-dir",
                port=22,
                port_source="cli --remote-port",
            )
            with mock.patch.object(FANOUT.SEND_TO_DALI, "resolve_remote_target", return_value=target), mock.patch.object(
                FANOUT.SEND_TO_DALI, "check_remote_intake"
            ) as mocked_check_remote_intake, mock.patch.object(
                FANOUT.SEND_TO_DALI,
                "transfer_envelope",
                side_effect=lambda source_path, *, target, dry_run: target.scp_target(source_path.name),
            ) as mocked_transfer:
                result = FANOUT.emit_planner_fanout(
                    parent_task_id="task-parent-001",
                    chain_id="chain-001",
                    child_specs=[
                        {
                            "title": "Executor child",
                            "instructions": "Produce a concise summary.",
                            "task_id": "task-child-003",
                        }
                    ],
                    requestor="c_lawd",
                    target_node="dali",
                    default_target_role="executor",
                    hop_count=1,
                    max_hops=3,
                    output_dir=output_dir,
                    manifest_path=manifest_path,
                    schema_path=None,
                    allow_overwrite=False,
                    send=True,
                    dry_run=True,
                    remote_host="dali",
                    remote_user="jeebs",
                    remote_port=22,
                    remote_dir="/home/jeebs/src/openclaw-dali/handoff/incoming/dali/",
                )

            mocked_check_remote_intake.assert_called_once_with(target)
            self.assertEqual(mocked_transfer.call_args.kwargs["dry_run"], True)
            self.assertEqual(result["manifest"]["send_mode"], "dry-run")
            self.assertEqual(result["manifest"]["validation_mode"], "canonical_contract_validation")
            self.assertIn("remote_target", result["manifest"]["children"][0])

    def test_emit_planner_fanout_rejects_hop_overflow(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "outgoing"
            manifest_path = Path(temp_dir) / "planner-manifest.v0.json"
            with self.assertRaisesRegex(ValueError, "hop count cannot exceed max hops"):
                FANOUT.emit_planner_fanout(
                    parent_task_id="task-parent-001",
                    chain_id="chain-001",
                    child_specs=[
                        {
                            "title": "Executor child",
                            "instructions": "Produce a concise summary.",
                            "task_id": "task-child-004",
                        }
                    ],
                    requestor="c_lawd",
                    target_node="dali",
                    default_target_role="executor",
                    hop_count=3,
                    max_hops=2,
                    output_dir=output_dir,
                    manifest_path=manifest_path,
                    schema_path=None,
                    allow_overwrite=False,
                    send=False,
                    dry_run=True,
                    remote_host=None,
                    remote_user=None,
                    remote_port=None,
                    remote_dir=None,
                )


if __name__ == "__main__":
    unittest.main()
