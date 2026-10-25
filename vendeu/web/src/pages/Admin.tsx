import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { RISK_FLAG_LABEL } from '../lib/api';
import { useAction, useAsync, usePageTitle } from '../lib/hooks';
import { CATEGORIES } from '@shared/catalog';
import { fmtDate, fmtDateTime, formatBRL, SALE_STATUS } from '../lib/format';
import { ContactCard, EVENT_LABEL, MoneyBanner, nextStep, OrderBadge, OrderTimeline, ShipToCard, ValuesBox, type Order } from '../components/OrderParts';
import { Alert, Badge, Empty, ErrorAlert, ErrorState, Loading, PageHead, StatusBadge } from '../components/ui';
import { SelectField, TextField } from '../components/fields';

interface Dash {
  kycPending: number; listingsInReview: number; reportsOpen: number; dataRequestsOpen: number; activeListings: number; salesFlagged: number;
  feesPaidCents: number | string; feesPendingCents: number | string; users: number;
  ordersDisputed: number; heldCents: number | string; commissionReleasedCents: number | string;
}
const TABS = [
  ['kyc', 'Verificações'], ['anuncios', 'Anúncios em revisão'], ['denuncias', 'Denúncias'], ['pedidos', 'Pedidos e disputas'], ['vendas', 'Taxas de retirada'],
  ['outros', 'Outros'], ['origem', 'Origem'], ['lgpd', 'Pedidos LGPD'], ['usuarios', 'Usuários'],
] as const;
type Tab = (typeof TABS)[number][0];

export function Admin() {
  usePageTitle('Administração');
  const [tab, setTab] = useState<Tab>('kyc');
  const dash = useAsync(() => api.get<Dash>('/admin/dashboard'), []);
  const d = dash.data;
  const counts: Partial<Record<Tab, number | undefined>> = { kyc: d?.kycPending, anuncios: d?.listingsInReview, denuncias: d?.reportsOpen, pedidos: d?.ordersDisputed, vendas: d?.salesFlagged, lgpd: d?.dataRequestsOpen };

  return (
    <div className="stack-l">
      <PageHead title="Administração" sub="Moderação, pedidos e privacidade. Tudo o que você vê de dado sensível fica registrado no log de auditoria." />
      {dash.error ? <ErrorState error={dash.error} onRetry={dash.reload} /> : d && (
        <div className="stat-grid">
          <Stat label="Verificações pendentes" value={d.kycPending} onClick={() => setTab('kyc')} />
          <Stat label="Anúncios em revisão" value={d.listingsInReview} onClick={() => setTab('anuncios')} />
          <Stat label="Denúncias abertas" value={d.reportsOpen} onClick={() => setTab('denuncias')} />
          <Stat label="Pedidos LGPD" value={d.dataRequestsOpen} onClick={() => setTab('lgpd')} />
          <Stat label="Pedidos em disputa" value={d.ordersDisputed} onClick={() => setTab('pedidos')} />
          <Stat label="Dinheiro retido (Mercado Pago)" text={formatBRL(Number(d.heldCents))} onClick={() => setTab('pedidos')} />
          <Stat label="Comissão já liberada" text={formatBRL(Number(d.commissionReleasedCents))} />
          <Stat label="Anúncios no ar" value={d.activeListings} />
          <Stat label="Usuários" value={d.users} onClick={() => setTab('usuarios')} />
          <Stat label="Taxas de retirada pagas" text={formatBRL(Number(d.feesPaidCents))} />
          <Stat label="Taxas de retirada a receber" text={formatBRL(Number(d.feesPendingCents))} />
        </div>
      )}
      <div className="admin-tabs" role="tablist" aria-label="Áreas da administração">
        {TABS.map(([k, t]) => (
          <button key={k} role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls="admin-panel" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {t}{counts[k] ? <span className="count count-inline">{counts[k]}</span> : null}
          </button>
        ))}
      </div>
      <div id="admin-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'kyc' && <KycTab onChange={dash.reload} />}
        {tab === 'anuncios' && <ListingsTab onChange={dash.reload} />}
        {tab === 'denuncias' && <ReportsTab onChange={dash.reload} />}
        {tab === 'pedidos' && <OrdersTab onChange={dash.reload} />}
        {tab === 'vendas' && <SalesTab onChange={dash.reload} />}
        {tab === 'outros' && <OutrosTab />}
        {tab === 'origem' && <OriginTab />}
        {tab === 'lgpd' && <DsrTab onChange={dash.reload} />}
        {tab === 'usuarios' && <UsersTab />}
      </div>
    </div>
  );
}

