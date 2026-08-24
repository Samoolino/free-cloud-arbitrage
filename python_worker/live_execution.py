"""Execution boundary for live arbitrage.

No raw private key is accepted here. Wallet execution must be delegated to an
external signer/HSM or a protected signer service. CEX execution uses scoped
trade-only credentials already injected into the venue adapter.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class ExecutionRequest:
    symbol: str
    buy_venue: str
    sell_venue: str
    notional: float
    expected_net_pnl: float
    max_slippage_bps: float


class Signer(Protocol):
    async def sign(self, payload: bytes) -> bytes: ...


class ExecutionBlocked(RuntimeError):
    pass


class LiveExecutionGate:
    def __init__(self, *, armed: bool, signer: Signer | None = None) -> None:
        self.armed = armed
        self.signer = signer

    async def execute(self, request: ExecutionRequest) -> dict[str, str | float]:
        if not self.armed:
            raise ExecutionBlocked("ENGINE_DISARMED")
        if request.expected_net_pnl <= 0:
            raise ExecutionBlocked("NET_PNL_NOT_POSITIVE")
        if request.notional <= 0:
            raise ExecutionBlocked("INVALID_NOTIONAL")
        if request.max_slippage_bps <= 0:
            raise ExecutionBlocked("INVALID_SLIPPAGE_LIMIT")
        if request.buy_venue == request.sell_venue:
            raise ExecutionBlocked("SAME_VENUE")

        # Actual CEX order submission / DEX transaction construction belongs in
        # venue-specific adapters. This gate intentionally refuses to accept a
        # raw private key or silently sign an arbitrary transaction.
        return {
            "status": "EXECUTION_APPROVED_FOR_ADAPTER",
            "symbol": request.symbol,
            "buy_venue": request.buy_venue,
            "sell_venue": request.sell_venue,
            "notional": request.notional,
            "expected_net_pnl": request.expected_net_pnl,
        }
