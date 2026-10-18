# Fase 1 — Níveis com chance de toque + mapa mensal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No topo do Painel, mostrar os níveis de preço mais próximos com a chance de o BTC tocar cada um em 7 e 30 dias (com alarme em um toque) e um mapa de retornos mensais. Corrigir o histórico de preço da Binance para 2017+.

**Architecture:** O worker (`btcsignals-ingest`) ganha um script diário `scripts/decision.ts`, que baixa OHLC diário da Binance desde 2017 e calcula candidatos de nível, curvas empíricas de toque por regime/direção/prazo, calibração walk-forward e retornos mensais. Grava tudo num único JSON em `decision_snapshot`. O app lê esse JSON e aplica as curvas ao preço ao vivo, então as chances se movem com o preço sem chamar o servidor. Toda a matemática fica em módulos puros em `src/lib/`, compartilhados entre worker e app, como `signals.ts` já é.

**Tech Stack:** TypeScript, Node 24 (strip-types) no worker, React 19 + Tailwind v4 no app, Supabase (PostgREST), `node:test` para testes. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-10-18-painel-decisao-semanal-design.md` (seções 5.1, 5.4, 6.1–6.3, 6.5; fase 1 da seção 8)

## Global Constraints

- Textos de UI em **português do Brasil, tratando o usuário por "você"**, linguagem simples (usuário não técnico).
- **Nenhuma dependência nova** (sem libs de gráfico/estatística).
- Módulos em `src/lib/` que o worker importa: **imports de valor com extensão `.ts`** (ex.: `from './levels.ts'`); `tsconfig` já tem `allowImportingTsExtensions`. Imports só de tipo podem ficar sem extensão.
- "Chegar/tocar" = **máxima (para cima) ou mínima (para baixo) do candle diário** encosta no nível dentro do prazo, não o fechamento.
- Prazos: **7 e 30 dias**.
- Níveis: remover os a **menos de 0,5%** do preço, deduplicar os a **menos de 1%** entre si, **até 3 de cada lado**, mais próximos primeiro, **sem arredondar**.
- **Nada de usar dado futuro** para avaliar o passado: a calibração é walk-forward.
- Toda probabilidade mostrada vem com a amostra por trás ("N situações").
- Testes: `node --test src/lib/<arquivo>.test.ts`. Build: `npm run build` (o `npm run typecheck` já está quebrado por config pré-existente; não é critério).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Preço ao vivo ainda não chegou** (WebSocket conectando ou caído): a tabela usa o `close` do snapshot e diz "preço de fechamento", sem quebrar.
- **Snapshot inexistente** (migration aplicada mas worker ainda não rodou) ou erro do Supabase: a seção some com um aviso curto, e o resto do Painel continua funcionando.
- **Preço ao vivo atravessou um nível** desde o cálculo diário: o nível muda de lado (acima ↔ abaixo) em vez de mostrar 100% ou distância negativa.
- **Nível muito longe** (z além da grade): mostrar "<1%" em vez de 0% ou NaN. Muito perto: ">99%".
- **Mês atual incompleto** no mapa: aparece marcado como parcial e fica fora das estatísticas (% positivos, mediana).

---

### Task 1: Binance diário desde 2017 (fetch compartilhado + correção da paginação)

**Files:**
- Create: `scripts/binance.ts`
- Modify: `scripts/ingest.ts:62-76` (remover `fetchBinanceCloses`, usar o novo fetch)
- Modify: `src/lib/types.ts` (adicionar o tipo `Ohlc`)

**Interfaces:**
- Produces: `type Ohlc = { date: string; open: number; high: number; low: number; close: number }` em `src/lib/types.ts`; `fetchBinanceDaily(): Promise<Ohlc[]>` em `scripts/binance.ts` (ordem crescente, de 2017-08-17 até hoje).

- [ ] **Step 1: Implementar `fetchBinanceDaily()`** em `scripts/binance.ts`: começa em `startTime = Date.UTC(2017, 7, 17)`, `interval=1d&limit=1000`, avança `startTime = último openTime + 86_400_000` até vir < 1000 candles. Data = `new Date(openTime).toISOString().slice(0, 10)`. Guarda contra loop infinito (máx. 30 páginas).
- [ ] **Step 2: Em `ingest.ts`**, trocar `fetchBinanceCloses()` por `new Map((await fetchBinanceDaily()).map(k => [k.date, k.close]))` e apagar a função antiga.
- [ ] **Step 3: Verificar**

Run: `node -e "import('./scripts/binance.ts').then(async m => { const k = await m.fetchBinanceDaily(); console.log(k.length, k[0].date, k.at(-1).date) })"`
Expected: mais de 3300 candles, primeiro `2017-08-17`, último = hoje (UTC).

- [ ] **Step 4: Commit** — `fix(ingest): fetch full Binance daily history since 2017`

---

### Task 2: Candidatos de nível e escolha pelo preço ao vivo

**Files:**
- Modify: `src/lib/levels.ts` (exportar `emaSeries`; `ema` passa a usar `emaSeries`; adicionar `candidateLevels` e `pickLevels`)
- Modify: `src/lib/types.ts` (tipos de nível)
- Test: `src/lib/levels.test.ts`

**Interfaces:**
- Consumes: `Ohlc` (Task 1).
- Produces:
  - `emaSeries(values: number[], period: number): (number | null)[]` (null até ter `period` pontos; seed = SMA dos primeiros `period`)
  - `type LevelCandidate = { price: number; label: string }`
  - `type PickedLevel = LevelCandidate & { side: 'above' | 'below' }`
  - `candidateLevels(ohlc: Ohlc[]): LevelCandidate[]`
  - `pickLevels(cands: LevelCandidate[], price: number, perSide = 3): PickedLevel[]` (ordenado do maior preço para o menor)

Candidatos e rótulos exatos: `Máxima de 7d` / `Mínima de 7d` (idem 14d, 30d, 90d; máx de `high`, mín de `low` dos últimos N candles, incluindo hoje), `EMA 21`, `EMA 50`, `EMA 200` (sobre `close`), `Banda superior (Bollinger)` / `Banda inferior (Bollinger)` (SMA20 ± 2σ populacional dos `close`), `Máxima do mês anterior` / `Mínima do mês anterior` (mês civil anterior ao do último candle). Omitir os que não têm dados suficientes.

- [ ] **Step 1: Testes que falham** (manter os testes existentes de `suggestLevels`):

```ts
test('emaSeries: null até period, depois EMA', () => {
  const s = emaSeries([1, 2, 3, 4], 3)
  assert.deepEqual(s.slice(0, 2), [null, null])
  assert.equal(s[2], 2)        // seed = SMA(1,2,3)
  assert.equal(s[3], 3)        // 4*0.5 + 2*0.5
})
test('candidateLevels: rótulos e swing por high/low', () => {
  const ohlc = Array.from({ length: 250 }, (_, i) => ({ date: dayStr(i), open: 100, high: 100 + (i === 245 ? 50 : 1), low: 99, close: 100 }))
  const c = candidateLevels(ohlc)
  assert.equal(c.find(x => x.label === 'Máxima de 7d')!.price, 150)
  assert.ok(c.some(x => x.label === 'EMA 200'))
  assert.ok(c.some(x => x.label === 'Máxima do mês anterior'))
})
test('pickLevels: lado pelo preço, filtro 0,5%, dedup 1%, até 3 por lado', () => {
  const cands = [101, 100.3, 103, 103.5, 106, 110, 97, 95, 90, 85].map((p, i) => ({ price: p, label: 'L' + i }))
  const r = pickLevels(cands, 100)
  assert.ok(!r.some(x => x.price === 100.3))                 // <0,5%
  assert.ok(!(r.some(x => x.price === 103) && r.some(x => x.price === 103.5))) // dedup <1%
  assert.equal(r.filter(x => x.side === 'above').length, 3)
  assert.equal(r.filter(x => x.side === 'below').length, 3)
  assert.ok(r.every(x => (x.side === 'above') === (x.price > 100)))
  assert.deepEqual(r.map(x => x.price), [...r.map(x => x.price)].sort((a, b) => b - a))
})
test('pickLevels: nível atravessado pelo preço ao vivo muda de lado', () => {
  const r = pickLevels([{ price: 105, label: 'x' }], 106)
  assert.equal(r[0].side, 'below')
})
```
(`dayStr(i)` = helper local que gera datas consecutivas `YYYY-MM-DD` a partir de 2025-01-01.)

- [ ] **Step 2: Rodar e ver falhar** — `node --test src/lib/levels.test.ts` → FAIL (`emaSeries`/`candidateLevels`/`pickLevels` não exportados).
- [ ] **Step 3: Implementar** as quatro funções em `src/lib/levels.ts`. `pickLevels` segue a mesma ideia de dedup já usada em `suggestLevels` (ordenar por proximidade, aceitar se a >1% dos já aceitos).
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → todos PASS (incluindo os de `suggestLevels`).
- [ ] **Step 5: Commit** — `feat(levels): candidate levels and live-price picking`

---

### Task 3: Curvas empíricas de toque por regime

**Files:**
- Create: `src/lib/touch.ts`
- Modify: `src/lib/types.ts`
- Test: `src/lib/touch.test.ts`

**Interfaces:**
- Consumes: `Ohlc` (Task 1), `emaSeries` (Task 2, `from './levels.ts'`).
- Produces (constantes e tipos exatos):
  - `Z_STEP = 0.1`, `Z_MAX = 4` (grade de 41 pontos, `z = k * 0.1`), `HORIZONS = [7, 30] as const`, `MIN_REGIME_N = 200`, `VOL_WINDOW = 20`
  - `type Regime = 'bull' | 'bear' | 'mixed'`
  - `type TouchCurve = { p: number[]; n: number }` (`p[k]` = fração das amostras com excursão ≥ `k*Z_STEP`; `p.length === 41`)
  - `type TouchSample = { i: number; regime: Regime; sigma: number; exc: Record<7 | 30, { up: number; down: number } | null> }`
  - `regimeOf(close: number, ema50: number, ema200: number): Regime`: `bull` se acima das duas, `bear` se abaixo das duas, senão `mixed`
  - `realizedVol(closes: number[], end: number, window = VOL_WINDOW): number | null`: desvio-padrão amostral dos log-retornos diários que terminam em `end`
  - `touchSamples(ohlc: Ohlc[]): TouchSample[]`: um por dia com EMA200 e vol disponíveis; `exc[h].up = ln(máx high de i+1..i+h ÷ close_i) / (sigma·√h)`, `down = ln(close_i ÷ mín low de i+1..i+h) / (sigma·√h)`; `null` se faltar futuro
  - `survival(values: number[]): TouchCurve`
  - `type TouchModel = Record<7 | 30, Record<'up' | 'down', Record<Regime | 'all', TouchCurve>>>`
  - `buildModel(samples: TouchSample[], knownBefore = Infinity): TouchModel`: usa só amostras com `i + h < knownBefore` (resultado já conhecido)
  - `probAt(curve: TouchCurve, z: number): number`: `z ≤ 0` → 1; `z ≥ Z_MAX` → `p[40]`; senão interpolação linear na grade
  - `curveFor(model: TouchModel, h: 7 | 30, dir: 'up' | 'down', regime: Regime): TouchCurve`: curva do regime se `n ≥ MIN_REGIME_N`, senão a de `'all'`

- [ ] **Step 1: Testes que falham**

```ts
test('regimeOf', () => {
  assert.equal(regimeOf(110, 100, 105), 'bull')
  assert.equal(regimeOf(90, 100, 105), 'bear')
  assert.equal(regimeOf(102, 100, 105), 'mixed')
})
test('survival: fração >= z na grade', () => {
  const c = survival([0, 0.5, 1, 2])
  assert.equal(c.p.length, 41)
  assert.equal(c.p[0], 1)                   // z=0: todas
  assert.equal(c.p[5], 0.75)                // z=0.5: 0.5, 1, 2
  assert.equal(c.p[20], 0.25)               // z=2
  assert.equal(c.p[40], 0)
  assert.equal(c.n, 4)
})
test('probAt: bordas e interpolação', () => {
  const c = survival([0, 0.5, 1, 2])
  assert.equal(probAt(c, -1), 1)
  assert.equal(probAt(c, 99), c.p[40])
  assert.ok(Math.abs(probAt(c, 0.55) - (c.p[5] + c.p[6]) / 2) < 1e-9)
})
test('touchSamples: excursão usa high/low do futuro e é null sem futuro', () => {
  const ohlc = trendSeries(300)            // helper: série com ruído determinístico
  const s = touchSamples(ohlc)
  assert.ok(s.length > 0)
  assert.equal(s.at(-1)!.exc[7], null)
  const x = s.find(v => v.exc[7])!
  assert.ok(x.exc[7]!.up >= 0 && x.exc[7]!.down >= 0)
})
test('buildModel walk-forward ignora resultados ainda não conhecidos', () => {
  const s = touchSamples(trendSeries(400))
  const cut = s[150].i
  const m = buildModel(s, cut)
  assert.equal(m[30].up.all.n, s.filter(v => v.exc[30] && v.i + 30 < cut).length)
})
test('curveFor cai para all com amostra pequena', () => {
  const s = touchSamples(trendSeries(400))
  const m = buildModel(s)
  m[7].up.bear = { p: m[7].up.bear.p, n: 10 }
  assert.equal(curveFor(m, 7, 'up', 'bear'), m[7].up.all)
})
```
(`trendSeries(n)` = helper local: OHLC com `close = 100·e^(0.001·i + 0.02·sin(i))`, `high = close·1.01`, `low = close·0.99`.)

- [ ] **Step 2: Rodar e ver falhar** — `node --test src/lib/touch.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar** `src/lib/touch.ts` com as assinaturas acima. Regime e vol do dia `i` usam só dados até `i`.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS.
- [ ] **Step 5: Commit** — `feat(touch): empirical touch-probability curves by regime`

