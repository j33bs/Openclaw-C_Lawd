from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

SCRIPT_PATH = Path(__file__).resolve().with_name("emit_dali_handoff.py")


def load_script_module():
    spec = importlib.util.spec_from_file_location("emit_dali_handoff", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load script module from {SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


EMIT_DALI_HANDOFF = load_script_module()


class EmitDaliHandoffWorkflowTests(unittest.TestCase):
    def test_resolve_handoff_paths_uses_repo_handoff_layout(self) -> None:
        repo_root = Path("/tmp/clawd-repo")
        outgoing_path, archive_path = EMIT_DALI_HANDOFF.resolve_handoff_paths(
            repo_root=repo_root,
            target_node="dali",
            task_id="task-123",
            created_at="2026-03-18T01:02:03Z",
        )
        expected_name = "2026-03-18T01-02-03Z--task-123.task-envelope.v0.json"
        self.assertEqual(outgoing_path, repo_root / "handoff" / "outgoing" / "dali" / expected_name)
        self.assertEqual(archive_path, repo_root / "handoff" / "archive" / "dali" / expected_name)

    def test_resolve_handoff_paths_supports_explicit_output_dir(self) -> None:
        repo_root = Path("/tmp/clawd-repo")
        output_dir = repo_root / "custom" / "outgoing"
        outgoing_path, archive_path = EMIT_DALI_HANDOFF.resolve_handoff_paths(
            repo_root=repo_root,
            target_node="dali",
            task_id="task-123",
            created_at="2026-03-18T01:02:03Z",
            output_dir=output_dir,
        )
        expected_name = "2026-03-18T01-02-03Z--task-123.task-envelope.v0.json"
        self.assertEqual(outgoing_path, output_dir / expected_name)
        self.assertEqual(archive_path, repo_root / "handoff" / "archive" / "dali" / expected_name)

    def test_emit_dali_handoff_writes_outgoing_and_archive(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            result = EMIT_DALI_HANDOFF.emit_dali_handoff(
                title="Workflow smoke",
                instructions="Write both outgoing and archive copies.",
                requestor="c_lawd",
                target_node="dali",
                extra_payload={"source": "unit-test"},
                task_id="task-emit-123",
                correlation_id="corr-emit-123",
                created_at="2026-03-18T01:02:03Z",
                repo_root=repo_root,
            )
            outgoing_path = result["outgoing_path"]
            archive_path = result["archive_path"]
            self.assertTrue(outgoing_path.exists())
            self.assertTrue(archive_path.exists())
            payload = json.loads(outgoing_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["schema_version"], "v0")
            self.assertNotEqual(payload["schema_version"], "task-envelope.v0")
            self.assertEqual(payload["task_id"], "task-emit-123")
            self.assertEqual(payload["payload"]["title"], "Workflow smoke")
            self.assertEqual(payload["payload"]["instructions"], "Write both outgoing and archive copies.")
            self.assertEqual(payload["payload"]["source"], "unit-test")
            self.assertEqual(result["validation_mode"], "canonical_contract_validation")
            self.assertEqual(result["validation_source"], "interbeing_contract.submit_task_v0")
            self.assertNotIn("local_dispatch", payload["payload"])

    def test_emit_dali_handoff_preserves_adapter_local_dispatch_payload(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            result = EMIT_DALI_HANDOFF.emit_dali_handoff(
                title="Workflow smoke",
                instructions="Write outgoing with local dispatch metadata.",
                requestor="c_lawd",
                target_node="dali",
                extra_payload={
                    "local_dispatch": {
                        "source_role": "planner",
                        "target_role": "executor",
                        "chain_id": "chain-xyz",
                        "task_contract": {
                            "task_class": "executor_work",
                            "acceptance_criteria": ["produce summary"],
                            "worker_limit": 1,
                        },
                    }
                },
                task_id="task-emit-local-dispatch",
                correlation_id="corr-emit-local-dispatch",
                created_at="2026-03-18T01:02:03Z",
                repo_root=repo_root,
            )
            payload = json.loads(result["outgoing_path"].read_text(encoding="utf-8"))
            self.assertEqual(
                payload["payload"]["local_dispatch"],
                {
                    "source_role": "planner",
                    "target_role": "executor",
                    "chain_id": "chain-xyz",
                    "task_contract": {
                        "task_class": "executor_work",
                        "acceptance_criteria": ["produce summary"],
                        "worker_limit": 1,
                    },
                },
            )

    def test_emit_dali_handoff_refuses_overwrite_by_default(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "fixed.json"
            output_path.write_text("{}", encoding="utf-8")
            with self.assertRaises(FileExistsError):
                EMIT_DALI_HANDOFF.emit_dali_handoff(
                    title="Collision",
                    instructions="This should fail without overwrite.",
                    requestor="c_lawd",
                    target_node="dali",
                    output_path=output_path,
                    archive=False,
                    repo_root=Path(temp_dir),
                )

    def test_cli_smoke_writes_handoff_file(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "cli-output.json"
            completed = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_PATH),
                    "--title",
                    "CLI smoke",
                    "--instructions",
                    "Emit one outgoing handoff.",
                    "--requestor",
                    "c_lawd",
                    "--target-node",
                    "dali",
                    "--output-path",
                    str(output_path),
                    "--task-id",
                    "task-cli-123",
                    "--correlation-id",
                    "corr-cli-123",
                    "--no-archive",
                ],
                check=False,
                capture_output=True,
                text=True,
                cwd=SCRIPT_PATH.parents[2],
            )
            if completed.returncode != 0:
                self.fail(completed.stderr or completed.stdout)
            self.assertTrue(output_path.exists())
            payload = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["schema_version"], "v0")
            self.assertEqual(payload["task_id"], "task-cli-123")
            self.assertIn("outgoing_path=", completed.stdout)
            self.assertIn("validation_mode=", completed.stdout)
            self.assertIn("validation_source=", completed.stdout)


if __name__ == "__main__":
    unittest.main()
