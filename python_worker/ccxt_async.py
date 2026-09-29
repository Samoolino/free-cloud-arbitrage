"""Compatibility import for CCXT's supported asynchronous client.

`ccxt.pro` is a commercial add-on and is not installed by `pip install ccxt`.
The worker only uses REST methods available in open-source CCXT, so use its
async client consistently across every worker.
"""
from __future__ import annotations

import ccxt.async_support as ccxt


def exchange_class(exchange_id: str):
    exchange_id = exchange_id.lower()
    if exchange_id not in ccxt.exchanges:
        raise ValueError(f"Exchange '{exchange_id}' is not supported by CCXT")
    return getattr(ccxt, exchange_id)
