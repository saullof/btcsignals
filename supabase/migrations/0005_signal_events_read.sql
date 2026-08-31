-- Libera leitura (anon) do histórico de viradas, pra UI mostrar as
-- notificações passadas. Escrita continua só via service_role (ignora RLS).
drop policy if exists "anon read events" on signal_events;
create policy "anon read events" on signal_events for select to anon using (true);
