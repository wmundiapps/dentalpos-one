// Plano SpaceHour: pagamento antecipado de 6 ou 12 meses com 10% de desconto, saldo e extrato do crédito,
// cancelamento com a política de reembolso, chave Pix do anfitrião e o financeiro da equipe.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../state';
import { useI18n } from '../i18n';
import { errorText } from '../errors';
import { PLAN_RULES, planQuote } from '../../../shared/rules';

const brl = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');

type Entry = { id: string; kind: string; amount: number; note: string | null; created_at: string; booking_id: string | null; title: string | null };
type Plan = {
  id: string; months: number; monthly_amount: number; credit_total: number; price_paid: number; status: string; checkout_url: string | null;
  paid_at: string | null; ends_at: string | null; valid_until: string | null; refund_amount: number | null; creditLeft: number; creditUsed: number;
  entries: Entry[]; refundNow: { amount: number; rule: string } | null;
};
const STATUS: Record<string, string> = { pending_payment: 'Aguardando pagamento', active: 'Ativo', refunded: 'Cancelado e reembolsado', cancelled: 'Não pago', expired: 'Encerrado' };
const KIND: Record<string, string> = { purchase: 'Compra do plano', booking: 'Reserva', booking_refund: 'Crédito devolvido', plan_refund: 'Cancelamento do plano', expiry: 'Fim da validade' };