---

### Task 4: Calibração walk-forward

**Files:**
- Modify: `src/lib/touch.ts`
- Test: `src/lib/touch.test.ts`

**Interfaces:**
- Consumes: `TouchSample`, `buildModel`, `curveFor`, `probAt` (Task 3).
- Produces:
  - `type CalBucket = { pred: number; obs: number; n: number }`
  - `type Calibration = { buckets: CalBucket[]; mae: number }` (`mae` = erro médio absoluto `|pred − obs|` ponderado por `n`, em fração 0..1)
  - `calibrate(samples: TouchSample[], h: 7 | 30, warmup = 730, step = 5): Calibration`

Algoritmo (fixo): para cada amostra de teste `t` a partir do índice `warmup` (de `step` em `step`) com `exc[h]` conhecida, montar `buildModel(samples, samples[t].i)`, pegar `curveFor(..., samples[t].regime)` e, para cada `z ∈ {0.5, 1, 1.5, 2}` e cada direção, registrar `pred = probAt(curve, z)` e `hit = exc[h][dir] ≥ z`. Agrupar por decil de `pred` (0–10%, …, 90–100%); em cada grupo, `pred` = média das previsões e `obs` = fração de acertos. Omitir grupos vazios.

- [ ] **Step 1: Teste que falha**

