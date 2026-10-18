import { h, get, post, patch, brl, fmtDate, clear, toast, fail, fmtPhone, modal, confirmBox } from '../lib.js';
import { pageHead, formModal } from './_ui.js';

const STAGES = [['new', 'Novos'], ['contacted', 'Em contato'], ['scheduled', 'Visita marcada'], ['won', 'Ganhos'], ['lost', 'Perdidos']];

export async function render(root, { session }) {
  const tz = session.salon.timezone;
  const board = h('div', { class: 'kanban' });
  let leads = [];
  async function load() { leads = (await get('/api/leads')).leads; paint(); }
  function paint() {
    clear(board).append(STAGES.map(([k, label]) => {
      const col = leads.filter((l) => l.stage === k);
      const body = h('div', { class: 'kcol-body', ondragover: (e) => e.preventDefault(), ondrop: async (e) => {
        e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (!id) return;
        try { await patch(`/api/leads/${id}`, { stage: k }); load(); } catch (ex) { fail(ex); } } },
      col.map(card));
      return h('div', { class: 'kcol' }, h('div', { class: 'kcol-head' }, h('b', {}, label), h('span', { class: 'chip' }, col.length)), body);
    }));
  }
  function card(l) {
    return h('div', { class: 'kcard', draggable: 'true', ondragstart: (e) => e.dataTransfer.setData('text/plain', l.id), onclick: () => detail(l) },
      h('b', {}, l.name), l.company ? h('div', { class: 'small' }, l.company) : null,
      h('div', { class: 'small muted' }, [l.city, l.source, fmtDate(l.created_at, tz)].filter(Boolean).join(' · ')),
      l.value_cents ? h('div', { class: 'small' }, brl(l.value_cents)) : null);
  }
  function detail(l) {
    modal(l.name, (b, close) => {
      const notes = h('textarea', { rows: 3 }, l.notes || '');
      const stage = h('select', {}, STAGES.map(([k, t]) => h('option', { value: k, selected: k === l.stage }, t)));
      b.append(h('div', { class: 'stack' },
        h('div', { class: 'grid g2' }, info('Telefone', fmtPhone(l.phone) || '—'), info('E-mail', l.email || '—'), info('Cidade', l.city || '—'), info('Origem', [l.source, l.utm?.utm_campaign].filter(Boolean).join(' / ') || '—')),
        h('label', { class: 'f' }, 'Etapa', stage), h('label', { class: 'f' }, 'Anotações', notes),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn primary', onclick: async () => { try { await patch(`/api/leads/${l.id}`, { stage: stage.value, notes: notes.value }); toast('Salvo', 'ok'); close(); load(); } catch (e) { fail(e); } } }, 'Salvar'),
          l.phone ? h('a', { class: 'btn', target: '_blank', rel: 'noopener', href: `https://wa.me/${l.phone.replace(/\D/g, '')}` }, 'Abrir WhatsApp') : null,
          l.stage !== 'won' ? h('button', { class: 'btn gold', onclick: async () => { try { await post(`/api/leads/${l.id}/convert`); toast('Convertido em cliente', 'ok'); close(); load(); } catch (e) { fail(e); } } }, 'Converter em cliente') : null)));
    });
  }
  const info = (a, v) => h('div', {}, h('div', { class: 'small muted' }, a), h('div', {}, v));
  root.append(pageHead('Funil de leads', 'Arraste os cartões entre as etapas.', h('button', { class: 'btn primary', onclick: () => formModal('Novo lead', [
    { name: 'name', label: 'Nome' }, { name: 'phone', label: 'WhatsApp', half: true, inputmode: 'tel' }, { name: 'email', label: 'E-mail', half: true, type: 'email' },
    { name: 'company', label: 'Empresa / salão', half: true }, { name: 'city', label: 'Cidade', half: true }, { name: 'notes', label: 'Anotações', type: 'textarea' },
    { name: 'consent', label: 'Autorizou contato (LGPD)', type: 'checkbox' }], async (v) => { await post('/api/leads', Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x !== false))); toast('Lead criado', 'ok'); load(); }) }, '+ Novo lead')), board);
  await load();
}
