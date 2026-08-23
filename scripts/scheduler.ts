// Worker que roda a ingestão sozinho: 1x na subida + a cada 24h.
// Processo longo (fica de pé) — encaixa no modelo "App" do EasyPanel.
// Cada execução é isolada num processo filho: se uma falhar, o worker segue.
import { spawn } from 'node:child_process'

const DAY = 24 * 60 * 60 * 1000

function runOnce() {
  console.log(new Date().toISOString(), '→ rodando ingestão…')
  const p = spawn(process.execPath, ['scripts/ingest.ts'], { stdio: 'inherit' })
  p.on('exit', (code) => console.log(new Date().toISOString(), `ingestão saiu (code ${code})`))
}

runOnce()
setInterval(runOnce, DAY) // ponytail: intervalo simples de 24h; troca por cron se precisar horário fixo
