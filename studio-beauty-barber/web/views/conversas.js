import { h, get, post, clear, toast, fail, fmtDateTime, fmtPhone, initials } from '../lib.js';
import { pageHead } from './_ui.js';

const CH = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', sms: 'SMS', email: 'E-mail', web: 'Site' };

export async function render(root, { session, refreshBadge }) {
  const tz = session.salon.timezone;
  const canReply = session.user.role !== 'staff';
  let current = null, timer;
  const listEl = h('div', { class: 'list' });
  const threadEl = h('div', { class: 'thread' }, h('p', { class: 'empty' }, 'Selecione uma conversa.'));

  async function loadList() {
    const { conversations } = await get('/api/conversations');
    clear(listEl).append(conversations.length ? conversations.map((c) => h('button', { class: `item ${current === c.id ? 'active' : ''}`, style: { textAlign: 'left', width: '100%', background: 'none', border: 0, font: 'inherit' }, onclick: () => openConv(c.id) },
      h('span', { class: 'avatar' }, initials(c.display_name)),
      h('span', { class: 'grow' }, h('b', {}, c.display_name || fmtPhone(c.external_id)), h('span', { class: 'small muted block' }, `${CH[c.channel] || c.channel} · ${c.mode === 'bot' ? '🤖 robô' : '👤 humano'}`), h('span', { class: 'small block ellipsis' }, c.last_body || '')),
      c.unread ? h('span', { class: 'badge' }, c.unread) : null)) : h('p', { class: 'empty' }, 'Nenhuma conversa ainda. Conecte o WhatsApp em Integrações.'));
  }
  async function openConv(id) {
    current = id;
    const { conversation: c, messages } = await get(`/api/conversations/${id}`);
    const box = h('div', { class: 'msgs' }, messages.map((m) => h('div', { class: `msg ${m.direction === 'in' ? 'in' : 'out'} ${m.sender === 'bot' ? 'bot' : ''}` },
      m.body, h('div', { class: 'meta' }, `${m.sender === 'bot' ? 'Robô · ' : m.sender === 'agent' ? 'Equipe · ' : ''}${fmtDateTime(m.created_at, tz)}${m.status === 'failed' ? ' · falhou' : m.status === 'blocked' ? ' · bloqueada' : ''}`))));
    const ta = h('textarea', { rows: 2, placeholder: 'Escreva sua resposta…', maxlength: 1500 });
    const send = async () => {
      if (!ta.value.trim()) return;
      try { await post(`/api/conversations/${id}/reply`, { body: ta.value.trim() }); ta.value = ''; openConv(id); loadList(); refreshBadge(); } catch (e) { fail(e); }
    };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); });
    clear(threadEl).append(
      h('div', { class: 'thread-head' }, h('div', {}, h('b', {}, c.display_name || fmtPhone(c.external_id)), h('div', { class: 'small muted' }, `${CH[c.channel] || c.channel} · ${fmtPhone(c.external_id)}`)),
        canReply ? h('button', { class: 'btn sm', onclick: async () => { try { await post(`/api/conversations/${id}/mode`, { mode: c.mode === 'bot' ? 'human' : 'bot' }); openConv(id); loadList(); } catch (e) { fail(e); } } }, c.mode === 'bot' ? 'Assumir atendimento' : 'Devolver ao robô') : null),
      c.flagged ? h('div', { class: 'banner bad' }, 'Mensagem suspeita (possível golpe/phishing). Não clique em links desconhecidos.') : null,
      box, canReply ? h('div', { class: 'composer' }, ta, h('button', { class: 'btn primary', onclick: send }, 'Enviar')) : null);
    box.scrollTop = box.scrollHeight;
    document.querySelector('.inbox')?.classList.add('show-thread');
  }
  root.append(pageHead('Conversas', 'WhatsApp, Instagram e Facebook em um só lugar. O robô atende até você assumir.'),
    h('div', { class: 'inbox' }, listEl, h('div', { class: 'thread-wrap' }, h('button', { class: 'btn sm back', onclick: () => document.querySelector('.inbox')?.classList.remove('show-thread') }, '‹ Voltar'), threadEl)));
  await loadList();
  timer = setInterval(() => { if (!document.body.contains(listEl)) return clearInterval(timer); loadList().catch(() => {}); if (current) openConvQuiet(); }, 15000);
  async function openConvQuiet() { /* mantém o rascunho: só recarrega se não houver texto digitado */ const ta = threadEl.querySelector('textarea'); if (!ta || !ta.value) openConv(current).catch(() => {}); }
}