```ts
test('calibrate: buckets bem formados e mae pequeno em série estacionária', () => {
  const s = touchSamples(randomWalk(2500, 42))   // helper: passeio aleatório com seed fixa
  const c = calibrate(s, 7)
  assert.ok(c.buckets.length >= 3)
  for (const b of c.buckets) assert.ok(b.n > 0 && b.pred >= 0 && b.pred <= 1 && b.obs >= 0 && b.obs <= 1)
  assert.ok(c.mae < 0.08, `mae ${c.mae}`)        // processo estacionário => calibrado
})
```
(`randomWalk(n, seed)` = helper local com PRNG determinístico, ex. mulberry32; log-retornos ~N(0, 0.03); high/low = close·(1 ± |ruído|·0.01).)

- [ ] **Step 2: Rodar e ver falhar** — `node --test src/lib/touch.test.ts` → FAIL (`calibrate` não existe).
- [ ] **Step 3: Implementar `calibrate`** conforme o algoritmo acima.
- [ ] **Step 4: Rodar e ver passar** — PASS, e o tempo total do arquivo fica abaixo de ~10 s (se não, aumentar `step` no teste, não no código).
- [ ] **Step 5: Commit** — `feat(touch): walk-forward calibration`

---

### Task 5: Retornos mensais

**Files:**
- Create: `src/lib/seasonality.ts`
- Test: `src/lib/seasonality.test.ts`

