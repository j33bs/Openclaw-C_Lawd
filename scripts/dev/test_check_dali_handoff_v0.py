from __future__ import annotations

import importlib.util
import io
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

SCRIPT_PATH = Path(__file__).resolve().with_name("check_dali_handoff_v0.py")


def load_script_module():
    spec = importlib.util.spec_from_file_location("check_dali_handoff_v0", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load script module from {SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


CHECK_DALI = load_script_module()


class CheckDaliHandoffV0Tests(unittest.TestCase):
    def test_derive_remote_status_dirs_from_absolute_intake_path(self) -> None:
        processed_dir, failed_dir = CHECK_DALI.derive_remote_status_dirs(
            "/home/jeebs/src/openclaw-dali/handoff/incoming/dali/"
        )
        self.assertEqual(processed_dir, "/home/jeebs/src/openclaw-dali/handoff/processed/dali")
        self.assertEqual(failed_dir, "/home/jeebs/src/openclaw-dali/handoff/failed/dali")

    def test_derive_remote_status_dirs_rejects_relative_path(self) -> None:
        with self.assertRaisesRegex(ValueError, "absolute remote intake path"):
            CHECK_DALI.derive_remote_status_dirs("handoff/incoming/dali/")

    def test_build_lookup_query_requires_selector(self) -> None:
        with self.assertRaisesRegex(ValueError, "at least one selector is required"):
            CHECK_DALI.build_lookup_query(filename=None, sha256=None, task_id=None, chain_id=None)

    def test_build_remote_lookup_command_is_read_only_ssh_probe(self) -> None:
        target = CHECK_DALI.SEND_TO_DALI.RemoteTarget(
            host="dali",
            user="jeebs",
            intake_path="/home/jeebs/src/openclaw-dali/handoff/incoming/dali/",
            host_source="cli --remote-host",
            path_source="cli --remote-dir",
            port=22,
            port_source="cli --remote-port",
        )
        command = CHECK_DALI.build_remote_lookup_command(
            target,
            processed_dir="/home/jeebs/src/openclaw-dali/handoff/processed/dali",
            failed_dir="/home/jeebs/src/openclaw-dali/handoff/failed/dali",
            query={"task_id": "task-123"},
        )
        self.assertEqual(command[0], "ssh")
        self.assertIn("python3", command)
        self.assertIn("-", command)
        self.assertNotIn("scp", command)
        self.assertNotIn("rm", command)

    def test_classify_matches_handles_all_dispositions(self) -> None:
        disposition, match = CHECK_DALI.classify_matches([])
        self.assertEqual(disposition, "not_found")
        self.assertIsNone(match)

        disposition, match = CHECK_DALI.classify_matches([{"disposition": "processed"}])
        self.assertEqual(disposition, "processed")
        self.assertEqual(match, {"disposition": "processed"})

        disposition, match = CHECK_DALI.classify_matches([{"disposition": "failed"}])
        self.assertEqual(disposition, "failed")
        self.assertEqual(match, {"disposition": "failed"})

        disposition, match = CHECK_DALI.classify_matches([{"disposition": "processed"}, {"disposition": "failed"}])
        self.assertEqual(disposition, "ambiguous_multiple_matches")
        self.assertIsNone(match)

    def test_cli_smoke_prints_processed_match(self) -> None:
        target = CHECK_DALI.SEND_TO_DALI.RemoteTarget(
            host="dali",
            user="jeebs",
            intake_path="/home/jeebs/src/openclaw-dali/handoff/incoming/dali/",
            host_source="cli --remote-host",
            path_source="cli --remote-dir",
            port=22,
            port_source="cli --remote-port",
        )
        stdout = io.StringIO()
        with mock.patch.object(CHECK_DALI.SEND_TO_DALI, "resolve_remote_target", return_value=target), mock.patch.object(
            CHECK_DALI, "check_remote_status_dirs"
        ), mock.patch.object(
            CHECK_DALI,
            "run_remote_lookup",
            return_value=mock.Mock(
                stdout='[{"disposition":"processed","file_path":"/tmp/sample.json","receipt_path":"/tmp/sample.receipt.json","reason_code":"processed","sha256":"abc","task_id":"task-123","chain_id":"chain-123"}]'
            ),
        ), redirect_stdout(stdout):
            exit_code = CHECK_DALI.main(["--task-id", "task-123", "--remote-dir", "/home/jeebs/src/openclaw-dali/handoff/incoming/dali/"])
        self.assertEqual(exit_code, 0)
        output = stdout.getvalue()
        self.assertIn("disposition=processed", output)
        self.assertIn("file_path=/tmp/sample.json", output)
        self.assertIn("chain_id=chain-123", output)


if __name__ == "__main__":
    unittest.main()
