-- Alarmes de preço configuráveis pelo usuário (§ alarmes).
-- One-shot: dispara push quando o preço cruza o alvo e desativa.
-- Modelo single-user (igual push_subscriptions): a anon key cria/lê/apaga.
-- O worker (check-alerts.ts) confere e dispara com a service_role (ignora RLS).
create table if not exists price_alerts (
  id           bigint generated always as identity primary key,
  target       numeric not null,                              -- preço-alvo em USD
  direction    text not null check (direction in ('above','below')),
  note         text,                                          -- ex.: 'resistência ~ venda'
  active       boolean default true,
  triggered_at timestamptz,                                   -- preenchido ao disparar
  created_at   timestamptz default now()
);

alter table price_alerts enable row level security;

-- Single-user: a anon key gerencia os próprios alarmes (criar, listar, apagar).
drop policy if exists "anon read alerts"   on price_alerts;
drop policy if exists "anon insert alerts" on price_alerts;
drop policy if exists "anon delete alerts" on price_alerts;
create policy "anon read alerts"   on price_alerts for select to anon using (true);
create policy "anon insert alerts" on price_alerts for insert to anon with check (true);
create policy "anon delete alerts" on price_alerts for delete to anon using (true);