**Interfaces:**
- Produces:
  - `type MonthlyReturn = { year: number; month: number; ret: number; partial: boolean }` (`month` 1–12)
  - `monthlyReturns(daily: { date: string; close: number }[], fromYear = 2013): MonthlyReturn[]`: `ret = último close do mês ÷ último close do mês anterior − 1`; o mês do último dado é `partial: true` se a última data não for o último dia do mês; o primeiro mês da série é omitido (sem mês anterior)
  - `monthStats(rows: MonthlyReturn[], month: number): { positivePct: number | null; median: number | null; n: number }` (ignora `partial`)

- [ ] **Step 1: Testes que falham**

```ts
test('monthlyReturns: retorno fim-a-fim e mês parcial', () => {
  const d = [
    { date: '2024-01-31', close: 100 }, { date: '2024-02-29', close: 110 },
    { date: '2024-03-15', close: 99 },
  ]
  const r = monthlyReturns(d, 2024)
  assert.equal(r.length, 2)
  assert.ok(Math.abs(r[0].ret - 0.1) < 1e-9)
  assert.deepEqual([r[0].year, r[0].month, r[0].partial], [2024, 2, false])
  assert.equal(r[1].partial, true)
})
test('monthStats: ignora parcial, mediana robusta', () => {
  const rows = [0.1, -0.2, 4.49, 0.05].map((ret, i) => ({ year: 2013 + i, month: 11, ret, partial: false }))
  rows.push({ year: 2026, month: 11, ret: -0.5, partial: true })
  const s = monthStats(rows, 11)
  assert.equal(s.n, 4)
  assert.equal(s.positivePct, 0.75)
  assert.ok(Math.abs(s.median! - 0.075) < 1e-9)
})
```

