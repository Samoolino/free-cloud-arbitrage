import os
import requests
from dotenv import load_dotenv
from supabase import create_client

WORKER_ROOT = os.path.dirname(os.path.abspath(__file__))
load_dotenv(dotenv_path=os.path.join(WORKER_ROOT, '.env'))

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError('SUPABASE_URL and SUPABASE_KEY must be set')

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_top_arbitrage_pairs():
    print('Scanning Coingecko for viable cross-exchange market pairs...')
    target_coins = ['bitcoin', 'ethereum', 'solana']
    verified_pairs = []

    for coin in target_coins:
        url = f'https://api.coingecko.com/api/v3/coins/{coin}/tickers'
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()

        if 'tickers' in data:
            for ticker in data['tickers']:
                market_name = ticker.get('market', {}).get('name', '')
                if market_name in {'Binance', 'Kraken'}:
                    verified_pairs.append({
                        'base': ticker.get('base'),
                        'target': ticker.get('target'),
                        'volume': ticker.get('converted_volume', {}).get('usd', 0),
                    })

    for pair in verified_pairs[:10]:
        symbol = f"{pair['base']}/{pair['target']}".upper()
        supabase.table('tracked_pairs').upsert({
            'symbol': symbol,
            'is_active': True,
            'last_volume_check': pair['volume'],
        }).execute()

    print('Scanner sync complete.')


if __name__ == '__main__':
    fetch_top_arbitrage_pairs()
