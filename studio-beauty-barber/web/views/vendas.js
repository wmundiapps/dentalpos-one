import { h, get, post, brl, fmtDateTime, clear, toast, fail, debounce, fmtPhone, todayLocal, addDays, copyText, modal, confirmBox } from '../lib.js';
import { pageHead } from './_ui.js';

const METHODS = { cash: 'Dinheiro', card: 'Cartão', pix: 'Pix (manual)', pix_asaas: 'Pix com QR (Asaas)', other: 'Outro' };
const SSTAT = { paid: ['Paga', 'ok'], open: ['Aberta', 'info'], pending: ['Aguardando Pix', 'warn'], cancelled: ['Cancelada', 'bad'] };

export async function render(root, ctx) {
  const { session } = ctx;
  const tz = session.salon.timezone;
  const isMgr = ['owner', 'manager'].includes(session.user.role);
  const today = todayLocal(tz);
  const from = h('input', { type: 'date', value: today.slice(0, 8) + '01' });
  const to = h('input', { type: 'date', value: today });
  const host = h('div', {});
  async function load() {
    const [s, c] = await Promise.all([get(`/api/sales?from=${from.value}&to=${to.value}`), isMgr ? get(`/api/reports/commissions?from=${from.value}&to=${to.value}`) : null]);
    const paid = s.sales.filter((x) => x.status === 'paid');
    clear(host).append(
      h('div', { class: 'grid g3' },
        kpi('Recebido no período', brl(paid.reduce((a, x) => a + x.total_cents, 0))), kpi('Vendas pagas', paid.length),
        kpi('Aguardando pagamento', s.sales.filter((x) => x.status === 'pending').length)),
      h('div', { class: 'card scroll-x', style: { padding: 0, marginTop: '14px' } }, s.sales.length ? h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, ['Data', 'Cliente', 'Profissional', 'Forma', 'Total', 'Situação', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, s.sales.map((x) => { const [l, k] = SSTAT[x.status] || [x.status, '']; return h('tr', {},
          h('td', { class: 'nowrap' }, fmtDateTime(x.created_at, tz)), h('td', {}, x.client_name || 'Balcão'), h('td', {}, x.staff_name || '—'), h('td', {}, METHODS[x.payment_method] || x.payment_method),
          h('td', {}, brl(x.total_cents)), h('td', {}, h('span', { class: `chip ${k}` }, l)),
          h('td', { class: 'nowrap' },
            x.status === 'pending' ? h('button', { class: 'btn sm', onclick: async () => { try { await post(`/api/sales/${x.id}/pay`); toast('Pagamento confirmado', 'ok'); load(); } catch (e) { fail(e); } } }, 'Confirmar recebimento') : null,
            isMgr && x.status !== 'paid' && x.status !== 'cancelled' ? h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmBox('Cancelar esta venda?', 'Cancelar venda')) { try { await post(`/api/sales/${x.id}/cancel`); load(); } catch (e) { fail(e); } } } }, 'Cancelar') : null)); }))) : h('p', { class: 'empty' }, 'Nenhuma venda no período.')),
      c ? h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, 'Comissões do período'), h('div', { class: 'scroll-x' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, ['Profissional', 'Vendas', 'Faturamento', '%', 'Comissão'].map((t) => h('th', {}, t)))),
        h('tbody', {}, c.rows.map((r) => h('tr', {}, h('td', {}, r.name), h('td', {}, r.sales), h('td', {}, brl(r.revenue_cents)), h('td', {}, `${r.commission_pct}%`), h('td', {}, h('b', {}, brl(r.commission_cents))))))))) : null);
  }
  from.addEventListener('change', () => load().catch(fail)); to.addEventListener('change', () => load().catch(fail));
  root.append(pageHead('Vendas e caixa', 'Comandas, recebimentos e comissões.', from, to, h('button', { class: 'btn primary', onclick: () => checkout(ctx, load) }, '+ Nova comanda')), host);
  await load();
  const apptId = new URLSearchParams(location.hash.split('?')[1] || '').get('appt');
  if (apptId) checkout(ctx, load, apptId);
}
const kpi = (l, v) => h('div', { class: 'card kpi' }, h('div', { class: 'label' }, l), h('div', { class: 'value' }, v));