- [ ] **Step 2: Rodar e ver falhar** — `node --test src/lib/seasonality.test.ts` → FAIL.
- [ ] **Step 3: Implementar** as duas funções.
- [ ] **Step 4: Rodar e ver passar** — PASS.
- [ ] **Step 5: Commit** — `feat(seasonality): monthly returns and per-month stats`

---

### Task 6: Snapshot diário no worker

**Files:**
- Create: `supabase/migrations/0006_decision_snapshot.sql`
- Modify: `src/lib/types.ts` (tipo `DecisionSnapshot`)
- Create: `scripts/decision.ts`
- Modify: `scripts/scheduler.ts` (rodar `scripts/decision.ts` junto com a ingestão: na subida e a cada 24h)

**Interfaces:**
- Consumes: `fetchBinanceDaily` (T1), `candidateLevels`/`emaSeries` (T2), `touchSamples`/`buildModel`/`regimeOf`/`realizedVol` (T3), `calibrate` (T4), `monthlyReturns` (T5).
- Produces:
  - Tabela `decision_snapshot (id int primary key default 1 check (id = 1), updated_at timestamptz not null default now(), payload jsonb not null)`, RLS ligada, policy `select to anon using (true)`.
  - `type DecisionSnapshot = { date: string; close: number; sigma: number; regime: Regime; model: TouchModel; calibration: Record<7 | 30, Calibration>; levels: LevelCandidate[]; monthly: MonthlyReturn[] }` (`sigma` = `realizedVol` do último dia; `regime` = `regimeOf` do último dia).

- [ ] **Step 1: Escrever a migration** (padrão das anteriores: `create table if not exists`, `drop policy if exists` + `create policy`).
- [ ] **Step 2: Implementar `scripts/decision.ts`**: `fetchBinanceDaily()`; série de closes para o mapa = closes do CBBI (`https://colintalkscrypto.com/cbbi/data/latest.json`, campo `Price`) antes de 2017-08-17 + Binance a partir daí; montar o `DecisionSnapshot`; `upsert({ id: 1, payload, updated_at })` com `SERVICE_ROLE_KEY` (mesmo padrão de cliente/env do `ingest.ts`); log de uma linha com regime, sigma, n de níveis e `mae` de 7/30d. Erro → `process.exit(1)`, como no ingest.
- [ ] **Step 3: Aplicar a migration** no Supabase (SQL Editor, ou via SSH com o acesso do runbook de memória `supabase-kong-outage`, **somente com o OK do usuário**).
- [ ] **Step 4: Rodar e verificar**

