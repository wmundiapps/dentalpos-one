import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../lib/app';
import { useAction, useAsync, usePageTitle } from '../lib/hooks';
import { CATEGORIES, OPERATION_LABEL, type Operation } from '@shared/catalog';
import { attrRows } from '../lib/attrs';
import { memberSince, priceLabel } from '../lib/format';
import { RISK_FLAG_LABEL } from '../lib/api';
import { Alert, Badge, copyText, Empty, ErrorAlert, ErrorState, Loading, Modal, SafetyBox, StatusBadge, VerifiedBadge } from '../components/ui';
import { SelectField, TextAreaField } from '../components/fields';
import { CloseModal } from '../components/CloseModal';

interface Detail {
  id: string; title: string; description: string; priceCents: number; rentPeriod: string | null; operation: Operation; condition: 'novo' | 'usado';
  category: string; city: string; state: string; district: string | null; attributes: Record<string, string | number>; status: string; publishedAt: string | null;
  views: number; photos: { id: string; url: string }[];
  seller: { name: string; verified: boolean; memberSince: string; completedDeals: number };
  isOwner: boolean; riskFlags?: string[]; reviewNote?: string | null;
}

const REPORT_REASONS: [string, string][] = [
  ['golpe', 'Parece golpe'], ['produto_ilegal', 'Produto ilegal ou proibido'], ['falsificado', 'Produto falsificado'],
  ['roubado_ou_duvidoso', 'Produto roubado ou de origem duvidosa'], ['foto_falsa', 'Fotos falsas ou da internet'],
  ['preco_enganoso', 'Preço enganoso'], ['fora_da_plataforma', 'Quer conversar ou pagar fora do Vendeu'], ['outro', 'Outro motivo'],
];

