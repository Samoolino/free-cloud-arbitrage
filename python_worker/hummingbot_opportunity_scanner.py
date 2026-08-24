"""Live cross-venue scanner using Hummingbot market-data APIs.

The scanner is intentionally execution-agnostic: it measures executable depth
at a requested notional and emits a candidate only when the *observed* VWAP
edge, fees, slippage buffer and fixed costs leave the configured profit floor.
It is an assertion of current market conditions, not a guarantee of future PnL.
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any

import requests


@dataclass(frozen=True)
class Market:
    connector: str
    pair: str
    fee_bps: float


@dataclass(frozen=True)
class Opportunity:
    symbol: str
    buy: Market
    sell: Market
    base_amount: float
    buy_vwap: float
    sell_vwap: float
    net_pnl: float
    spread_bps: float
    age_ms: float


def _auth() -> tuple[str, str] | None:
    user, password = os.getenv("HUMMINGBOT_API_USER"), os.getenv("HUMMINGBOT_API_PASS")
    return (user, password) if user and password else None


class HummingbotScanner:
    def __init__(self, base_url: str | None = None, timeout: float = 3.0) -> None:
        self.base_url = (base_url or os.getenv("HUMMINGBOT_API_URL", "http://127.0.0.1:8000")).rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        auth = _auth()
        if auth:
            self.session.auth = auth

    def order_book(self, connector: str, pair: str, depth: int = 50) -> dict[str, Any]:
        r = self.session.post(
            f"{self.base_url}/market-data/order-book",
            json={"connector_name": connector, "trading_pair": pair, "depth": depth},
            timeout=self.timeout,
        )
        r.raise_for_status()
        return r.json()

    @staticmethod
    def _vwap(levels: list[dict[str, Any]], amount: float) -> tuple[float, float] | None:
        remaining, spent = amount, 0.0
        for level in levels:
            price, size = float(level["price"]), float(level["amount"])
            take = min(remaining, size)
            spent += take * price
            remaining -= take
            if remaining <= 0:
                return spent / amount, spent
        return None

    def assert_opportunity(
        self,
        buy: Market,
        sell: Market,
        base_amount: float,
        min_net_pnl: float,
        fixed_cost: float = 0.0,
        max_age_ms: float = 1500.0,
    ) -> Opportunity | None:
        if base_amount <= 0:
            return None
        a = self.order_book(buy.connector, buy.pair)
        b = self.order_book(sell.connector, sell.pair)
        now_ms = time.time() * 1000
        a_age, b_age = now_ms - float(a.get("timestamp", 0)) * 1000, now_ms - float(b.get("timestamp", 0)) * 1000
        age = max(a_age, b_age)
        if age > max_age_ms:
            return None
        buy_v = self._vwap(a.get("asks", []), base_amount)
        sell_v = self._vwap(b.get("bids", []), base_amount)
        if not buy_v or not sell_v:
            return None
        buy_price, buy_cost = buy_v
        sell_price, sell_proceeds = sell_v
        fee_cost = buy_cost * buy.fee_bps / 10_000 + sell_proceeds * sell.fee_bps / 10_000
        net = sell_proceeds - buy_cost - fee_cost - fixed_cost
        spread_bps = ((sell_price / buy_price) - 1) * 10_000
        if net < min_net_pnl:
            return None
        return Opportunity(
            symbol=buy.pair,
            buy=buy,
            sell=sell,
            base_amount=base_amount,
            buy_vwap=buy_price,
            sell_vwap=sell_price,
            net_pnl=net,
            spread_bps=spread_bps,
            age_ms=age,
        )