function Stat({ label, value, text, onClick }: { label: string; value?: number; text?: string; onClick?: () => void }) {
  const inner = (<><span className="stat-n">{text ?? value}</span><span className="stat-l">{label}</span></>);
  return onClick ? <button className="stat" onClick={onClick}>{inner}</button> : <div className="stat">{inner}</div>;
}

/** Botões de decisão com justificativa obrigatória. */
function Decision({ min = 3, placeholder = 'Justificativa', actions, extra }: { min?: number; placeholder?: string; actions: { label: string; tone?: 'primary' | 'danger' | 'outline'; run: (note: string) => Promise<unknown>; needNote?: boolean }[]; extra?: ReactNode }) {
  const [note, setNote] = useState('');
  const act = useAction();
  return (
    <div className="decision stack">
      <TextField label={placeholder} value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} />
      {extra}
      <ErrorAlert error={act.error} />
      <div className="row wrap">
        {actions.map((a) => (
          <button key={a.label} className={`btn btn-${a.tone ?? 'outline'} btn-sm`} disabled={act.busy || ((a.needNote ?? true) && note.trim().length < min)} onClick={() => act.run(() => a.run(note.trim()))}>{a.label}</button>
        ))}
      </div>
    </div>
  );
}

function ListState<T>({ q, empty, children }: { q: ReturnType<typeof useAsync<T>>; empty: string; children: (d: T) => ReactNode }) {
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  return <>{children(q.data!)}</>;
  void empty;
}

// ---------- verificações ----------
interface KycItem { id: string; full_name: string; email: string; doc_type: string; doc_masked: string; kyc_submitted_at: string }
interface KycDetail {
  id: string; fullName: string; email: string; phone: string; docType: string; docNumber: string | null; companyName: string | null; birthDate: string | null;
  address: { cep: string; street: string; number: string; complement: string | null; district: string; city: string; state: string };
  emailVerified: boolean; phoneVerified: boolean; kycStatus: string; documents: { id: string; kind: string; mime: string; size: number; created_at: string }[];
  relatedAccounts: { id: string; full_name: string; email: string; kyc_status: string }[];
}
const KIND_LABEL: Record<string, string> = { doc_front: 'Documento — frente', doc_back: 'Documento — verso', selfie: 'Selfie com documento', address_proof: 'Comprovante de endereço', cnpj_card: 'Cartão CNPJ' };

function KycTab({ onChange }: { onChange: () => void }) {
  const list = useAsync(() => api.get<{ items: KycItem[] }>('/admin/kyc'), []);
  const [sel, setSel] = useState<string | null>(null);
  return (
    <div className="split">
      <div>
        <ListState q={list} empty="">{(d) => d.items.length === 0 ? <Empty icon="✅" title="Nenhuma verificação na fila" /> : (
          <ul className="rows compact">{d.items.map((i) => (
            <li key={i.id}><button className={`row-card btn-card${sel === i.id ? ' on' : ''}`} onClick={() => setSel(i.id)}>
              <div className="row-main"><strong>{i.full_name}</strong><span className="small muted">{i.email} · {i.doc_masked}</span><span className="small muted">Enviado em {fmtDateTime(i.kyc_submitted_at)}</span></div>
            </button></li>
          ))}</ul>
        )}</ListState>
      </div>
      <div>{sel ? <KycDetailView key={sel} userId={sel} onDone={() => { setSel(null); list.reload(); onChange(); }} /> : <p className="muted">Escolha uma verificação na lista.</p>}</div>
    </div>
  );
}

