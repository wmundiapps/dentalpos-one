/**
 * Cache "stale-while-revalidate" para cálculos pesados lidos por muitos usuários ao mesmo tempo (painéis, alertas).
 * - Dentro de ttlMs devolve o valor guardado.
 * - Passado o ttl devolve o valor antigo NA HORA e recalcula em segundo plano (um único cálculo por chave, mesmo com 1.000 pedidos).
 * - Se o valor guardado tiver mais de maxStaleMs, o pedido espera o recálculo (nunca serve dado muito velho).
 */
export function swrCache<T>(ttlMs: number, maxStaleMs: number, load: (key: string) => Promise<T>) {
  const store = new Map<string, { at: number; value?: T; loading?: Promise<T> }>()

  function refresh(key: string): Promise<T> {
    const entry = store.get(key) ?? { at: 0 }
    if (entry.loading) return entry.loading
    const p = load(key).then(
      (value) => { store.set(key, { at: Date.now(), value }); return value },
      (err) => { const cur = store.get(key); if (cur) { cur.loading = undefined } ; throw err },
    )
    entry.loading = p
    store.set(key, entry)
    return p
  }

  return {
    get(key: string): Promise<T> {
      const e = store.get(key)
      if (!e || e.value === undefined) return refresh(key)
      const idade = Date.now() - e.at
      if (idade < ttlMs) return Promise.resolve(e.value)
      if (idade < maxStaleMs) { void refresh(key).catch(() => undefined); return Promise.resolve(e.value) }
      return refresh(key)
    },
    clear() { store.clear() },
  }
}
