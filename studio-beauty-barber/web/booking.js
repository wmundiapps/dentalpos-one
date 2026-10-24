// Página pública de agendamento: /s/<slug>. Sem login; horários sempre validados no servidor.
import { h, $, clear, get, post, brl, toast, fail } from './lib.js';
import { applyBrand, waLink, mapsLink } from './theme.js';

const slug = location.pathname.split('/').filter(Boolean)[1] || '';
const root = $('#root');
const st = { salon: null, services: [], staff: [], service: null, staffId: '', date: null, slot: null, optionStaff: null };
const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

async function boot() {
  try {
    const r = await get(`/api/public/salons/${encodeURIComponent(slug)}`);
    Object.assign(st, { salon: r.salon, services: r.services, staff: r.staff });
    document.title = `Agende em ${r.salon.name}`;
    applyBrand(r.salon.brand);
    stepService();
  } catch (e) {
    clear(root).append(h('div', { class: 'pub-wrap' }, h('div', { class: 'card' }, h('h2', {}, 'Página não encontrada'), h('p', { class: 'muted' }, 'Confira o link com o salão.'))));
  }
}

function contactBar() {
  const c = st.salon.brand?.contact || {};
  const links = [];
  if (c.whatsapp) links.push(h('a', { class: 'wa', href: waLink(c.whatsapp, `Olá! Vim pela página de agendamento do ${st.salon.name}.`), target: '_blank', rel: 'noopener noreferrer' }, 'WhatsApp'));
  if (c.phone) links.push(h('a', { href: `tel:+${String(c.phone).replace(/\D/g, '')}` }, 'Ligar'));
  if (c.instagram) links.push(h('a', { href: `https://instagram.com/${encodeURIComponent(c.instagram)}`, target: '_blank', rel: 'noopener noreferrer' }, 'Instagram'));
  if (c.facebook) links.push(h('a', { href: `https://facebook.com/${encodeURIComponent(c.facebook)}`, target: '_blank', rel: 'noopener noreferrer' }, 'Facebook'));
  if (c.website) links.push(h('a', { href: c.website, target: '_blank', rel: 'noopener noreferrer' }, 'Site'));
  if (c.address) links.push(h('a', { href: mapsLink(c.address, c.city), target: '_blank', rel: 'noopener noreferrer' }, 'Como chegar'));
  return links.length ? h('div', { class: 'pub-contact' }, links) : null;
}

function shell(...content) {
  const b = st.salon.brand || {};
  const c = b.contact || {};
  clear(root).append(h('div', { class: 'pub-wrap' },
    h('header', { class: 'pub-hero' },
      h('div', { class: 'pub-head', style: { marginBottom: 0 } }, st.salon.logo ? h('img', { src: st.salon.logo, alt: '', class: 'pub-logo' }) : h('div', { class: 'mark' }, st.salon.name[0]),
        h('div', {}, h('h1', {}, st.salon.name), b.tagline ? h('p', {}, b.tagline) : null, h('p', { class: 'small' }, [c.address, c.city].filter(Boolean).join(' · ')))),
      contactBar()),
    ...content,
    b.about ? h('p', { class: 'small muted', style: { marginTop: '22px' } }, b.about) : null,
    h('footer', { class: 'small muted', style: { textAlign: 'center', marginTop: '24px' } }, st.salon.hours ? `Funcionamento: ${st.salon.hours}` : '', h('br'), 'Agendamento por Studio Beauty Barber')));
  window.scrollTo(0, 0);
}

function stepService() {
  const groups = new Map();
  for (const s of st.services) { const k = s.category || 'Serviços'; (groups.get(k) || groups.set(k, []).get(k)).push(s); }
  shell(h('h2', {}, '1. Escolha o serviço'), [...groups].map(([cat, list]) => h('div', { class: 'card', style: { marginBottom: '12px' } }, h('h3', {}, cat),
    list.map((s) => h('button', { class: 'opt', onclick: () => { st.service = s; stepStaff(); } },
      h('span', { class: 'grow' }, h('b', {}, s.name), h('span', { class: 'small muted block' }, `${s.duration_min} min${s.description ? ' · ' + s.description : ''}`)), h('b', {}, brl(s.price_cents)))))));
}

