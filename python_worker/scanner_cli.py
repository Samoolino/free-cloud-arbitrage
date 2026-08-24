from __future__ import annotations

import os

from hummingbot_opportunity_scanner import HummingbotScanner, Market


def main() -> None:
    scanner = HummingbotScanner()
    amount = float(os.getenv("SCANNER_BASE_AMOUNT", "0.001"))
    min_pnl = float(os.getenv("SCANNER_MIN_NET_PNL_USD", "1.0"))
    fixed_cost = float(os.getenv("SCANNER_FIXED_COST_USD", "0"))
    max_age = float(os.getenv("SCANNER_MAX_QUOTE_AGE_MS", "1500"))
    raw = os.getenv("SCANNER_MARKETS", "binance:BTC-USDT,kraken:BTC-USDT")
    markets = [
        Market(connector=x.split(":", 1)[0], pair=x.split(":", 1)[1], fee_bps=float(os.getenv("DEFAULT_FEE_BPS", "10")))
        for x in raw.split(",") if ":" in x
    ]
    for buy in markets:
        for sell in markets:
            if buy == sell or buy.pair != sell.pair:
                continue
            opp = scanner.assert_opportunity(buy, sell, amount, min_pnl, fixed_cost, max_age)
            if opp:
                print({
                    "symbol": opp.symbol,
                    "buy": opp.buy.connector,
                    "sell": opp.sell.connector,
                    "base_amount": opp.base_amount,
                    "buy_vwap": opp.buy_vwap,
                    "sell_vwap": opp.sell_vwap,
                    "spread_bps": opp.spread_bps,
                    "net_pnl": opp.net_pnl,
                    "quote_age_ms": opp.age_ms,
                    "assertion": "EXECUTABLE_NOW",
                })


if __name__ == "__main__":
    main()
