"""Minimal Telegram control plane.

Commands are deliberately small: status, arm/disarm, dry-run, and stop.
The Telegram token is read only from the runtime environment. The chat ID is
allow-listed; commands do not expose API keys, secrets or private keys.
"""
from __future__ import annotations

import os
import threading
import time
from typing import Callable

import requests


class TelegramControl:
    def __init__(self, status_fn: Callable[[], str], arm_fn: Callable[[], None], disarm_fn: Callable[[], None], dry_fn: Callable[[], None], stop_fn: Callable[[], None]):
        self.token = os.getenv("TELEGRAM_BOT_TOKEN", "")
        self.chat_id = os.getenv("TELEGRAM_ALLOWED_CHAT_ID", "")
        self.status_fn = status_fn
        self.arm_fn = arm_fn
        self.disarm_fn = disarm_fn
        self.dry_fn = dry_fn
        self.stop_fn = stop_fn
        self.offset = 0
        self.running = False

    def _send(self, text: str) -> None:
        if not self.token or not self.chat_id:
            return
        requests.post(
            f"https://api.telegram.org/bot{self.token}/sendMessage",
            json={"chat_id": self.chat_id, "text": text}, timeout=10,
        ).raise_for_status()

    def _handle(self, message: dict) -> None:
        chat = str(message.get("chat", {}).get("id", ""))
        if chat != self.chat_id:
            return
        text = str(message.get("text", "")).strip().lower()
        commands = {
            "/status": lambda: self.status_fn(),
            "/arm": lambda: (self.arm_fn(), "ARMED"),
            "/disarm": lambda: (self.disarm_fn(), "DISARMED"),
            "/dry": lambda: (self.dry_fn(), "DRY-RUN ENABLED"),
            "/stop": lambda: (self.stop_fn(), "STOP REQUESTED"),
        }
        if text in commands:
            result = commands[text]()
            if isinstance(result, tuple):
                result = result[-1]
            self._send(str(result))
        elif text == "/help":
            self._send("/status /arm /disarm /dry /stop /help")

    def run_forever(self) -> None:
        if not self.token or not self.chat_id:
            return
        self.running = True
        while self.running:
            try:
                r = requests.get(
                    f"https://api.telegram.org/bot{self.token}/getUpdates",
                    params={"timeout": 25, "offset": self.offset}, timeout=35,
                )
                r.raise_for_status()
                for update in r.json().get("result", []):
                    self.offset = int(update["update_id"]) + 1
                    if update.get("message"):
                        self._handle(update["message"])
            except Exception:
                time.sleep(3)

    def start(self) -> None:
        threading.Thread(target=self.run_forever, daemon=True, name="telegram-control").start()
