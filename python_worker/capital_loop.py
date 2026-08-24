"""Bounded rotating working-capital controller.

The controller tracks one working-capital pool that may be reused for multiple
opportunities. It does not store or print private keys. The source and sweep
wallet addresses are configuration values; actual signing must be supplied by
an external signer/HSM or a locally protected wallet process.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal


@dataclass
class CapitalConfig:
    source_wallet: str
    sweep_wallet: str
    starting_capital: Decimal
    max_working_capital: Decimal
    target_equity: Decimal
    min_profit_per_trade: Decimal
    reserve_ratio: Decimal = Decimal("0.10")


class CapitalLoop:
    def __init__(self, config: CapitalConfig) -> None:
        self.config = config
        self.equity = config.starting_capital
        self.realized_pnl = Decimal("0")
        self.trades = 0
        self.active = True

    @property
    def target_reached(self) -> bool:
        return self.equity >= self.config.target_equity

    @property
    def available_notional(self) -> Decimal:
        reserve = self.equity * self.config.reserve_ratio
        capped = min(self.equity - reserve, self.config.max_working_capital)
        return max(Decimal("0"), capped)

    def can_allocate(self, notional: Decimal, expected_net_pnl: Decimal) -> bool:
        if not self.active or self.target_reached:
            return False
        if expected_net_pnl < self.config.min_profit_per_trade:
            return False
        return Decimal("0") < notional <= self.available_notional

    def record_trade(self, realized_net_pnl: Decimal) -> None:
        self.realized_pnl += realized_net_pnl
        self.equity += realized_net_pnl
        self.trades += 1
        if self.target_reached:
            self.active = False

    def stop(self) -> None:
        self.active = False

    def snapshot(self) -> dict[str, str | int | bool]:
        return {
            "source_wallet": self.config.source_wallet,
            "sweep_wallet": self.config.sweep_wallet,
            "equity": str(self.equity),
            "realized_pnl": str(self.realized_pnl),
            "target_equity": str(self.config.target_equity),
            "available_notional": str(self.available_notional),
            "target_reached": self.target_reached,
            "active": self.active,
            "trades": self.trades,
        }


class SettlementRequired(RuntimeError):
    pass


def build_sweep_request(loop: CapitalLoop) -> dict[str, str]:
    """Return a signer-neutral settlement instruction once the target is met."""
    if not loop.target_reached:
        raise SettlementRequired("target has not been reached")
    return {
        "action": "SWEEP",
        "from": loop.config.source_wallet,
        "to": loop.config.sweep_wallet,
        "amount": str(loop.equity),
        "reason": "TARGET_EQUITY_REACHED",
    }
