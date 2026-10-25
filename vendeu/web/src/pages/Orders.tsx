import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../lib/app';
import { useAction, useAsync, usePageTitle } from '../lib/hooks';
import { fmtDate, formatBRL, priceLabel } from '../lib/format';
import { Alert, copyText, Empty, ErrorAlert, ErrorState, Loading, Modal, PageHead } from '../components/ui';
import { TextAreaField, TextField } from '../components/fields';
import {
  AUTO_RECEIVE_DAYS, ContactCard, Countdown, EVENT_LABEL, MoneyBanner, nextStep, needsAction, OrderBadge, OrderTimeline, SHIP_DAYS, ShipToCard, ValuesBox,
  type Order, type OrderEvent,
} from '../components/OrderParts';

// ---------- lista ----------
export function Orders() {
  usePageTitle('Meus pedidos');
  const q = useAsync(() => api.get<{ items: Order[] }>('/orders'), [], { silentMs: 15000 });
  const [tab, setTab] = useState<'todos' | 'buyer' | 'seller'>('todos');
  const items = (q.data?.items ?? []).filter((o) => tab === 'todos' || o.role === tab);
  const urgent = items.filter(needsAction);
  const rest = items.filter((o) => !needsAction(o));
  return (
    <div className="stack-l">
      <PageHead title="Meus pedidos" sub="Compras e vendas feitas pelo Vendeu: pagamento retido até você receber, contato só depois do recebimento, 7 dias para devolver." />
      <div className="segmented" role="group" aria-label="Filtrar pedidos">
        {([['todos', 'Todos'], ['buyer', 'Minhas compras'], ['seller', 'Pedidos recebidos']] as const).map(([k, t]) => (
          <button key={k} type="button" aria-pressed={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>
        ))}
      </div>
      {q.loading && !q.data ? <Loading /> : q.error && !q.data ? <ErrorState error={q.error} onRetry={q.reload} /> : !items.length ? (
        <Empty icon="📦" title="Nenhum pedido por aqui">Quando você comprar, alugar ou receber um pedido, ele aparece nesta tela. <Link to="/compra">Ver anúncios</Link></Empty>
      ) : (<>
        {urgent.length > 0 && <section aria-labelledby="ped-acao"><h2 id="ped-acao">Aguardando uma ação sua ({urgent.length})</h2><OrderRows items={urgent} /></section>}
        {rest.length > 0 && <section aria-labelledby="ped-resto"><h2 id="ped-resto">{urgent.length ? 'Outros pedidos' : 'Pedidos'}</h2><OrderRows items={rest} /></section>}
      </>)}
    </div>
  );
}

export function OrderRows({ items }: { items: Order[] }) {
  return (
    <ul className="rows">
      {items.map((o) => (
        <li key={o.id} className="row-card">
          <div className="row-thumb">{o.listing.photo ? <img src={o.listing.photo} alt="" loading="lazy" /> : <span aria-hidden="true">📦</span>}</div>
          <div className="row-main">
            <Link to={`/pedidos/${o.id}`} className="row-title">{o.listing.title}</Link>
            <div className="row wrap gap-s"><OrderBadge status={o.status} /><span className="small muted">{o.role === 'buyer' ? (o.operation === 'locacao' ? 'Aluguel' : 'Compra') : (o.operation === 'locacao' ? 'Locação' : 'Venda')} · {formatBRL(o.priceCents)}{o.listedPriceCents !== o.priceCents ? ' (proposta)' : ''} · {fmtDate(o.createdAt)}</span></div>
            <div className="small">{nextStep(o)}</div>
          </div>
          <div className="row-actions"><Link className={`btn btn-sm ${needsAction(o) ? 'btn-primary' : 'btn-outline'}`} to={`/pedidos/${o.id}`}>{needsAction(o) ? 'Resolver' : 'Abrir'}</Link></div>
        </li>
      ))}
    </ul>
  );
}

// ---------- detalhe ----------
export function OrderDetail() {
  const { id } = useParams();
  usePageTitle('Pedido');
  const { pay } = useApp();
  const [fast, setFast] = useState(false);
  const q = useAsync(() => api.get<Order>(`/orders/${id}`), [id], { silentMs: fast ? 4000 : 12000 });
  const ev = useAsync(() => api.get<{ items: OrderEvent[] }>(`/orders/${id}/events`), [id, q.data?.status]);
  const act = useAction();
  const o = q.data;
  useEffect(() => { setFast(o?.status === 'awaiting_payment' && !!o.pix); }, [o?.status, o?.pix]);

  if (q.loading && !o) return <Loading />;
  if (q.error && !o) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!o) return null;

  const call = <T,>(path: string, body: unknown = {}) => act.run(async () => {
    const r = await api.post<Order>(`/orders/${o.id}/${path}`, body);
    q.setData(r); ev.reload();
    return r as unknown as T;
  });
  const buyer = o.role === 'buyer', seller = o.role === 'seller';
  const has = (a: string) => o.actions.includes(a);
  const rent = o.operation === 'locacao';
  const finished = ['released', 'refunded', 'declined', 'expired', 'cancelled'].includes(o.status);

  return (
    <div className="stack-l order-page">
      <div>
        <Link to="/pedidos" className="small">← Meus pedidos</Link>
        <div className="order-head">
          <div className="row-thumb lg">{o.listing.photo ? <img src={o.listing.photo} alt="" /> : <span aria-hidden="true">📦</span>}</div>
          <div className="row-main">
            <h1><Link to={`/anuncio/${o.listing.id}`} className="plain-link">{o.listing.title}</Link></h1>
            <div className="row wrap gap-s">
              <OrderBadge status={o.status} />
              <span className="small muted">{buyer ? `${rent ? 'Aluguel' : 'Compra'} de ${o.sellerFirstName}` : seller ? `${rent ? 'Locação' : 'Venda'} para ${o.buyerFirstName}` : `${o.buyerFirstName} × ${o.sellerFirstName}`} · pedido de {fmtDate(o.createdAt)}{o.receiptNumber ? ` · recibo ${o.receiptNumber}` : ''}</span>
            </div>
          </div>
        </div>
      </div>

      <MoneyBanner o={o} />

      {!finished && <section className="panel next-step" aria-label="Próximo passo">
        <h2>Próximo passo</h2>
        <p>{nextStep(o)}</p>
        <Deadlines o={o} />
        <ErrorAlert error={act.error} overrides={OVERRIDES} />
        {o.role !== 'admin' && <Actions o={o} call={call} busy={act.busy} has={has} onPaid={q.reload} provider={pay?.provider} />}
      </section>}
      {finished && <Alert tone={o.status === 'released' ? 'ok' : 'info'} title={ORDER_FINISH[o.status]?.title}>{ORDER_FINISH[o.status]?.text(o)}</Alert>}

      <div className="order-cols">
        <div className="stack-l">
          <section className="panel" aria-labelledby="etapas"><h2 id="etapas">Etapas e dinheiro</h2><OrderTimeline o={o} /></section>
        </div>
        <div className="stack-l">
          <section className="panel" aria-labelledby="valores"><h2 id="valores">Valores</h2><ValuesBox o={o} />
            <p className="small muted">{o.deliveryMode === 'envio' ? 'Entrega por envio.' : 'Retirada em mãos.'}{o.trackingCode ? ` Rastreio: ${o.trackingCode}.` : ''}</p>
          </section>
          {seller && o.shipTo && <ShipToCard a={o.shipTo} />}
          {o.handoverCode && <HandoverCode code={o.handoverCode} />}
          <ContactCard o={o} />
          {(buyer || seller) && !finished && <Help o={o} call={call} busy={act.busy} has={has} />}
          <section className="panel" aria-labelledby="hist"><h2 id="hist">Histórico</h2>
            {ev.data?.items.length ? <ul className="events">{ev.data.items.map((e, i) => <li key={i}><span className="small muted">{fmtDate(e.created_at)} {new Date(e.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span><div>{EVENT_LABEL[e.event] ?? e.event}{e.note && !['paid_held', 'offer_made', 'order_created'].includes(e.event) ? <span className="muted"> — {e.note}</span> : ''}</div></li>)}</ul> : <p className="small muted">Sem eventos ainda.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

const ORDER_FINISH: Record<string, { title: string; text: (o: Order) => string }> = {
  released: { title: 'Concluído', text: (o) => o.role === 'seller' ? `O prazo de devolução terminou e o valor foi repassado a você: ${formatBRL(o.sellerReceivesCents)} (preço menos comissão de ${formatBRL(o.commissionCents)}).` : 'O prazo de devolução terminou e a compra foi concluída. Obrigado por usar o Vendeu!' },
  refunded: { title: 'Valor devolvido ao comprador', text: () => 'O valor voltou integralmente ao comprador e ninguém paga comissão. O anúncio voltou à vitrine.' },
  declined: { title: 'Proposta recusada', text: () => 'O anúncio voltou à vitrine. Nada foi cobrado.' },
  expired: { title: 'Pedido expirado', text: () => 'O prazo acabou sem pagamento ou resposta. Nada foi cobrado e o anúncio voltou à vitrine.' },
  cancelled: { title: 'Pedido cancelado', text: (o) => o.paidAt ? 'O pagamento já feito foi devolvido integralmente ao comprador.' : 'Nada foi cobrado e o anúncio voltou à vitrine.' },
};

const OVERRIDES = {
  code_invalid: 'Código incorreto. Peça ao comprador o código de 6 dígitos que aparece no app dele, e só depois de entregar o produto.',
  too_many_attempts: 'Você errou o código 5 vezes e a digitação foi bloqueada por segurança. Fale com o suporte para a moderação resolver.',
};

function Deadlines({ o }: { o: Order }) {
  const items: { to: string | null | undefined; label: string }[] = [];
  if (o.status === 'offered') items.push({ to: o.offerExpiresAt, label: o.role === 'seller' ? 'Responder em' : 'A proposta vence em' });
  if (o.status === 'awaiting_payment') items.push({ to: o.payExpiresAt, label: 'Pagar em' });
  if (o.status === 'paid' && o.paidAt && o.deliveryMode === 'envio') items.push({ to: new Date(new Date(o.paidAt).getTime() + SHIP_DAYS * 86400000).toISOString(), label: o.role === 'seller' ? 'Enviar em' : 'O vendedor tem para enviar' });
  if (o.status === 'shipped' && o.shippedAt) items.push({ to: new Date(new Date(o.shippedAt).getTime() + AUTO_RECEIVE_DAYS * 86400000).toISOString(), label: 'Considerado recebido automaticamente em' });
  if (o.status === 'received') items.push({ to: o.returnDeadline, label: 'Prazo para devolver' });
  if (!items.length) return null;
  return <p className="deadlines">{items.map((i) => <Countdown key={i.label} to={i.to} label={i.label} />)}</p>;
}

type Call = <T = Order>(path: string, body?: unknown) => Promise<T | undefined>;
interface PanelProps { o: Order; call: Call; busy: boolean; has: (a: string) => boolean }

function Actions({ o, call, busy, has, onPaid, provider }: PanelProps & { onPaid: () => void; provider?: string }) {
  return (
    <div className="stack">
      {has('pay') && <PayPanel o={o} call={call} busy={busy} has={has} onPaid={onPaid} provider={provider} />}
      {has('accept') && (
        <div className="row wrap">
          <button className="btn btn-primary" disabled={busy} onClick={() => call('accept')}>Aceitar proposta de {formatBRL(o.priceCents)}</button>
          <button className="btn btn-outline" disabled={busy} onClick={() => call('decline')}>Recusar</button>
        </div>
      )}
      {has('ship') && <ShipForm call={call} busy={busy} />}
      {has('handover') && <HandoverForm call={call} busy={busy} />}
      {has('receive') && o.deliveryMode === 'envio' && <ReceiveButton call={call} busy={busy} primary />}
      {has('confirm_return') && <ConfirmReturn call={call} busy={busy} />}
    </div>
  );
}

function PayPanel({ o, call, busy, onPaid, provider }: PanelProps & { onPaid: () => void; provider?: string }) {
  const [copied, setCopied] = useState(false);
  const sim = useAction();
  const doCopy = async () => { if (o.pix && await copyText(o.pix.copyPaste)) { setCopied(true); setTimeout(() => setCopied(false), 2500); } };
  const simulate = async () => { if (await sim.run(() => api.post(`/orders/${o.id}/simulate-payment`))) onPaid(); };
  if (!o.pix) {
    return (
      <div className="stack">
        <p className="small muted">O pagamento é por Pix, processado pelo Mercado Pago. O dinheiro fica retido: o vendedor só recebe depois que você receber o produto e passar o prazo de devolução de 7 dias.</p>
        <div><button className="btn btn-primary btn-lg" disabled={busy} onClick={() => call('pay', { method: 'pix' })}>{busy ? 'Gerando Pix…' : `Pagar ${formatBRL(o.priceCents)} com Pix`}</button></div>
      </div>
    );
  }
  return (
    <div className="stack" aria-live="polite">
      <h3>Pague com Pix</h3>
      {o.pix.qrBase64 && <img className="qr" alt="QR Code do Pix" src={`data:image/png;base64,${o.pix.qrBase64}`} width={200} height={200} />}
      <label htmlFor="pix-code" className="small">Pix copia e cola</label>
      <textarea id="pix-code" readOnly rows={3} value={o.pix.copyPaste} onFocus={(e) => e.currentTarget.select()} />
      <div className="row wrap"><button className="btn btn-primary" onClick={doCopy}>{copied ? '✔ Código copiado' : 'Copiar código'}</button></div>
      <p className="small muted" role="status">⏳ Abra o app do seu banco, escolha Pix &gt; Copia e Cola e cole o código. Esta tela atualiza sozinha quando o pagamento for confirmado.</p>
      {provider === 'mock' && (
        <Alert tone="warn" title="Modo de teste">
          O pagamento está simulado (nenhum dinheiro de verdade).
          <div style={{ marginTop: 8 }}><button className="btn btn-accent" disabled={sim.busy} onClick={simulate}>{sim.busy ? 'Simulando…' : 'Simular pagamento (apenas teste)'}</button></div>
          <ErrorAlert error={sim.error} />
        </Alert>
      )}
    </div>
  );
}

function ShipForm({ call, busy }: { call: Call; busy: boolean }) {
  const [code, setCode] = useState('');
  const submit = (e: FormEvent) => { e.preventDefault(); void call('ship', code.trim() ? { trackingCode: code.trim() } : {}); };
  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Código de rastreio" value={code} onChange={(e) => setCode(e.target.value)} maxLength={60} placeholder="Ex.: BR123456789BR"
        hint={`Informe o rastreio ao enviar. Se você não enviar em ${SHIP_DAYS} dias, o valor é devolvido ao comprador automaticamente.`} />
      <div><button className="btn btn-primary" disabled={busy}>{busy ? 'Salvando…' : 'Já enviei o produto'}</button></div>
    </form>
  );
}

function HandoverForm({ call, busy }: { call: Call; busy: boolean }) {
  const [code, setCode] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const submit = (e: FormEvent) => { e.preventDefault(); if (/^\d{6}$/.test(code)) void call('handover', { code }); };
  return (
    <form className="stack" onSubmit={submit}>
      <label htmlFor="handover" className="field-label"><strong>Código de retirada</strong></label>
      <input id="handover" ref={ref} className="code-input" inputMode="numeric" autoComplete="off" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
      <p className="small muted">Entregue o produto em mãos e peça o código de 6 dígitos que aparece no app do comprador. Digitar o código confirma o recebimento (5 tentativas).</p>
      <div><button className="btn btn-primary" disabled={busy || code.length !== 6}>{busy ? 'Confirmando…' : 'Confirmar entrega'}</button></div>
    </form>
  );
}

function HandoverCode({ code }: { code: string }) {
  return (
    <section className="panel handover" aria-label="Código de retirada">
      <h2>Seu código de retirada</h2>
      <div className="code-big" aria-label={`Código ${code.split('').join(' ')}`}>{code.split('').map((d, i) => <span key={i}>{d}</span>)}</div>
      <Alert tone="warn" title="Mostre só quando tiver o produto em mãos">Passar o código confirma o recebimento e inicia os 7 dias de devolução. Nunca envie o código por mensagem nem o dê antes de receber.</Alert>
    </section>
  );
}

function ReceiveButton({ call, busy, primary }: { call: Call; busy: boolean; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const [ok, setOk] = useState(false);
  return (<>
    <div><button className={`btn ${primary ? 'btn-primary btn-lg' : 'btn-outline'}`} onClick={() => { setOk(false); setOpen(true); }}>Recebi o produto</button></div>
    <Modal open={open} onClose={() => setOpen(false)} title="Confirmar recebimento">
      <div className="stack">
        <p>Ao confirmar, os contatos do vendedor são liberados e começam os <strong>7 dias para devolver</strong>. Passado o prazo, o dinheiro vai para o vendedor.</p>
        <label className="check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span>Estou com o produto em mãos.</span></label>
        <div className="row wrap"><button className="btn btn-primary" disabled={!ok || busy} onClick={async () => { if (await call('receive')) setOpen(false); }}>{busy ? 'Confirmando…' : 'Confirmar: recebi'}</button><button className="btn btn-outline" onClick={() => setOpen(false)}>Voltar</button></div>
      </div>
    </Modal>
  </>);
}

function ConfirmReturn({ call, busy }: { call: Call; busy: boolean }) {
  const [open, setOpen] = useState(false);
  return (<>
    <div><button className="btn btn-primary" onClick={() => setOpen(true)}>O produto voltou: confirmar devolução</button></div>
    <Modal open={open} onClose={() => setOpen(false)} title="Confirmar que o produto voltou">
      <div className="stack">
        <p>Só confirme com o produto de volta nas suas mãos. O valor será devolvido <strong>integralmente</strong> ao comprador, sem comissão, e o anúncio volta à vitrine.</p>
        <div className="row wrap"><button className="btn btn-primary" disabled={busy} onClick={async () => { if (await call('return-received')) setOpen(false); }}>{busy ? 'Confirmando…' : 'Sim, o produto voltou'}</button><button className="btn btn-outline" onClick={() => setOpen(false)}>Voltar</button></div>
      </div>
    </Modal>
  </>);
}

// ---------- devolução, disputa, cancelamento ----------
function Help({ o, call, busy, has }: PanelProps) {
  const [modal, setModal] = useState<null | 'return' | 'dispute' | 'cancel' | 'receive'>(null);
  const [reason, setReason] = useState('');
  const min = modal === 'dispute' ? 10 : 3;
  const close = () => { setModal(null); setReason(''); };
  const cancelPaid = o.status === 'paid';
  const anything = has('return') || has('dispute') || has('cancel') || (has('receive') && o.deliveryMode === 'retirada');
  if (!anything) return null;
  return (
    <section className="panel" aria-labelledby="ajuda">
      <h2 id="ajuda">Algo não saiu como esperado?</h2>
      <div className="stack">
        {has('receive') && o.deliveryMode === 'retirada' && o.role === 'buyer' && <p className="small muted">Na retirada em mãos, o recebimento é confirmado quando o vendedor digita o seu código. Só confirme por aqui se estiver com o produto.</p>}
        {has('receive') && o.deliveryMode === 'retirada' && o.role === 'buyer' && <ReceiveButton call={call} busy={busy} />}
        {has('return') && <div><button className="btn btn-outline" onClick={() => setModal('return')}>Pedir devolução</button><p className="small muted">Você tem 7 dias desde o recebimento. Devolvendo, o dinheiro volta integral para você.</p></div>}
        {has('dispute') && <div><button className="btn btn-outline" onClick={() => setModal('dispute')}>Abrir disputa</button><p className="small muted">Não recebi, veio diferente do anunciado ou algo não bate? A moderação analisa e decide. O dinheiro fica retido até lá.</p></div>}
        {has('cancel') && <div><button className="btn btn-danger-outline" onClick={() => setModal('cancel')}>{cancelPaid ? 'Cancelar pedido' : o.status === 'offered' ? (o.role === 'buyer' ? 'Retirar proposta' : 'Cancelar') : 'Cancelar pedido'}</button>{cancelPaid && <p className="small muted">Cancelar depois de pago e antes do envio devolve tudo ao comprador.</p>}</div>}
      </div>

      <Modal open={modal === 'return' || modal === 'dispute'} onClose={close} title={modal === 'return' ? 'Pedir devolução' : 'Abrir disputa'}>
        <form className="stack" onSubmit={async (e) => { e.preventDefault(); if (await call(modal!, { reason: reason.trim() })) close(); }}>
          <p className="small muted">{modal === 'return' ? 'Conte o motivo. Você combina a devolução com o vendedor (os contatos estão liberados). Quando o produto voltar e ele confirmar, o valor é devolvido integralmente.' : 'Explique o que aconteceu (mínimo 10 caracteres). A moderação decide entre devolver ao comprador ou liberar ao vendedor.'}</p>
          <TextAreaField label={modal === 'return' ? 'Motivo da devolução' : 'O que aconteceu?'} value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={modal === 'return' ? 500 : 1000} required />
          <div className="row wrap"><button className="btn btn-primary" disabled={busy || reason.trim().length < min}>{busy ? 'Enviando…' : modal === 'return' ? 'Pedir devolução' : 'Abrir disputa'}</button><button type="button" className="btn btn-outline" onClick={close}>Voltar</button></div>
        </form>
      </Modal>
      <Modal open={modal === 'cancel'} onClose={close} title="Cancelar o pedido?">
        <div className="stack">
          <p>{cancelPaid ? 'O pagamento será devolvido integralmente ao comprador e o anúncio volta à vitrine.' : 'O anúncio volta à vitrine e nada é cobrado.'}</p>
          <div className="row wrap"><button className="btn btn-danger" disabled={busy} onClick={async () => { if (await call('cancel')) close(); }}>{busy ? 'Cancelando…' : 'Sim, cancelar'}</button><button className="btn btn-outline" onClick={close}>Voltar</button></div>
        </div>
      </Modal>
    </section>
  );
}

export { priceLabel };
