"""Route opportunity lifecycle events to configured control-plane sinks.

Notifications are advisory. They never bypass the execution/risk gate.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class OpportunityEvent:
    event: str
    route: str
    symbol: str
    expected_net_pnl: str
    executable_notional: str
    confidence: str
    reason: str


class EventSink(Protocol):
    async def publish(self, event: OpportunityEvent) -> None: ...


class NotificationRouter:
    def __init__(self, sinks: list[EventSink]) -> None:
        self.sinks = sinks

    async def publish(self, event: OpportunityEvent) -> None:
        for sink in self.sinks:
            try:
                await sink.publish(event)
            except Exception:
                # Notification failure must never crash or alter the trading loop.
                continue
