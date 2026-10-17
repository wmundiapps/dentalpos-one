import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, privatePhotoUrl } from './api';
import { brl } from './format';

// ---- Aviso rápido
const ToastCtx = createContext<(msg: string, bad?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ msg: string; bad: boolean } | null>(null);
  const timer = useRef<number>(0);
  const show = useCallback((msg: string, bad = false) => { setT({ msg, bad }); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setT(null), 4200); }, []);
  return <ToastCtx.Provider value={show}>{children}{t && <div className={`toast ${t.bad ? 'bad' : ''}`} role="status">{t.msg}</div>}</ToastCtx.Provider>;
}

export const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Sem conexão. Verifique a internet e tente de novo.');

/** Roda uma ação mostrando erro em aviso; devolve [executar, ocupado]. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
    setBusy(true);
    try { const r = await fn(); if (ok) toast(ok); return r; } catch (e) { toast(errMsg(e), true); } finally { setBusy(false); }
    return undefined;
  }, [toast]);
  return [run, busy] as const;
}

/** Carrega dados da API e permite recarregar. */
export function useLoad<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!path);
  const reload = useCallback(async () => {
    if (!path) return;
    try { setError(''); setData(await api<T>(path)); } catch (e) { setError(errMsg(e)); } finally { setLoading(false); }
  }, [path]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setLoading(!!path); void reload(); }, [reload, ...deps]);
  return { data, error, loading, reload, setData };
}

export const Loading = ({ error }: { error?: string }) => (error ? <div className="alert bad">{error}</div> : <p className="muted">Carregando…</p>);

export function Page({ title, sub, actions, children }: { title: string; sub?: string; actions?: ReactNode; children: ReactNode }) {
  return (<>
    <div className="row between" style={{ marginBottom: 12 }}>
      <div><h1>{title}</h1>{sub && <div className="muted">{sub}</div>}</div>
      {actions && <div className="row">{actions}</div>}
    </div>
    {children}
  </>);
}

export const Card = ({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) => (
  <section className="card">{(title || right) && <div className="row between"><h2>{title}</h2>{right}</div>}{children}</section>
);
export const Kpi = ({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) => <div className="kpi"><b style={tone ? { color: `var(--${tone})` } : undefined}>{value}</b><span>{label}</span></div>;

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="f"><span>{label}</span>{children}{hint && <small className="muted">{hint}</small>}</label>;
}

/** Lista de opções em barra de rolagem (select) — mais rápido que digitar. */
export function Select({ label, value, onChange, options, placeholder }: { label: string; value: string; onChange: (v: string) => void; options: (string | { value: string; label: string })[]; placeholder?: string }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder ?? 'Selecione…'}</option>
        {options.map((o) => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function Text({ label, value, onChange, hint, ...rest }: { label: string; value: string; onChange: (v: string) => void; hint?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  return <Field label={label} hint={hint}><input value={value} onChange={(e) => onChange(e.target.value)} {...rest} /></Field>;
}

/** Valor em reais: o usuário digita 12,50 e a tela guarda 1250 centavos. */
export function MoneyInput({ label, cents, onChange }: { label?: string; cents: number; onChange: (c: number) => void }) {
  const [txt, setTxt] = useState((cents / 100).toFixed(2).replace('.', ','));
  useEffect(() => { setTxt((cents / 100).toFixed(2).replace('.', ',')); }, [cents]);
  const input = (
    <input inputMode="decimal" value={txt} onChange={(e) => setTxt(e.target.value.replace(/[^\d,]/g, ''))}
      onBlur={() => { const n = Math.round(parseFloat(txt.replace(',', '.') || '0') * 100); onChange(Number.isFinite(n) ? n : 0); }} />
  );
  return label ? <Field label={label}>{input}</Field> : input;
}

export function NumberInput({ label, value, onChange, min, max, step }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number }) {
  return <Field label={label}><input type="number" inputMode="decimal" value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} /></Field>;
}

/** Marcação com "X": toque para marcar/desmarcar. */
export function Chip({ on, onClick, children, tone }: { on: boolean; onClick: () => void; children: ReactNode; tone?: 'bad' | 'ok' | 'warn' }) {
  return <button type="button" className={`chip ${tone ?? ''} ${on ? 'on' : ''}`} aria-pressed={on} onClick={onClick}>{on && <span className="x">✕</span>}{children}</button>;
}

export function Toggle({ label, checked, onChange, hint }: { label: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="row" style={{ margin: '8px 0', cursor: 'pointer', alignItems: 'flex-start' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="grow">{label}{hint && <small className="muted" style={{ display: 'block' }}>{hint}</small>}</span>
    </label>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between"><h2>{title}</h2><button className="ghost sm" onClick={onClose} aria-label="Fechar">✕</button></div>
        {children}
      </div>
    </div>
  );
}

export const Badge = ({ tone, children }: { tone?: 'ok' | 'warn' | 'bad' | 'info'; children: ReactNode }) => <span className={`badge ${tone ?? ''}`}>{children}</span>;

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { key: T; label: string }[] }) {
  return <div className="tabs" role="tablist">{items.map((i) => <button key={i.key} role="tab" className={value === i.key ? 'on' : ''} onClick={() => onChange(i.key)}>{i.label}</button>)}</div>;
}

export function Money({ cents }: { cents: number }) { return <>{brl(cents)}</>; }

/** Foto privada (carrega com a sessão). */
export function PrivatePhoto({ id, alt }: { id: string; alt: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => { let on = true; privatePhotoUrl(id).then((u) => on && setSrc(u)).catch(() => {}); return () => { on = false; }; }, [id]);
  return src ? <img src={src} alt={alt} loading="lazy" /> : <div className="muted small">…</div>;
}

export const ORDER_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'info' }> = {
  em_servico: { label: 'Em serviço', tone: 'info' }, pronto: { label: 'Pronto', tone: 'ok' }, entregue: { label: 'Entregue', tone: 'ok' }, cancelada: { label: 'Cancelada', tone: 'bad' },
};
