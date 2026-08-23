"""Hummingbot adapter boundary.

The bot keeps strategy/risk decisions independent from the execution engine.
Use Hummingbot Gateway/Connectors for venue-specific execution rather than
embedding private keys in this repository. This adapter is intentionally a
small interface so a running Hummingbot instance can be substituted without
changing the opportunity engine.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class OrderRequest:
    venue: str
    symbol: str
    side: str
    amount: float
    limit_price: float | None = None


class ExecutionEngine(Protocol):
    async def place(self, request: OrderRequest) -> dict[str, Any]: ...

    async def cancel(self, order_id: str) -> dict[str, Any]: ...

    async def balances(self) -> dict[str, float]: ...


class HummingbotAdapter:
    """HTTP/RPC integration point for a separately managed Hummingbot process."""

    def __init__(self, client: Any):
        self.client = client

    async def place(self, request: OrderRequest) -> dict[str, Any]:
        return await self.client.place_order(
            venue=request.venue,
            symbol=request.symbol,
            side=request.side,
            amount=request.amount,
            price=request.limit_price,
        )

    async def cancel(self, order_id: str) -> dict[str, Any]:
        return await self.client.cancel_order(order_id)

    async def balances(self) -> dict[str, float]:
        return await self.client.get_balances()