export function PlansPage() {
  const { me } = useApp();
  const { t } = useI18n();
  const [sp] = useSearchParams();
  const [months, setMonths] = useState<6 | 12>(12);
  const [monthly, setMonthly] = useState('1000');
  const [method, setMethod] = useState<'pix' | 'card'>('pix');
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [mine, setMine] = useState<{ plans: Plan[]; balance: number } | null>(null);
  const load = () => { if (me) api<{ plans: Plan[]; balance: number }>('/me/plans').then(setMine).catch(() => {}); };
  useEffect(() => { document.title = 'Plano SpaceHour: pague adiantado e economize 10% | SpaceHour'; }, []);
  useEffect(load, [me]); // eslint-disable-line react-hooks/exhaustive-deps
  const value = Number(monthly.replace(/\./g, '').replace(',', '.')) || 0;
  const q = planQuote(value, months);
  const valid = value >= PLAN_RULES.minMonthly && value <= PLAN_RULES.maxMonthly;

  async function buy() {
    setBusy(true); setMsg('');
    try {
      const p = await api<Plan>('/me/plans', { body: { months, monthly: value, method, acceptTerms: accept } });
      if (p.checkout_url) window.location.href = p.checkout_url;
      else { setMsg('Plano ativo! O crédito já está disponível.'); load(); }
    } catch (e) { setMsg(errorText(e, t)); } finally { setBusy(false); }
  }
  async function cancel(p: Plan) {
    try {
      const r = await api<{ amount: number; rule: string }>(`/me/plans/${p.id}/refund`);
      const text = r.rule === 'withdrawal'
        ? `Você está no prazo de arrependimento (${PLAN_RULES.withdrawalDays} dias). Devolução: ${brl(r.amount)}.`
        : `Devolução: ${brl(r.amount)} (valor pago ${brl(p.price_paid)} menos o crédito usado a preço cheio ${brl(p.creditUsed)}; o desconto de 10% vale só para quem cumpre o plano).`;
      if (!confirm(`${text}\n\nO saldo restante será zerado e as reservas já feitas continuam valendo. Cancelar o plano?`)) return;
      await api(`/me/plans/${p.id}/cancel`, { body: { confirm: true } });
      setMsg(`Plano cancelado. Devolução de ${brl(r.amount)} em até ${PLAN_RULES.refundBusinessDays} dias úteis, na mesma forma de pagamento.`);
      load();
    } catch (e) { setMsg(errorText(e, t)); }
  }

  const active = mine?.plans.filter((p) => p.status !== 'cancelled') ?? [];
  return (
    <div className="lp">
      <section className="lp-hero">
        <div className="container">
          <p className="lp-kicker">Plano SpaceHour</p>
          <h1>Garanta seus espaços por 6 ou 12 meses e economize 10%.</h1>
          <p className="lp-lead">Pague adiantado e ganhe crédito para reservar consultórios, salas e espaços compartilhados por hora ou por dia, na plataforma global SpaceHour. Use quando quiser, agende com antecedência e acompanhe tudo no seu saldo.</p>
          {sp.get('pago') && <p className="notice success">Pagamento recebido. Seu plano ativa assim que o Mercado Pago confirmar (no Pix, em segundos).</p>}
        </div>
      </section>
      <div className="container">
        {me && mine && active.length > 0 && (
          <section className="panel" id="meu-plano">
            <div className="row between wrap gap"><h2>Meu Plano</h2><span className="badge">Saldo: <b>{brl(mine.balance)}</b></span></div>
            {active.map((p) => (
              <div key={p.id} className="panel">
                <div className="row between wrap gap">
                  <b>{p.months} meses · crédito {brl(p.credit_total)} (pago {brl(p.price_paid)})</b>
                  <span className="badge">{STATUS[p.status] ?? p.status}</span>
                </div>
                {p.status === 'pending_payment' && p.checkout_url && <p><a className="btn btn-primary small" href={p.checkout_url}>Concluir pagamento</a></p>}
                {p.status === 'active' && <>
                  <div className="meter" aria-label="Uso do crédito" style={{ background: 'var(--surface-2)', borderRadius: 8, height: 10, margin: '8px 0' }}>
                    <div style={{ width: `${Math.min(100, (p.creditUsed / p.credit_total) * 100)}%`, background: 'var(--brand)', height: 10, borderRadius: 8 }} />
                  </div>
                  <p className="small">Disponível: <b>{brl(p.creditLeft)}</b> · Usado: {brl(p.creditUsed)} · Plano até {date(p.ends_at)} · crédito vale até {date(p.valid_until)}</p>
                  <div className="row gap wrap">
                    <Link className="btn btn-primary small" to="/">Reservar um espaço</Link>
                    <button className="btn btn-ghost small" onClick={() => cancel(p)}>Cancelar plano</button>
                  </div>
                </>}
                {p.refund_amount != null && <p className="small">Devolução: {brl(p.refund_amount)}</p>}
                {!!p.entries.length && (
                  <details><summary className="small">Extrato</summary>
                    <table className="table small"><tbody>{p.entries.map((e) => (
                      <tr key={e.id}><td>{date(e.created_at)}</td><td>{KIND[e.kind] ?? e.kind}{e.title ? ` · ${e.title}` : ''}</td>
                        <td style={{ textAlign: 'end', color: e.amount < 0 ? 'var(--danger, #b42318)' : 'var(--ok, #067647)' }}>{e.amount > 0 ? '+' : ''}{brl(e.amount)}</td></tr>
                    ))}</tbody></table>
                  </details>
                )}
              </div>
            ))}
          </section>
        )}

        <section className="panel">
          <h2>Monte seu plano</h2>
          <div className="segmented" role="tablist">
            {([6, 12] as const).map((m) => <button key={m} type="button" className={months === m ? 'on' : ''} onClick={() => setMonths(m)}>{m} meses</button>)}
          </div>
          <label>Quanto você usa por mês (R$)
            <input inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
          </label>
          <div className="row gap wrap" style={{ margin: '12px 0' }}>
            <div className="panel"><div className="muted small">Crédito para usar</div><b style={{ fontSize: '1.4rem' }}>{brl(q.credit)}</b></div>
            <div className="panel"><div className="muted small">Você paga</div><b style={{ fontSize: '1.4rem' }}>{brl(q.price)}</b></div>
            <div className="panel"><div className="muted small">Economia</div><b style={{ fontSize: '1.4rem', color: 'var(--ok, #067647)' }}>{brl(q.savings)}</b></div>
          </div>
          {!valid && <p className="errors small">O valor mensal deve ficar entre {brl(PLAN_RULES.minMonthly)} e {brl(PLAN_RULES.maxMonthly)}.</p>}
          {me ? <>
            <div className="pay-methods" role="radiogroup">
              {(['pix', 'card'] as const).map((m) => (
                <label key={m} className={`pay-method ${method === m ? 'selected' : ''}`}><input type="radio" name="pm" checked={method === m} onChange={() => setMethod(m)} /> <span>{m === 'pix' ? 'Pix' : 'Cartão de crédito'}</span></label>
              ))}
            </div>
            <label className="check"><input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} /> <span>Li e aceito as <Link to="/regras/prepaid-plan" target="_blank">condições e a política de reembolso do Plano SpaceHour</Link>.</span></label>
            {msg && <p className="notice">{msg}</p>}
            <button className="btn btn-primary" disabled={!valid || !accept || busy} onClick={buy}>Contratar por {brl(q.price)}</button>
          </> : <p><Link className="btn btn-primary" to="/entrar?next=/planos">Entrar para contratar</Link></p>}
        </section>

        <section className="panel">
          <h2>Como funciona</h2>
          <ul>
            <li><b>10% de desconto</b> pagando 6 ou 12 meses adiantado (Pix ou cartão).</li>
            <li>O crédito paga a locação (valor do espaço + limpeza) em todos os espaços que aceitam o Plano.</li>
            <li>Agende com antecedência: séries semanais de até 12 semanas, renováveis, e reservas até 180 dias à frente.</li>
            <li>Taxas de corretor e de atendimento (zelador), quando o espaço tiver, são pagas à parte na reserva; não saem do seu crédito.</li>
            <li>Crédito válido durante o plano e mais {PLAN_RULES.graceDays} dias.</li>
          </ul>
          <h3>Reembolso</h3>
          <ul>
            <li><b>Até {PLAN_RULES.withdrawalDays} dias da compra:</b> devolução de tudo, menos o que já usou (pelo preço com desconto).</li>
            <li><b>Depois:</b> cancele quando quiser. Devolvemos o valor pago menos o crédito usado a preço cheio (o desconto vale para quem cumpre o plano). Sem outra multa.</li>
            <li><b>Fim da validade:</b> o saldo que sobrar volta automaticamente pela mesma regra.</li>
            <li>Devolução na mesma forma de pagamento, em até {PLAN_RULES.refundBusinessDays} dias úteis. Reservas já feitas continuam valendo.</li>
          </ul>
          <p className="muted small">Exemplo: plano de {brl(1000)} × 12 = crédito de {brl(12000)} por {brl(10800)}. Usou {brl(3000)} e cancelou depois de 7 dias: devolução de {brl(7800)}. <Link to="/regras/prepaid-plan">Condições completas</Link></p>
        </section>
      </div>
    </div>
  );
}

