import { h, get, post, brl, fmtDate, toast, fail, copyText } from '../lib.js';
import { pageHead } from './_ui.js';

export async function render(root, { session }) {
  const b = await get('/api/billing');
  const tz = session.salon.timezone;
  const statusTxt = { trial: 'Teste grátis', active: 'Ativa', past_due: 'Pagamento em atraso', trial_expired: 'Teste encerrado', suspended: 'Suspensa', cancelled: 'Cancelada' }[b.status] || b.status;
  const providers = [['asaas', 'Pix, boleto ou cartão (Asaas)', b.providers.asaas], ['stripe', 'Cartão internacional (Stripe)', b.providers.stripe]].filter((p) => p[2]);
  const provider = h('select', {}, providers.length ? providers.map(([v, l]) => h('option', { value: v }, l)) : h('option', { value: '' }, 'Pagamento ainda não habilitado'));
  const doc = h('input', { placeholder: 'CPF ou CNPJ (para Pix/boleto)', inputmode: 'numeric' });
  async function choose(plan) {
    if (!provider.value) return toast('A cobrança online será habilitada em breve. Fale com o suporte.', 'bad');
    try {
      const r = await post('/api/billing/checkout', { plan, provider: provider.value, cpf_cnpj: provider.value === 'asaas' ? doc.value || undefined : undefined });
      if (r.url) location.href = r.url; else toast(r.message || 'Assinatura criada', 'ok');
    } catch (e) { fail(e); }
  }
  root.append(pageHead('Assinatura', 'Plano do Studio Beauty Barber para o seu salão.'),
    h('div', { class: 'card' }, h('div', { class: 'row spread' }, h('div', {}, h('div', { class: 'small muted' }, 'Situação'), h('b', {}, statusTxt), b.trial_ends_at && b.status === 'trial' ? h('span', { class: 'muted' }, ` · termina em ${fmtDate(b.trial_ends_at, tz)}`) : null), h('span', { class: 'chip' }, `Plano ${b.plan}`))),
    h('div', { class: 'grid g3', style: { marginTop: '14px' } }, b.plans.map((p) => h('div', { class: `card plan ${p.key === b.plan ? 'current' : ''}` },
      h('h3', {}, p.name), h('div', { class: 'big' }, brl(p.cents), h('span', { class: 'small muted' }, '/mês')), h('p', { class: 'muted small' }, `Até ${p.staff} profissionais`),
      session.user.role === 'owner' ? h('button', { class: 'btn primary block', onclick: () => choose(p.key) }, p.key === b.plan && b.status === 'active' ? 'Plano atual' : 'Escolher') : null))),
    session.user.role === 'owner' ? h('div', { class: 'card', style: { marginTop: '14px' } }, h('div', { class: 'grid g2' }, h('label', { class: 'f' }, 'Forma de pagamento', provider), h('label', { class: 'f' }, 'Documento', doc))) : null,
    h('div', { class: 'banner', style: { marginTop: '14px' } }, 'Os créditos de WhatsApp, SMS e ligações são pagos à parte, diretamente por você à operadora ou plataforma de cada canal. A assinatura não inclui esses créditos.'));
}
