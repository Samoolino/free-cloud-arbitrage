"""Continuous cross-venue opportunity matrix.

Produces actionable *notifications* from normalized quotes for CEX/CEX,
DEX/DEX and CEX/DEX combinations. Execution remains behind the existing risk,
capital and reconciliation pipeline.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from itertools import permutations
from time import time


@dataclass(frozen=True)
class Quote:
    venue: str
    market: str
    bid: Decimal
    ask: Decimal
    timestamp_ms: int
    fee_bps: Decimal
    gas_cost: Decimal = Decimal("0")


@dataclass(frozen=True)
class Opportunity:
    buy: Quote
    sell: Quote
    notional: Decimal
    gross_edge: Decimal
    estimated_cost: Decimal
    estimated_net_pnl: Decimal
    assertion: str


def build_matrix(quotes: list[Quote], notional: Decimal, min_net_pnl: Decimal,
                 max_quote_age_ms: int, max_slippage_bps: Decimal = Decimal("30")) -> list[Opportunity]:
    now = int(time() * 1000)
    fresh = [q for q in quotes if now - q.timestamp_ms <= max_quote_age_ms and q.ask > 0 and q.bid > 0]
    results: list[Opportunity] = []
    for buy, sell in permutations(fresh, 2):
        if buy.venue == sell.venue or buy.market != sell.market:
            continue
        gross = (sell.bid - buy.ask) / buy.ask * notional
        fees = notional * (buy.fee_bps + sell.fee_bps) / Decimal("10000")
        cost = fees + buy.gas_cost + sell.gas_cost
        net = gross - cost
        assertion = "EXECUTABLE_NOW" if net >= min_net_pnl and sell.bid > buy.ask else "WATCH"
        results.append(Opportunity(buy, sell, notional, gross, cost, net, assertion))
    return sorted(results, key=lambda x: x.estimated_net_pnl, reverse=True)