export function ListingDetail() {
  const { id } = useParams();
  const { user, ready } = useApp();
  const d = useAsync(() => api.get<Detail>(`/listings/${id}`), [id, user?.id]);
  usePageTitle(d.data?.title ?? 'Anúncio');
  const [photo, setPhoto] = useState(0);
  const [report, setReport] = useState(false);
  const [closing, setClosing] = useState(false);
  const [shared, setShared] = useState('');
  const pauseAct = useAction();

  if (d.loading && !d.data) return <Loading />;
  if (d.error) {
    const nf = (d.error as { status?: number }).status === 404;
    return nf ? <Empty icon="🕵️" title="Anúncio não encontrado">Ele pode ter sido vendido, retirado ou nunca existiu. <Link to="/compra">Ver outros anúncios</Link></Empty> : <ErrorState error={d.error} onRetry={d.reload} />;
  }
  const l = d.data!;
  const cat = CATEGORIES.find((c) => c.slug === l.category);
  const rows = attrRows(l.attributes);
  const photos = l.photos;

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) { try { await navigator.share({ title: l.title, url }); return; } catch { /* cancelou */ } }
    setShared((await copyText(url)) ? 'Link copiado!' : 'Copie o endereço na barra do navegador.');
    setTimeout(() => setShared(''), 3000);
  };

  return (
    <div className="detail">
      <nav className="crumbs small" aria-label="Você está em">
        <Link to={l.operation === 'venda' ? `/compra?condicao=${l.condition}` : `/locacao?condicao=${l.condition}`}>{OPERATION_LABEL[l.operation]}</Link> › {' '}
        <Link to={`${l.operation === 'venda' ? '/compra' : '/locacao'}?condicao=${l.condition}&categoria=${l.category}`}>{cat?.label}</Link>
      </nav>
      {l.isOwner && l.status !== 'active' && (
        <Alert tone={l.status === 'rejected' || l.status === 'removed' ? 'bad' : 'warn'} title={`Seu anúncio está: ${statusText(l.status)}`}>
          {l.status === 'pending_review' && 'Nossa equipe está analisando. Você será avisado por e-mail quando for ao ar.'}
          {l.status === 'draft' && 'Ele ainda não foi publicado.'}
          {l.status === 'paused' && 'Ninguém vê este anúncio até você retomar.'}
          {l.reviewNote ? ` Observação da equipe: ${l.reviewNote}` : ''}
        </Alert>
      )}
      {!l.isOwner && l.status !== 'active' && <Alert tone="warn">Este anúncio não está no ar (visível só para você como administrador).</Alert>}

      <div className="detail-grid">
        <section aria-label="Fotos">
          <div className="gallery">
            {photos.length ? <img className="gallery-main" src={photos[photo]?.url} alt={`Foto ${photo + 1} de ${photos.length}: ${l.title}`} />
              : <div className="gallery-main gallery-empty" aria-hidden="true">{cat?.icon}</div>}
            {photos.length > 1 && (
              <div className="thumbs" role="group" aria-label="Escolher foto">
                {photos.map((p, i) => (
                  <button key={p.id} className={i === photo ? 'on' : ''} onClick={() => setPhoto(i)} aria-label={`Ver foto ${i + 1}`} aria-pressed={i === photo}>
                    <img src={p.url} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="panel">
            <h2>Descrição</h2>
            <p className="pre">{l.description}</p>
            {rows.length > 0 && (<>
              <h2>Detalhes</h2>
              <dl className="attrs">{rows.map((r) => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}</dl>
            </>)}
            <h2>Local</h2>
            <p>{l.district ? `${l.district}, ` : ''}{l.city}/{l.state}</p>
            <p className="small muted">O endereço exato só é combinado na conversa, nunca é público.</p>
          </div>
        </section>

        <aside className="side">
          <div className="panel">
            <div className="row wrap gap-s">
              <Badge tone="info">{l.condition === 'novo' ? 'Novo' : 'Usado'}</Badge>
              <Badge>{OPERATION_LABEL[l.operation]}</Badge>
              <Badge>{cat?.icon} {cat?.label}</Badge>
            </div>
            <h1 className="detail-title">{l.title}</h1>
            <div className="price price-lg">{priceLabel(l.priceCents, l.rentPeriod)}</div>
            <div className="seller-box">
              <strong>{l.seller.name}</strong>
              {l.seller.verified ? <VerifiedBadge /> : <span className="small muted">Identidade ainda não verificada</span>}
              <span className="small muted">No Vendeu desde {memberSince(l.seller.memberSince)}</span>
              {l.seller.completedDeals > 0 && <span className="small muted">{l.seller.completedDeals} {l.seller.completedDeals === 1 ? 'negócio concluído' : 'negócios concluídos'}</span>}
            </div>
            <div className="row wrap gap-s">
              <button className="btn btn-outline" onClick={share}>↗ Compartilhar</button>
              {!l.isOwner && <button className="btn btn-outline" onClick={() => setReport(true)}>🚩 Denunciar</button>}
            </div>
            {shared && <p className="small" role="status">{shared}</p>}
          </div>

          {l.isOwner ? (
            <div className="panel stack">
              <h2>Seu anúncio</h2>
              <div className="row gap-s"><StatusBadge status={l.status} /><span className="small muted">{l.views} visualizações</span></div>
              {(l.riskFlags?.length ?? 0) > 0 && <p className="small muted">Pontos de atenção: {l.riskFlags!.map((f) => RISK_FLAG_LABEL[f] ?? f).join(', ')}.</p>}
              <div className="row wrap gap-s">
                {!['sold', 'pending_checkout', 'removed'].includes(l.status) && <Link className="btn btn-outline" to={`/venda/anuncio/${l.id}/editar`}>Editar</Link>}
                {l.status === 'active' && <button className="btn btn-outline" disabled={pauseAct.busy} onClick={async () => { await pauseAct.run(() => api.post(`/listings/${l.id}/pause`)); d.reload(); }}>Pausar</button>}
                {l.status === 'paused' && <button className="btn btn-outline" disabled={pauseAct.busy} onClick={async () => { await pauseAct.run(() => api.post(`/listings/${l.id}/resume`)); d.reload(); }}>Retomar</button>}
                {['active', 'paused', 'pending_review'].includes(l.status) && <button className="btn btn-primary" onClick={() => setClosing(true)}>{l.operation === 'locacao' ? 'Aluguei' : 'Vendi'} — retirar anúncio</button>}
              </div>
              <ErrorAlert error={pauseAct.error} />
            </div>
          ) : l.status === 'active' ? (
            <ContactForm listingId={l.id} ready={ready} />
          ) : null}

          <SafetyBox />
        </aside>
      </div>

      <ReportModal open={report} onClose={() => setReport(false)} listingId={l.id} />
      <CloseModal target={closing ? { id: l.id, title: l.title, priceCents: l.priceCents, operation: l.operation } : null} onClose={() => setClosing(false)} onDone={() => { setClosing(false); d.reload(); }} />
    </div>
  );
}

const statusText = (s: string) => ({ draft: 'rascunho', paused: 'pausado', pending_review: 'em análise', rejected: 'recusado', removed: 'retirado', pending_checkout: 'aguardando pagamento da taxa', sold: 'vendido/alugado' } as Record<string, string>)[s] ?? s;

function ContactForm({ listingId, ready }: { listingId: string; ready: boolean }) {
  const { user, refreshUnread } = useApp();
  const [body, setBody] = useState('');
  const [result, setResult] = useState<{ conversationId: string; warnings: string[] } | null>(null);
  const act = useAction();

  if (!ready) return null;
  if (!user) {
    return (
      <div className="panel stack">
        <h2>Fale com o vendedor</h2>
        <p>Para enviar mensagem, entre na sua conta ou crie uma (é grátis).</p>
        <div className="row wrap gap-s">
          <Link className="btn btn-primary" to={`/entrar?volta=${encodeURIComponent(`/anuncio/${listingId}`)}`}>Entrar</Link>
          <Link className="btn btn-outline" to="/cadastrar">Cadastrar</Link>
        </div>
      </div>
    );
  }
  if (!user.emailVerified) {
    return (
      <div className="panel stack">
        <h2>Fale com o vendedor</h2>
        <Alert tone="warn">Confirme seu e-mail para enviar mensagens. É rápido: enviamos um código de 6 dígitos.</Alert>
        <Link className="btn btn-primary" to="/conta/confirmar">Confirmar e-mail</Link>
      </div>
    );
  }
  const send = async (e: FormEvent) => {
    e.preventDefault();
    const r = await act.run(() => api.post<{ conversationId: string; warnings: string[] }>(`/messages/start/${listingId}`, { body: body.trim() }));
    if (r) { setResult(r); setBody(''); refreshUnread(); }
  };
  if (result) {
    return (
      <div className="panel stack">
        <Alert tone="ok" title="Mensagem enviada!">O vendedor vai responder pelo Vendeu. Você será avisado.</Alert>
        {result.warnings.length > 0 && (
          <Alert tone="warn" title="Atenção ao seu texto">
            <ul>{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </Alert>
        )}
        <Link className="btn btn-primary" to={`/mensagens/${result.conversationId}`}>Abrir a conversa</Link>
      </div>
    );
  }
  return (
    <form className="panel stack" onSubmit={send}>
      <h2>Enviar mensagem ao vendedor</h2>
      <TextAreaField label="Sua mensagem" value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={2000} required
        placeholder="Olá! Ainda está disponível? Posso ver o produto pessoalmente?"
        hint="Não envie senhas, códigos nem dados do cartão. Combine o encontro em local público." />
      <ErrorAlert error={act.error} />
      <button className="btn btn-primary" disabled={act.busy || !body.trim()}>{act.busy ? 'Enviando…' : 'Enviar mensagem'}</button>
    </form>
  );
}

function ReportModal({ open, onClose, listingId }: { open: boolean; onClose: () => void; listingId: string }) {
  const [reason, setReason] = useState('golpe');
  const [details, setDetails] = useState('');
  const [done, setDone] = useState(false);
  const act = useAction();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await act.run(() => api.post('/reports', { listingId, reason, ...(details.trim() ? { details: details.trim() } : {}) }));
    if (r) setDone(true);
  };
  return (
    <Modal open={open} onClose={() => { onClose(); setDone(false); }} title="Denunciar anúncio">
      {done ? (
        <div className="stack">
          <Alert tone="ok">Obrigado! Recebemos sua denúncia e a equipe vai analisar. Se você já pagou algo, procure a polícia e guarde os comprovantes.</Alert>
          <button className="btn btn-primary" onClick={() => { onClose(); setDone(false); }}>Fechar</button>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <SelectField label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REPORT_REASONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </SelectField>
          <TextAreaField label="Detalhes (opcional)" value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={1000} />
          <ErrorAlert error={act.error} />
          <div className="row wrap"><button className="btn btn-primary" disabled={act.busy}>{act.busy ? 'Enviando…' : 'Enviar denúncia'}</button><button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button></div>
        </form>
      )}
    </Modal>
  );
}