function stepStaff() {
  const pros = st.staff.filter((p) => p.service_ids.includes(st.service.id));
  shell(back(stepService), h('h2', {}, '2. Com quem?'),
    h('div', { class: 'card' }, h('button', { class: 'opt', onclick: () => { st.staffId = ''; stepDate(); } }, h('b', {}, 'Qualquer profissional'), h('span', { class: 'muted small' }, 'mais horários disponíveis')),
      pros.map((p) => h('button', { class: 'opt', onclick: () => { st.staffId = p.id; stepDate(); } }, h('b', {}, p.name), h('span', { class: 'muted small' }, p.role || '')))));
}

async function stepDate() {
  const q = `service_id=${encodeURIComponent(st.service.id)}${st.staffId ? `&staff_id=${st.staffId}` : ''}`;
  const slots = h('div', { class: 'slots' });
  const days = h('div', { class: 'days' });
  shell(back(stepStaff), h('h2', {}, '3. Escolha dia e horário'), h('p', { class: 'muted small' }, `${st.service.name} · ${st.service.duration_min} min`), days, slots);
  try {
    const r = await get(`/api/public/salons/${encodeURIComponent(slug)}/days?${q}`);
    if (!r.days.length) { days.append(h('p', { class: 'empty' }, 'Sem horários nos próximos dias. Fale com o salão pelo telefone.')); return; }
    const pick = async (d, btn) => {
      days.querySelectorAll('button').forEach((b) => b.classList.remove('active')); btn.classList.add('active'); st.date = d.date;
      clear(slots).append(h('p', { class: 'muted small' }, 'Carregando…'));
      try {
        const s = await get(`/api/public/salons/${encodeURIComponent(slug)}/slots?${q}&date=${d.date}`);
        clear(slots).append(s.slots.map((x) => h('button', { class: 'slot-btn', onclick: () => { st.slot = x; stepContact(); } }, x.time)));
      } catch (e) { fail(e); }
    };
    r.days.forEach((d, i) => { const [y, m, dd] = d.date.split('-').map(Number); const wd = WD[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()];
      const b = h('button', { class: 'day', onclick: (e) => pick(d, e.currentTarget) }, h('span', { class: 'small' }, wd), h('b', {}, `${String(dd).padStart(2, '0')}/${String(m).padStart(2, '0')}`)); days.append(b); if (i === 0) pick(d, b); });
  } catch (e) { fail(e); }
}

function stepContact() {
  const name = h('input', { autocomplete: 'name', required: true }), phone = h('input', { autocomplete: 'tel', inputmode: 'tel', required: true, placeholder: '(11) 91234-5678' }), email = h('input', { type: 'email', autocomplete: 'email' });
  const consent = h('input', { type: 'checkbox' });
  const cash = h('input', { type: 'checkbox' });
  const paid = !!st.salon.deposit_required;
  const cpf = h('input', { inputmode: 'numeric', autocomplete: 'off', placeholder: 'CPF ou CNPJ (para o pagamento)' });
  const pixR = h('input', { type: 'radio', name: 'pay', checked: true }), cardR = h('input', { type: 'radio', name: 'pay' });
  const accept = h('input', { type: 'checkbox' });
  const hp = h('input', { name: 'website', tabindex: -1, autocomplete: 'off', 'aria-hidden': 'true', style: { position: 'absolute', left: '-9999px' } });
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, paid ? `Pagar ${brl(st.service.price_cents)} e reservar` : 'Confirmar agendamento');
  const [y, m, d] = st.date.split('-');
  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    if (paid && !accept.checked) return toast('Para reservar, aceite a política de não comparecimento.', 'bad');
    btn.disabled = true;
    try {
      const r = await post(`/api/public/salons/${encodeURIComponent(slug)}/book`, { service_id: st.service.id, staff_id: st.staffId || undefined, starts_at: st.slot.startsAt, name: name.value, phone: phone.value, email: email.value || undefined, consent_marketing: consent.checked, cashback_optin: cash.checked, website: hp.value,
        ...(paid ? { accept_policy: accept.checked, cpf_cnpj: cpf.value, pay_method: cardR.checked ? 'CREDIT_CARD' : 'PIX' } : {}) });
      if (r.pending_payment) pay(r); else done();
    } catch (ex) { fail(ex); btn.disabled = false; if (ex.status === 409) stepDate(); }
  } },
  h('div', { class: 'card flat' }, h('b', {}, st.service.name), h('div', { class: 'muted small' }, `${d}/${m}/${y} às ${st.slot.time} · ${brl(st.service.price_cents)}`)),
  h('label', { class: 'f' }, 'Seu nome', name), h('label', { class: 'f' }, 'WhatsApp com DDD', phone), h('label', { class: 'f' }, 'E-mail (opcional)', email),
  h('label', { class: 'check' }, consent, h('span', {}, 'Aceito receber lembretes e novidades do salão por WhatsApp (opcional). Posso sair a qualquer momento respondendo PARAR.')),
  h('label', { class: 'check' }, cash, h('span', {}, 'Quero participar do Cashbacksmart e receber cashback nas minhas compras (opcional).')),
  paid ? h('div', { class: 'card flat' }, h('h3', {}, 'Pagamento antecipado'),
    h('label', { class: 'f' }, 'CPF ou CNPJ', cpf),
    h('div', { class: 'row wrap', style: { gap: '18px' } }, h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, pixR, 'Pix'), h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, cardR, 'Cartão de crédito')),
    h('div', { class: 'card flat', style: { borderColor: 'var(--gold)' } }, h('b', {}, 'Política de não comparecimento'), h('p', { class: 'small' }, st.salon.policy || '')),
    h('label', { class: 'check' }, accept, h('span', {}, 'Li e concordo com a política de não comparecimento.'))) : null,
  hp, btn, h('p', { class: 'small muted' }, 'Usamos seus dados apenas para este agendamento, conforme a LGPD.'));
  shell(back(stepDate), h('h2', {}, '4. Seus dados'), form);
}

