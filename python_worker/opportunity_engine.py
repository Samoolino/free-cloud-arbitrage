"""Executable cross-venue spread calculation.

This module deliberately does not submit orders. It produces an execution
candidate only after fees, slippage and a safety reserve are accounted for.
"""
from __future__ import annotations

from dataclasses import dataclass
from risk_engine import Opportunity, Quote


@dataclass(frozen=True)
class Candidate:
    symbol: str
    opportunity: Opportunity

    @property
    def executable(self) -> bool:
        return self.opportunity.executable

    @property
    def net_pnl(self) -> float:
        return self.opportunity.net_pnl

    def reason(self) -> str:
        return self.opportunity.reason()


def find_candidate(
    symbol: str,
    buy_venue: str,
    buy_ask: float,
    sell_venue: str,
    sell_bid: float,
    notional: float,
    buy_fee_bps: float,
    sell_fee_bps: float,
    buy_slippage_bps: float,
    sell_slippage_bps: float,
    fixed_cost: float = 0.0,
    safety_reserve: float = 0.0,
) -> Candidate:
    buy = Quote(buy_venue, bid=0.0, ask=buy_ask, fee_bps=buy_fee_bps, slippage_bps=buy_slippage_bps)
    sell = Quote(sell_venue, bid=sell_bid, ask=0.0, fee_bps=sell_fee_bps, slippage_bps=sell_slippage_bps)
    return Candidate(symbol, Opportunity(buy, sell, notional, fixed_cost, safety_reserve))
