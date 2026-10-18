import { h, get, post, patch, modal, field, toast, fail, confirmBox, todayLocal, addDays, fmtTime, statusChip, brl, debounce, fmtPhone, clear, STATUS } from '../lib.js';

const HOUR_PX = 60;
let state = { date: todayLocal(), data: null, staff: [], services: [] };

export async function render(root, ctx) {
  const tz = ctx.session.salon.timezone;
  state.date = state.date || todayLocal(tz);
  [state.staff, state.services] = await Promise.all([get('/api/staff').then((r) => r.staff.filter((s) => s.active)), get('/api/services').then((r) => r.services.filter((s) => s.active))]);
  const host = h('div', {});
  const dateInput = h('input', { type: 'date', value: state.date, style: { width: 'auto' }, onchange: (e) => { state.date = e.target.value; draw(); } });

  async function draw() {
    dateInput.value = state.date;
    try { state.data = await get(`/api/appointments?from=${state.date}&to=${state.date}`); } catch (e) { return fail(e); }
    clear(host).append(grid(tz, ctx));
  }

  root.append(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Agenda'), h('p', {}, 'Clique em um horário vazio para agendar ou em um atendimento para gerenciar.')),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn', onclick: () => { state.date = addDays(state.date, -1); draw(); } }, '‹'),
        h('button', { class: 'btn', onclick: () => { state.date = todayLocal(tz); draw(); } }, 'Hoje'),
        h('button', { class: 'btn', onclick: () => { state.date = addDays(state.date, 1); draw(); } }, '›'),
        dateInput,
        h('button', { class: 'btn primary', onclick: () => newAppointment(ctx, tz, null, null, draw) }, '+ Agendar'))),
    host);
  await draw();
}

function toMin(hhmm) { const [a, b] = hhmm.split(':').map(Number); return a * 60 + b; }
function hhmmIn(iso, tz) { return fmtTime(iso, tz); }

function grid(tz, ctx) {
  const staff = state.staff;
  if (!staff.length) return h('div', { class: 'card empty' }, 'Cadastre profissionais em "Serviços e equipe" para usar a agenda.');
  const appts = state.data.appointments;
  const mins = appts.flatMap((a) => [toMin(hhmmIn(a.starts_at, tz))]);
  const startH = Math.min(8, ...mins.map((m) => Math.floor(m / 60)));
  const endH = Math.max(20, ...appts.map((a) => Math.ceil(toMin(hhmmIn(a.ends_at, tz)) / 60) || 20));
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);

  const timeCol = h('div', { class: 'time-col' }, h('div', { class: 'col-head', style: { borderLeft: 0 } }, ''), hours.map((hr) => h('div', { class: 'hour' }, `${String(hr).padStart(2, '0')}:00`)));
  const cols = staff.map((st) => {
    const col = h('div', { class: 'col', style: { height: `${hours.length * HOUR_PX}px` } },
      hours.map((hr) => h('div', { class: 'slot', onclick: (e) => {
        const half = e.offsetY > HOUR_PX / 2 ? 30 : 0;
        newAppointment(ctx, tz, st.id, `${String(hr).padStart(2, '0')}:${half === 0 ? '00' : '30'}`, () => render(document.createElement('div'), ctx) && redraw());
      } })));
    for (const a of appts.filter((x) => x.staff_id === st.id)) {
      const top = ((toMin(hhmmIn(a.starts_at, tz)) - startH * 60) / 60) * HOUR_PX;
      const height = Math.max(26, (a.duration_min / 60) * HOUR_PX - 2);
      col.append(h('div', { class: `appt ${a.status}`, style: { top: `${top + 0}px`, height: `${height}px`, '--c': st.color || '#c9a66b' }, title: `${a.client_name} — ${a.service_name}`, onclick: (e) => { e.stopPropagation(); openAppointment(a, tz, ctx); } },
        h('b', {}, `${hhmmIn(a.starts_at, tz)} ${a.client_name}`), h('span', {}, a.service_name)));
    }
    return col;
  });
  const heads = staff.map((st) => h('div', { class: 'col-head' }, h('span', { style: { width: '10px', height: '10px', borderRadius: '50%', background: st.color || '#c9a66b', display: 'inline-block' } }), st.name));

  // linha do "agora"
  const g = h('div', { class: 'agenda', style: { gridTemplateColumns: `56px repeat(${staff.length}, minmax(160px, 1fr))` } });
  g.append(h('div', {}, h('div', { class: 'col-head', style: { borderLeft: 0 } }), ...hours.map((hr) => h('div', { class: 'hour' }, `${String(hr).padStart(2, '0')}:00`))));
  staff.forEach((st, i) => g.append(h('div', {}, heads[i], cols[i])));
  if (state.date === todayLocal(tz)) {
    const nowMin = toMin(new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date()));
    if (nowMin >= startH * 60 && nowMin <= endH * 60) {
      const line = h('div', { class: 'now-line', style: { top: `${41 + ((nowMin - startH * 60) / 60) * HOUR_PX}px` } });
      g.append(line);
    }
  }
  return h('div', { class: 'agenda-wrap' }, g);
}

