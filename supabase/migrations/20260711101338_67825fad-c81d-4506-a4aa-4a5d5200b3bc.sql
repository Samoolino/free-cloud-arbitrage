CREATE TABLE public.market_context (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  exchange_id TEXT,
  symbol TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ttl_seconds INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, scope, exchange_id, symbol)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_context TO authenticated;
GRANT ALL ON public.market_context TO service_role;

ALTER TABLE public.market_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own market_context"
  ON public.market_context FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX market_context_user_scope_idx ON public.market_context (user_id, scope, updated_at DESC);

CREATE TRIGGER market_context_touch
  BEFORE UPDATE ON public.market_context
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();