# Painel de decisão semanal — design

Data: 2026-10-18 · Projeto: BTC Cycle Signals (`I:\App Cripto`)

## 1. Intenção e porquê

O app hoje responde "em que fase do ciclo de 4 anos o BTC está". O usuário precisa de outra coisa: **apoio estatístico para decidir na semana e no mês**. As decisões são quanto aportar, quando entrar ou sair numa operação de semanas, quando realizar lucro e quando se proteger de uma queda. Ele olha o app e age **semanalmente**.

Em ~2 meses de uso, o painel nunca deu um rumo. Os cards ficaram em "incerto", o composto oscilou entre 0,40 e 0,54 e a "chance de subir" ficou sempre acima de 50%. O que mais ajudou foram os **alertas de preço**, porque transformam análise em ação: um preço concreto e um gatilho.

A visão que o usuário descreveu, com as palavras dele:

> BTC a 82.000 · 10% de chance de chegar a 87.000 · 23% de chance de chegar a 79.000

Ou seja: algo **probabilístico, preso a níveis de preço, com prazo**, baseado em métricas e em análise gráfica, e não em opinião.

## 2. Evidências que motivam o redesenho

Medidas feitas em 2026-10-17/18 com os dados reais do app (`composite_snapshots`, Binance diário desde 2017, CBBI):

- **O composto de ciclo é forte no longo prazo e quase ruído no curto.** A correlação de Spearman entre o composto e o retorno futuro é 0,07 em 7d, 0,12 em 14d, 0,21 em 30d, 0,23 em 90d, 0,30 em 180d e **0,71 em 1 ano**.
- **No último ano o painel acertou o ciclo.** Mostrou venda em set–out/2025, perto de $110k, e compra em fev–jul/2026, entre $58k e $68k. Mas o usuário começou a usar o app depois disso, no meio do ciclo, quando "neutro" é a resposta honesta e inútil.
- **Pi Cycle Top:** disparou só 4 vezes em 13 anos (2013 duas vezes, 2017 e 2021), todas a ±3 dias de um topo real. Não disparou no topo de nov/2021 e **nunca disparou no ciclo 2024–26** (chegou no máximo a 0,736 de 1,0, em jun/2024). O card do app usa a versão normalizada do CBBI, que desde 2024 marcou 119 dias de "venda" e **zero de "compra"**: o indicador só sabe falar de topo.
- **Faixa de preço sozinha não decide.** Em $80–84k houve só 5 passagens desde 2017, com 53% no lucro em 7d (cara ou coroa). O "71% em 90d" vem de 3 passagens completas, uma delas com −21%. O que separou os resultados foi o **contexto** (tendência subindo ou caindo), não o preço.
- **Viés de olhar o futuro no código atual.** O percentil do Mayer e as faixas de base-rate são calculados com o histórico inteiro, incluindo dados posteriores a cada dia. O CBBI também é recalibrado em retrospecto. Os números históricos ficam melhores do que seriam na época.
- **Bug de dados:** `price_history` tem só ~1.054 dias (desde nov/2023). A paginação da Binance em `scripts/ingest.ts` traz apenas os últimos ~1000 dias, e os testes de curto prazo precisam de 2017+ com máxima e mínima (OHLC).

## 3. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
0. **Sugerir a ação** para cada uma das quatro decisões (aporte, operação de semanas, realizar lucro, proteção), em linguagem direta, sempre mostrando os números que levaram à sugestão. Decisão do usuário: o app não para nas informações.
1. Logo abaixo, uma **tabela de níveis de preço** com a **chance de o BTC tocar cada nível em 7 e 30 dias**, acima e abaixo do preço atual.
2. **Cards que dão peso.** Cada indicador mostra uma distribuição ("x% alta · y% queda · z% lateral") que **se mexe de verdade**. Indicador sem poder comprovado no prazo é sinalizado e sai da conta.
3. **Mapa de retornos mensais** (anos × meses, verde/vermelho) para dar contexto de sazonalidade.
4. **"O que aconteceu das últimas vezes que o BTC passou por aqui"**: o histórico de passagens pela faixa de preço atual, como contexto.
5. **Honestidade estatística visível.** Todo número mostra quanta evidência tem por trás, e o app mostra o quanto tem acertado (calibração).
6. Cada nível da tabela vira um **alarme com um toque**, reaproveitando o sistema de alertas que já existe.

**Não-objetivos**
- Visão de ciclo ou anual como foco. O painel antigo **fica**, mas abaixo do conteúdo novo.
- Trading intradiário, ordens automáticas, conexão com corretora.
- Dados pagos (Coinglass, Glassnode, Hyblock) nesta versão.
- Modelos de machine learning opacos.