async function checkout(ctx, done, apptId) {
  const [{ services }, { products }, { staff }] = await Promise.all([get('/api/services'), get('/api/products'), get('/api/staff')]);
  let appt = null;
  if (apptId) { const t = todayLocal(ctx.session.salon.timezone); const r = await get(`/api/appointments?from=${addDays(t, -30)}&to=${addDays(t, 30)}`); appt = r.appointments.find((a) => a.id === apptId); }
  const items = new Map(); // key -> {kind, ref_id, name, qty, unit}
  if (appt) items.set(`service:${appt.service_id}`, { kind: 'service', ref_id: appt.service_id, name: appt.service_name, qty: 1, unit: appt.price_cents });
  modal(appt ? `Cobrar ${appt.client_name}` : 'Nova comanda', (body, close) => {
    const list = h('div', {});
    const total = h('div', { class: 'big' });
    const disc = h('input', { type: 'text', value: '0', inputmode: 'decimal', style: { maxWidth: '120px' } });
    const method = h('select', {}, Object.entries(METHODS).map(([v, l]) => h('option', { value: v }, l)));
    const stf = h('select', {}, h('option', { value: '' }, 'Profissional (comissão)'), staff.filter((s) => s.active).map((s) => h('option', { value: s.id, selected: appt && s.id === appt.staff_id }, s.name)));
    const parse = (s) => Math.round(Number(String(s).replace(/\./g, '').replace(',', '.')) * 100) || 0;
    const calc = () => { const sub = [...items.values()].reduce((a, i) => a + i.qty * i.unit, 0); return { sub, tot: Math.max(0, sub - Math.min(parse(disc.value), sub)) }; };
    const paint = () => {
      clear(list).append(items.size ? [...items].map(([k, i]) => h('div', { class: 'row spread', style: { padding: '6px 0' } }, h('span', {}, i.name), h('span', { class: 'row' },
        h('input', { type: 'number', min: 1, max: 99, value: i.qty, style: { width: '64px' }, onchange: (e) => { i.qty = Math.max(1, Number(e.target.value) || 1); paint(); } }), brl(i.qty * i.unit),
        h('button', { class: 'btn sm', onclick: () => { items.delete(k); paint(); } }, '✕')))) : h('p', { class: 'muted small' }, 'Adicione serviços ou produtos.'));
      total.textContent = `Total: ${brl(calc().tot)}`;
    };
    const add = (kind, arr) => h('select', { onchange: (e) => { const x = arr.find((a) => a.id === e.target.value); if (x) { const k = `${kind}:${x.id}`; const cur = items.get(k); cur ? cur.qty++ : items.set(k, { kind, ref_id: x.id, name: x.name, qty: 1, unit: x.price_cents }); paint(); } e.target.value = ''; } },
      h('option', { value: '' }, kind === 'service' ? '+ Serviço' : '+ Produto'), arr.filter((a) => a.active).map((a) => h('option', { value: a.id }, `${a.name} — ${brl(a.price_cents)}`)));
    disc.addEventListener('input', paint);
    const out = h('div', {});
    body.append(h('div', { class: 'stack' }, h('div', { class: 'grid g2' }, add('service', services), add('product', products)), list,
      h('div', { class: 'grid g2' }, h('label', { class: 'f' }, 'Desconto (R$)', disc), h('label', { class: 'f' }, 'Forma de pagamento', method)), stf, total, out,
      h('button', { class: 'btn primary block', onclick: async (e) => {
        if (!items.size) return toast('Adicione pelo menos um item.', 'bad');
        e.target.disabled = true;
        try {
          const r = await post('/api/sales', { appointment_id: appt?.id, staff_id: stf.value || undefined, payment_method: method.value, discount_cents: parse(disc.value),
            items: [...items.values()].map((i) => ({ kind: i.kind, ref_id: i.ref_id, qty: i.qty })) });
          done();
          if (r.pix) {
            clear(out).append(h('div', { class: 'card flat' }, h('h3', {}, 'Pix gerado'), r.pix.image ? h('img', { src: `data:image/png;base64,${r.pix.image}`, alt: 'QR Code Pix', width: 200, height: 200 }) : null,
              h('code', { class: 'break' }, r.pix.payload), h('button', { class: 'btn sm', onclick: () => copyText(r.pix.payload) }, 'Copiar Pix copia e cola'),
              r.pix.note ? h('p', { class: 'small muted' }, r.pix.note) : null, h('p', { class: 'small muted' }, 'A confirmação chega automaticamente pelo Asaas.')));
            e.target.remove();
          } else { toast('Venda registrada', 'ok'); close(); }
        } catch (ex) { fail(ex); e.target.disabled = false; }
      } }, 'Fechar comanda')));
    paint();
  }, { wide: true });
}
