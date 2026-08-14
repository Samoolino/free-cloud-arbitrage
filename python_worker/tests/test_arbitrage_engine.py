import time

from arbitrage_engine import ArbitrageEngine, Quote


def quote(exchange, bid, ask, fee=0.001, age=0):
    return Quote(exchange, "BTC/USDT", bid, 1.0, ask, 1.0, fee, int(time.time() * 1000) - age)


def test_profitable_route_requires_net_profit():
    engine = ArbitrageEngine(min_profit_usd=0.01, min_profit_pct=0.001, slippage_bps=0, safety_buffer_bps=0)
    found = engine.scan([quote("a", 100, 100), quote("b", 101, 102)], 100)
    assert found
    assert found[0].expected_profit_usd > 0


def test_fee_and_safety_can_reject_gross_spread():
    engine = ArbitrageEngine(min_profit_usd=0.01, min_profit_pct=0.001, slippage_bps=100, safety_buffer_bps=100)
    found = engine.scan([quote("a", 100, 100), quote("b", 100.2, 100.3)], 100)
    assert found == []


def test_stale_quotes_are_rejected():
    engine = ArbitrageEngine(max_quote_age_ms=1)
    found = engine.scan([quote("a", 100, 100), quote("b", 101, 102, age=10_000)], 100)
    assert found == []
