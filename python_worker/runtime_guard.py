from __future__ import annotations

import os
import threading
import time


class RuntimeGuard:
    """Process-local kill switch and heartbeat state.

    Live execution requires ARMED=true and a fresh heartbeat. Restarting the
    process returns it to disarmed state unless explicitly configured otherwise.
    """

    def __init__(self, heartbeat_timeout: float = 30.0):
        self.armed = False
        self.dry_run = os.getenv("NO_LOSS_MODE", "true").lower() != "false"
        self.heartbeat_timeout = heartbeat_timeout
        self.last_heartbeat = time.time()
        self._lock = threading.Lock()

    def heartbeat(self) -> None:
        with self._lock:
            self.last_heartbeat = time.time()

    def arm(self) -> None:
        with self._lock:
            self.armed = True

    def disarm(self) -> None:
        with self._lock:
            self.armed = False

    def set_dry(self) -> None:
        with self._lock:
            self.dry_run = True
            self.armed = False

    def can_execute(self) -> bool:
        with self._lock:
            return self.armed and not self.dry_run and (time.time() - self.last_heartbeat) <= self.heartbeat_timeout

    def status(self) -> str:
        with self._lock:
            age = time.time() - self.last_heartbeat
            return f"ARMED={self.armed} DRY_RUN={self.dry_run} HEARTBEAT_AGE={age:.1f}s EXECUTABLE={self.armed and not self.dry_run and age <= self.heartbeat_timeout}"