function KycDetailView({ userId, onDone }: { userId: string; onDone: () => void }) {
  const q = useAsync(() => api.get<KycDetail>(`/admin/kyc/${userId}`), [userId]);
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  const u = q.data!;
  const a = u.address;
  return (
    <div className="panel stack">
      <h3>{u.fullName}</h3>
      <dl className="attrs">
        <div><dt>E-mail</dt><dd>{u.email} {u.emailVerified ? <Badge tone="ok">ok</Badge> : <Badge tone="bad">não confirmado</Badge>}</dd></div>
        <div><dt>Telefone</dt><dd>+{u.phone} {u.phoneVerified ? <Badge tone="ok">ok</Badge> : <Badge tone="bad">não confirmado</Badge>}</dd></div>
        <div><dt>{u.docType?.toUpperCase()}</dt><dd>{u.docNumber}</dd></div>
        {u.companyName && <div><dt>Razão social</dt><dd>{u.companyName}</dd></div>}
        <div><dt>Nascimento</dt><dd>{fmtDate(u.birthDate)}</dd></div>
        <div><dt>Endereço</dt><dd>{a.street}, {a.number} {a.complement ?? ''} — {a.district}, {a.city}/{a.state} — CEP {a.cep}</dd></div>
      </dl>
      {u.relatedAccounts.length > 0 && (
        <Alert tone="warn" title="Contas relacionadas (mesmo IP, aparelho ou telefone)">
          <ul>{u.relatedAccounts.map((r) => <li key={r.id}>{r.full_name} · {r.email} · verificação: {r.kyc_status}</li>)}</ul>
        </Alert>
      )}
      <h4>Documentos enviados</h4>
      <div className="doc-grid">
        {u.documents.map((d) => {
          const src = `/api/admin/kyc/${u.id}/documents/${d.id}`;
          return (
            <figure key={d.id} className="doc">
              {d.mime === 'application/pdf' ? <a className="btn btn-outline" href={src} target="_blank" rel="noopener noreferrer">Abrir PDF</a> : <a href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt={KIND_LABEL[d.kind] ?? d.kind} loading="lazy" /></a>}
              <figcaption className="small">{KIND_LABEL[d.kind] ?? d.kind}<br /><span className="muted">{fmtDateTime(d.created_at)}</span></figcaption>
            </figure>
          );
        })}
      </div>
      {u.kycStatus === 'pending' ? (
        <Decision min={5} placeholder="Motivo (obrigatório para recusar, mínimo 5 caracteres)" actions={[
          { label: 'Aprovar identidade', tone: 'primary', needNote: false, run: async () => { await api.post(`/admin/kyc/${u.id}/decision`, { approve: true }); onDone(); } },
          { label: 'Recusar', tone: 'danger', run: async (n) => { await api.post(`/admin/kyc/${u.id}/decision`, { approve: false, reason: n }); onDone(); } },
        ]} />
      ) : <Alert tone="info">Esta verificação já foi decidida ({u.kycStatus}).</Alert>}
    </div>
  );
}

