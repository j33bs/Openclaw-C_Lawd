from __future__ import annotations

import importlib.util
import sys
import unittest
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
    def test_resolve_remote_target_uses_discovered_alias_and_default_path(self) -> None:
        with mock.patch.object(SEND_TO_DALI, "discover_default_dali_alias", return_value="dali"):
            target = SEND_TO_DALI.resolve_remote_target(
                remote_host=None,
                remote_user=None,
                remote_path=None,
                repo_root=SCRIPT_PATH.parents[2],
            )
        self.assertEqual(target.host, "dali")
        self.assertEqual(target.intake_path, "handoff/incoming/dali/")
        self.assertIn("discovered ssh alias", target.host_source)
        self.assertEqual(target.scp_target("sample.task-envelope.v0.json"), "dali:handoff/incoming/dali/sample.task-envelope.v0.json")

    def test_resolve_remote_target_prefers_cli_values(self) -> None:
        target = SEND_TO_DALI.resolve_remote_target(
            remote_host="cli-host",
            remote_user="runner",
            remote_path="/srv/handoff/incoming/dali/",
            repo_root=SCRIPT_PATH.parents[2],
        )
        self.assertEqual(target.ssh_target(), "runner@cli-host")
        self.assertEqual(target.intake_path, "/srv/handoff/incoming/dali/")
        self.assertEqual(target.host_source, "cli --remote-host")
        self.assertEqual(target.path_source, "cli --remote-path")

    def test_emit_mode_reuses_existing_emitter_flow(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "emit.task-envelope.v0.json"
            with mock.patch.object(SEND_TO_DALI, "check_remote_intake"), mock.patch.object(
                SEND_TO_DALI, "transfer_envelope", return_value="dali:handoff/incoming/dali/emit.task-envelope.v0.json"
            ), mock.patch.object(SEND_TO_DALI, "discover_default_dali_alias", return_value="dali"):
                exit_code = SEND_TO_DALI.main(
                    [
                        "--emit",
                        "--title",
                        "Emit then send",
                        "--instructions",
                        "Use the existing emitter flow.",
                        "--output-path",
                        str(output_path),
                        "--dry-run",
                    ]
                )
            self.assertEqual(exit_code, 0)
            payload = SEND_TO_DALI.validate_local_envelope_file(output_path)
            self.assertEqual(payload["schema_version"], "v0")

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
                exit_code = SEND_TO_DALI.main(["--file", str(source_path), "--dry-run"])
            self.assertEqual(exit_code, 0)


if __name__ == "__main__":
    unittest.main()
