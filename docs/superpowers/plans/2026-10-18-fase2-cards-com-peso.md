# Fase 2 — Cards com peso — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada indicador mostra a distribuição "alta forte / lateral / queda forte" em 30 dias (7 dias ao tocar), medida no histórico. Indicador sem poder comprovado num teste walk-forward vai para uma seção recolhida "Não ajudam neste prazo". Entram indicadores de curto prazo (RSI, distância das EMAs, momentum, volatilidade, %B de Bollinger, funding). O Pi Cycle vira "distância até o sinal de topo".

**Architecture:** Funções puras de série em `src/lib/indicators.ts` e de peso/validação em `src/lib/weights.ts`. O worker (`scripts/decision.ts`) monta as séries (CBBI, Fear & Greed, Mayer, curto prazo, funding da Binance), calcula os pesos e o teste walk-forward e grava tudo no mesmo `decision_snapshot.payload` (campos novos `indicators` e `piCycle`). No app, o componente `IndicatorWeights.tsx` substitui a grade antiga de cards do Painel; o resto do Painel antigo fica.

**Tech Stack:** igual à fase 1 (TypeScript, Node 24 strip-types, React 19 + Tailwind v4, `node:test`, sem dependências novas).

**Spec:** `docs/superpowers/specs/2026-10-18-painel-decisao-semanal-design.md` (5.2, 6.1, 6.4, 6.5; fase 2 da seção 8)

## Global Constraints

- Tudo da fase 1 vale: pt-BR com "você"; sem dependência nova; imports de valor com `.ts` em `src/lib` usados pelo worker; nada de dado futuro na validação.
- **Resultados por tercis** do retorno histórico no prazo: "queda forte" ≤ q33, "lateral" entre q33 e q67, "alta forte" ≥ q67. O card mostra os limiares reais em %.
- **Critério de "ajuda"** (uma frase pro usuário): no teste walk-forward, o indicador melhorou o Brier score em **≥ 1%** sobre a base **e** ficou positivo nas **duas metades** do período de teste.
- Prazos: 7 e 30 dias. Faixas do indicador: **quintis** (5 faixas).
- O histórico de preço para os resultados usa CBBI (antes de 2017-08-17) + Binance (depois), como o mapa mensal.

## Review Focus

- **Indicador com histórico curto** (funding desde 2019, F&G desde 2018): avalia só onde há dados e não quebra se faltar warmup → `helps: false` com motivo "histórico curto".
- **Fonte fora do ar** (funding bloqueado no servidor, F&G caído): o indicador some do payload; os demais seguem.
- **Valor de hoje ausente** (CBBI defasado 1–2 dias): usa o último valor disponível até 3 dias atrás; mais velho → indicador omitido.
- **Snapshot antigo sem `indicators`** (app novo lendo payload da fase 1 antes do worker rodar): a seção mostra o aviso e o Painel não quebra.
- **Empates nos quintis** (indicadores discretos como F&G): os limites repetidos não podem gerar faixa vazia que zere a distribuição; suavização de Laplace garante probabilidades > 0.

---

### Task 1: Séries de curto prazo e Pi Cycle

**Files:** Create `src/lib/indicators.ts`, Test `src/lib/indicators.test.ts`

**Interfaces — Produces** (todas devolvem `(number | null)[]` alinhado a `closes`, `null` sem dados suficientes):
- `rsiSeries(closes: number[], period = 14)`: RSI de Wilder
- `emaDistSeries(closes: number[], period: number)`: `close / EMA − 1` (usa `emaSeries` de `./levels.ts`)
- `returnSeries(closes: number[], n: number)`: `close / close[i−n] − 1`
- `volSeries(closes: number[], window = 20)`: `realizedVol` de `./touch.ts` em cada dia
- `pctBSeries(closes: number[], period = 20)`: `(close − (SMA − 2σ)) / (4σ)`
- `piRatioSeries(closes: number[])`: `SMA111 / (2 · SMA350)`

- [ ] **Step 1: Testes que falham** — RSI de série só subindo = 100 e só caindo = 0; `emaDistSeries` de série constante = 0; `returnSeries([100,110,121],1)` = `[null, 0.1, 0.1]`; `pctBSeries` no topo da banda ≈ 1 e na média ≈ 0,5; `piRatioSeries` de série constante (≥ 350 pontos) = 0,5; comprimento sempre igual ao de `closes`.
- [ ] **Step 2: Rodar** `node --test src/lib/indicators.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** → PASS.
- [ ] **Step 5: Commit** — `feat(indicators): short-term indicator series and Pi Cycle ratio`

### Task 2: Peso por tercis e teste walk-forward

**Files:** Create `src/lib/weights.ts`, Test `src/lib/weights.test.ts`

**Interfaces — Produces:**
- `type Dist = [number, number, number]` (queda, lateral, alta; soma 1)
- `type HorizonWeight = { dist: Dist; thresholds: [number, number]; n: number; skill: number; helps: boolean; reason: string }`
- `terciles(values: number[]): [number, number]`
- `quintileEdges(values: number[]): number[]` (4 cortes)
- `binOf(x: number, edges: number[]): number` (0..4)
- `condDist(xs: number[], cls: number[], edges: number[]): Dist[]` (Laplace +1 por classe)
- `brier(p: Dist, cls: number): number`
- `horizonWeight(series: (number | null)[], closes: number[], h: number, opts?: { warmup?: number; step?: number; refit?: number }): HorizonWeight | null` — `null` se não houver valor de hoje. Padrões: `warmup = 1095` amostras, `step = 7`, `refit = 30`. Walk-forward: a cada `refit` dias, refaz tercis, cortes e `condDist` só com resultados conhecidos (`t' + h < t`); prevê os dias de teste (de `step` em `step`) até o próximo refit; `skill = 1 − Brier_modelo / Brier_base` (base = frequência das classes no mesmo treino); `helps` pelo critério das Global Constraints; `reason` em pt-BR ("melhorou a previsão em X% nos testes" / "não melhorou a previsão nos testes" / "histórico curto"). `dist`/`thresholds`/`n` do card vêm do histórico completo conhecido hoje, na faixa do valor de hoje.

