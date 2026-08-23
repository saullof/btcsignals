# BTC Cycle Signals

PWA (React + Vite + TypeScript + Tailwind) que mostra um painel de indicadores de
ciclo do Bitcoin (compra / venda / incerto), preço ao vivo, uma leitura
probabilística por frequências históricas (base-rates) e push nas viradas de estado.

> Apoio à decisão baseado em amostra pequena (poucos ciclos). **Não é conselho financeiro.**

## Stack

- Frontend: React + Vite + Tailwind v4, PWA via `vite-plugin-pwa` (injectManifest).
- Backend: Supabase self-hosted (Postgres + PostgREST) no EasyPanel.
- Ingestão: um script Node (`scripts/ingest.ts`) — sem Edge Functions.
- Fontes 100% grátis e sem chave: CBBI, Fear & Greed, Binance.

## Rodar local

```bash
npm install
cp .env.example .env   # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
```

## Banco

Aplique `supabase/migrations/0001_init.sql` no SQL Editor do Supabase (Studio).

## Ingestão / backfill

Popula preço, indicadores, composto e base-rates; detecta viradas. Roda o histórico
inteiro e o dia atual de uma vez (idempotente — pode rodar todo dia).

```bash
# supabase/.env contém SUPABASE_URL e SERVICE_ROLE_KEY (server-side, gitignored)
node --env-file=supabase/.env scripts/ingest.ts
```

Agende 1x/dia (ex.: scheduled task do EasyPanel rodando o comando acima).

## Deploy (EasyPanel, Docker)

O `Dockerfile` faz o build e serve o estático com nginx.

1. Suba este repositório num git (GitHub, ou o git embutido do EasyPanel).
2. No EasyPanel: **+ Serviço → App**, aponte para o repo, tipo **Dockerfile**.
3. Em **Domínios**, adicione um domínio (EasyPanel emite HTTPS/Let's Encrypt).
4. Deploy. Abra o domínio no iPhone (Safari) → Compartilhar →
   **Adicionar à Tela de Início**. Pronto, PWA instalado.

As variáveis públicas do build ficam em `.env.production` (Vite lê no build).

## Testes

```bash
node --test src/lib/signals.test.ts   # lógica de sinal + base-rates
```

## Segurança

Antes de expor em produção: troque `JWT_SECRET`, `POSTGRES_PASSWORD` e regenere as
chaves ANON/SERVICE do Supabase (não use as chaves-demo padrão). `SERVICE_ROLE_KEY`
nunca vai no frontend nem no git.