// ---------- anúncios ----------
interface AdminListing { id: string; title: string; description: string; price_cents: number; category: string; condition: string; operation: string; status: string; risk_score: number; risk_flags: string[] | null; review_note: string | null; created_at: string; seller_name: string; kyc_status: string }
function ListingsTab({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState('pending_review');
  const list = useAsync(() => api.get<{ items: AdminListing[] }>('/admin/listings', { status }), [status]);
  return (
    <div className="stack">
      <SelectField label="Mostrar" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="pending_review">Em revisão</option><option value="active">No ar</option><option value="rejected">Recusados</option><option value="removed">Removidos</option><option value="sold">Vendidos</option>
      </SelectField>
      <ListState q={list} empty="">{(d) => d.items.length === 0 ? <Empty icon="✅" title="Nada por aqui" /> : (
        <ul className="rows">{d.items.map((l) => (
          <li key={l.id} className="row-card col">
            <div className="row between wrap"><Link to={`/anuncio/${l.id}`} className="row-title">{l.title}</Link><StatusBadge status={l.status} /></div>
            <div className="small muted">{CATEGORIES.find((c) => c.slug === l.category)?.label} · {l.operation} · {l.condition} · {formatBRL(l.price_cents)} · vendedor {l.seller_name} (verificação: {l.kyc_status}) · risco {l.risk_score}</div>
            {l.risk_flags && l.risk_flags.length > 0 && <div className="row wrap gap-s">{l.risk_flags.map((f) => <Badge key={f} tone="warn">{RISK_FLAG_LABEL[f] ?? f}</Badge>)}</div>}
            <p className="pre small">{l.description}</p>
            {l.review_note && <p className="small muted">Nota: {l.review_note}</p>}
            {['pending_review', 'rejected', 'active'].includes(l.status) && (
              <Decision placeholder="Nota da decisão (mínimo 3 caracteres)" actions={[
                ...(l.status !== 'active' ? [{ label: 'Aprovar', tone: 'primary' as const, run: async (n: string) => { await api.post(`/admin/listings/${l.id}/decision`, { approve: true, note: n }); list.reload(); onChange(); } }] : []),
                { label: 'Remover', tone: 'danger', run: async (n) => { await api.post(`/admin/listings/${l.id}/decision`, { approve: false, note: n }); list.reload(); onChange(); } },
              ]} />
            )}
          </li>
        ))}</ul>
      )}</ListState>
    </div>
  );
}

// ---------- denúncias ----------
interface AdminReport { id: string; reason: string; details: string | null; created_at: string; listing_id: string | null; title: string | null; listing_status: string | null; reported_user_id: string | null }
const REASON: Record<string, string> = { golpe: 'Golpe', produto_ilegal: 'Produto ilegal', falsificado: 'Falsificado', roubado_ou_duvidoso: 'Roubado ou duvidoso', foto_falsa: 'Foto falsa', preco_enganoso: 'Preço enganoso', fora_da_plataforma: 'Fora da plataforma', outro: 'Outro' };
function ReportsTab({ onChange }: { onChange: () => void }) {
  const list = useAsync(() => api.get<{ items: AdminReport[] }>('/admin/reports'), []);
  return (
    <ListState q={list} empty="">{(d) => d.items.length === 0 ? <Empty icon="✅" title="Nenhuma denúncia aberta" /> : (
      <ul className="rows">{d.items.map((r) => <ReportRow key={r.id} r={r} done={() => { list.reload(); onChange(); }} />)}</ul>
    )}</ListState>
  );
}
function ReportRow({ r, done }: { r: AdminReport; done: () => void }) {
  const [block, setBlock] = useState(false);
  return (
    <li className="row-card col">
      <div className="row between wrap"><strong>{REASON[r.reason] ?? r.reason}</strong><span className="small muted">{fmtDateTime(r.created_at)}</span></div>
      <div className="small">Anúncio: {r.listing_id ? <Link to={`/anuncio/${r.listing_id}`}>{r.title}</Link> : '—'} {r.listing_status && <StatusBadge status={r.listing_status} />}</div>
      {r.details && <p className="pre small">{r.details}</p>}
      <Decision placeholder="Nota (mínimo 3 caracteres)"
        extra={<label className="check small"><input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} /> Se procedente, bloquear também o vendedor</label>}
        actions={[
          { label: 'Procedente (remove o anúncio)', tone: 'danger', run: async (n) => { await api.post(`/admin/reports/${r.id}/decision`, { uphold: true, note: n, blockSeller: block }); done(); } },
          { label: 'Improcedente', tone: 'outline', run: async (n) => { await api.post(`/admin/reports/${r.id}/decision`, { uphold: false, note: n }); done(); } },
        ]} />
    </li>
  );
}

