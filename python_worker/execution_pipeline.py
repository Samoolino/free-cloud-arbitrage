"""Live execution orchestration boundary.

The pipeline connects scanner candidates to an execution adapter, but requires
capital reservation, arming, balance checks and post-trade reconciliation.
Wallet signing remains delegated to an external signer implementation.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol

from capital_loop import CapitalLoop


@dataclass(frozen=True)
class ExecutionRequest:
    symbol: str
    buy_venue: str
    sell_venue: str
    notional: Decimal
    expected_net_pnl: Decimal


@dataclass(frozen=True)
class ExecutionResult:
    status: str
    realized_net_pnl: Decimal
    reference: str = ""


class ExecutionAdapter(Protocol):
    async def execute(self, request: ExecutionRequest) -> ExecutionResult: ...

    async def reconcile(self, result: ExecutionResult) -> ExecutionResult: ...


class ExecutionPipeline:
    def __init__(self, capital: CapitalLoop, adapter: ExecutionAdapter) -> None:
        self.capital = capital
        self.adapter = adapter
        self.armed = False

    def arm(self) -> None:
        self.armed = True

    def disarm(self) -> None:
        self.armed = False
        self.capital.stop()

    async def execute(self, request: ExecutionRequest) -> ExecutionResult:
        if not self.armed:
            return ExecutionResult("REJECTED_DISARMED", Decimal("0"))
        if not self.capital.can_allocate(request.notional, request.expected_net_pnl):
            return ExecutionResult("REJECTED_CAPITAL_OR_PROFIT_GATE", Decimal("0"))

        result = await self.adapter.execute(request)
        if result.status not in {"FILLED", "PARTIAL", "SUBMITTED"}:
            self.disarm()
            return result

        reconciled = await self.adapter.reconcile(result)
        if reconciled.status != "RECONCILED":
            self.disarm()
            return ExecutionResult("RECONCILIATION_FAILED", Decimal("0"), result.reference)

        self.capital.record_trade(reconciled.realized_net_pnl)
        if reconciled.realized_net_pnl < 0:
            self.disarm()
        return reconciled
