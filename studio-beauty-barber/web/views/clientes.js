import { h, get, post, patch, del, brl, fmtPhone, fmtDate, fmtDateTime, statusChip, debounce, clear, toast, fail, confirmBox, modal, copyText } from '../lib.js';
import { pageHead, formModal } from './_ui.js';

export async function render(root, { session }) {
  const tz = session.salon.timezone;
  const can = ['owner', 'manager', 'reception'].includes(session.user.role);
  const isMgr = ['owner', 'manager'].includes(session.user.role);
  const q = h('input', { type: 'search', placeholder: 'Buscar por nome, telefone ou e-mail…', style: { maxWidth: '360px' } });
  const list = h('div', {});
  async function load() {
    const r = await get(`/api/clients?q=${encodeURIComponent(q.value)}&limit=150`);
    clear(list).append(r.clients.length ? h('div', { class: 'card scroll-x', style: { padding: 0 } }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ['Cliente', 'Telefone', 'Visitas', 'Total gasto', 'Última visita', 'Marketing'].map((t) => h('th', {}, t)))),
      h('tbody', {}, r.clients.map((c) => h('tr', { class: 'click', onclick: () => open(c.id) },
        h('td', {}, h('b', {}, c.name), c.tags ? h('div', { class: 'small muted' }, c.tags) : null),
        h('td', { class: 'nowrap' }, fmtPhone(c.phone)), h('td', {}, c.visits), h('td', {}, brl(c.total_spent_cents)),
        h('td', {}, c.last_visit_at ? fmtDate(c.last_visit_at, tz) : '—'),
        h('td', {}, c.consent_marketing ? h('span', { class: 'chip ok' }, 'Autorizou') : h('span', { class: 'chip' }, 'Não'), c.cashback_optin ? h('span', { class: 'chip info', style: { marginLeft: '6px' } }, 'Cashback') : null)))))) : h('p', { class: 'empty' }, 'Nenhum cliente encontrado.'));
  }
  q.addEventListener('input', debounce(() => load().catch(fail)));

  const fields = (c = {}) => [
    { name: 'name', label: 'Nome', value: c.name, required: true },
    { name: 'phone', label: 'WhatsApp (com DDD)', value: c.phone ? fmtPhone(c.phone) : '', half: true, inputmode: 'tel' },
    { name: 'email', label: 'E-mail', value: c.email, half: true, type: 'email' },
    { name: 'birthday', label: 'Aniversário', value: c.birthday, type: 'date', half: true },
    { name: 'tags', label: 'Etiquetas (separadas por vírgula)', value: c.tags, half: true },
    { name: 'notes', label: 'Observações', value: c.notes, type: 'textarea' },
    { name: 'consent_marketing', label: 'O cliente autorizou receber promoções e lembretes (LGPD)', value: c.consent_marketing, type: 'checkbox' },
    { name: 'cashback_optin', label: 'O cliente quer participar do Cashbacksmart (cashback nas compras)', value: c.cashback_optin, type: 'checkbox' },
  ];
  const clean = (v) => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== ''));

  function newClient() {
    formModal('Novo cliente', fields(), async (v) => { await post('/api/clients', clean(v)); toast('Cliente cadastrado', 'ok'); load(); });
  }
  async function open(id) {
    const { client: c, history } = await get(`/api/clients/${id}`);
    modal(c.name, (body, close) => {
      body.append(h('div', { class: 'stack' },
        h('div', { class: 'grid g3' },
          h('div', {}, h('div', { class: 'small muted' }, 'Telefone'), fmtPhone(c.phone) || '—'),
          h('div', {}, h('div', { class: 'small muted' }, 'Visitas'), c.visits),
          h('div', {}, h('div', { class: 'small muted' }, 'Total gasto'), brl(c.total_spent_cents))),
        c.notes ? h('p', {}, c.notes) : null,
        h('h3', {}, 'Histórico'),
        history.length ? h('ul', { class: 'list-clean' }, history.slice(0, 12).map((a) => h('li', {}, h('span', { class: 'grow' }, `${fmtDateTime(a.starts_at, tz)} — ${a.service_name || 'Serviço'}`), statusChip(a.status)))) : h('p', { class: 'muted' }, 'Sem atendimentos ainda.'),
        h('div', { class: 'row wrap' },
          can ? h('button', { class: 'btn', onclick: () => { close(); formModal('Editar cliente', fields(c), async (v) => { await patch(`/api/clients/${id}`, clean(v)); toast('Salvo', 'ok'); load(); }); } }, 'Editar') : null,
          h('a', { class: 'btn', href: `#/agenda` , onclick: close }, 'Ir para a agenda'),
          isMgr ? h('button', { class: 'btn', onclick: async () => {
            const r = await get(`/api/clients/${id}/export`);
            const url = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' }));
            const a = h('a', { href: url, download: `cliente-${id.slice(0, 8)}.json` }); document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
          } }, 'Exportar dados (LGPD)') : null,
          isMgr ? h('button', { class: 'btn danger', onclick: async () => {
            if (!(await confirmBox('Excluir e anonimizar este cliente? Esta ação não pode ser desfeita.', 'Excluir'))) return;
            try { await del(`/api/clients/${id}`); toast('Cliente anonimizado', 'ok'); close(); load(); } catch (e) { fail(e); }
          } }, 'Excluir (LGPD)') : null)));
    }, { wide: true });
  }
  root.append(pageHead('Clientes', 'Cadastro, histórico e consentimentos.', can ? h('button', { class: 'btn primary', onclick: newClient }, '+ Novo cliente') : null), h('div', { style: { marginBottom: '12px' } }, q), list);
  await load();
}
