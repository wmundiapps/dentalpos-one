import { h, get, post, brl, clear, toast, fail, confirmBox, fmtDateTime, modal, field, statusChip } from '../lib.js';
import { pageHead } from './_ui.js';

const LABEL = { 7: 'Semanal (7 em 7 dias)', 15: '15 em 15 dias', 30: '30 em 30 dias', 45: '45 em 45 dias', 60: '60 em 60 dias' };

export async function render(root, { session }) {
  const tz = session.salon.timezone;
  const box = h('div', {});
  const canEdit = ['owner', 'manager'].includes(session.user.role);

  async function load() {
    const { memberships } = await get('/api/club');
    clear(box).append(memberships.length
      ? h('div', { class: 'scroll-x' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, ['Cliente', 'Serviço', 'Intervalo', 'Valor por visita', 'Próximas visitas', 'Situação', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, memberships.map((m) => h('tr', {},
          h('td', {}, h('b', {}, m.client_name), h('div', { class: 'small muted' }, m.staff_name)),
          h('td', {}, m.service_name), h('td', {}, LABEL[m.interval_days] || `${m.interval_days} dias`),
          h('td', {}, brl(m.visit_cents), m.discount_pct ? h('div', { class: 'small muted' }, `${m.discount_pct}% de desconto`) : null),
          h('td', {}, m.next_visits.slice(0, 3).map((v) => h('div', { class: 'small' }, fmtDateTime(v.starts_at, tz), ' ', v.pay_status === 'paid' ? '· pago' : v.pay_status === 'pending' ? '· cobrança enviada' : ''))),
          h('td', {}, statusChip(m.status === 'active' ? 'confirmed' : 'cancelled')),
          h('td', {}, canEdit && m.status === 'active' ? h('button', { class: 'btn sm', onclick: async () => {
            if (!(await confirmBox('Cancelar a assinatura? As visitas futuras ainda não pagas serão liberadas.', 'Cancelar assinatura'))) return;
            try { const r = await post(`/api/club/${m.id}/cancel`); toast(`Assinatura cancelada. ${r.released} horário(s) liberado(s).`, 'ok'); load(); } catch (e) { fail(e); }
          } }, 'Cancelar') : null))))))
      : h('p', { class: 'empty' }, 'Nenhuma assinatura ainda. Crie a primeira para o cliente ter o horário sempre garantido.'));
  }

  async function create() {
    const [{ clients }, { services }, { staff }] = await Promise.all([get('/api/clients'), get('/api/services'), get('/api/staff')]);
    modal('Nova assinatura com horário fixo', (body, close) => {
      const cl = h('select', {}, clients.map((c) => h('option', { value: c.id }, c.name)));
      const sv = h('select', {}, services.filter((s) => s.active).map((s) => h('option', { value: s.id }, `${s.name} — ${brl(s.price_cents)}`)));
      const pro = h('select', {});
      const fillPro = () => { clear(pro).append(staff.filter((p) => p.active && p.service_ids.includes(sv.value)).map((p) => h('option', { value: p.id }, p.name))); };
      sv.addEventListener('change', fillPro); fillPro();
      const iv = h('select', {}, Object.entries(LABEL).map(([v, l]) => h('option', { value: v, selected: v === '30' }, l)));
      const chargeBox = h('input', { type: 'checkbox', checked: true });
      const tm = h('input', { type: 'time', value: '10:00' }), ds = h('input', { type: 'number', min: 0, max: 50, value: 10 }), doc = h('input', { inputmode: 'numeric', placeholder: 'Para a cobrança no Asaas' });
      const btn = h('button', { class: 'btn primary', onclick: async () => {
        btn.disabled = true;
        try {
          const r = await post('/api/club', { client_id: cl.value, service_id: sv.value, staff_id: pro.value, interval_days: Number(iv.value), preferred_time: tm.value, discount_pct: Number(ds.value) || 0, cpf_cnpj: doc.value || undefined, charge: chargeBox.checked });
          toast(`Assinatura criada: ${r.visits.length} visitas reservadas`, 'ok'); close(); load();
        } catch (e) { fail(e); btn.disabled = false; }
      } }, 'Criar assinatura');
      body.append(h('div', { class: 'stack' }, field('Cliente', cl), field('Serviço', sv), field('Profissional', pro), field('Repetir', iv),
        h('div', { class: 'grid g2' }, field('Horário preferido', tm), field('Desconto do clube (%)', ds)), field('CPF/CNPJ do cliente', doc), h('label', { class: 'check' }, chargeBox, h('span', {}, 'Cobrar cada visita pelo Asaas (desmarque para só repetir o horário, sem cobrança)')), btn,
        h('p', { class: 'small muted' }, 'O sistema reserva as próximas 6 visitas no mesmo profissional e perto desse horário, cobra cada uma 7 dias antes pelo Asaas e libera o horário se não for paga até o prazo de cancelamento.')));
    });
  }

  root.append(pageHead('Clube de assinatura', 'Horário fixo recorrente: semanal, 15/15, 30/30, 45/45 ou 60/60 dias.', canEdit ? h('button', { class: 'btn primary', onclick: () => create().catch(fail) }, '+ Nova assinatura') : null), h('div', { class: 'card' }, box));
  await load();
}
