
-- ============ Enums ============
CREATE TYPE public.app_role AS ENUM ('admin','user');
CREATE TYPE public.session_status AS ENUM ('running','target_reached','stopped','lockout','cooldown','error');
CREATE TYPE public.intent_status AS ENUM ('queued','acked','executing','filled','partial','failed','cancelled','aborted_stale');
CREATE TYPE public.transfer_status AS ENUM ('pending','broadcast','confirmed','failed');
CREATE TYPE public.strategy_kind AS ENUM ('triangular','pentagonal');

-- ============ profiles ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles self insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ============ user_roles ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles self read" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- Auto-create profile + grant first user admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE first_user BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO first_user;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, CASE WHEN first_user THEN 'admin'::public.app_role ELSE 'user'::public.app_role END);
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Generic updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ exchange_credentials ============
CREATE TABLE public.exchange_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange_id TEXT NOT NULL,                -- ccxt id (binance, okx, kraken, ...)
  label TEXT,
  api_key_enc TEXT,                          -- pgp_sym_encrypt result base64
  api_secret_enc TEXT,
  passphrase_enc TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  is_trigger BOOLEAN NOT NULL DEFAULT false,
  taker_fee_bps INTEGER,                     -- override default
  network_pref JSONB NOT NULL DEFAULT '{}',  -- per-asset preferred network
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, exchange_id)
);
CREATE INDEX idx_ec_user ON public.exchange_credentials(user_id);
-- Only one trigger per user
CREATE UNIQUE INDEX uniq_trigger_per_user ON public.exchange_credentials(user_id) WHERE is_trigger;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exchange_credentials TO authenticated;
GRANT ALL ON public.exchange_credentials TO service_role;
ALTER TABLE public.exchange_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ec self all" ON public.exchange_credentials FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_ec_updated BEFORE UPDATE ON public.exchange_credentials FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ bot_config ============
CREATE TABLE public.bot_config (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  paper_trading BOOLEAN NOT NULL DEFAULT true,
  target_profit_pct NUMERIC NOT NULL DEFAULT 0.30,
  slippage_buffer_pct NUMERIC NOT NULL DEFAULT 0.05,
  min_trigger_balance_usd NUMERIC NOT NULL DEFAULT 50,
  ws_staleness_ms INTEGER NOT NULL DEFAULT 500,
  triangular_enabled BOOLEAN NOT NULL DEFAULT true,
  pentagonal_enabled BOOLEAN NOT NULL DEFAULT false,
  coingecko_plan TEXT NOT NULL DEFAULT 'DEMO',
  conflict_mode TEXT NOT NULL DEFAULT 'greedy',
  enabled_exchanges TEXT[] NOT NULL DEFAULT ARRAY['binance','okx','kraken','coinbase']::TEXT[],
  tracked_assets TEXT[] NOT NULL DEFAULT ARRAY['BTC','ETH','SOL','XRP','USDT','USDC']::TEXT[],
  bot_secret_hint TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.bot_config TO authenticated;
GRANT ALL ON public.bot_config TO service_role;
ALTER TABLE public.bot_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bc self" ON public.bot_config FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_bc_updated BEFORE UPDATE ON public.bot_config FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ sessions ============
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_amount_usd NUMERIC NOT NULL,
  starting_balance_usd NUMERIC,
  realized_pnl_usd NUMERIC NOT NULL DEFAULT 0,
  status public.session_status NOT NULL DEFAULT 'running',
  trades_count INTEGER NOT NULL DEFAULT 0,
  trigger_exchange TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  notes TEXT
);
CREATE INDEX idx_sessions_user_running ON public.sessions(user_id, status);
GRANT SELECT, INSERT, UPDATE ON public.sessions TO authenticated;
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions self" ON public.sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ opportunities (rolling log of detected loops) ============
CREATE TABLE public.opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  strategy public.strategy_kind NOT NULL,
  loop_path TEXT NOT NULL,
  legs JSONB NOT NULL,
  gross_pct NUMERIC,
  net_pct NUMERIC,
  expected_net_usd NUMERIC,
  max_size_usd NUMERIC,
  gate_passed BOOLEAN NOT NULL DEFAULT false,
  reason TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_opp_user_time ON public.opportunities(user_id, detected_at DESC);
GRANT SELECT, INSERT, DELETE ON public.opportunities TO authenticated;
GRANT ALL ON public.opportunities TO service_role;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "opp self" ON public.opportunities FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ trade_intents ============
CREATE TABLE public.trade_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  legs JSONB NOT NULL,
  allocated_usd NUMERIC NOT NULL,
  expected_net_usd NUMERIC NOT NULL,
  lock_token TEXT NOT NULL,
  ttl_ms INTEGER NOT NULL DEFAULT 800,
  status public.intent_status NOT NULL DEFAULT 'queued',
  ack_at TIMESTAMPTZ,
  result_at TIMESTAMPTZ,
  realized_pnl_usd NUMERIC,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ti_user_status ON public.trade_intents(user_id, status);
CREATE INDEX idx_ti_queue ON public.trade_intents(status, created_at);
GRANT SELECT, INSERT, UPDATE ON public.trade_intents TO authenticated;
GRANT ALL ON public.trade_intents TO service_role;
ALTER TABLE public.trade_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ti self" ON public.trade_intents FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ trades ============
CREATE TABLE public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  intent_id UUID REFERENCES public.trade_intents(id) ON DELETE SET NULL,
  strategy public.strategy_kind NOT NULL,
  legs JSONB NOT NULL,
  notional_usd NUMERIC NOT NULL,
  realized_pnl_usd NUMERIC NOT NULL DEFAULT 0,
  paper BOOLEAN NOT NULL DEFAULT true,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_trades_user_time ON public.trades(user_id, executed_at DESC);
GRANT SELECT, INSERT ON public.trades TO authenticated;
GRANT ALL ON public.trades TO service_role;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trades self" ON public.trades FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ transfers ============
CREATE TABLE public.transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  intent_id UUID REFERENCES public.trade_intents(id) ON DELETE SET NULL,
  asset TEXT NOT NULL,
  network TEXT NOT NULL,
  from_exchange TEXT NOT NULL,
  to_exchange TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  fee NUMERIC,
  tx_hash TEXT,
  status public.transfer_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);
CREATE INDEX idx_xfers_user_time ON public.transfers(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.transfers TO authenticated;
GRANT ALL ON public.transfers TO service_role;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "xfers self" ON public.transfers FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ balances_snapshot ============
CREATE TABLE public.balances_snapshot (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange_id TEXT NOT NULL,
  balances JSONB NOT NULL,
  total_usd NUMERIC,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bs_user_ex_time ON public.balances_snapshot(user_id, exchange_id, taken_at DESC);
GRANT SELECT, INSERT, DELETE ON public.balances_snapshot TO authenticated;
GRANT ALL ON public.balances_snapshot TO service_role;
ALTER TABLE public.balances_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bs self" ON public.balances_snapshot FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ system_events ============
CREATE TABLE public.system_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  level TEXT NOT NULL DEFAULT 'info',
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_se_user_time ON public.system_events(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.system_events TO authenticated;
GRANT ALL ON public.system_events TO service_role;
ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "se self" ON public.system_events FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ Realtime ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.opportunities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trade_intents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transfers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.balances_snapshot;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