// ---------- pedidos e disputas ----------
interface AdminOrder { id: string; status: string; price_cents: number; commission_cents: number; delivery_mode: string; dispute_reason: string | null; dispute_by: string | null; return_reason: string | null; created_at: string; disputed_at: string | null; title: string; buyer_name: string; seller_name: string }
const ORDER_FILTERS: [string, string][] = [['disputed', 'Em disputa'], ['return_requested', 'Devolução pedida'], ['paid', 'Pagos (dinheiro retido)'], ['shipped', 'Enviados'], ['received', 'Recebidos (prazo de 7 dias)'], ['released', 'Concluídos'], ['refunded', 'Devolvidos']];
function OrdersTab({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState('disputed');
  const [sel, setSel] = useState<string | null>(null);
  const list = useAsync(() => api.get<{ items: AdminOrder[] }>('/admin/orders', { status }), [status]);
  return (
    <div className="stack">
      <SelectField label="Mostrar pedidos" value={status} onChange={(e) => { setStatus(e.target.value); setSel(null); }}>
        {ORDER_FILTERS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
      </SelectField>
      <div className="split">
        <div>
          <ListState q={list} empty="">{(d) => d.items.length === 0 ? <Empty icon="✅" title="Nenhum pedido neste estado" /> : (
            <ul className="rows compact">{d.items.map((i) => (
              <li key={i.id}><button className={`row-card btn-card${sel === i.id ? ' on' : ''}`} onClick={() => setSel(i.id)}>
                <div className="row-main"><strong>{i.title}</strong><span className="small muted">{i.buyer_name} (comprador) × {i.seller_name} (vendedor)</span>
                  <span className="small muted">{formatBRL(i.price_cents)} · {i.delivery_mode === 'envio' ? 'envio' : 'retirada'} · {fmtDateTime(i.disputed_at ?? i.created_at)}</span>
                  {(i.dispute_reason || i.return_reason) && <span className="small">{i.dispute_reason ?? i.return_reason}</span>}</div>
              </button></li>
            ))}</ul>
          )}</ListState>
        </div>
        <div>{sel ? <AdminOrderView key={sel} id={sel} onDone={() => { list.reload(); onChange(); }} /> : <p className="muted">Escolha um pedido na lista para ver as etapas e decidir.</p>}</div>
      </div>
    </div>
  );
}

function AdminOrderView({ id, onDone }: { id: string; onDone: () => void }) {
  const q = useAsync(() => api.get<{ order: Order; events: { event: string; note: string | null; actor_id: string | null; created_at: string }[] }>(`/admin/orders/${id}`), [id]);
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  const { order: o, events } = q.data!;
  return (
    <div className="panel stack">
      <div className="row between wrap"><h3><Link to={`/anuncio/${o.listing.id}`}>{o.listing.title}</Link></h3><OrderBadge status={o.status} /></div>
      <p className="small muted">{o.buyerFirstName} (comprador) × {o.sellerFirstName} (vendedor) · {o.deliveryMode === 'envio' ? 'envio' : 'retirada em mãos'}{o.trackingCode ? ` · rastreio ${o.trackingCode}` : ''} · {nextStep(o)}</p>
      <MoneyBanner o={o} />
      {o.disputeReason && <Alert tone="bad" title="Disputa aberta">{o.disputeReason}</Alert>}
      {o.returnReason && <Alert tone="warn" title="Motivo da devolução">{o.returnReason}</Alert>}
      <ValuesBox o={o} />
      <OrderTimeline o={o} />
      {o.shipTo && <ShipToCard a={o.shipTo} />}
      <ContactCard o={o} />
      <h4>Histórico</h4>
      <ul className="events">{events.map((e, i) => <li key={i}><span className="small muted">{fmtDateTime(e.created_at)}</span><div>{EVENT_LABEL[e.event] ?? e.event}{e.note ? <span className="muted"> — {e.note}</span> : ''}</div></li>)}</ul>
      {o.status === 'disputed' ? (
        <Decision min={5} placeholder="Justificativa da decisão (mínimo 5 caracteres; fica registrada)" actions={[
          { label: 'Devolver ao comprador (reembolso integral)', tone: 'danger', run: async (n) => { await api.post(`/admin/orders/${o.id}/resolve`, { outcome: 'refund', note: n }); q.reload(); onDone(); } },
          { label: 'Liberar ao vendedor (menos a comissão)', tone: 'primary', run: async (n) => { await api.post(`/admin/orders/${o.id}/resolve`, { outcome: 'release', note: n }); q.reload(); onDone(); } },
        ]} />
      ) : <Alert tone="info">Só pedidos em disputa têm decisão da moderação. Este pedido segue o fluxo normal.</Alert>}
    </div>
  );
}

// ---------- taxas de retirada ----------
interface AdminSale { id: string; status: string; fee_cents: number; due_at: string; paid_at: string | null; receipt_number: string; title: string; seller_name: string }
function SalesTab({ onChange }: { onChange: () => void }) {
  const list = useAsync(() => api.get<{ items: AdminSale[] }>('/admin/sales'), []);
  return (
    <div className="stack">
      <p className="muted small">Taxa fixa de retirada de anúncio já publicado sem venda. A comissão de vendas é descontada do repasse e aparece em Pedidos.</p>
      <ListState q={list} empty="">{(d) => d.items.length === 0 ? <Empty icon="🧾" title="Nenhuma taxa de retirada" /> : (
        <ul className="rows">{d.items.map((s) => {
          const st = SALE_STATUS[s.status] ?? { label: s.status, tone: 'muted' as const };
          return (
            <li key={s.id} className="row-card col">
              <div className="row between wrap"><strong>{s.title}</strong><Badge tone={st.tone}>{st.label}</Badge></div>
              <div className="small muted">Vendedor {s.seller_name} · taxa {formatBRL(s.fee_cents)} · vence {fmtDate(s.due_at)} · recibo {s.receipt_number}{s.paid_at ? ` · paga em ${fmtDate(s.paid_at)}` : ''}</div>
              {s.status === 'awaiting_payment' && (
                <Decision min={5} placeholder="Motivo (mínimo 5 caracteres)" actions={[
                  { label: 'Marcar como pago', tone: 'primary', run: async (n) => { await api.post(`/admin/sales/${s.id}/mark-paid`, { reason: n }); list.reload(); onChange(); } },
                  { label: 'Isentar taxa', tone: 'outline', run: async (n) => { await api.post(`/admin/sales/${s.id}/waive`, { reason: n }); list.reload(); onChange(); } },
                ]} />
              )}
            </li>
          );
        })}</ul>
      )}</ListState>
    </div>
  );
}

// ---------- Outros ----------
interface OutrosResp {
  stats: { windowDays: number; minToGroup: number; totalListings: number; terms: { term: string; count: number; isGroup: boolean }[] };
  groups: { token: string; label: string; status: string; total_count: number; active_count: number }[];
}
function OutrosTab() {
  const q = useAsync(() => api.get<OutrosResp>('/admin/outros'), []);
  const act = useAction();
  const [labels, setLabels] = useState<Record<string, string>>({});
  const call = async (token: string, body: object) => { await act.run(() => api.post(`/admin/outros/groups/${token}`, body)); q.reload(); };
  return (
    <ListState q={q} empty="">{(d) => (
      <div className="stack-l">
        <div className="row between wrap">
          <p className="muted small">Termos que mais aparecem em "Outros" nos últimos {d.stats.windowDays} dias ({d.stats.totalListings} anúncios). Com {d.stats.minToGroup}+ repetições, o termo vira um grupo.</p>
          <button className="btn btn-outline btn-sm" disabled={act.busy} onClick={async () => { await act.run(() => api.post('/admin/outros/refresh')); q.reload(); }}>Recalcular grupos</button>
        </div>
        <ErrorAlert error={act.error} />
        <div>
          <h3>Termos mais frequentes</h3>
          {d.stats.terms.length === 0 ? <p className="muted small">Sem dados.</p> : <div className="chips">{d.stats.terms.map((t) => <span key={t.term} className={`chip chip-sm static${t.isGroup ? ' on' : ''}`}>{t.term} ({t.count}){t.isGroup ? ' ✔' : ''}</span>)}</div>}
        </div>
        <div>
          <h3>Grupos</h3>
          {d.groups.length === 0 ? <p className="muted small">Nenhum grupo ainda.</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th scope="col">Grupo</th><th scope="col">Estado</th><th scope="col">Anúncios (ativos/total)</th><th scope="col">Ações</th></tr></thead>
              <tbody>{d.groups.map((g) => (
                <tr key={g.token}>
                  <td><strong>{g.label}</strong><br /><span className="small muted">{g.token}</span></td>
                  <td>{({ auto: 'automático', approved: 'aprovado', hidden: 'escondido' } as Record<string, string>)[g.status]}</td>
                  <td>{g.active_count}/{g.total_count}</td>
                  <td>
                    <div className="row wrap gap-s">
                      <button className="btn btn-outline btn-sm" disabled={act.busy || g.status === 'approved'} onClick={() => call(g.token, { status: 'approved' })}>Aprovar</button>
                      <button className="btn btn-outline btn-sm" disabled={act.busy || g.status === 'hidden'} onClick={() => call(g.token, { status: 'hidden' })}>Esconder</button>
                      {g.status === 'hidden' && <button className="btn btn-outline btn-sm" disabled={act.busy} onClick={() => call(g.token, { status: 'auto' })}>Reativar</button>}
                    </div>
                    <form className="row gap-s rename" onSubmit={(e: FormEvent) => { e.preventDefault(); if ((labels[g.token] ?? '').trim().length >= 2) void call(g.token, { label: labels[g.token].trim() }); }}>
                      <label className="sr-only" htmlFor={`rn-${g.token}`}>Novo nome do grupo {g.label}</label>
                      <input id={`rn-${g.token}`} placeholder="Renomear…" value={labels[g.token] ?? ''} maxLength={40} onChange={(e) => setLabels({ ...labels, [g.token]: e.target.value })} />
                      <button className="btn btn-outline btn-sm" disabled={act.busy || (labels[g.token] ?? '').trim().length < 2}>Salvar</button>
                    </form>
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      </div>
    )}</ListState>
  );
}

// ---------- origem ----------
interface OriginRow { id: string; event: string; user_id: string | null; listing_id: string | null; email: string | null; phone: string | null; ip: string | null; user_agent: string | null; device_hash: string | null; created_at: string }
function OriginTab() {
  const [f, setF] = useState({ ip: '', email: '', phone: '', userId: '', listingId: '' });
  const [applied, setApplied] = useState<typeof f | null>(null);
  const q = useAsync(() => api.get<{ items: OriginRow[] }>('/admin/origin', applied ?? {}), [applied], { enabled: !!applied });
  const submit = (e: FormEvent) => { e.preventDefault(); setApplied({ ...f }); };
  const any = Object.values(f).some((v) => v.trim());
  return (
    <div className="stack">
      <p className="muted small">Consulta de registros de origem (IP, e-mail, telefone, aparelho) para investigação de fraude ou ordem judicial. Cada consulta fica no log de auditoria.</p>
      <form className="form-grid" onSubmit={submit}>
        <TextField label="IP" value={f.ip} onChange={(e) => setF({ ...f, ip: e.target.value.trim() })} />
        <TextField label="E-mail" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value.trim() })} />
        <TextField label="Telefone (com 55)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '') })} />
        <TextField label="ID do usuário" value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value.trim() })} />
        <TextField label="ID do anúncio" value={f.listingId} onChange={(e) => setF({ ...f, listingId: e.target.value.trim() })} />
        <div className="filters-actions"><button className="btn btn-primary" disabled={!any}>Consultar</button></div>
      </form>
      {applied && (q.loading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : q.data!.items.length === 0 ? <Empty title="Nenhum registro" /> : (
        <div className="table-wrap"><table className="small">
          <thead><tr><th scope="col">Quando</th><th scope="col">Evento</th><th scope="col">Usuário</th><th scope="col">Anúncio</th><th scope="col">E-mail</th><th scope="col">Telefone</th><th scope="col">IP</th><th scope="col">Aparelho</th><th scope="col">Navegador</th></tr></thead>
          <tbody>{q.data!.items.map((r) => (
            <tr key={r.id}><td>{fmtDateTime(r.created_at)}</td><td>{r.event}</td><td>{r.user_id}</td><td>{r.listing_id}</td><td>{r.email}</td><td>{r.phone}</td><td>{r.ip}</td><td>{r.device_hash?.slice(0, 10)}</td><td className="ua">{r.user_agent}</td></tr>
          ))}</tbody>
        </table></div>
      ))}
    </div>
  );
}

