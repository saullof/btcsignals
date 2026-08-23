-- Base-rate por consenso (quantos indicadores concordam), guardada como JSON
-- no snapshot do dia mais recente. Flexível: não engessa em colunas fixas.
alter table composite_snapshots add column if not exists consensus jsonb;
