"""Signer boundary for DEX transactions.

The trading engine receives a signer reference and unsigned transaction data.
Implementations may use Vault/HSM/hardware-wallet infrastructure. Raw private
keys are intentionally unsupported here.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class UnsignedTransaction:
    chain_id: int
    to: str
    data: str
    value_wei: int
    nonce: int
    gas_limit: int
    max_fee_per_gas: int
    max_priority_fee_per_gas: int


class ExternalSigner(Protocol):
    async def sign(self, transaction: UnsignedTransaction) -> str: ...


class SignerConfigurationError(RuntimeError):
    pass


def signer_from_environment() -> str:
    import os

    ref = os.getenv("DEX_SIGNER_REF", "").strip()
    if not ref:
        raise SignerConfigurationError("DEX_SIGNER_REF is required; raw private keys are not supported")
    return ref