**Anti-objetivos** (coisas que fariam o projeto fracassar mesmo funcionando)
- Números que **parecem precisos mas são ruído**: uma porcentagem sem amostra suficiente, apresentada com a mesma confiança das outras.
- Cards que **nunca saem do lugar**: o mesmo problema de hoje, com outra roupa.
- Estreitar faixas só para os cards "mexerem" sem acertar mais.
- **Sugestão de ação sem vantagem comprovada.** Uma regra que não bate a estratégia simples equivalente no histórico (aporte fixo, segurar) não pode aparecer como sugestão.
- Qualquer cálculo que use dados futuros ao avaliar o passado.

## 4. Restrições

- Stack atual: React 19 + Vite 6 + TypeScript + Tailwind v4 (PWA), Supabase self-hosted no EasyPanel, worker Node 24 (`scripts/scheduler.ts` → `scripts/ingest.ts` a cada 24h e `scripts/check-alerts.ts` a cada 3 min). Deploy pelo GitHub `saullof/btcsignals` (branch `master`).
- O usuário **não é técnico**: textos em português simples, cada número com explicação curta ("?").
- Fontes gratuitas e sem chave. A Binance (spot e futuros) funciona. A Deribit (opções) tem API pública e foi testada do PC do usuário. **Kalshi e Polymarket não resolvem DNS na rede do usuário**, então ficam fora.
- Mobile-first (iPhone, PWA instalado).

## 5. O que o usuário vai ver (ordem na tela "Painel")

### 5.0 Topo — "O que fazer esta semana"

Um card com quatro linhas, uma por decisão. Cada linha tem **a sugestão**, **o porquê em números** e **o grau de confiança**:

| Decisão | Exemplo de sugestão *(ilustrativo)* |
|---|---|
| Aporte | "Aporte normal. Considere guardar metade para $79.200 (52% de chance de tocar em 30 dias)." |
| Operação (semanas) | "Sem operação com vantagem esta semana." ou "Entrada perto de $79.200 · alvo $84.900 · saída se perder $76.800 · nas N vezes parecidas, deu certo em X%." |
| Realizar lucro | "Nada a realizar: chance de tocar $87.140 em 30 dias está abaixo do normal." |
| Proteção | "Risco de queda forte em 7 dias: normal (22% vs 21% de costume)." |

- Quando não há vantagem estatística, a sugestão diz isso claramente ("sem sinal, siga seu plano"). Essa é uma resposta válida e esperada, não uma falha.
- Ao tocar numa linha: a explicação completa e, quando houver nível de preço, o botão **"Criar alarme"**.
- Linha discreta no rodapé do card: "Sugestão estatística baseada no histórico, não recomendação." *(decisão minha; o usuário pediu antes para remover o card de aviso, então isto é só uma linha, e ele pode remover)*.

### 5.1 "Chances desta semana e deste mês"

- Preço atual (ao vivo, como já existe no header).
- Tabela com ~3 níveis acima e ~3 abaixo do preço:

| Nível | Por quê | Em 7 dias | Em 30 dias |
|---|---|---|---|
| 87.140 ↑ | Máxima de 30d | 12% | 38% |
| 84.900 ↑ | EMA 50 | 31% | 61% |
| 79.200 ↓ | Mínima de 14d | 24% | 52% |

  *(números ilustrativos)*
- "Chegar" = **o preço encostar no nível em algum momento** dentro do prazo, pela máxima/mínima do candle. É o mesmo gatilho dos alertas.
- Cada linha mostra a **origem do nível** em linguagem simples e, ao tocar, abre "o que isso significa" e o botão **"Criar alarme neste nível"**.
- Rodapé: "Baseado em N situações parecidas desde 2017 · Nas últimas previsões de ~25%, aconteceu 27%" (calibração).

### 5.2 Cards dos indicadores — com peso

- Cada card mostra uma **barra de 3 cores** com a distribuição para **30 dias** (e 7 dias ao tocar): "alta forte / lateral / queda forte".
- O rótulo (compra / incerto / venda) continua, derivado da barra.
- Ao lado, a comparação com o "normal": "Normalmente: 33% · 33% · 33%". O que importa é o **desvio**.
- Indicadores **sem poder comprovado** no prazo ficam numa seção recolhida "Não ajudam neste prazo", com o motivo. Eles não entram em nenhum número agregado.
- **Pi Cycle Top** deixa de ser compra/incerto/venda e vira só "Distância até o sinal de topo: 47%", nessa seção recolhida.

### 5.3 "Da última vez que passou por aqui"

