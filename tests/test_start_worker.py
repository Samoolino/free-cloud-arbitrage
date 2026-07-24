import importlib.util
import os
import unittest
from pathlib import Path
from unittest import mock

MODULE_PATH = Path(__file__).resolve().parents[1] / "python_worker" / "start_worker.py"
SPEC = importlib.util.spec_from_file_location("start_worker", MODULE_PATH)
start_worker = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(start_worker)


class StartWorkerTests(unittest.TestCase):
    def test_build_command_uses_service_wrapper(self) -> None:
        with mock.patch.object(start_worker, "resolve_python_executable", return_value="python3"):
            command = start_worker.build_command(["--once"])

        self.assertEqual(command[:2], ["python3", str(start_worker.ROOT / "service_wrapper.py")])
        self.assertEqual(command[2:], ["--once"])

    def test_resolve_python_executable_prefers_env(self) -> None:
        with mock.patch.dict(os.environ, {"PYTHON_EXE": "/tmp/custom-python"}, clear=False):
            self.assertEqual(start_worker.resolve_python_executable(), "/tmp/custom-python")


if __name__ == "__main__":
    unittest.main()