// ───────────── Anfitrião: Pix para receber reservas do plano ─────────────
type Payout = { id: string; title: string; amount: number; status: string; due_at: string; paid_at: string | null; paid_ref: string | null };
const PAYOUT: Record<string, string> = { scheduled: 'Agendado', due: 'Liberado (Pix em breve)', paid: 'Pago', void: 'Cancelado', failed: 'Falhou, a equipe vai refazer' };
export function HostPixSetup() {
  const { t } = useI18n();
  const [d, setD] = useState<{ account: { pix_key: string; holder_name: string; holder_tax_id: string } | null; payouts: Payout[] } | null>(null);
  const [f, setF] = useState({ pixKey: '', holderName: '', holderTaxId: '' });
  const [msg, setMsg] = useState('');
  const load = () => api<NonNullable<typeof d>>('/me/pix').then((r) => { setD(r); if (r.account) setF({ pixKey: r.account.pix_key, holderName: r.account.holder_name, holderTaxId: r.account.holder_tax_id }); }).catch(() => {});
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    setMsg('');
    try { await api('/me/pix', { method: 'PUT', body: f }); setMsg('Chave Pix salva.'); load(); } catch (e) { setMsg(errorText(e, t)); }
  }
  return (
    <section className="panel" id="pix">
      <h2>Plano SpaceHour: receba por Pix</h2>
      <p className="muted small">Profissionais que pagam adiantado (Plano SpaceHour, com 10% de desconto) reservam com crédito. Nessas reservas você recebe 80% do valor efetivamente pago, por Pix do SpaceHour, 24 h depois do início. Para aceitar o plano, cadastre uma chave Pix no seu nome. Você pode desligar o plano em cada anúncio.</p>
      <div className="form-grid">
        <label>Chave Pix<input value={f.pixKey} onChange={(e) => setF({ ...f, pixKey: e.target.value })} placeholder="CPF, CNPJ, e-mail, +55... ou aleatória" /></label>
        <label>Nome do titular<input value={f.holderName} onChange={(e) => setF({ ...f, holderName: e.target.value })} /></label>
        <label>CPF ou CNPJ do titular<input inputMode="numeric" value={f.holderTaxId} onChange={(e) => setF({ ...f, holderTaxId: e.target.value })} /></label>
      </div>
      {msg && <p className="notice small">{msg}</p>}
      <button className="btn btn-outline small" onClick={save}>{d?.account ? 'Atualizar chave Pix' : 'Salvar chave Pix'}</button>
      {!!d?.payouts.length && <table className="table small" style={{ marginTop: 12 }}><tbody>{d.payouts.map((p) => (
        <tr key={p.id}><td>{p.title}</td><td>{brl(p.amount)}</td><td>{PAYOUT[p.status] ?? p.status}</td><td>{p.paid_at ? date(p.paid_at) : `previsto ${date(p.due_at)}`}</td></tr>
      ))}</tbody></table>}
    </section>
  );
}