function redraw() { document.querySelector('.page-head input[type=date]')?.dispatchEvent(new Event('change')); }

function openAppointment(a, tz, ctx) {
  modal('Atendimento', (body, close) => {
    const moneyAct = async (appt, status, msg) => {
      try { const r = await patch(`/api/appointments/${appt.id}`, { status }); toast(r.money?.note ? `${msg}. ${r.money.note}` : msg, 'ok'); close(); redraw(); ctx.refreshBadge?.(); } catch (e) { fail(e); }
    };
    const act = async (fn, msg) => { try { await fn(); toast(msg, 'ok'); close(); redraw(); ctx.refreshBadge?.(); } catch (e) { fail(e); } };
    body.append(
      h('div', { class: 'stack' },
        h('div', { class: 'row spread' }, h('div', {}, h('h3', {}, a.client_name), h('p', { class: 'muted small' }, fmtPhone(a.client_phone))), statusChip(a.status)),
        h('div', { class: 'grid g2' },
          info('Serviço', a.service_name), info('Profissional', a.staff_name),
          info('Início', `${fmtTime(a.starts_at, tz)} (${a.duration_min} min)`), info('Valor', brl(a.price_cents)),
          a.pay_status && a.pay_status !== 'none' ? info('Pagamento antecipado', ({ pending: 'Aguardando pagamento', paid: `Pago ${brl(a.paid_cents)}`, refunded: `Devolvido ${brl(a.refunded_cents)}`, partial_refund: `Devolvido ${brl(a.refunded_cents)} (retido ${brl(a.paid_cents - a.refunded_cents)})` })[a.pay_status] || a.pay_status) : null,
          a.club_id ? info('Origem', 'Clube de assinatura') : null),
        a.notes ? info('Observações', a.notes) : null,
        h('div', { class: 'row wrap' },
          a.status === 'scheduled' ? h('button', { class: 'btn', onclick: () => act(() => patch(`/api/appointments/${a.id}`, { status: 'confirmed' }), 'Confirmado') }, 'Confirmar presença') : null,
          ['scheduled', 'confirmed'].includes(a.status) ? h('button', { class: 'btn gold', onclick: () => { close(); location.hash = `#/vendas?appt=${a.id}`; } }, 'Concluir e cobrar') : null,
          ['scheduled', 'confirmed'].includes(a.status) ? h('button', { class: 'btn', onclick: async () => {
            if (a.pay_status === 'paid' && !(await confirmBox('Marcar falta? O pagamento antecipado será devolvido, menos a retenção definida na política do salão.', 'Marcar falta'))) return;
            await moneyAct(a, 'noshow', 'Marcado como falta');
          } }, 'Faltou') : null,
          ['scheduled', 'confirmed', 'pending_payment'].includes(a.status) ? h('button', { class: 'btn danger', onclick: async () => {
            if (await confirmBox(a.pay_status === 'paid' ? 'Cancelar? Dentro do prazo da política, o valor é devolvido por inteiro; fora dele, aplica-se a retenção.' : 'Cancelar este agendamento?', 'Cancelar agendamento')) await moneyAct(a, 'cancelled', 'Agendamento cancelado');
          } }, 'Cancelar') : null),
        ['scheduled', 'confirmed'].includes(a.status) ? reschedule(a, tz, act) : null));
  });
}
const info = (l, v) => h('div', {}, h('div', { class: 'small muted' }, l), h('div', {}, v));

