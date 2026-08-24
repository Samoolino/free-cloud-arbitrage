"""Policy helpers for multi-network arbitrage candidates."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class NetworkLeg:
    venue: str
    network: str
    inventory_available: bool
    quote_age_ms: int


@dataclass(frozen=True)
class CrossNetworkCandidate:
    buy: NetworkLeg
    sell: NetworkLeg
    transfer_required: bool = False
    pre_funded_destination: bool = False

    def executable(self, max_quote_age_ms: int = 750) -> tuple[bool, str]:
        if not self.buy.inventory_available or not self.sell.inventory_available:
            return False, "INSUFFICIENT_INVENTORY"
        if self.buy.quote_age_ms > max_quote_age_ms or self.sell.quote_age_ms > max_quote_age_ms:
            return False, "STALE_QUOTE"
        if self.transfer_required and not self.pre_funded_destination:
            return False, "TRANSFER_DEPENDENT_NOT_EXECUTABLE"
        if self.buy.network != self.sell.network and not self.pre_funded_destination:
            return False, "DESTINATION_NOT_PRE_FUNDED"
        return True, "PASS"
