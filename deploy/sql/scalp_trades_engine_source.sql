-- TRADES-SOURCE-01: run manually in the Supabase SQL editor after confirmation.
alter table public.scalp_trades
  add column engine_source text not null
  constraint scalp_trades_engine_source_check check (engine_source in ('V1', 'V2'));
