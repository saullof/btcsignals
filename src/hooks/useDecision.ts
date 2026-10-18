import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DecisionSnapshot } from '../lib/types'

// Uma busca por carregamento do app, compartilhada entre as seções que leem o snapshot.
let cache: Promise<DecisionSnapshot | null> | null = null

function load(): Promise<DecisionSnapshot | null> {
  if (!cache) {
    cache = (async () => {
      if (!supabase) return null
      const { data, error } = await supabase.from('decision_snapshot').select('payload').eq('id', 1).maybeSingle()
      return error || !data ? null : (data.payload as DecisionSnapshot)
    })()
  }
  return cache
}

export function useDecision(): { snap: DecisionSnapshot | null; state: 'loading' | 'ready' | 'none' } {
  const [snap, setSnap] = useState<DecisionSnapshot | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'none'>('loading')
  useEffect(() => {
    load().then((s) => {
      setSnap(s)
      setState(s ? 'ready' : 'none')
    })
  }, [])
  return { snap, state }
}
