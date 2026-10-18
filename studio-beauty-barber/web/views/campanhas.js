import { h, get, post, fmtDateTime, clear, toast, fail, confirmBox, modal, debounce } from '../lib.js';
import { pageHead } from './_ui.js';

const CHANNELS = [['whatsapp', 'WhatsApp'], ['sms', 'SMS'], ['email', 'E-mail']];
const STAT = { draft: ['Rascunho', ''], scheduled: ['Agendada', 'info'], running: ['Enviando', 'warn'], paused: ['Pausada', 'warn'], done: ['Concluída', 'ok'] };

export async function render(root, { session }) {
  const tz = session.salon.timezone;
  const host = h('div', {});
  async function load() {
    const { campaigns } = await get('/api/campaigns');
    clear(host).append(campaigns.length ? h('div', { class: 'card scroll-x', style: { padding: 0 } }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ['Campanha', 'Canal', 'Situação', 'Criada em', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, campaigns.map((c) => { const [l, k] = STAT[c.status] || [c.status, '']; return h('tr', {},
        h('td', {}, h('b', {}, c.name)), h('td', {}, (CHANNELS.find((x) => x[0] === c.channel) || [, c.channel])[1]), h('td', {}, h('span', { class: `chip ${k}` }, l)), h('td', {}, fmtDateTime(c.created_at, tz)),
        h('td', { class: 'nowrap' },
          c.status === 'draft' ? h('button', { class: 'btn sm primary', onclick: async () => { if (!(await confirmBox('Iniciar os envios desta campanha agora? Só recebem clientes que autorizaram.', 'Iniciar'))) return; try { const r = await post(`/api/campaigns/${c.id}/launch`); toast(`${r.recipients} destinatários na fila`, 'ok'); load(); } catch (e) { fail(e); } } }, 'Iniciar') : null,
          c.status === 'running' ? h('button', { class: 'btn sm', onclick: async () => { try { await post(`/api/campaigns/${c.id}/pause`); load(); } catch (e) { fail(e); } } }, 'Pausar') : null,
          c.status === 'paused' ? h('button', { class: 'btn sm', onclick: async () => { try { await post(`/api/campaigns/${c.id}/resume`); load(); } catch (e) { fail(e); } } }, 'Retomar') : null)); })))) : h('p', { class: 'empty' }, 'Nenhuma campanha ainda.'));
  }
  function create() {
    modal('Nova campanha', (b, close) => {
      const name = h('input', { placeholder: 'Ex.: Volta às aulas — corte + barba' });
      const channel = h('select', {}, CHANNELS.map(([v, l]) => h('option', { value: v }, l)));
      const audience = h('select', {}, [['clients', 'Clientes'], ['leads', 'Leads']].map(([v, l]) => h('option', { value: v }, l)));
      const inactive = h('input', { type: 'number', min: 0, placeholder: 'ex.: 60', style: { maxWidth: '120px' } });
      const body = h('textarea', { rows: 5, maxlength: 900, placeholder: 'Olá {nome}! Temos horários esta semana no {salao}. Responda para agendar 💈' });
      const prev = h('div', { class: 'card flat small' }, 'Preencha a mensagem para ver a prévia.');
      const seg = () => ({ audience: audience.value, ...(inactive.value ? { inactiveDays: Number(inactive.value) } : {}) });
      const preview = debounce(async () => {
        if (!body.value.trim()) return;
        try { const r = await post('/api/campaigns/preview', { channel: channel.value, body: body.value, segment: seg() });
          clear(prev).append(h('b', {}, `${r.eligible} pessoas elegíveis`), h('span', { class: 'muted' }, ' (só quem autorizou e não pediu para sair)'), r.sample ? h('p', { class: 'pre' }, r.sample) : null, r.blocked ? h('p', { class: 'field-error' }, r.blocked) : null);
        } catch (e) { clear(prev).append(h('span', { class: 'field-error' }, e.message)); }
      }, 400);
      [channel, audience, inactive, body].forEach((x) => x.addEventListener('input', preview));
      b.append(h('div', { class: 'stack' },
        h('label', { class: 'f' }, 'Nome interno', name),
        h('div', { class: 'grid g2' }, h('label', { class: 'f' }, 'Canal', channel), h('label', { class: 'f' }, 'Público', audience)),
        h('label', { class: 'f' }, 'Sem visita há (dias) — opcional', inactive),
        h('label', { class: 'f' }, 'Mensagem (use {nome} e {salao})', body), prev,
        h('p', { class: 'small muted' }, 'Mensagens de WhatsApp e SMS incluem automaticamente a opção "responda PARAR". Os custos de envio são cobrados direto pela sua operadora/plataforma. Não há envio entre 21h e 8h.'),
        h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn', onclick: close }, 'Cancelar'),
          h('button', { class: 'btn primary', onclick: async (e) => { e.target.disabled = true; try { await post('/api/campaigns', { name: name.value, channel: channel.value, body: body.value, segment: seg() }); toast('Campanha salva como rascunho', 'ok'); close(); load(); } catch (ex) { fail(ex); e.target.disabled = false; } } }, 'Salvar rascunho'))));
    }, { wide: true });
  }
  root.append(pageHead('Campanhas', 'Reative clientes e traga leads de volta, com consentimento.', h('button', { class: 'btn primary', onclick: create }, '+ Nova campanha')), host);
  await load();
}
