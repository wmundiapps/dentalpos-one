import { h, get, post, patch, api, clear, toast, fail, copyBox, fmtDateTime, modal } from '../lib.js';
import { pageHead } from './_ui.js';

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ROLES = { owner: 'Proprietário', manager: 'Gerente', reception: 'Recepção', staff: 'Profissional' };

export async function render(root, { session }) {
  const isOwner = session.user.role === 'owner';
  const { salon: s } = await get('/api/settings');
  const text = (v, o = {}) => h('input', { value: v ?? '', ...o });
  const name = text(s.name), phone = text(s.phone, { inputmode: 'tel' }), email = text(s.email, { type: 'email' }), address = text(s.address), city = text(s.city);
  const domains = text(s.allowed_domains, { placeholder: 'seusalao.com.br, instagram.com/seusalao' });
  const qs = h('input', { type: 'number', min: 0, max: 23, value: s.quiet_start }), qe = h('input', { type: 'number', min: 0, max: 23, value: s.quiet_end });
  const bot = h('input', { type: 'checkbox', checked: s.bot_enabled });
  const A = s.automations || {};
  const aRem = h('input', { type: 'checkbox', checked: A.reminders }), aBd = h('input', { type: 'checkbox', checked: A.birthday }), aRe = h('input', { type: 'checkbox', checked: A.reactivation });
  const hoursRows = DAYS.map((d, i) => {
    const v = s.hours?.[i]; const on = h('input', { type: 'checkbox', checked: !!v });
    const a = h('input', { type: 'time', value: v?.[0] || '09:00' }), b = h('input', { type: 'time', value: v?.[1] || '19:00' });
    return { i, on, a, b, el: h('div', { class: 'row', style: { padding: '4px 0' } }, h('label', { class: 'check', style: { width: '120px' } }, on, h('span', {}, d)), a, '–', b) };
  });
  const dep = h('input', { type: 'checkbox', checked: s.deposit_required });
  const ret = h('input', { type: 'number', min: 0, max: 100, value: s.noshow_retention_pct ?? 30 }), fch = h('input', { type: 'number', min: 0, max: 168, value: s.free_cancel_hours ?? 24 });
  const chk = (el, label) => h('label', { class: 'check' }, el, h('span', {}, label));

  async function save(e) {
    e.preventDefault();
    const hours = Object.fromEntries(hoursRows.map((r) => [r.i, r.on.checked ? [r.a.value, r.b.value] : null]));
    try {
      await patch('/api/settings', { name: name.value, phone: phone.value || undefined, email: email.value || undefined, address: address.value || undefined, city: city.value || undefined,
        allowed_domains: domains.value, quiet_start: Number(qs.value), quiet_end: Number(qe.value), deposit_required: dep.checked, noshow_retention_pct: Number(ret.value), free_cancel_hours: Number(fch.value), bot_enabled: bot.checked, hours,
        automations: { reminders: aRem.checked, birthday: aBd.checked, reactivation: aRe.checked } });
      toast('Configurações salvas', 'ok');
    } catch (ex) { fail(ex); }
  }
  async function logoUpload(e) {
    const f = e.target.files[0]; if (!f) return;
    try { await api('POST', '/api/settings/logo', await f.arrayBuffer(), { raw: true, contentType: f.type }); toast('Logo atualizada', 'ok'); } catch (ex) { fail(ex); }
  }
  const users = h('div', {});
  async function loadUsers() {
    const { users: list } = await get('/api/users');
    clear(users).append(h('div', { class: 'scroll-x' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, ['Nome', 'E-mail', 'Função', '2FA', 'Último acesso', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, list.map((u) => h('tr', {}, h('td', {}, u.name), h('td', {}, u.email), h('td', {}, ROLES[u.role]), h('td', {}, u.totp_enabled ? '✓' : '—'), h('td', {}, u.last_login_at ? fmtDateTime(u.last_login_at, session.salon.timezone) : '—'),
        h('td', {}, isOwner && u.role !== 'owner' ? h('button', { class: 'btn sm', onclick: async () => { try { await patch(`/api/users/${u.id}`, { active: u.active ? 0 : 1 }); loadUsers(); } catch (ex) { fail(ex); } } }, u.active ? 'Desativar' : 'Ativar') : null)))))));
  }
  function newUser() {
    modal('Novo usuário', (b, close) => {
      const n = h('input'), em = h('input', { type: 'email' }), pw = h('input', { type: 'password', autocomplete: 'new-password' }), role = h('select', {}, ['manager', 'reception', 'staff'].map((r) => h('option', { value: r }, ROLES[r])));
      b.append(h('div', { class: 'stack' }, h('label', { class: 'f' }, 'Nome', n), h('label', { class: 'f' }, 'E-mail', em), h('label', { class: 'f' }, 'Senha inicial', pw), h('label', { class: 'f' }, 'Função', role),
        h('button', { class: 'btn primary', onclick: async () => { try { await post('/api/users', { name: n.value, email: em.value, password: pw.value, role: role.value }); toast('Usuário criado', 'ok'); close(); loadUsers(); } catch (ex) { fail(ex); } } }, 'Criar')));
    });
  }
  root.append(pageHead('Configurações', 'Dados do salão, horários, automações e equipe de acesso.'),
    h('form', { class: 'stack', onsubmit: save },
      h('div', { class: 'card' }, h('h3', {}, 'Dados do salão'), h('div', { class: 'grid g2' }, f('Nome', name), f('Telefone', phone), f('E-mail', email), f('Cidade', city)), f('Endereço', address),
        h('div', { class: 'row wrap', style: { marginTop: '10px' } }, h('label', { class: 'f' }, 'Logo (PNG/JPG, até 2 MB)', h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', onchange: logoUpload })))),
      h('div', { class: 'card' }, h('h3', {}, 'Página de agendamento online'), copyBox(s.booking_url), h('p', { class: 'small muted' }, 'Divulgue este link no Instagram, Google e WhatsApp.')),
      h('div', { class: 'card' }, h('h3', {}, 'Reserva paga e política de não comparecimento'),
        h('div', { class: 'stack-sm' }, chk(dep, 'Exigir pagamento antecipado (Pix ou cartão, pelo seu Asaas) na página de agendamento')),
        h('div', { class: 'row', style: { marginTop: '10px' } }, f('Retenção por falta (%)', ret), f('Cancelamento sem custo até (h antes)', fch)),
        h('p', { class: 'small muted' }, 'O cliente precisa aceitar a política para reservar. Falta: o salão retém o percentual e devolve o resto. Conecte o Asaas em Integrações antes de ativar.')),
      h('div', { class: 'card' }, h('h3', {}, 'Horário de funcionamento'), hoursRows.map((r) => r.el)),
      h('div', { class: 'card' }, h('h3', {}, 'Automações e robô'),
        h('div', { class: 'stack-sm' }, chk(bot, 'Robô de atendimento ligado (WhatsApp, Instagram, Facebook)'), chk(aRem, 'Lembretes de agendamento (24h e 2h antes)'), chk(aBd, 'Mensagem de aniversário'), chk(aRe, 'Reativar clientes sumidos (só quem autorizou)')),
        h('div', { class: 'row', style: { marginTop: '10px' } }, f('Sem envios a partir das (h)', qs), f('até as (h)', qe))),
      h('div', { class: 'card' }, h('h3', {}, 'Proteção contra golpes (anti-phishing)'), f('Domínios permitidos em mensagens enviadas', domains), h('p', { class: 'small muted' }, 'Links para outros endereços, encurtadores e domínios suspeitos são bloqueados antes do envio.')),
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn primary', type: 'submit' }, 'Salvar alterações'))),
    h('div', { class: 'card', style: { marginTop: '14px' } }, h('div', { class: 'row spread' }, h('h3', {}, 'Usuários e permissões'), isOwner ? h('button', { class: 'btn sm primary', onclick: newUser }, '+ Novo usuário') : null), users));
  await loadUsers();
}
const f = (l, el) => h('label', { class: 'f' }, l, el);