- [ ] **Step 1: Testes que falham** — `terciles` de 1..9 = [3.64.., 6.36..] (definir com interpolação linear e testar valores exatos); `binOf` nas bordas; `condDist` com Laplace nunca zera; **indicador preditivo sintético** (valor = sinal do retorno futuro + ruído, 3000 dias de passeio aleatório) → `helps: true`, `skill > 0.01`; **indicador de puro ruído** → `helps: false`; série com menos dados que o warmup → `helps: false`, `reason: 'histórico curto'`; valor de hoje `null` → `null`.
- [ ] **Step 2: Rodar** `node --test src/lib/weights.test.ts` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** → PASS em < 10 s.
- [ ] **Step 5: Commit** — `feat(weights): tercile weights and walk-forward skill test`

### Task 3: Worker — séries, pesos e payload

**Files:** Create `scripts/sources.ts` (move `CBBI_INDICATORS`, `fetchJson`, `seriesToMap`, `tsToDate` de `ingest.ts`, que passa a importar daqui); Modify `scripts/decision.ts`, `src/lib/types.ts`.

**Interfaces — Produces:** no `DecisionSnapshot`:
- `indicators: { key: string; group: 'ciclo' | 'curto'; value: number; w: Record<7 | 30, HorizonWeight> }[]`
- `piCycle: { ratio: number } | null`

Indicadores: os 8 do CBBI (valor bruto 0..1), `fng` (alternative.me), `mayer` (close/SMA200), `rsi`, `ema21` e `ema50` (distância), `ret30`, `vol20`, `pctb`, `funding` (média de 7 dias da taxa de funding da Binance futuros, `GET https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1000&startTime=…`, paginado; falha → indicador omitido com log). Todos alinhados ao calendário de closes mesclado. `pi_cycle` sai de `indicators` e vira `piCycle.ratio` (último valor de `piRatioSeries`).

- [ ] **Step 1: Implementar** `sources.ts` e trocar os helpers no `ingest.ts` (comportamento idêntico).
- [ ] **Step 2: Implementar** a montagem em `decision.ts` e os tipos.
- [ ] **Step 3: Rodar** `node --env-file=supabase/.env scripts/decision.ts` → log com a contagem `indicadores=N úteis7=X úteis30=Y` e saída 0; tempo total < 60 s. Conferir no payload (GET anon) que `indicators` tem os campos e que `dist` soma 1.
- [ ] **Step 4: Commit** — `feat(worker): indicator weights with walk-forward test`

### Task 4: Cards com peso no app

**Files:** Create `src/components/IndicatorWeights.tsx`; Modify `src/components/Panel.tsx` (remover a grade antiga `Indicadores` + `IndicatorCard`/`Sheet` se ficarem sem uso), `src/lib/ui.ts` (nomes e descrições dos indicadores novos), `src/App.tsx` (posição: depois de `Seasonality`, antes do `Panel`).

Comportamento e textos:
- Título **"Indicadores — peso em 30 dias"** com "?" (o que é a barra, os tercis com os limiares reais, o critério de "ajuda" em uma frase).
- Seção principal: indicadores com `helps` em 30 **ou** 7 dias. Card: nome, valor de hoje, **barra de 3 cores** (`var(--sell)` queda / `var(--neutral)` lateral / `var(--buy)` alta) com as % e a linha "Normalmente: ~33% cada"; o rótulo do maior desvio da base ("mais chance de alta" / "de queda" / "lateral").
- Tocar abre a folha com a descrição, a barra de 7 dias, os limiares ("alta forte = subir mais de +X% em 30 dias") e o `reason` de cada prazo.
- Seção recolhida **"Não ajudam neste prazo (N)"**, com cada indicador e o `reason`; dentro dela, o Pi Cycle como "Distância até o sinal de topo: X%".
- Sem `indicators` no snapshot → um aviso curto, sem quebrar.

- [ ] **Step 1: Implementar.**
- [ ] **Step 2: Verificar no navegador** em 375×812: cards úteis com barra e %, seção recolhida abre e fecha, folha de detalhe, sem rolagem lateral na página, sem erros no console.
- [ ] **Step 3: `npm run build`** e todos os testes `node --test src/lib/*.test.ts` → PASS.
- [ ] **Step 4: Commit** — `feat(ui): weighted indicator cards with collapsed no-help section`
