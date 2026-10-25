import { useEffect, useState, type ReactNode } from 'react';
import { fmtDate, fmtDateTime, fmtPhone, formatBRL, remaining } from '../lib/format';
import { Alert, Badge } from './ui';

export interface Address { cep: string; street: string; number: string; complement?: string | null; district: string; city: string; state: string }
export interface Order {
  id: string; role: 'buyer' | 'seller' | 'admin'; status: string; operation: 'venda' | 'locacao'; receiptNumber: string | null;
  listing: { id: string; title: string; photo: string | null };
  priceCents: number; listedPriceCents: number; commissionCents: number; sellerReceivesCents: number;
  deliveryMode: 'envio' | 'retirada'; trackingCode: string | null; buyerFirstName: string; sellerFirstName: string;
  offerExpiresAt: string | null; payExpiresAt: string | null; paidAt: string | null; shippedAt: string | null; receivedAt: string | null; autoReceived: boolean | null;
  returnDeadline: string | null; returnRequestedAt: string | null; returnReason: string | null; disputeReason: string | null; disputeBy: string | null;
  releasedAt: string | null; refundedAt: string | null; createdAt: string;
  pix?: { copyPaste: string; qrBase64: string | null }; handoverCode?: string; shipTo?: Address;
  contact: { name: string; phone: string; email: string } | null; contactNote: string | null; actions: string[];
}
export interface OrderEvent { event: string; note: string | null; created_at: string }

export const SHIP_DAYS = 5;
export const AUTO_RECEIVE_DAYS = 10;

export const ORDER_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'info' | 'muted' }> = {
  offered: { label: 'Proposta aguardando resposta', tone: 'warn' },
  awaiting_payment: { label: 'Aguardando pagamento', tone: 'warn' },
  paid: { label: 'Pago — dinheiro retido', tone: 'info' },
  shipped: { label: 'Enviado', tone: 'info' },
  received: { label: 'Recebido — prazo de devolução', tone: 'info' },
  return_requested: { label: 'Devolução pedida', tone: 'warn' },
  disputed: { label: 'Em disputa', tone: 'bad' },
  released: { label: 'Concluído', tone: 'ok' },
  refunded: { label: 'Valor devolvido ao comprador', tone: 'muted' },
  declined: { label: 'Proposta recusada', tone: 'muted' },
  expired: { label: 'Expirado', tone: 'muted' },
  cancelled: { label: 'Cancelado', tone: 'muted' },
};
export const OrderBadge = ({ status }: { status: string }) => { const s = ORDER_STATUS[status] ?? { label: status, tone: 'muted' as const }; return <Badge tone={s.tone}>{s.label}</Badge>; };

export const EVENT_LABEL: Record<string, string> = {
  order_created: 'Pedido criado', offer_made: 'Proposta enviada', offer_accepted: 'Proposta aceita', offer_declined: 'Proposta recusada',
  payment_started: 'Pix gerado', paid_held: 'Pagamento confirmado: dinheiro retido', shipped: 'Produto enviado',
  received: 'Recebimento confirmado', received_auto: 'Recebimento considerado automaticamente (sem resposta do comprador)',
  return_requested: 'Devolução pedida', return_received_refunded: 'Devolução confirmada: valor devolvido ao comprador',
  cancelled: 'Pedido cancelado', cancelled_after_payment: 'Pedido cancelado: valor devolvido ao comprador',
  auto_refund_no_shipment: 'Sem envio no prazo: valor devolvido ao comprador', dispute_opened: 'Disputa aberta',
  dispute_refund: 'Moderação decidiu: valor devolvido ao comprador', dispute_release: 'Moderação decidiu: valor liberado ao vendedor',
  released: 'Prazo de devolução encerrado: valor liberado ao vendedor', expired: 'Prazo esgotado: pedido expirado',
};

const ACTION_NOW = ['pay', 'accept', 'ship', 'handover', 'confirm_return'];
export const needsAction = (o: Order) => o.actions.some((a) => ACTION_NOW.includes(a)) || (o.role === 'buyer' && o.status === 'shipped');

/** Frase curta: o que acontece agora e quem age. */
export function nextStep(o: Order): string {
  const b = o.role === 'buyer';
  const rent = o.operation === 'locacao';
  switch (o.status) {
    case 'offered': return b ? `Aguardando ${o.sellerFirstName} responder à sua proposta.` : 'Aceite ou recuse a proposta.';
    case 'awaiting_payment': return b ? 'Pague com Pix para reservar. O dinheiro fica retido até você receber.' : 'Aguardando o comprador pagar.';
    case 'paid': return o.deliveryMode === 'envio'
      ? (b ? 'Pagamento retido. Aguarde o vendedor enviar.' : 'Pagamento retido. Envie o produto e informe o rastreio.')
      : (b ? 'Pagamento retido. Combine a retirada pelo chat e mostre o código só com o produto em mãos.' : 'Pagamento retido. Combine a retirada pelo chat e digite o código que o comprador mostrar.');
    case 'shipped': return b ? 'Quando o produto chegar, confirme "Recebi".' : 'Aguardando o comprador receber.';
    case 'received': return b ? `Você pode devolver até ${fmtDate(o.returnDeadline)}.` : `Prazo de devolução até ${fmtDate(o.returnDeadline)}. Depois, o repasse.`;
    case 'return_requested': return b ? 'Devolva o produto. O vendedor confirma quando ele chegar.' : 'Confirme quando o produto voltar.';
    case 'disputed': return 'A moderação está analisando. O dinheiro continua retido.';
    case 'released': return rent ? 'Aluguel concluído.' : 'Venda concluída.';
    case 'refunded': return 'Valor devolvido integralmente ao comprador.';
    default: return ORDER_STATUS[o.status]?.label ?? '';
  }
}