// ───────────── Equipe: Financeiro ─────────────
type AdminPayout = Payout & { name: string; email: string; pix_key: string | null; holder_name: string | null; holder_tax_id: string | null };
type AdminPlan = Plan & { name: string; email: string; created_at: string };
export function FinanceAdmin() {
  const { t } = useI18n();
  const [d, setD] = useState<{ plans: AdminPlan[]; payouts: AdminPayout[]; totals: { sold: number; refunded: number; credit_outstanding: number; host_payouts_open: number }; autoPix: boolean } | null>(null);
  const [msg, setMsg] = useState('');
  const load = () => api<NonNullable<typeof d>>('/admin/finance').then(setD).catch((e) => setMsg(errorText(e, t)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function pay(p: AdminPayout) {
    setMsg('');
    let ref: string | undefined;
    if (!d?.autoPix) {
      ref = prompt(`Faça o Pix de ${brl(p.amount)} para ${p.holder_name ?? p.name} (chave ${p.pix_key ?? 'não cadastrada'}) e cole aqui o código do Pix:`) ?? undefined;
      if (!ref) return;
    } else if (!confirm(`Enviar Pix de ${brl(p.amount)} para ${p.holder_name ?? p.name} (${p.pix_key})?`)) return;
    try { await api(`/admin/host-payouts/${p.id}/pay`, { body: { ref } }); setMsg('Pix registrado.'); load(); } catch (e) { setMsg(errorText(e, t)); }
  }
  if (!d) return <p className="muted">{msg || 'Carregando…'}</p>;
  return (
    <div>
      {msg && <p className="notice">{msg}</p>}
      <div className="row gap wrap">
        <div className="panel"><div className="muted small">Planos vendidos</div><b>{brl(d.totals.sold)}</b></div>
        <div className="panel"><div className="muted small">Reembolsado</div><b>{brl(d.totals.refunded)}</b></div>
        <div className="panel"><div className="muted small">Crédito em aberto</div><b>{brl(d.totals.credit_outstanding)}</b></div>
        <div className="panel"><div className="muted small">Pix a anfitriões</div><b>{brl(d.totals.host_payouts_open)}</b></div>
      </div>
      <p className="muted small">{d.autoPix ? 'Pix automático pela conta Asaas do SpaceHour.' : 'Pix manual: pague pelo banco e informe o código. Para enviar automaticamente, configure a conta Asaas (ASAAS_API_KEY).'} Taxas de corretor e zelador ficam no Admin → Parceiros e nunca saem do crédito dos planos.</p>
      <h2>Pix a anfitriões (reservas do plano)</h2>
      {!d.payouts.length && <p className="muted">Nada pendente.</p>}
      {d.payouts.map((p) => (
        <div key={p.id} className="row between wrap gap panel">
          <span><b>{p.name}</b> · {p.title} · <b>{brl(p.amount)}</b> · {PAYOUT[p.status] ?? p.status} · previsto {date(p.due_at)} · Pix {p.pix_key ?? '—'}</span>
          {(p.status === 'due' || p.status === 'failed') && <button className="btn btn-primary small" onClick={() => pay(p)}>Enviar Pix</button>}
        </div>
      ))}
      <h2>Planos</h2>
      <table className="table small"><tbody>{d.plans.map((p) => (
        <tr key={p.id}><td>{date(p.created_at)}</td><td>{p.name}<br /><span className="muted">{p.email}</span></td><td>{p.months} meses</td><td>pago {brl(p.price_paid)}<br />crédito {brl(p.credit_total)}</td><td>{STATUS[p.status] ?? p.status}{p.refund_amount != null ? ` · devolvido ${brl(p.refund_amount)}` : ''}</td></tr>
      ))}</tbody></table>
    </div>
  );
}
