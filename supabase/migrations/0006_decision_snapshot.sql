-- Snapshot diário do painel de decisão (fase 1): níveis candidatos, curvas de
-- chance de toque por regime, calibração walk-forward e retornos mensais.
-- Uma linha só (id = 1), payload JSON; escrita pelo worker (service_role).
create table if not exists decision_snapshot (
  id         int primary key default 1 check (id = 1),
  updated_at timestamptz not null default now(),
  payload    jsonb not null
);

alter table decision_snapshot enable row level security;

drop policy if exists "anon read decision" on decision_snapshot;
create policy "anon read decision" on decision_snapshot for select to anon using (true);