/** Onde está o dinheiro agora. */
export function moneyNow(o: Order): { icon: string; text: string; tone: 'ok' | 'info' | 'warn' | 'muted' } {
  const held = ['paid', 'shipped', 'received', 'return_requested', 'disputed'].includes(o.status);
  if (held) return { icon: '🔒', text: `${formatBRL(o.priceCents)} retidos no Mercado Pago`, tone: 'info' };
  if (o.status === 'released') return { icon: '✅', text: o.role === 'seller' ? `${formatBRL(o.sellerReceivesCents)} liberados a você (menos a comissão)` : `${formatBRL(o.priceCents)} liberados ao vendedor`, tone: 'ok' };
  if (o.status === 'refunded' || (o.status === 'cancelled' && o.paidAt)) return { icon: '↩️', text: `${formatBRL(o.priceCents)} devolvidos integralmente ao comprador`, tone: 'muted' };
  return { icon: '💤', text: 'Nenhum dinheiro foi movimentado ainda', tone: 'muted' };
}

export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}
export function Countdown({ to, label }: { to?: string | null; label: string }) {
  const now = useNow();
  if (!to) return null;
  const r = remaining(to, now);
  return <span className={`countdown${r.late ? ' late' : ''}`}><span aria-hidden="true">⏳</span> {label}: <strong>{r.text}</strong></span>;
}

type StepState = 'done' | 'now' | 'todo' | 'skip' | 'bad';
interface TStep { key: string; title: string; date?: string | null; money: string; state: StepState; extra?: ReactNode }

export function buildSteps(o: Order): TStep[] {
  const s = o.status;
  const envio = o.deliveryMode === 'envio';
  const rent = o.operation === 'locacao';
  const closed = ['declined', 'expired'].includes(s) || (s === 'cancelled' && !o.paidAt);
  const retired = s === 'refunded' || (s === 'cancelled' && !!o.paidAt);
  const received = !!o.receivedAt;

  const steps: TStep[] = [];
  const offerLike = o.listedPriceCents !== o.priceCents;
  steps.push({ key: 'order', title: offerLike ? 'Proposta e pedido' : 'Pedido', date: o.createdAt, money: 'Nenhum dinheiro movimentado ainda.',
    state: s === 'offered' ? 'now' : 'done' });
  if (closed) {
    steps.push({ key: 'end', title: s === 'declined' ? 'Proposta recusada' : s === 'expired' ? 'Prazo esgotado' : 'Pedido cancelado', date: null, money: 'Nada foi cobrado. O anúncio voltou à vitrine.', state: 'bad' });
    return steps;
  }
  steps.push({ key: 'paid', title: 'Pagamento retido', date: o.paidAt, state: o.paidAt ? 'done' : s === 'awaiting_payment' ? 'now' : 'todo',
    money: o.paidAt ? 'Dinheiro retido no Mercado Pago.' : 'Aguardando o pagamento por Pix.' });
  steps.push({ key: 'ship', title: envio ? 'Envio' : 'Retirada em mãos', date: envio ? o.shippedAt : o.receivedAt,
    state: (envio ? (!!o.shippedAt || received) : received) ? 'done' : s === 'paid' ? 'now' : 'todo',
    money: (envio ? (o.shippedAt || received) : received) ? (retired || s === 'released' ? 'Veja os próximos passos.' : 'Continua retido no Mercado Pago.') : 'Continua retido até a entrega.',
    extra: envio && o.trackingCode ? <span className="small">Rastreio: <strong>{o.trackingCode}</strong></span> : undefined });
  steps.push({ key: 'received', title: 'Recebido', date: o.receivedAt, state: received ? 'done' : s === 'shipped' ? 'now' : 'todo',
    money: received ? (o.autoReceived ? 'Considerado recebido automaticamente. Contatos liberados.' : 'Contatos liberados para os dois lados.') : 'Os contatos só são liberados depois do recebimento.' });

  if (retired) {
    steps.push({ key: 'return', title: 'Devolução', date: o.refundedAt, state: 'done', money: 'Devolvido integralmente ao comprador. Ninguém paga comissão.' });
    return steps;
  }
  if (s === 'return_requested') {
    steps.push({ key: 'return', title: 'Devolução pedida', date: o.returnRequestedAt, state: 'now', money: 'Retido até o vendedor confirmar que o produto voltou.', extra: o.returnReason ? <span className="small">Motivo: {o.returnReason}</span> : undefined });
    return steps;
  }
  if (s === 'disputed') {
    steps.push({ key: 'dispute', title: 'Disputa', date: null, state: 'bad', money: 'Retido até a moderação decidir (devolver ao comprador ou liberar ao vendedor).', extra: o.disputeReason ? <span className="small">Motivo: {o.disputeReason}</span> : undefined });
    return steps;
  }
  steps.push({ key: 'window', title: `Prazo de devolução de 7 dias`, date: o.returnDeadline, state: s === 'received' ? 'now' : s === 'released' ? 'done' : 'todo',
    money: s === 'released' ? 'Prazo encerrado sem devolução.' : 'Retido no Mercado Pago até o fim do prazo.',
    extra: s === 'received' ? <Countdown to={o.returnDeadline} label="faltam" /> : undefined });
  steps.push({ key: 'done', title: rent ? 'Concluído (aluguel)' : 'Concluído', date: o.releasedAt, state: s === 'released' ? 'done' : 'todo',
    money: s === 'released' ? `Liberado ao vendedor: ${formatBRL(o.sellerReceivesCents)} (preço menos comissão de ${formatBRL(o.commissionCents)}).` : 'Depois do prazo, o valor é liberado ao vendedor, menos a comissão.' });
  return steps;
}

