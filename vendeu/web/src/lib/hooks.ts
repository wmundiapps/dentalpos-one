import { useCallback, useEffect, useRef, useState } from 'react';

/** Título da página por rota. */
export function usePageTitle(title: string) {
  useEffect(() => { document.title = title ? `${title} — Vendeu` : 'Vendeu — compre, venda e alugue'; }, [title]);
}

export interface Async<T> { data: T | null; error: unknown; loading: boolean; reload: () => void; setData: (d: T | null) => void }

/** Carrega dados e refaz quando as dependências mudam. `silentMs` repete a busca sem piscar a tela (polling leve). */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], opts: { silentMs?: number; enabled?: boolean } = {}): Async<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(opts.enabled !== false);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const enabled = opts.enabled !== false;

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    let alive = true;
    setLoading(true); setError(null);
    fnRef.current().then((d) => { if (alive) { setData(d); setLoading(false); } }, (e) => { if (alive) { setError(e); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  useEffect(() => {
    if (!opts.silentMs || !enabled) return;
    let alive = true;
    const t = setInterval(() => {
      if (document.hidden) return;
      fnRef.current().then((d) => { if (alive) { setData(d); setError(null); } }, () => undefined);
    }, opts.silentMs);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.silentMs, enabled, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

/** Executa uma ação (botão) com estado de "enviando" e erro. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true); setError(null);
    try { return await fn(); } catch (e) { setError(e); return undefined; } finally { setBusy(false); }
  }, []);
  return { busy, error, run, clear: () => setError(null) };
}

export function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