Run: `node --env-file=supabase/.env scripts/decision.ts`
Expected: log com `regime=…`, `mae7≈`/`mae30≈` abaixo de 0.1 e saída 0. Depois, `GET /rest/v1/decision_snapshot?select=updated_at` com a anon key → 200 com a data de hoje.

- [ ] **Step 5: Commit** — `feat(worker): daily decision snapshot (levels, touch model, calibration, monthly)`

---

### Task 7: Linhas da tabela + alarme compartilhado

**Files:**
- Create: `src/lib/chances.ts`
- Test: `src/lib/chances.test.ts`
- Create: `src/lib/alerts.ts`
- Modify: `src/components/Alerts.tsx` (usar `createPriceAlert` no lugar do insert inline em `addAlert`)

**Interfaces:**
- Consumes: `DecisionSnapshot` (T6), `pickLevels` (T2), `curveFor`/`probAt`/`HORIZONS` (T3).
- Produces:
  - `type LevelRow = PickedLevel & { prob: Record<7 | 30, number>; n: Record<7 | 30, number> }`
  - `levelRows(snap: DecisionSnapshot, price: number): LevelRow[]`: `z = |ln(level ÷ price)| / (snap.sigma · √h)`; direção `up` para `above` e `down` para `below`; curva via `curveFor(snap.model, h, dir, snap.regime)`; `n` = `curve.n`
  - `fmtProb(p: number): string`: `< 0.01` → `"<1%"`, `> 0.99` → `">99%"`, senão `Math.round(p·100) + "%"`
  - `createPriceAlert(target: number, direction: 'above' | 'below', note: string | null): Promise<{ ok: boolean; error?: string }>` em `src/lib/alerts.ts`

- [ ] **Step 1: Testes que falham** (`chances.test.ts`). Helper local `snap(over: Partial<DecisionSnapshot>)`: `{ date: '2026-10-18', close: 100, sigma: 0.03, regime: 'mixed', model: buildModel(touchSamples(trendSeries(400))), calibration: {} as any, levels: [{ price: 103, label: 'x' }, { price: 96, label: 'y' }], monthly: [], ...over }`, com `trendSeries` copiado do `touch.test.ts`.

```ts
test('levelRows: mais perto => chance maior, mesmo lado', () => {
  const r = levelRows(snap({ levels: [{ price: 101.5, label: 'a' }, { price: 108, label: 'b' }], close: 100 }), 100)
  const a = r.find(x => x.label === 'a')!, b = r.find(x => x.label === 'b')!
  assert.ok(a.prob[7] > b.prob[7] && a.prob[30] >= a.prob[7])
})
test('levelRows: 30 dias nunca menor que 7 dias', () => {
  for (const x of levelRows(snap({ close: 100 }), 100)) assert.ok(x.prob[30] >= x.prob[7] - 1e-9)
})
test('fmtProb: bordas', () => {
  assert.equal(fmtProb(0.004), '<1%'); assert.equal(fmtProb(0.995), '>99%'); assert.equal(fmtProb(0.234), '23%')
})
```

