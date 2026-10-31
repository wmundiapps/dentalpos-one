// Base de contatos autorizados: uma aba por empresa, com os canais que cada pessoa autorizou, exportação e revogação.
import { h, get, post, del, clear, toast, fail, confirmBox, copyBox, fmtPhone, fmtDateTime } from '../lib.js';
import { pageHead, formModal } from './_ui.js';

const LABEL = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'E-mail', phone: 'Telefone', telegram: 'Telegram', social_ads: 'Anúncios' };

export async function render(root) {
  const info = await get('/api/consents/companies');
  const box = h('div', { class: 'stack' });
  root.append(pageHead('Contatos autorizados', 'Quem autorizou falar com a gente, por quais canais, com qual texto e quando. Cada empresa tem a sua aba.'), box);
  let company = info.companies[0]?.company || null;

  async function draw() {
    clear(box);
    const tabs = h('div', { class: 'row wrap' }, info.companies.map((c) => h('button', { class: `btn sm${c.company === company ? ' primary' : ''}`, onclick: () => { company = c.company; draw(); } }, `${c.company} (${c.active})`)));
    box.append(tabs.childNodes.length ? tabs : h('p', { class: 'empty' }, 'Ainda não há autorizações. Elas chegam do indicador de profissionais, da landing e dos outros sistemas.'));
    if (company) {
      const q = h('input', { type: 'search', placeholder: 'Buscar por nome, telefone ou e-mail' });
      const list = h('div', {});
      const load = async () => {
        const r = await get(`/api/consents?company=${encodeURIComponent(company)}&q=${encodeURIComponent(q.value)}`);
        clear(list).append(r.consents.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Nome', 'Contato', 'Canais autorizados', 'Origem', 'Data', ''].map((x) => h('th', {}, x)))),
          h('tbody', {}, r.consents.map((x) => h('tr', { class: x.revoked_at ? 'muted' : '' },
            h('td', {}, x.name || '—'), h('td', {}, [x.phone ? fmtPhone(x.phone) : null, x.phone && x.email ? ' · ' : null, x.email].filter(Boolean)),
            h('td', {}, x.channels.map((c) => LABEL[c] || c).join(', ')), h('td', {}, x.source || '—'), h('td', {}, new Date(x.consent_at).toLocaleDateString('pt-BR')),
            h('td', {}, x.revoked_at ? 'Revogada' : h('button', { class: 'btn sm', onclick: async () => { if (!(await confirmBox('Registrar que esta pessoa retirou a autorização? Ela não entra mais na planilha.', 'Revogar'))) return; try { await post(`/api/consents/${x.id}/revoke`); toast('Revogada', 'ok'); load(); } catch (e) { fail(e); } } }, 'Revogar'))))))) : h('p', { class: 'empty' }, 'Nenhum cadastro.'));
      };
      q.addEventListener('input', () => { clearTimeout(q._t); q._t = setTimeout(load, 250); });
      box.append(h('div', { class: 'card stack' }, h('div', { class: 'row spread wrap' }, h('h3', {}, company), h('a', { class: 'btn', href: `/api/consents/export?company=${encodeURIComponent(company)}` }, 'Baixar planilha (só autorizações válidas)')), q, list));
      load().catch(fail);
    }
    box.append(sources(), textCard());
  }

  function sources() {
    return h('div', { class: 'card stack' }, h('h3', {}, 'Conectar outros sistemas'),
      h('p', { class: 'small muted' }, 'Cada empresa recebe uma chave própria para enviar as autorizações dela para esta base. A chave aparece uma única vez, só na sua tela. Não envie a chave por mensagem.'),
      h('button', { class: 'btn', onclick: () => formModal('Nova chave', [{ name: 'company', label: 'Nome da empresa ou sistema (ex.: DentalPos)', required: true }], async (v) => {
        const r = await post('/api/consents/sources', { company: v.company });
        clear(box).append(h('div', { class: 'card stack' }, h('h3', {}, `Chave de ${v.company}`), h('p', { class: 'small' }, 'Copie agora. Ela não aparece de novo.'), copyBox(r.key), h('button', { class: 'btn', onclick: () => location.reload() }, 'Já copiei')));
      }) }, '+ Nova chave'),
      info.keys.length ? h('div', { class: 'stack-sm' }, info.keys.map((k) => h('div', { class: 'row spread' }, h('span', {}, `${k.company} · chave …${k.last4}${k.revoked_at ? ' (desativada)' : ''}`),
        k.revoked_at ? null : h('button', { class: 'btn sm', onclick: async () => { if (!(await confirmBox('Desativar esta chave? O sistema deixa de enviar autorizações.', 'Desativar'))) return; try { await del(`/api/consents/sources/${k.id}`); toast('Desativada', 'ok'); location.reload(); } catch (e) { fail(e); } } }, 'Desativar')))) : null);
  }

  function textCard() {
    return h('div', { class: 'card stack' }, h('h3', {}, 'Texto de autorização em uso'), h('p', { class: 'small muted' }, `Versão ${info.text.version}. Texto provisório: precisa da sua aprovação e da revisão da Dra. Roberta antes do uso comercial, inclusive nos EUA.`),
      h('p', { class: 'small' }, h('b', {}, 'Português: '), info.text.pt), h('p', { class: 'small' }, h('b', {}, 'English: '), info.text.en));
  }
  draw();
}
