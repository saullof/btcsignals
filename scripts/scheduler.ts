// Worker que roda a ingestão sozinho: 1x na subida + a cada 24h.
// Processo longo (fica de pé) — encaixa no modelo "App" do EasyPanel.
// Cada execução é isolada num processo filho: se uma falhar, o worker segue.
import { spawn } from 'node:child_process'

const DAY = 24 * 60 * 60 * 1000
const ALERT_MS = 3 * 60 * 1000 // alarmes de preço: checagem rápida

function run(script: string) {
  const p = spawn(process.execPath, [script], { stdio: 'inherit' })
  p.on('exit', (code) => console.log(new Date().toISOString(), `${script} saiu (code ${code})`))
}

// Ingestão completa + snapshot do painel de decisão: 1x na subida + a cada 24h.
const daily = () => {
  console.log(new Date().toISOString(), '→ rodando ingestão e snapshot de decisão…')
  run('scripts/ingest.ts')
  run('scripts/decision.ts')
}
daily()
setInterval(daily, DAY) // ponytail: intervalo simples de 24h; troca por cron se precisar horário fixo

// Alarmes de preço: loop leve só de preço vivo + push.
run('scripts/check-alerts.ts')
setInterval(() => run('scripts/check-alerts.ts'), ALERT_MS)
