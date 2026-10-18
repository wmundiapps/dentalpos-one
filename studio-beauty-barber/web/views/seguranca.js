import { h, get, post, del, clear, toast, fail, fmtDateTime, copyBox, modal } from '../lib.js';
import { pageHead } from './_ui.js';

export async function render(root, { session }) {
  const tz = session.salon.timezone;
  const isMgr = ['owner', 'manager'].includes(session.user.role);
  const host = h('div', { class: 'stack' });
  async function load() {
    const me = await get('/api/auth/me');
    const [{ sessions }, audit] = await Promise.all([get('/api/auth/sessions'), isMgr ? get('/api/audit') : { events: [] }]);
    clear(host).append(
      h('div', { class: 'card' }, h('h3', {}, 'Verificação em duas etapas (2FA)'),
        me.user.totp_enabled ? h('div', { class: 'stack-sm' }, h('p', {}, h('span', { class: 'chip ok' }, 'Ativada'), ' Sua conta pede um código do app autenticador a cada login.'), h('button', { class: 'btn danger', onclick: disable2fa }, 'Desativar'))
          : h('div', { class: 'stack-sm' }, h('p', { class: 'muted' }, 'Recomendado para todos, obrigatório na prática para quem administra o salão. Use Google Authenticator, Authy ou 1Password.'), h('button', { class: 'btn primary', onclick: setup2fa }, 'Ativar 2FA'))),
      h('div', { class: 'card' }, h('h3', {}, 'Trocar senha'), pwForm()),
      h('div', { class: 'card' }, h('h3', {}, 'Sessões ativas'), h('ul', { class: 'list-clean' }, sessions.map((s) => h('li', {},
        h('span', { class: 'grow' }, h('b', {}, s.current ? 'Este dispositivo' : 'Outro dispositivo'), h('div', { class: 'small muted' }, `${s.ip || ''} · ${fmtDateTime(s.created_at, tz)} · ${(s.ua || '').slice(0, 60)}`)),
        s.current ? null : h('button', { class: 'btn sm', onclick: async () => { try { await del(`/api/auth/sessions/${s.id}`); load(); } catch (e) { fail(e); } } }, 'Encerrar'))))),
      isMgr ? h('div', { class: 'card' }, h('h3', {}, 'Registro de atividades'), h('div', { class: 'scroll-x' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, ['Quando', 'Quem', 'Ação', 'IP'].map((t) => h('th', {}, t)))),
        h('tbody', {}, audit.events.map((e) => h('tr', {}, h('td', { class: 'nowrap' }, fmtDateTime(e.created_at, tz)), h('td', {}, e.user_name || '—'), h('td', {}, e.action), h('td', {}, e.ip || '')))))) ) : null);
  }
  function pwForm() {
    const cur = h('input', { type: 'password', autocomplete: 'current-password' }), nw = h('input', { type: 'password', autocomplete: 'new-password' });
    return h('form', { class: 'stack-sm', onsubmit: async (e) => { e.preventDefault(); try { await post('/api/auth/change-password', { current: cur.value, next: nw.value }); toast('Senha alterada. Outros dispositivos foram desconectados.', 'ok'); cur.value = nw.value = ''; } catch (ex) { fail(ex); } } },
      h('label', { class: 'f' }, 'Senha atual', cur), h('label', { class: 'f' }, 'Nova senha (mín. 10, letras e números)', nw), h('button', { class: 'btn', type: 'submit' }, 'Alterar senha'));
  }
  async function setup2fa() {
    try {
      const r = await post('/api/auth/2fa/setup');
      modal('Ativar 2FA', (b, close) => {
        const code = h('input', { inputmode: 'numeric', maxlength: 6, placeholder: '000000', autocomplete: 'one-time-code' });
        b.append(h('div', { class: 'stack' },
          h('p', {}, 'No app autenticador, escolha "adicionar conta" → "inserir chave" e cole a chave abaixo (tipo: baseada em tempo).'), copyBox(r.secret),
          h('details', {}, h('summary', { class: 'small muted' }, 'Prefere o link otpauth?'), copyBox(r.uri)),
          h('label', { class: 'f' }, 'Digite o código de 6 dígitos para confirmar', code),
          h('button', { class: 'btn primary', onclick: async () => { try { await post('/api/auth/2fa/enable', { code: code.value }); toast('2FA ativado', 'ok'); close(); load(); } catch (e) { fail(e); } } }, 'Confirmar e ativar')));
      });
    } catch (e) { fail(e); }
  }
  function disable2fa() {
    modal('Desativar 2FA', (b, close) => {
      const pw = h('input', { type: 'password' }), code = h('input', { inputmode: 'numeric', maxlength: 6 });
      b.append(h('div', { class: 'stack' }, h('label', { class: 'f' }, 'Senha', pw), h('label', { class: 'f' }, 'Código atual do app', code),
        h('button', { class: 'btn danger', onclick: async () => { try { await post('/api/auth/2fa/disable', { password: pw.value, code: code.value }); toast('2FA desativado', 'ok'); close(); load(); } catch (e) { fail(e); } } }, 'Desativar')));
    });
  }
  root.append(pageHead('Segurança', 'Proteja o acesso ao seu salão.'), host);
  await load();
}