Tabela de passagens pela faixa de preço atual (±2,5%, contando **toque pelo candle**, não só o fechamento): data, preço de entrada, resultado em 7/30/90d. Sempre com o aviso "N passagens — contexto, não previsão".

### 5.4 Mapa de retornos mensais

- Grade anos × meses desde 2013, verde/vermelho com o %, igual à referência que o usuário mandou (estilo Coinglass).
- Linha de resumo por mês: **% de anos positivos** e **mediana** (não média, por causa de extremos como nov/2013 +449%).
- Mês atual e próximo em destaque.

### 5.5 Painel antigo

Composto de ciclo, resumo e demais cards continuam abaixo, como estão hoje, exceto pelo item 5.2 e pela remoção do viés de futuro (6.7).

## 6. Metodologia

### 6.1 Dados
- Nova série diária **OHLC da Binance desde 2017-08-17**, com paginação corrigida (avançar `startTime` até o fim; o código atual só traz os últimos ~1000 dias). Antes de 2017, o preço de fechamento do CBBI basta para o mapa mensal.
- Candidatos a indicadores de curto prazo, todos gratuitos: EMAs 21/50/200, RSI 14, bandas de Bollinger 20, retorno de 30d, volatilidade realizada, **funding rate** e **open interest** de futuros da Binance (posicionamento alavancado, o mais próximo de "smart money" disponível de graça), Fear & Greed. Os indicadores de ciclo atuais também entram como candidatos.

### 6.2 Escolha dos níveis (análise gráfica, testável)
Candidatos: máximas e mínimas de 7/14/30/90 dias (onde se acumula liquidez/stops), EMAs 21/50/200, bandas de Bollinger, máxima e mínima do mês anterior. Remover os que estão a menos de ~0,5% do preço e deduplicar os próximos entre si (<1%), ficando com até 3 de cada lado, priorizando proximidade. **Sem arredondar para números redondos** (o usuário rejeitou isso nos alertas).

### 6.3 Chance de tocar um nível
- Abordagem empírica no estilo "probability of touch", **condicionada ao contexto**:
  1. Converter a distância até o nível em **unidades de volatilidade** (distância ÷ volatilidade realizada recente escalada pelo prazo).
  2. Classificar o dia num **regime** simples: tendência (preço vs EMA 50 e EMA 200) e, se ajudar na validação, volatilidade alta/baixa.
  3. No histórico, para cada dia, regime, direção (acima/abaixo) e faixa de distância, registrar se a máxima/mínima tocou aquela distância dentro de 7 e 30 dias.
  4. A tabela resultante (faixa de distância × direção × regime × prazo → probabilidade e n) é recalculada pelo worker uma vez por dia e gravada no banco.
  5. O app aplica a tabela ao **preço ao vivo**, então as chances se atualizam conforme o preço anda, sem chamar o servidor.
- Faixas com amostra insuficiente se fundem com as vizinhas ou mostram "poucos dados", nunca um número solto.

### 6.4 Peso dos cards (3 caminhos)
- Os resultados são definidos por **tercis do retorno histórico** em cada prazo (ex.: em 30d, "alta forte" = terço superior, que historicamente é algo como "+7% ou mais"). Assim o "normal" é 33/33/33 e qualquer desvio de um indicador fica visível. **O card mostra o limiar real em %** ("subir mais de 7%").
- Para cada indicador: agrupar o histórico em faixas do valor do indicador e medir a distribuição de resultados em cada faixa. O card mostra a distribuição da faixa em que o indicador está hoje.

### 6.5 Validação — o que decide se um indicador "ajuda"
- **Walk-forward:** cada avaliação no passado usa só dados disponíveis até aquele dia (janela expansiva).
- Um indicador ajuda num prazo se sua distribuição condicional difere da base de forma consistente fora da amostra. O critério concreto (ex.: melhoria do Brier score / log-loss sobre a base) fica para o construtor, desde que seja walk-forward e mostrado ao usuário em linguagem simples.
- **Amostra efetiva:** dias consecutivos não são independentes. Reportar sempre "N situações", e o construtor deve considerar a sobreposição das janelas ao decidir se há evidência.
- **Calibração da tabela de toques:** agrupar previsões passadas por faixa (0–10%, 10–20%…) e comparar com a frequência real. Mostrar no rodapé de 5.1 e numa tela "Como o app tem acertado".

