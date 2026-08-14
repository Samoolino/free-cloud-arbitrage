"""Conservative, executable arbitrage calculations.

Market data is considered eligible only while it is fresh and has enough
visible depth. Profit is calculated after exchange fees, estimated slippage,
and a configurable safety buffer. This is a profitability gate, not a promise
that live trading can never lose money.
"""
from __future__ import annotations

from dataclasses import dataclass
from itertools import permutations
from time import time
from typing import Dict, Iterable, List, Optional


@dataclass(frozen=True)
class Quote:
    exchange: str
    symbol: str
    bid: float
    bid_size: float
    ask: float
    ask_size: float
    fee_rate: float
    timestamp_ms: int

    @property
    def age_ms(self) -> int:
        return max(0, int(time() * 1000) - self.timestamp_ms)


@dataclass(frozen=True)
class Opportunity:
    symbol: str
    buy_exchange: str
    sell_exchange: str
    amount: float
    input_usdt: float
    gross_profit_usd: float
    fees_usd: float
    slippage_usd: float
    safety_buffer_usd: float
    expected_profit_usd: float
    expected_profit_pct: float
    max_quote_age_ms: int


class ArbitrageEngine:
    def __init__(self, min_profit_usd: float = 0.05, min_profit_pct: float = 0.10,
                 slippage_bps: float = 5.0, safety_buffer_bps: float = 5.0,
                 max_quote_age_ms: int = 1000) -> None:
        self.min_profit_usd = min_profit_usd
        self.min_profit_pct = min_profit_pct
        self.slippage_bps = slippage_bps
        self.safety_buffer_bps = safety_buffer_bps
        self.max_quote_age_ms = max_quote_age_ms

    def _valid(self, q: Quote) -> bool:
        return (q.bid > 0 and q.ask > 0 and q.bid_size > 0 and q.ask_size > 0
                and q.bid < q.ask and q.age_ms <= self.max_quote_age_ms
                and 0 <= q.fee_rate < 1)

    def two_leg(self, buy: Quote, sell: Quote, input_usdt: float) -> Optional[Opportunity]:
        if not self._valid(buy) or not self._valid(sell):
            return None
        if buy.symbol != sell.symbol or buy.exchange == sell.exchange or buy.ask >= sell.bid:
            return None
        amount = min(input_usdt / buy.ask, buy.ask_size, sell.bid_size)
        if amount <= 0:
            return None
        cost = amount * buy.ask
        proceeds = amount * sell.bid
        buy_fee = cost * buy.fee_rate
        sell_fee = proceeds * sell.fee_rate
        gross = proceeds - cost
        slippage = (cost + proceeds) * self.slippage_bps / 10000
        safety = (cost + proceeds) * self.safety_buffer_bps / 10000
        net = gross - buy_fee - sell_fee - slippage - safety
        pct = (net / cost) * 100 if cost else 0.0
        if net < self.min_profit_usd or pct < self.min_profit_pct:
            return None
        return Opportunity(
            buy.symbol, buy.exchange, sell.exchange, amount, cost, gross,
            buy_fee + sell_fee, slippage, safety, net, pct,
            max(buy.age_ms, sell.age_ms),
        )

    def scan(self, quotes: Iterable[Quote], input_usdt: float) -> List[Opportunity]:
        grouped: Dict[str, List[Quote]] = {}
        for quote in quotes:
            grouped.setdefault(quote.symbol, []).append(quote)
        found: List[Opportunity] = []
        for candidates in grouped.values():
            for buy, sell in permutations(candidates, 2):
                opportunity = self.two_leg(buy, sell, input_usdt)
                if opportunity:
                    found.append(opportunity)
        return sorted(found, key=lambda item: item.expected_profit_usd, reverse=True)