// Tela de pagamento: mostra Pix copia-e-cola ou o link da fatura e confere a cada 5 s se o pagamento caiu.
function pay(r) {
  const p = r.payment;
  const status = h('p', { class: 'muted small' }, `Seu horário está reservado por ${r.hold_minutes} minutos. Aguardando o pagamento…`);
  const pix = p.pix?.copy_paste ? h('div', { class: 'stack-sm' }, h('b', {}, 'Pix copia e cola'), h('textarea', { rows: 3, readonly: true, onclick: (e) => e.target.select() }, p.pix.copy_paste),
    h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(p.pix.copy_paste); toast('Código copiado', 'ok'); } catch { toast('Selecione o texto e copie.', 'bad'); } } }, 'Copiar código')) : null;
  const qr = p.pix?.qr_base64 ? h('img', { src: `data:image/png;base64,${p.pix.qr_base64}`, alt: 'QR Code Pix', style: { width: '200px', maxWidth: '100%', margin: '8px auto', display: 'block' } }) : null;
  const link = p.invoice_url ? h('a', { class: 'btn gold', href: p.invoice_url, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir página de pagamento') : null;
  shell(h('div', { class: 'card', style: { textAlign: 'center' } }, h('h2', {}, `Pague ${brl(r.appointment.price_cents)} para confirmar`), qr, pix, link, status));
  const t = setInterval(async () => {
    try {
      const s = await get(`/api/public/salons/${encodeURIComponent(slug)}/appointments/${r.appointment.id}/status`);
      if (s.pay_status === 'paid') { clearInterval(t); done(); }
      else if (s.status === 'cancelled') { clearInterval(t); toast('O tempo para pagar acabou. Escolha o horário de novo.', 'bad'); stepDate(); }
    } catch { /* tenta de novo */ }
  }, 5000);
}

function done() {
  const [y, m, d] = st.date.split('-');
  shell(h('div', { class: 'card', style: { textAlign: 'center' } }, h('div', { class: 'big' }, '✓'), h('h2', {}, 'Agendamento confirmado!'),
    h('p', {}, `${st.service.name} — ${d}/${m}/${y} às ${st.slot.time}`), h('p', { class: 'muted' }, 'Você receberá um lembrete antes do horário. Para remarcar ou cancelar, fale com o salão.'),
    st.salon.phone ? h('p', { class: 'small' }, `Telefone do salão: ${st.salon.phone}`) : null,
    h('button', { class: 'btn', onclick: () => { Object.assign(st, { service: null, staffId: '', date: null, slot: null }); stepService(); } }, 'Fazer outro agendamento')));
}
const back = (fn) => h('button', { class: 'btn sm', style: { marginBottom: '10px' }, onclick: fn }, '‹ Voltar');

boot();