### 6.6 Regras de ação (5.0)
- As sugestões vêm de **regras determinísticas e explicáveis** sobre os números de 6.3 e 6.4 (sem LLM, sem texto livre gerado). Cada regra cabe numa frase.
- Lógica de cada decisão (o construtor afina limiares pela validação):
  - **Aporte:** compara a chance de queda forte com a de alta forte em 30d (vs o normal) e a chance de tocar o suporte mais próximo. Saídas: aporte menor / normal / maior, e opcionalmente "guardar parte para o nível X".
  - **Operação (semanas):** usa um suporte como entrada, a resistência seguinte como alvo e o nível abaixo do suporte como saída. Só sugere quando, no histórico walk-forward, setups com o mesmo regime e as mesmas distâncias tiveram resultado esperado positivo e n suficiente. Caso contrário, "sem operação com vantagem".
  - **Realizar lucro:** chance de tocar a resistência acima do normal, combinada com a distribuição de 30d inclinada para queda, gera "considere realizar parte em $X".
  - **Proteção:** chance de queda forte em 7d e 30d acima do normal por uma margem definida na validação gera "risco acima do normal".
- **Prova obrigatória:** cada regra roda em backtest walk-forward (2017+) contra a estratégia simples correspondente: aporte semanal fixo para "Aporte", segurar para "Realizar lucro" e "Proteção", não operar para "Operação". **Regra que não bate a referência não é exibida**, e a linha mostra "sem sinal". O resultado do backtest aparece no "?" da linha ("nos testes, esta regra teria rendido X% vs Y% do aporte fixo").
- Grau de confiança (alto / médio / baixo) derivado do n e da margem sobre a referência.

### 6.7 Correções no que já existe
- Mayer e base-rates: trocar o percentil sobre o histórico inteiro por um percentil **walk-forward**.
- Documentar no "?" dos cards de CBBI que a fonte é recalibrada em retrospecto.

## 7. Decisões

**Do usuário**
- Horizonte semanal e mensal; agir semanalmente. Nada de visão anual como foco.
- Tabela de níveis com chance em **7 e 30 dias**, no topo.
- Painel antigo **mantido**, abaixo.
- Cards com distribuição de peso (compra/venda/incerto %) que precisa se mexer; se ficar sempre >50% "incerto", não serve.
- Mapa de retornos mensais com verde/vermelho.
- Alertas foram o que mais ajudou: integrar.
- **O app sugere a ação** para as quatro decisões, não só mostra probabilidades.

**Minhas** (o usuário pode revisar)
- "Chegar" = tocar pela máxima/mínima do candle, não fechar acima/abaixo.
- Probabilidade empírica condicionada a regime, e não Black-Scholes nem modelo de ML.
- Tercis para definir alta/lateral/queda nos cards (resolve o "incerto sempre >50%" sem estreitar faixas artificialmente).
- Níveis escolhidos por análise gráfica e validados pelo histórico; conceitos SMC como order blocks e FVG ficam fora da v1 por falta de validação estatística, e podem entrar depois se passarem no mesmo teste.
- Opções da Deribit como **segunda opinião** ("chance pelo mercado"), mas só na fase 4.
- Mediana e % de anos positivos no mapa mensal, em vez de média.
- Sugestões por regras determinísticas e só exibidas se baterem a estratégia simples no backtest walk-forward; caso contrário, "sem sinal".
- Uma linha discreta "sugestão estatística, não recomendação" no card de ação.

## 8. Fases

1. **Base + níveis:** OHLC 2017+ (corrige a paginação), níveis, tabela de toques 7/30d com calibração, alarme por nível, mapa mensal (ganho rápido).
2. **Cards com peso:** tercis, validação walk-forward dos indicadores atuais e dos novos de curto prazo (incl. funding e open interest), seção "não ajudam neste prazo", Pi Cycle como distância.
3. **Sugestões de ação:** card "O que fazer esta semana" (5.0) com as regras de 6.6 e seus backtests contra as referências.
4. **Contexto:** "da última vez que passou por aqui", correções de viés de futuro (6.7), tela "como o app tem acertado".
5. **Opcional:** chance pelo mercado (opções Deribit) ao lado da histórica; resumo semanal por push no domingo com as sugestões da semana.

## 9. Deixado para o construtor

- Esquema exato das tabelas novas (OHLC, tabela de toques, resultados dos indicadores) e migrations.
- Granularidade das faixas de distância e de valor dos indicadores, regras de fusão de faixas pequenas e o n mínimo.
- Critério estatístico exato de "ajuda" (6.5), desde que walk-forward e explicável em uma frase.
- Layout visual fino, cores, componentes e onde fica a tela "como o app tem acertado".
- Se a tabela de toques usa volatilidade realizada de 14, 20 ou 30 dias (escolher pela calibração).
- Limiares exatos das regras de ação (6.6), escolhidos pela validação walk-forward, e a fórmula do grau de confiança.
