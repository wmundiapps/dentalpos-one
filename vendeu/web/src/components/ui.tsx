import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { errorMessage } from '../lib/api';
import { useApp } from '../lib/app';
import { CATEGORIES } from '@shared/catalog';
import { priceLabel, timeAgo, LISTING_STATUS } from '../lib/format';

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return <div className="state" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /><span>{label}</span></div>;
}

export function ErrorState({ error, onRetry, title = 'Não foi possível carregar' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div className="state state-error" role="alert">
      <strong>{title}</strong>
      <span>{errorMessage(error)}</span>
      {onRetry && <button className="btn btn-outline" onClick={onRetry}>Tentar de novo</button>}
    </div>
  );
}

export function Empty({ icon = '🔎', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="state">
      <span className="state-icon" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

export function Alert({ tone = 'info', children, title }: { tone?: 'info' | 'ok' | 'warn' | 'bad'; children: ReactNode; title?: string }) {
  return (
    <div className={`alert alert-${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      {title && <strong>{title}</strong>}
      <div>{children}</div>
    </div>
  );
}
export const ErrorAlert = ({ error, fallback, overrides }: { error: unknown; fallback?: string; overrides?: Record<string, string> }) => (error ? <Alert tone="bad">{errorMessage(error, fallback, overrides)}</Alert> : null);

export function Badge({ tone = 'muted', children }: { tone?: 'ok' | 'warn' | 'bad' | 'info' | 'muted'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function StatusBadge({ status }: { status: string }) {
  const s = LISTING_STATUS[status] ?? { label: status, tone: 'muted' as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
export const VerifiedBadge = () => <span className="badge badge-verified" title="Identidade verificada pela equipe do Vendeu"><span aria-hidden="true">✔</span> Vendedor verificado</span>;

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <small className="hint">{hint}</small>}
      {error && <small className="field-error" role="alert">{error}</small>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  if (!open) return null;
  return (
    <dialog ref={ref} className={`modal${wide ? ' modal-wide' : ''}`} aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="modal-body">
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="pager" aria-label="Paginação">
      <button className="btn btn-outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Anterior</button>
      <span aria-live="polite">Página {page} de {pages}</span>
      <button className="btn btn-outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>Próxima →</button>
    </nav>
  );
}

/** Renderiza markdown dos documentos legais. O react-markdown não executa HTML. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
        a: ({ href, children: c }) => {
          const h = href ?? '';
          if (h.startsWith('/')) return <Link to={h}>{c}</Link>;
          if (/^(https?:|mailto:)/.test(h)) return <a href={h} target="_blank" rel="noopener noreferrer">{c}</a>;
          return <span>{c}</span>;
        },
        table: ({ children: c }) => <div className="table-wrap"><table>{c}</table></div>,
      }}>{children.replace(/<!--[\s\S]*?-->/g, '')}</ReactMarkdown>
    </div>
  );
}

export interface ListingCardData {
  id: string; title: string; priceCents: number; rentPeriod: string | null; city: string; state: string; district?: string | null;
  category: string; condition: string; photo: string | null; publishedAt?: string | null; status?: string; sellerVerified?: boolean;
}
export function ListingCard({ l, to }: { l: ListingCardData; to?: string }) {
  const cat = CATEGORIES.find((c) => c.slug === l.category);
  return (
    <Link to={to ?? `/anuncio/${l.id}`} className="card listing-card">
      <div className="thumb">
        {l.photo ? <img src={l.photo} alt="" loading="lazy" /> : <span className="thumb-empty" aria-hidden="true">{cat?.icon ?? '📦'}</span>}
        <span className="chip-cond">{l.condition === 'novo' ? 'Novo' : 'Usado'}</span>
      </div>
      <div className="card-body">
        <div className="price">{priceLabel(l.priceCents, l.rentPeriod)}</div>
        <h3 className="card-title">{l.title}</h3>
        <div className="muted small">{l.district ? `${l.district} · ` : ''}{l.city}/{l.state}</div>
        <div className="muted small">{cat?.icon} {cat?.label}{l.publishedAt ? ` · ${timeAgo(l.publishedAt)}` : ''}</div>
        {l.sellerVerified && <VerifiedBadge />}
      </div>
    </Link>
  );
}

export const SAFETY_TIPS = [
  'Nunca negocie nem pague fora do Vendeu. Pagou por fora, você perde a retenção do pagamento e os 7 dias para devolver.',
  'Só confirme "Recebi" com o produto em suas mãos. Depois disso o dinheiro segue para o vendedor após o prazo de devolução.',
  'Na retirada em mãos, só passe o código de 6 dígitos ao vendedor depois de receber o produto.',
  'Nunca informe códigos recebidos por SMS ou WhatsApp. Golpistas usam esses códigos para invadir contas.',
  'Desconfie de preço muito abaixo do mercado, pressa exagerada e quem pede para sair do chat do Vendeu.',
  'Combine a retirada em local público e movimentado, de preferência de dia e acompanhado.',
];

/** Faixa curta com a promessa do modelo (Compra, Locação, detalhe). */
export function PromiseStrip({ compact }: { compact?: boolean }) {
  const items: [string, string, string][] = [
    ['🔒', 'Pagamento retido', 'O dinheiro fica retido no Mercado Pago até você receber.'],
    ['🤝', 'Contato só depois do recebimento', 'Telefone e e-mail ficam ocultos até o produto chegar.'],
    ['↩️', '7 dias para devolver', 'Devolveu? O valor volta integral para você.'],
  ];
  return (
    <ul className={`promise${compact ? ' promise-compact' : ''}`} aria-label="Como funciona a compra no Vendeu">
      {items.map(([i, t, d]) => <li key={t}><span aria-hidden="true">{i}</span><div><strong>{t}</strong>{!compact && <span className="small muted">{d}</span>}</div></li>)}
    </ul>
  );
}

export function SafetyBox({ compact }: { compact?: boolean }) {
  return (
    <aside className="safety" aria-label="Dicas anti-golpe">
      <h3><span aria-hidden="true">🛡️</span> Dicas anti-golpe</h3>
      <ul>{(compact ? SAFETY_TIPS.slice(0, 3) : SAFETY_TIPS).map((t) => <li key={t}>{t}</li>)}</ul>
      <Link to="/seguranca">Ver o guia completo anti-golpe</Link>
    </aside>
  );
}

/** Exige login (e papel opcional). Guarda a rota para voltar depois de entrar. */
export function RequireAuth({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { user, ready } = useApp();
  const loc = useLocation();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to={`/entrar?volta=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </div>
  );
}

export function copyText(text: string): Promise<boolean> {
  return navigator.clipboard?.writeText(text).then(() => true, () => false) ?? Promise.resolve(false);
}