// ---------- LGPD ----------
interface Dsr { id: string; user_id: string | null; email: string | null; kind: string; details: string | null; created_at: string }
const DSR_KIND: Record<string, string> = { correct: 'Correção', info: 'Informação', revoke: 'Revogação', export: 'Exportação', delete: 'Eliminação' };
function DsrTab({ onChange }: { onChange: () => void }) {
  const q = useAsync(() => api.get<{ items: Dsr[] }>('/admin/data-requests'), []);
  const act = useAction();
  const resolve = async (id: string, status: 'done' | 'denied') => { await act.run(() => api.post(`/admin/data-requests/${id}/resolve`, { status })); q.reload(); onChange(); };
  return (
    <ListState q={q} empty="">{(d) => d.items.length === 0 ? <Empty icon="✅" title="Nenhum pedido aberto" /> : (
      <div className="stack"><ErrorAlert error={act.error} /><p className="small muted">Prazo legal de resposta: 15 dias.</p>
        <ul className="rows">{d.items.map((r) => (
          <li key={r.id} className="row-card col">
            <div className="row between wrap"><strong>{DSR_KIND[r.kind] ?? r.kind}</strong><span className="small muted">{fmtDateTime(r.created_at)}</span></div>
            <div className="small muted">{r.email ?? r.user_id}</div>
            {r.details && <p className="pre small">{r.details}</p>}
            <div className="row wrap"><button className="btn btn-primary btn-sm" disabled={act.busy} onClick={() => resolve(r.id, 'done')}>Marcar como atendido</button><button className="btn btn-outline btn-sm" disabled={act.busy} onClick={() => resolve(r.id, 'denied')}>Não atendido</button></div>
          </li>
        ))}</ul></div>
    )}</ListState>
  );
}

