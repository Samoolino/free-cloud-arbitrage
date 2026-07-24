import importlib.util
import os
import unittest
from pathlib import Path
from unittest import mock

MODULE_PATH = Path(__file__).resolve().parents[1] / "python_worker" / "service_wrapper.py"
SPEC = importlib.util.spec_from_file_location("service_wrapper", MODULE_PATH)
service_wrapper = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(service_wrapper)


class ServiceWrapperTests(unittest.TestCase):
    def test_resolve_python_executable_prefers_env(self) -> None:
        with mock.patch.dict(os.environ, {"PYTHON_EXE": "/tmp/custom-python"}, clear=False):
            self.assertEqual(service_wrapper.resolve_python_executable(), "/tmp/custom-python")

    def test_build_worker_command_includes_worker_script(self) -> None:
        with mock.patch.object(service_wrapper, "resolve_python_executable", return_value="python3"):
            command = service_wrapper.build_worker_command(["--once"])

        self.assertEqual(command[:2], ["python3", "-u"])
        self.assertEqual(command[2], str(service_wrapper.WORKER))
        self.assertEqual(command[3:], ["--once"])

    def test_parse_args_supports_once_flag(self) -> None:
        with mock.patch("sys.argv", ["service_wrapper.py", "--once"]):
            args = service_wrapper.parse_args()

        self.assertTrue(args.once)


if __name__ == "__main__":
    unittest.main()
