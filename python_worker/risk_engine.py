"""Conservative execution gate for cross-venue arbitrage.

This module never claims that arbitrage is risk-free. It only permits an order
when the *modeled worst-case* net PnL clears a configured reserve. The caller
must still handle partial fills, stale quotes, RPC failures and venue outages.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Quote:
    venue: str
    bid: float
    ask: float
    fee_bps: float = 0.0
    slippage_bps: float = 0.0


@dataclass(frozen=True)
class Opportunity:
    buy: Quote
    sell: Quote
    notional: float
    fixed_cost: float = 0.0
    safety_reserve: float = 0.0

    @property
    def gross_edge(self) -> float:
        return self.sell.bid - self.buy.ask

    @property
    def gross_edge_pct(self) -> float:
        return self.gross_edge / self.buy.ask if self.buy.ask else 0.0

    @property
    def estimated_fees(self) -> float:
        return self.notional * (self.buy.fee_bps + self.sell.fee_bps) / 10_000

    @property
    def estimated_slippage(self) -> float:
        return self.notional * (self.buy.slippage_bps + self.sell.slippage_bps) / 10_000

    @property
    def net_pnl(self) -> float:
        # Scale the price edge by notional and subtract conservative costs.
        edge_pnl = self.notional * self.gross_edge_pct
        return edge_pnl - self.estimated_fees - self.estimated_slippage - self.fixed_cost

    @property
    def executable(self) -> bool:
        return (
            self.notional > 0
            and self.buy.ask > 0
            and self.sell.bid > 0
            and self.sell.bid > self.buy.ask
            and self.net_pnl > self.safety_reserve
        )

    def reason(self) -> str:
        if self.notional <= 0:
            return "INVALID_NOTIONAL"
        if self.buy.ask <= 0 or self.sell.bid <= 0:
            return "INVALID_QUOTE"
        if self.sell.bid <= self.buy.ask:
            return "NO_GROSS_EDGE"
        if self.net_pnl <= self.safety_reserve:
            return "NET_EDGE_BELOW_SAFETY_RESERVE"
        return "PASS"
