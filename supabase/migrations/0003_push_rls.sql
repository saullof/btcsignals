-- Permite ao app (chave anon) registrar a PRÓPRIA inscrição de push.
-- Só INSERT — anon não lê nem edita inscrições de ninguém. O envio é feito
-- pelo script de ingestão com a service_role (que ignora RLS).
drop policy if exists "anon insert subscription" on push_subscriptions;
create policy "anon insert subscription" on push_subscriptions
  for insert to anon with check (true);