function reschedule(a, tz, act) {
  const date = h('input', { type: 'date', value: state.date });
  const slots = h('select', {});
  const load = async () => {
    clear(slots);
    const r = await get(`/api/availability?service_id=${a.service_id}&date=${date.value}&staff_id=${a.staff_id}`);
    slots.append(h('option', { value: '' }, r.slots.length ? 'Escolha o novo horário' : 'Sem horários neste dia'), r.slots.map((s) => h('option', { value: s.startsAt }, s.time)));
  };
  date.addEventListener('change', () => load().catch(fail)); load().catch(fail);
  return h('div', { class: 'card flat' }, h('h3', {}, 'Remarcar'),
    h('div', { class: 'grid g2' }, field('Nova data', date), field('Novo horário', slots)),
    h('button', { class: 'btn', style: { marginTop: '10px' }, onclick: () => { if (!slots.value) return toast('Escolha um horário.', 'bad'); act(() => patch(`/api/appointments/${a.id}`, { starts_at: slots.value }), 'Remarcado'); } }, 'Remarcar'));
}

function newAppointment(ctx, tz, staffId, time, done) {
  modal('Novo agendamento', (body, close) => {
    let client = null;
    const q = h('input', { placeholder: 'Buscar cliente por nome ou telefone…', autocomplete: 'off' });
    const results = h('div', { class: 'stack-sm' });
    const picked = h('div', { class: 'small' });
    const newName = h('input', { placeholder: 'Nome do cliente novo' });
    const newPhone = h('input', { placeholder: 'WhatsApp com DDD', inputmode: 'tel' });
    const svc = h('select', {}, h('option', { value: '' }, 'Escolha o serviço'), state.services.map((s) => h('option', { value: s.id }, `${s.name} — ${brl(s.price_cents)}`)));
    const stf = h('select', {});
    const date = h('input', { type: 'date', value: state.date });
    const slot = h('select', {});

    const fillStaff = () => {
      clear(stf).append(h('option', { value: '' }, 'Escolha o profissional'),
        state.staff.filter((s) => !svc.value || s.service_ids.includes(svc.value)).map((s) => h('option', { value: s.id, selected: s.id === staffId }, s.name)));
    };
    const loadSlots = async () => {
      clear(slot);
      if (!svc.value || !stf.value || !date.value) { slot.append(h('option', { value: '' }, 'Escolha serviço, profissional e data')); return; }
      const r = await get(`/api/availability?service_id=${svc.value}&date=${date.value}&staff_id=${stf.value}`);
      slot.append(h('option', { value: '' }, r.slots.length ? 'Escolha o horário' : 'Sem horários livres'), r.slots.map((s) => h('option', { value: s.startsAt, selected: s.time === time }, s.time)));
    };
    fillStaff();
    svc.addEventListener('change', () => { fillStaff(); loadSlots().catch(fail); });
    stf.addEventListener('change', () => loadSlots().catch(fail));
    date.addEventListener('change', () => loadSlots().catch(fail));
    if (staffId) setTimeout(() => svc.value && loadSlots().catch(fail), 0);

    q.addEventListener('input', debounce(async () => {
      clear(results);
      if (q.value.trim().length < 2) return;
      const r = await get(`/api/clients?q=${encodeURIComponent(q.value)}&limit=6`).catch(() => ({ clients: [] }));
      r.clients.forEach((c) => results.append(h('button', { class: 'btn sm', type: 'button', onclick: () => { client = c; picked.textContent = `Cliente: ${c.name} ${fmtPhone(c.phone)}`; clear(results); q.value = ''; } }, `${c.name} · ${fmtPhone(c.phone)}`)));
    }));

    body.append(h('div', { class: 'stack' },
      h('div', { class: 'stack-sm' }, h('b', {}, 'Cliente'), q, results, picked,
        h('details', {}, h('summary', { class: 'small muted' }, 'Cliente novo'), h('div', { class: 'grid g2', style: { marginTop: '8px' } }, newName, newPhone))),
      field('Serviço', svc), field('Profissional', stf),
      h('div', { class: 'grid g2' }, field('Data', date), field('Horário', slot)),
      h('button', { class: 'btn primary block', onclick: async (e) => {
        e.target.disabled = true;
        try {
          if (!slot.value) throw new Error('Escolha um horário livre.');
          const payload = { staff_id: stf.value, service_id: svc.value, starts_at: slot.value };
          if (client) payload.client_id = client.id;
          else if (newName.value.trim()) payload.new_client = { name: newName.value.trim(), phone: newPhone.value.trim() || undefined };
          else throw new Error('Escolha um cliente ou informe os dados de um novo.');
          await post('/api/appointments', payload);
          toast('Agendado!', 'ok'); close(); redraw();
        } catch (ex) { fail(ex); e.target.disabled = false; }
      } }, 'Agendar')));
  });
}
