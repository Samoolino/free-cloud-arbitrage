import asyncio
import json
import os
import time
from typing import Any, Dict, Optional

import requests
import websockets
from dotenv import load_dotenv
from supabase import create_client

WORKER_ROOT = os.path.dirname(os.path.abspath(__file__))
load_dotenv(dotenv_path=os.path.join(WORKER_ROOT, '.env'))

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError('SUPABASE_URL and SUPABASE_KEY must be set')

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

order_books: Dict[str, Dict[str, Any]] = {}
asset_eligibility_cache: Dict[str, Dict[str, Any]] = {}


def get_exchange_configs() -> list[dict[str, Any]]:
    return [
        {
            'id': 'binance',
            'ws_url': 'wss://stream.binance.com:9443/ws/btcusdt@depth@100ms',
            'symbol': 'BTC/USDT',
        },
        {
            'id': 'kraken',
            'ws_url': 'wss://ws.kraken.com/',
            'symbol': 'BTC/USDT',
        },
    ]


async def websocket_feed_worker(exchange_id: str, ws_url: str, symbol: str) -> None:
    print(f'[Worker] Starting stream for {exchange_id}...')
    while True:
        try:
            async with websockets.connect(ws_url) as ws:
                if exchange_id == 'kraken':
                    await ws.send(json.dumps({
                        'event': 'subscribe',
                        'pair': ['BTC/USDT'],
                        'subscription': {'name': 'book', 'depth': 25},
                    }))
                async for message in ws:
                    data = json.loads(message)
                    if exchange_id == 'binance':
                        if isinstance(data, dict) and 'asks' in data and 'bids' in data:
                            order_books[exchange_id] = {
                                'bid': float(data['bids'][0][0]),
                                'ask': float(data['asks'][0][0]),
                                'depth_bids': data['bids'][:5],
                                'depth_asks': data['asks'][:5],
                            }
                    elif exchange_id == 'kraken':
                        if isinstance(data, dict) and 'bids' in data and 'asks' in data:
                            order_books[exchange_id] = {
                                'bid': float(data['bids'][0][0]),
                                'ask': float(data['asks'][0][0]),
                                'depth_bids': data['bids'][:5],
                                'depth_asks': data['asks'][:5],
                            }
                    await asyncio.sleep(0)
        except Exception as exc:
            print(f'[Worker Error] {exchange_id} disconnected: {exc}. Reconnecting...')
            await asyncio.sleep(2)


async def evaluate_asset_eligibility(exchange_id: str, symbol: str) -> Dict[str, Any]:
    cache_key = f'{exchange_id}:{symbol}'
    now = time.time()
    cached = asset_eligibility_cache.get(cache_key)
    if cached and (now - cached.get('fetched_at', 0)) < 60:
        return cached['data']

    try:
        if exchange_id == 'binance':
            endpoint = 'https://api.binance.com/api/v3/exchangeInfo'
            response = requests.get(endpoint, timeout=10)
            response.raise_for_status()
            data = response.json()
            symbols = {entry['symbol'] for entry in data.get('symbols', [])}
            is_tradeable = symbol.replace('/', '') in symbols
            result = {
                'tradeable': is_tradeable,
                'deposit_enabled': True,
                'withdraw_enabled': True,
                'suspended': False,
                'network': 'BSC/ETH/ARBITRUM',
            }
        else:
            result = {
                'tradeable': True,
                'deposit_enabled': True,
                'withdraw_enabled': True,
                'suspended': False,
                'network': 'unknown',
            }
    except Exception as exc:
        result = {
            'tradeable': False,
            'deposit_enabled': False,
            'withdraw_enabled': False,
            'suspended': True,
            'network': 'unknown',
            'error': str(exc),
        }

    asset_eligibility_cache[cache_key] = {'fetched_at': now, 'data': result}
    return result


async def arbitrage_pnl_engine(threshold: float = 0.50) -> None:
    print('[Engine] Arbitrage calculation engine active.')
    while True:
        try:
            if 'binance' in order_books and 'kraken' in order_books:
                a = order_books['binance']
                b = order_books['kraken']

                bid_a = a.get('bid', 0.0)
                ask_a = a.get('ask', 0.0)
                bid_b = b.get('bid', 0.0)
                ask_b = b.get('ask', 0.0)

                if bid_a > 0 and ask_b > 0:
                    spread_1 = bid_a - ask_b
                    if spread_1 > threshold:
                        availability_a = await evaluate_asset_eligibility('binance', 'BTC/USDT')
                        availability_b = await evaluate_asset_eligibility('kraken', 'BTC/USDT')
                        if availability_a.get('tradeable') and availability_b.get('tradeable') and not availability_a.get('suspended') and not availability_b.get('suspended'):
                            print(f'[OPPORTUNITY] Buy on Kraken ({ask_b}) -> Sell on Binance ({bid_a}) | Gross PNL: +{spread_1:.2f}')
                            upsert_signal('BTC/USDT', 'kraken', 'binance', spread_1, availability_a, availability_b)

                if bid_b > 0 and ask_a > 0:
                    spread_2 = bid_b - ask_a
                    if spread_2 > threshold:
                        availability_a = await evaluate_asset_eligibility('binance', 'BTC/USDT')
                        availability_b = await evaluate_asset_eligibility('kraken', 'BTC/USDT')
                        if availability_a.get('tradeable') and availability_b.get('tradeable') and not availability_a.get('suspended') and not availability_b.get('suspended'):
                            print(f'[OPPORTUNITY] Buy on Binance ({ask_a}) -> Sell on Kraken ({bid_b}) | Gross PNL: +{spread_2:.2f}')
                            upsert_signal('BTC/USDT', 'binance', 'kraken', spread_2, availability_a, availability_b)

            await asyncio.sleep(0.001)
        except Exception as exc:
            print(f'[Engine Error] {exc}')
            await asyncio.sleep(1)


def upsert_signal(symbol: str, buy_exchange: str, sell_exchange: str, expected_pnl: float, buy_availability: Dict[str, Any], sell_availability: Dict[str, Any]) -> None:
    supabase.table('arbitrage_signals').upsert({
        'symbol': symbol,
        'buy_exchange': buy_exchange,
        'sell_exchange': sell_exchange,
        'expected_pnl': expected_pnl,
        'status': 'pending_execution',
        'buy_tradeable': buy_availability.get('tradeable', False),
        'buy_deposit_enabled': buy_availability.get('deposit_enabled', False),
        'buy_withdraw_enabled': buy_availability.get('withdraw_enabled', False),
        'buy_suspended': buy_availability.get('suspended', True),
        'buy_network': buy_availability.get('network', 'unknown'),
        'sell_tradeable': sell_availability.get('tradeable', False),
        'sell_deposit_enabled': sell_availability.get('deposit_enabled', False),
        'sell_withdraw_enabled': sell_availability.get('withdraw_enabled', False),
        'sell_suspended': sell_availability.get('suspended', True),
        'sell_network': sell_availability.get('network', 'unknown'),
        'updated_at': time.time(),
    }, on_conflict='symbol,buy_exchange,sell_exchange').execute()


async def main() -> None:
    configs = get_exchange_configs()
    tasks = [
        websocket_feed_worker(config['id'], config['ws_url'], config['symbol'])
        for config in configs
    ]
    tasks.append(arbitrage_pnl_engine(threshold=0.50))
    await asyncio.gather(*tasks)


if __name__ == '__main__':
    asyncio.run(main())