export function OrderTimeline({ o }: { o: Order }) {
  const steps = buildSteps(o);
  return (
    <ol className="timeline" aria-label="Etapas do pedido">
      {steps.map((st) => (
        <li key={st.key} className={`tl-${st.state}`} aria-current={st.state === 'now' ? 'step' : undefined}>
          <span className="tl-dot" aria-hidden="true">{st.state === 'done' ? '✔' : st.state === 'bad' ? '!' : st.state === 'now' ? '●' : ''}</span>
          <div className="tl-body">
            <div className="tl-head"><strong>{st.title}</strong>{st.date && <span className="small muted">{fmtDateTime(st.date)}</span>}</div>
            <div className="small tl-money"><span aria-hidden="true">💰</span> {st.money}</div>
            {st.extra}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function MoneyBanner({ o }: { o: Order }) {
  const m = moneyNow(o);
  return <div className={`money-now money-${m.tone}`} role="status"><span aria-hidden="true">{m.icon}</span><div><span className="small muted">Onde está o dinheiro</span><strong>{m.text}</strong></div></div>;
}

export function ValuesBox({ o }: { o: Order }) {
  const offer = o.listedPriceCents !== o.priceCents;
  const rent = o.operation === 'locacao';
  const done = o.status === 'released';
  return (
    <dl className="attrs values">
      {offer && <div><dt>Preço anunciado</dt><dd><s>{formatBRL(o.listedPriceCents)}</s></dd></div>}
      <div><dt>{offer ? 'Valor combinado (proposta aceita)' : rent ? 'Valor do aluguel' : 'Preço'}</dt><dd>{formatBRL(o.priceCents)}</dd></div>
      <div><dt>{done ? 'Comissão do Vendeu' : rent ? 'Comissão se o aluguel se concluir' : 'Comissão se a venda se concluir'}</dt><dd>{formatBRL(o.commissionCents)}</dd></div>
      <div><dt>{done ? 'Vendedor recebeu' : 'Vendedor recebe'}</dt><dd><strong>{formatBRL(o.sellerReceivesCents)}</strong></dd></div>
      {o.role === 'buyer' && <div><dt>Você paga</dt><dd><strong>{formatBRL(o.priceCents)}</strong> <span className="small muted">(sem taxa extra)</span></dd></div>}
    </dl>
  );
}

export function ContactCard({ o }: { o: Order }) {
  if (o.role === 'admin') return null;
  if (o.contact) {
    const c = o.contact;
    return (
      <section className="panel contact-card" aria-label="Contato liberado">
        <h2>Contato liberado</h2>
        <p className="small muted">O recebimento foi registrado, então os contatos agora aparecem para os dois lados. Use para combinar devolução ou resolver dúvidas.</p>
        <dl className="attrs">
          <div><dt>Nome</dt><dd>{c.name}</dd></div>
          <div><dt>Telefone</dt><dd><a href={`tel:+${c.phone.replace(/\D/g, '')}`}>{fmtPhone(c.phone)}</a></dd></div>
          <div><dt>E-mail</dt><dd><a href={`mailto:${c.email}`}>{c.email}</a></dd></div>
        </dl>
      </section>
    );
  }
  return o.contactNote ? <Alert tone="info" title="Por que não vejo o contato?"><span aria-hidden="true">🔒</span> {o.contactNote}</Alert> : null;
}

export function ShipToCard({ a }: { a: Address }) {
  return (
    <section className="panel" aria-label="Endereço de entrega">
      <h2>Endereço de entrega</h2>
      <p className="pre">{a.street}, {a.number}{a.complement ? ` — ${a.complement}` : ''}{'\n'}{a.district} · {a.city}/{a.state}{'\n'}CEP {a.cep.replace(/(\d{5})(\d{3})/, '$1-$2')}</p>
      <p className="small muted">Aparece só para você, enquanto o pedido estiver pago ou enviado. Use apenas para enviar este produto.</p>
    </section>
  );
}
