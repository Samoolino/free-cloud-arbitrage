import importlib.util
import os
import unittest
from pathlib import Path
from unittest import mock

MODULE_PATH = Path(__file__).resolve().parents[1] / "python_worker" / "worker.py"
SPEC = importlib.util.spec_from_file_location("worker_module", MODULE_PATH)
worker = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(worker)


class WorkerResilienceTests(unittest.TestCase):
    def test_main_retries_on_failure_when_not_once(self) -> None:
        def stop_after_first_sleep(*_args, **_kwargs):
            worker.should_run = False
            return None

        with mock.patch.object(worker, "parse_args", return_value=type("Args", (), {"once": False})()), \
             mock.patch.object(worker, "fetch_lovable_signals", side_effect=[RuntimeError("boom"), []]), \
             mock.patch.object(worker.time, "sleep", side_effect=stop_after_first_sleep) as sleep_mock, \
             mock.patch.object(worker, "get_exchange_id", return_value="binance"):
            worker.main()

        self.assertGreaterEqual(sleep_mock.call_count, 1)


if __name__ == "__main__":
    unittest.main()
