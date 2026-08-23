import { useEffect, useState } from 'react'

export type BtcTicker = {
  price: number
  changePct: number
  changeAbs: number
  high: number
  low: number
  volQuote: number
} | null

// Preço ao vivo direto do WebSocket público da Binance (roda no cliente).
// O stream @ticker já traz máx/mín/volume 24h — sem chamada extra.
// Reconecta sozinho se a conexão cair.
export function useBtcPrice(): BtcTicker {
  const [ticker, setTicker] = useState<BtcTicker>(null)

  useEffect(() => {
    let ws: WebSocket | null = null
    let closed = false
    let retry: ReturnType<typeof setTimeout> | undefined

    const connect = () => {
      ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker')
      ws.onmessage = (e) => {
        const d = JSON.parse(e.data)
        setTicker({
          price: parseFloat(d.c),
          changePct: parseFloat(d.P),
          changeAbs: parseFloat(d.p),
          high: parseFloat(d.h),
          low: parseFloat(d.l),
          volQuote: parseFloat(d.q), // volume 24h em USDT
        })
      }
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 3000)
      }
      ws.onerror = () => ws?.close()
    }

    connect()
    return () => {
      closed = true
      clearTimeout(retry)
      ws?.close()
    }
  }, [])

  return ticker
}
