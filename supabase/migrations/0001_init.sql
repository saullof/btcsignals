-- BTC Cycle Signals — schema inicial (§5 do guia).
-- Aplicar no Studio (SQL Editor) do seu Supabase self-hosted, ou via CLI.

-- Extensões p/ o cron chamar as Edge Functions via HTTP.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Preço diário (base para base-rates e indicadores de preço).
create table if not exists price_history (
  date  date primary key,
  close numeric not null
);

-- Snapshot diário de cada indicador.
create table if not exists indicator_snapshots (
  date          date not null,
  indicator_key text not null,          -- ex.: 'mvrv_z', 'fng', 'cbbi', 'puell'
  raw_value     numeric,                -- valor bruto da fonte
  cheapness     numeric,                -- 0..1 normalizado (1 = compra máx, 0 = venda máx)
  signal        text check (signal in ('buy','sell','neutral')),
  source        text,
  primary key (date, indicator_key)
);

-- Snapshot diário do composto + probabilidade (base-rates).
create table if not exists composite_snapshots (
  date          date primary key,
  composite     numeric,                -- média das cheapness (0..1)
  votes_buy     int default 0,
  votes_sell    int default 0,
  votes_neutral int default 0,
  prob_up_30d   numeric,                -- base-rate p/ a faixa atual
  prob_up_90d   numeric,
  prob_up_180d  numeric,
  sample_30d    int,                    -- N da faixa (mostrar sempre!)
  sample_90d    int,
  sample_180d   int
);

-- Eventos de virada de estado (disparam o push).
create table if not exists signal_events (
  id         bigint generated always as identity primary key,
  date       date not null,
  scope      text not null,             -- 'indicator' | 'composite'
  key        text not null,             -- indicator_key ou 'composite'
  old_signal text,
  new_signal text,
  created_at timestamptz default now()
);

-- Assinaturas de push.
create table if not exists push_subscriptions (
  id         bigint generated always as identity primary key,
  endpoint   text unique not null,
  p256dh     text not null,
  auth       text not null,
  active     boolean default true,
  created_at timestamptz default now()
);

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Frontend usa a ANON_KEY via PostgREST. Snapshots e preço são leitura pública.
-- As Edge Functions escrevem com a SERVICE_ROLE_KEY, que ignora RLS.
alter table price_history        enable row level security;
alter table indicator_snapshots  enable row level security;
alter table composite_snapshots  enable row level security;
alter table signal_events        enable row level security;
alter table push_subscriptions   enable row level security;

-- Leitura pública (anon) só nas tabelas de exibição.
create policy "public read price"      on price_history       for select using (true);
create policy "public read indicators" on indicator_snapshots for select using (true);
create policy "public read composite"  on composite_snapshots for select using (true);

-- signal_events e push_subscriptions: SEM policy p/ anon.
-- Ninguém lê/escreve com a anon key; só a service_role (que ignora RLS) mexe nelas.
