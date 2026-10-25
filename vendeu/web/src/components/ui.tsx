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
export const ErrorAlert = ({ error, fallback }: { error: unknown; fallback?: string }) => (error ? <Alert tone="bad">{errorMessage(error, fallback)}</Alert> : null);

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
  'Nunca pague antes de ver o produto. O Vendeu não pede Pix antecipado, sinal nem "taxa de liberação".',
  'Nunca informe códigos recebidos por SMS ou WhatsApp. Golpistas usam esses códigos para invadir contas.',
  'Combine o encontro em local público e movimentado, de preferência de dia e acompanhado.',
  'Desconfie de preço muito abaixo do mercado, pressa exagerada e quem foge de encontro presencial.',
  'Confirme o dinheiro na sua conta antes de entregar. Comprovante enviado não é pagamento.',
  'Fique no chat do Vendeu: fora dele você perde o registro e os avisos de segurança.',
];

export function SafetyBox({ compact }: { compact?: boolean }) {
  return (
    <aside className="safety" aria-label="Dicas anti-golpe">
      <h3><span aria-hidden="true">🛡️</span> Compre e venda com segurança</h3>
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
