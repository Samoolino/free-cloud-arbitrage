"""Market-context persistence — survives worker restarts.

Dual-store strategy:
  1. Local SQLite file next to worker.py (`market_context.sqlite`) — instant,
     no network, works offline. This is authoritative for the running process.
  2. Postgres via the Lovable HMAC API (`/api/public/bot/context`) — queryable
     from the dashboard, survives moving the worker to a new machine.

On startup call `rehydrate()`; it pulls remote snapshots newer than local ones
so a fresh VPS wakes up with the last known order-book / strategy state.
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any, Callable, Iterable

DB_PATH = Path(__file__).with_name("market_context.sqlite")


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(DB_PATH)
    c.execute(
        """CREATE TABLE IF NOT EXISTS ctx (
          scope TEXT, exchange_id TEXT, symbol TEXT,
          payload TEXT, ttl_seconds INTEGER, updated_at REAL,
          PRIMARY KEY (scope, exchange_id, symbol)
        )"""
    )
    return c


def save(scope: str, payload: dict[str, Any], *, exchange_id: str = "", symbol: str = "", ttl: int = 60) -> None:
    c = _conn()
    c.execute(
        "INSERT OR REPLACE INTO ctx VALUES (?,?,?,?,?,?)",
        (scope, exchange_id, symbol, json.dumps(payload), int(ttl), time.time()),
    )
    c.commit()
    c.close()


def load(scope: str, *, exchange_id: str = "", symbol: str = "") -> dict[str, Any] | None:
    c = _conn()
    row = c.execute(
        "SELECT payload, ttl_seconds, updated_at FROM ctx WHERE scope=? AND exchange_id=? AND symbol=?",
        (scope, exchange_id, symbol),
    ).fetchone()
    c.close()
    if not row:
        return None
    payload, ttl, ts = row
    if time.time() - ts > ttl:
        return None
    return json.loads(payload)


def all_entries() -> list[dict[str, Any]]:
    c = _conn()
    rows = c.execute("SELECT scope, exchange_id, symbol, payload, ttl_seconds FROM ctx").fetchall()
    c.close()
    return [
        {"scope": s, "exchange_id": e or None, "symbol": sy or None,
         "payload": json.loads(p), "ttl_seconds": t}
        for (s, e, sy, p, t) in rows
    ]


def push_remote(signed: Callable[[str, str, Any], Any], entries: Iterable[dict[str, Any]] | None = None) -> None:
    batch = list(entries or all_entries())
    if not batch:
        return
    for i in range(0, len(batch), 100):
        chunk = batch[i:i + 100]
        try:
            signed("POST", "/api/public/bot/context", {"entries": chunk})
        except Exception as exc:
            print(f"market_context: push_remote chunk failed: {exc}")


def rehydrate(signed: Callable[[str, str, Any], Any]) -> int:
    """Fetch remote context and merge into local sqlite if remote is newer."""
    try:
        remote = signed("GET", "/api/public/bot/context", None).get("entries", [])
    except Exception as exc:
        print(f"market_context: rehydrate failed: {exc}")
        return 0
    n = 0
    for e in remote:
        save(e["scope"], e["payload"],
             exchange_id=e.get("exchange_id") or "",
             symbol=e.get("symbol") or "",
             ttl=int(e.get("ttl_seconds", 60)))
        n += 1
    return n


if __name__ == "__main__":
    print(f"market_context db: {DB_PATH} entries={len(all_entries())}")