- [ ] **Step 2: Rodar e ver falhar** — `node --test src/lib/chances.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `chances.ts` e `alerts.ts`; trocar o insert de `Alerts.tsx` por `createPriceAlert` (comportamento igual: depois de criar, recarregar a lista).
- [ ] **Step 4: Rodar e ver passar** — PASS; `npm run build` sem erros.
- [ ] **Step 5: Commit** — `feat(chances): level rows from live price; shared createPriceAlert`

---

### Task 8: Seção "Chances desta semana e deste mês"

**Files:**
- Create: `src/hooks/useDecision.ts`
- Create: `src/components/Chances.tsx`
- Modify: `src/App.tsx` (aba `panel` renderiza `<Chances />`, `<Seasonality />` e `<Panel />` em sequência, numa coluna `flex flex-col gap-4`, para não depender do estado de carregamento do Panel)

**Interfaces:**
- Consumes: `DecisionSnapshot` (T6), `levelRows`/`fmtProb` (T7), `createPriceAlert` (T7), `useBtcPrice` (existente), `fmtUsd` (existente, `src/lib/ui.ts`).
- Produces: `useDecision(): { snap: DecisionSnapshot | null; state: 'loading' | 'ready' | 'none' }` (lê `decision_snapshot.payload` com id 1; erro ou ausência → `'none'`). `Seasonality` vem da Task 9 (esta task cria só o import, e pode deixar `{/* Seasonality na Task 9 */}` até lá).

Comportamento e textos (fixos):
- Título: **"Chances desta semana e deste mês"**, com botão "?" no padrão do `HelpBtn`/`InfoSheet` de `Panel.tsx`.
- Preço usado: ao vivo (`useBtcPrice`); se ainda não chegou, `snap.close` com a legenda "preço de fechamento".
- Tabela: colunas **Nível**, **Por quê** (o `label`), **Em 7 dias**, **Em 30 dias**; seta ↑ para acima e ↓ para abaixo; cores `var(--buy)`/`var(--sell)` como no resto do app.
- Tocar numa linha expande: "Chance de o preço encostar em {nível} em algum momento nos próximos 7 / 30 dias." e o botão **"Criar alarme neste nível"** → `createPriceAlert(price, side, label + ' · painel')` → texto "Alarme criado ✓" ou a mensagem de erro.
- Rodapé: "Baseado em {n} situações parecidas desde 2017." (n da curva de 30d do regime atual) e "Teste sem olhar o futuro: as chances erraram em média ±{round(mae30·100)} pontos."
- "?" explica: o que é "encostar", o que é regime (tendência de alta/baixa/mista pelas médias de 50 e 200 dias) e a tabela de calibração (`buckets` de 30d: "previu ~X% → aconteceu Y%").
- `state === 'none'` → um card curto: "As chances aparecem depois do primeiro cálculo diário." Nunca quebra o Painel.

- [ ] **Step 1: Implementar** `useDecision`, `Chances` e a mudança em `App.tsx`.
- [ ] **Step 2: Verificar no navegador** (`preview_start` com `dev`, aba Painel): tabela com até 3 linhas ↑ e 3 ↓, chances entre `<1%` e `>99%`, rodapé com n e erro médio; expandir uma linha e criar um alarme → aparece na aba Alertas; sem console errors. Simular "sem snapshot" (renomear temporariamente o id consultado) → card de aviso, Painel antigo ainda abaixo.
- [ ] **Step 3: Commit** — `feat(ui): chances table with one-tap alarms`

---

### Task 9: Mapa de retornos mensais

**Files:**
- Create: `src/components/Seasonality.tsx`
- Modify: `src/App.tsx` (trocar o placeholder pela `<Seasonality />`)

**Interfaces:**
- Consumes: `useDecision` (T8), `MonthlyReturn`/`monthStats` (T5).

Comportamento e textos (fixos):
- Título **"Retornos por mês"**, com "?" ("Verde = mês fechou positivo. Contexto, não previsão: são só ~13 exemplos por mês.").
- Grade: anos em linhas (mais recente no topo), meses em colunas `Jan … Dez`; célula com `+x.x%` / `−x.x%`, fundo `var(--buy)`/`var(--sell)` em baixa opacidade (mesmo tom de `signalTint` em `ui.ts`); vazia sem dado; mês parcial com contorno tracejado e "(parcial)" no `title`.
- Linha final **"Positivo"**: `positivePct` em %, e linha **"Mediana"**: mediana em %.
- Colunas do **mês atual e do próximo** destacadas (borda `var(--btc)`).
- Em 375px de largura a grade rola na horizontal **dentro do card** (a página não ganha rolagem lateral); coluna do ano fixa (`sticky left-0`).

- [ ] **Step 1: Implementar** `Seasonality.tsx` e plugar em `App.tsx`.
- [ ] **Step 2: Verificar no navegador** em `resize_window` mobile (375×812): sem rolagem horizontal da página, grade rola no card, coluna do ano fixa, mês atual marcado como parcial e fora de "Positivo"/"Mediana" (conferir um mês contra o cálculo à mão de 2 anos). Voltar com `preset: desktop`.
- [ ] **Step 3: `npm run build`** sem erros e todos os testes: `node --test src/lib/*.test.ts` → PASS.
- [ ] **Step 4: Commit e push** — `feat(ui): monthly returns heatmap`, depois `git push` (o usuário implanta `btcsignals` e `btcsignals-ingest` no EasyPanel).
