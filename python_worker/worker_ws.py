import asyncio
import os
import ccxt.pro as ccxtpro
from dotenv import load_dotenv
from supabase import create_client

WORKER_ROOT = os.path.dirname(os.path.abspath(__file__))
load_dotenv(dotenv_path=os.path.join(WORKER_ROOT, '.env'))

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError('SUPABASE_URL and SUPABASE_KEY must be set')

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

MIN_MARGIN = float(os.getenv('MIN_PROFIT_MARGIN_PERCENT', '0.15')) / 100
SLIPPAGE = float(os.getenv('SLIPPAGE_BUFFER_PERCENT', '0.05')) / 100


async def monitor_orderbook(exchange_id, symbol, data_store):
    exchange_class = getattr(ccxtpro, exchange_id)
    exchange = exchange_class({'enableRateLimit': True})

    print(f'Opening live WebSocket connection to {exchange_id} for {symbol}...')
    while True:
        try:
            orderbook = await exchange.watch_order_book(symbol)
            data_store[exchange_id] = {
                'ask': orderbook['asks'][0][0] if len(orderbook['asks']) > 0 else None,
                'bid': orderbook['bids'][0][0] if len(orderbook['bids']) > 0 else None,
                'fee_rate': 0.001,
            }
            await calculate_arbitrage_opportunity(symbol, data_store)
        except Exception as exc:
            print(f'WebSocket Error on {exchange_id}: {exc}')
            await asyncio.sleep(2)


async def calculate_arbitrage_opportunity(symbol, data_store):
    if 'binance' not in data_store or 'kraken' not in data_store:
        return

    b_ask = data_store['binance']['ask']
    b_bid = data_store['binance']['bid']
    k_ask = data_store['kraken']['ask']
    k_bid = data_store['kraken']['bid']

    if not all([b_ask, b_bid, k_ask, k_bid]):
        return

    gross_spread_a = k_bid - b_ask
    total_fees_a = (b_ask * data_store['binance']['fee_rate']) + (k_bid * data_store['kraken']['fee_rate'])
    safety_buffer_a = (b_ask + k_bid) * SLIPPAGE
    net_profit_a = gross_spread_a - (total_fees_a + safety_buffer_a)

    gross_spread_b = b_bid - k_ask
    total_fees_b = (k_ask * data_store['kraken']['fee_rate']) + (b_bid * data_store['binance']['fee_rate'])
    safety_buffer_b = (k_ask + b_bid) * SLIPPAGE
    net_profit_b = gross_spread_b - (total_fees_b + safety_buffer_b)

    target_opportunity = None
    if net_profit_a > (b_ask * MIN_MARGIN):
        target_opportunity = {'buy_ex': 'binance', 'sell_ex': 'kraken', 'profit': net_profit_a, 'type': 'A'}
    elif net_profit_b > (k_ask * MIN_MARGIN):
        target_opportunity = {'buy_ex': 'kraken', 'sell_ex': 'binance', 'profit': net_profit_b, 'type': 'B'}

    supabase.table('live_spreads').upsert({
        'symbol': symbol,
        'binance_price': (b_ask + b_bid) / 2,
        'kraken_price': (k_ask + k_bid) / 2,
        'potential_profit': max(net_profit_a, net_profit_b),
    }).execute()

    if target_opportunity:
        print(f'🔥 ZERO-LOSS OPPORTUNITY DETECTED: {target_opportunity}')
        supabase.table('arbitrage_signals').insert({
            'symbol': symbol,
            'buy_exchange': target_opportunity['buy_ex'],
            'sell_exchange': target_opportunity['sell_ex'],
            'expected_pnl': target_opportunity['profit'],
            'status': 'pending_execution',
        }).execute()


async def main():
    shared_data = {}
    target_symbol = 'BTC/USDT'
    await asyncio.gather(
        monitor_orderbook('binance', target_symbol, shared_data),
        monitor_orderbook('kraken', target_symbol, shared_data),
    )


if __name__ == '__main__':
    asyncio.run(main())
