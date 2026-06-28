create table if not exists public.arbitrage_signals (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  buy_exchange text not null,
  sell_exchange text not null,
  expected_pnl numeric default 0,
  status text default 'pending_execution',
  buy_tradeable boolean default false,
  buy_deposit_enabled boolean default false,
  buy_withdraw_enabled boolean default false,
  buy_suspended boolean default true,
  buy_network text,
  sell_tradeable boolean default false,
  sell_deposit_enabled boolean default false,
  sell_withdraw_enabled boolean default false,
  sell_suspended boolean default true,
  sell_network text,
  updated_at bigint default extract(epoch from now())
);

create table if not exists public.live_spreads (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  exchange_a text,
  exchange_b text,
  binance_price numeric,
  kraken_price numeric,
  potential_profit numeric,
  tradeable boolean default false,
  updated_at bigint default extract(epoch from now())
);

create index if not exists idx_arbitrage_signals_status on public.arbitrage_signals(status);
create index if not exists idx_live_spreads_symbol on public.live_spreads(symbol);
