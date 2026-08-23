import { useEffect, useState } from 'react'

export type BtcTicker = { price: number; changePct: number } | null

// Preço ao vivo direto do WebSocket público da Binance (roda no cliente).
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
        setTicker({ price: parseFloat(d.c), changePct: parseFloat(d.P) })
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