// ---------- usuários ----------
interface AdminUser { id: string; full_name: string; email: string; account_type: string; kyc_status: string; blocked_at: string | null; fee_blocked_at: string | null; created_at: string }
function UsersTab() {
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const list = useAsync(() => api.get<{ items: AdminUser[] }>('/admin/users', { q: applied }), [applied]);
  return (
    <div className="stack">
      <form className="row gap-s search-inline" onSubmit={(e) => { e.preventDefault(); setApplied(q.trim()); }}>
        <TextField label="Buscar por nome ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-primary">Buscar</button>
      </form>
      <ListState q={list} empty="">{(d) => d.items.length === 0 ? <Empty title="Nenhum usuário" /> : (
        <ul className="rows">{d.items.map((u) => (
          <li key={u.id} className="row-card col">
            <div className="row between wrap"><strong>{u.full_name}</strong><span className="row gap-s wrap">
              <Badge>{u.account_type}</Badge><Badge tone={u.kyc_status === 'verified' ? 'ok' : 'muted'}>verificação: {u.kyc_status}</Badge>
              {u.blocked_at && <Badge tone="bad">bloqueado</Badge>}{u.fee_blocked_at && <Badge tone="warn">taxa em atraso</Badge>}</span></div>
            <div className="small muted">{u.email} · ID {u.id} · desde {fmtDate(u.created_at)}</div>
            <Decision placeholder="Motivo (mínimo 3 caracteres)" actions={[
              u.blocked_at ? { label: 'Desbloquear', tone: 'primary', run: async (n) => { await api.post(`/admin/users/${u.id}/block`, { block: false, reason: n }); list.reload(); } }
                : { label: 'Bloquear conta (remove os anúncios)', tone: 'danger', run: async (n) => { await api.post(`/admin/users/${u.id}/block`, { block: true, reason: n }); list.reload(); } },
            ]} />
          </li>
        ))}</ul>
      )}</ListState>
    </div>
  );
}
