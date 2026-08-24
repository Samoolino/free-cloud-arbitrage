from decimal import Decimal

from capital_loop import CapitalConfig, CapitalLoop, SettlementRequired, build_sweep_request


def test_reuses_working_capital_until_target():
    loop = CapitalLoop(CapitalConfig(
        source_wallet="0xsource",
        sweep_wallet="0xsweep",
        starting_capital=Decimal("100"),
        max_working_capital=Decimal("100"),
        target_equity=Decimal("105"),
        min_profit_per_trade=Decimal("1"),
    ))
    assert loop.can_allocate(Decimal("80"), Decimal("2"))
    loop.record_trade(Decimal("2"))
    assert loop.can_allocate(Decimal("80"), Decimal("2"))
    loop.record_trade(Decimal("3"))
    assert loop.target_reached
    assert not loop.can_allocate(Decimal("10"), Decimal("2"))
    sweep = build_sweep_request(loop)
    assert sweep["to"] == "0xsweep"
    assert sweep["amount"] == "105"


def test_target_blocks_sweep_before_completion():
    loop = CapitalLoop(CapitalConfig(
        source_wallet="0xsource",
        sweep_wallet="0xsweep",
        starting_capital=Decimal("100"),
        max_working_capital=Decimal("100"),
        target_equity=Decimal("110"),
        min_profit_per_trade=Decimal("1"),
    ))
    try:
        build_sweep_request(loop)
    except SettlementRequired:
        return
    raise AssertionError("sweep must remain blocked until target equity is reached")
