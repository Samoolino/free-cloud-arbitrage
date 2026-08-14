"""Real-time conservative arbitrage profitability engine.

The engine accepts normalized live quotes and only emits an opportunity when
current executable prices, visible depth, fees, slippage allowance, quote
freshness and a configurable profit buffer all pass. It is deliberately
independent of the UI so the strategy can continue without Lovable.

A positive gate is not a mathematical guarantee against market risk; the
execution layer must revalidate every leg immediately before order placement.
"""
from __future__ import annotations

from dataclasses import dataclass
from itertools import permutations
from time import time
from typing import Dict, Iterable, List, Optional, Tuple


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
class RouteLeg:
    exchange: str
    symbol: str
    side: str
    price: float
    amount: float
    fee_usd: float


@dataclass(frozen=True)
class Opportunity:
    route_type: str
    legs: Tuple[RouteLeg, ...]
    input_usdt: float
    expected_output_usdt: float
    gross_profit_usd: float
    fees_usd: float
    slippage_usd: float
    safety_buffer_usd: float
    expected_profit_usd: float
    expected_profit_pct: float
    max_quote_age_ms: int


class ArbitrageEngine:
    def __init__(
        self,
        min_profit_usd: float = 0.05,
        min_profit_pct: float = 0.10,
        slippage_bps: float = 5.0,
        safety_buffer_bps: float = 5.0,
        max_quote_age_ms: int = 1000,
    ) -> None:
        self.min_profit_usd = min_profit_usd
        self.min_profit_pct = min_profit_pct
        self.slippage_bps = slippage_bps
        self.safety_buffer_bps = safety_buffer_bps
        self.max_quote_age_ms = max_quote_age_ms

    def _valid(self, q: Quote) -> bool:
        return (
            q.bid > 0 and q.ask > 0 and q.bid_size > 0 and q.ask_size > 0
            and q.bid < q.ask
            and q.age_ms <= self.max_quote_age_ms
            and 0 <= q.fee_rate < 1
        )

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
        pct = (net / cost) * 100 if cost else 0
        if net < self.min_profit_usd or pct < self.min_profit_pct:
            return None

        legs = (
            RouteLeg(buy.exchange, buy.symbol, "buy", buy.ask, amount, buy_fee),
            RouteLeg(sell.exchange, sell.symbol, "sell", sell.bid, amount, sell_fee),
        )
        return Opportunity(
            route_type="two_leg",
            legs=legs,
            input_usdt=cost,
            expected_output_usdt=proceeds - sell_fee,
            gross_profit_usd=gross,
            fees_usd=buy_fee + sell_fee,
            slippage_usd=slippage,
            safety_buffer_usd=safety,
            expected_profit_usd=net,
            expected_profit_pct=pct,
            max_quote_age_ms=max(buy.age_ms, sell.age_ms),
        )

    def scan(self, quotes: Iterable[Quote], input_usdt: float) -> List[Opportunity]:
        grouped: Dict[str, List[Quote]] = {}
        for q in quotes:
            grouped.setdefault(q.symbol, []).append(q)
        results: List[Opportunity] = []
        for entries in grouped.values():
            for buy, sell in permutations(entries, 2):
                result = self.two_leg(buy, sell, input_usdt)
                if result:
                    results.append(result)
        return sorted(results, key=lambda item: item.expected_profit_usd, reverse=True)

    scan_two_leg = scan
