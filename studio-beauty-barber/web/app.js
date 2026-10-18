// Casca do painel: autenticação, menu e roteamento por hash (#/agenda, #/clientes...).
import { h, $, clear, icon, get, post, setUnauthorizedHandler, toast, fail, initials } from './lib.js';

const ROUTES = [
  { path: 'dashboard', label: 'Painel', icon: 'home', mod: './views/dashboard.js' },
  { path: 'agenda', label: 'Agenda', icon: 'calendar', mod: './views/agenda.js' },
  { path: 'clientes', label: 'Clientes', icon: 'users', mod: './views/clientes.js' },
  { path: 'catalogo', label: 'Serviços e equipe', icon: 'scissors', mod: './views/catalogo.js', min: 'manager' },
  { path: 'vendas', label: 'Vendas e caixa', icon: 'cart', mod: './views/vendas.js', min: 'reception' },
  { path: 'clube', label: 'Clube de assinatura', icon: 'repeat', mod: './views/clube.js', min: 'reception' },
  { sep: true },
  { path: 'leads', label: 'Funil de leads', icon: 'funnel', mod: './views/leads.js' },
  { path: 'conversas', label: 'Conversas', icon: 'chat', mod: './views/conversas.js', badge: 'unread' },
  { path: 'campanhas', label: 'Campanhas', icon: 'megaphone', mod: './views/campanhas.js', min: 'manager' },
  { sep: true },
  { path: 'integracoes', label: 'Integrações', icon: 'plug', mod: './views/integracoes.js', min: 'manager' },
  { path: 'seguranca', label: 'Segurança', icon: 'shield', mod: './views/seguranca.js' },
  { path: 'configuracoes', label: 'Configurações', icon: 'gear', mod: './views/configuracoes.js', min: 'manager' },
  { path: 'assinatura', label: 'Assinatura', icon: 'card', mod: './views/assinatura.js', min: 'owner' },
];
const RANK = { staff: 1, reception: 2, manager: 3, owner: 4 };

const root = $('#root');
let session = null;
let unread = 0;

setUnauthorizedHandler(() => { if (session) { session = null; toast('Sessão expirada. Entre novamente.', 'bad'); renderLogin(); } });

async function boot() {
  try { session = await get('/api/auth/me'); } catch { session = null; }
  if (!session) return renderLogin();
  renderShell();
  route();
  refreshBadge();
}
let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('hashchange', route);
  setInterval(refreshBadge, 60_000);
}

async function refreshBadge() {
  try {
    const d = await get('/api/dashboard');
    unread = d.unread_conversations;
    const b = $('.nav a[data-path="conversas"] .badge');
    if (b) { b.textContent = unread; b.classList.toggle('hidden', !unread); }
  } catch { /* silencioso */ }
}

function renderShell() {
  listen();
  const visible = ROUTES.filter((r) => r.sep || !r.min || RANK[session.user.role] >= RANK[r.min]);
  const nav = h('nav', { class: 'nav', 'aria-label': 'Menu principal' },
    visible.map((r) => r.sep ? h('div', { class: 'sep' }) : h('a', { href: `#/${r.path}`, 'data-path': r.path, onclick: closeMenu }, icon(r.icon), r.label,
      r.badge ? h('span', { class: 'badge hidden' }, '0') : null)));
  const side = h('aside', { class: 'side', id: 'side' },
    h('div', { class: 'brand' }, h('div', { class: 'mark' }, 'S'), h('div', {}, h('b', {}, 'Studio Beauty Barber'), h('span', {}, 'Gestão'))),
    nav,
    h('div', { class: 'me' }, h('b', {}, session.user.name), h('span', { class: 'muted' }, session.salon.name),
      h('button', { class: 'btn sm block', onclick: logout }, icon('logout'), 'Sair')));
  const scrim = h('div', { class: 'scrim hidden', id: 'scrim', onclick: closeMenu });
  const top = h('header', { class: 'topbar' },
    h('button', { class: 'btn sm', onclick: openMenu, 'aria-label': 'Abrir menu' }, icon('menu')),
    h('span', { class: 't' }, session.salon.name));
  clear(root).append(h('div', { class: 'app' }, side, h('div', {}, top, h('main', { class: 'main', id: 'main', tabindex: '-1' }))), scrim);
}
const openMenu = () => { $('#side').classList.add('open'); $('#scrim').classList.remove('hidden'); };
const closeMenu = () => { $('#side')?.classList.remove('open'); $('#scrim')?.classList.add('hidden'); };

async function route() {
  if (!session) return;
  const path = (location.hash.replace(/^#\//, '').split('?')[0]) || 'dashboard';
  const def = ROUTES.find((r) => r.path === path && !r.sep) || ROUTES[0];
  if (def.min && RANK[session.user.role] < RANK[def.min]) { location.hash = '#/dashboard'; return; }
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.path === def.path));
  const main = clear($('#main'));
  main.append(h('p', { class: 'muted' }, 'Carregando…'));
  try {
    const mod = await import(def.mod);
    const holder = h('div', {});
    await mod.render(holder, { session, navigate: (p) => { location.hash = `#/${p}`; }, refreshBadge });
    clear(main).append(holder);
    main.focus({ preventScroll: true });
  } catch (e) {
    clear(main).append(h('div', { class: 'card' }, h('h3', {}, 'Não foi possível abrir esta tela'), h('p', { class: 'muted' }, e.message)));
  }
}

async function logout() {
  try { await post('/api/auth/logout'); } catch { /* segue */ }
  session = null; location.hash = ''; renderLogin();
}

// ---------- Login / cadastro ----------
function renderLogin(mode = 'login') {
  let need2fa = false;
  const form = h('form', { novalidate: true, onsubmit: submit });
  const err = h('p', { class: 'field-error', role: 'alert' });
  const fields = h('div', { class: 'stack' });
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, '');
  const switchLink = h('a', { href: '#', onclick: (e) => { e.preventDefault(); renderLogin(mode === 'login' ? 'signup' : 'login'); } }, '');

  function build() {
    clear(fields);
    if (mode === 'login') {
      fields.append(
        h('label', { class: 'f' }, 'E-mail', h('input', { name: 'email', type: 'email', autocomplete: 'username', required: true })),
        h('label', { class: 'f' }, 'Senha', h('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true })),
        need2fa ? h('label', { class: 'f' }, 'Código do app autenticador (6 dígitos)', h('input', { name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, autofocus: true })) : null);
      btn.textContent = need2fa ? 'Verificar e entrar' : 'Entrar';
      switchLink.textContent = 'Não tem conta? Teste grátis por 14 dias';
    } else {
      fields.append(
        h('label', { class: 'f' }, 'Nome do salão ou barbearia', h('input', { name: 'salon_name', required: true, maxlength: 80 })),
        h('div', { class: 'grid g2' },
          h('label', { class: 'f' }, 'Seu nome', h('input', { name: 'owner_name', autocomplete: 'name', required: true })),
          h('label', { class: 'f' }, 'WhatsApp (com DDD)', h('input', { name: 'phone', inputmode: 'tel', autocomplete: 'tel', required: true }))),
        h('label', { class: 'f' }, 'Cidade', h('input', { name: 'city', autocomplete: 'address-level2' })),
        h('label', { class: 'f' }, 'E-mail', h('input', { name: 'email', type: 'email', autocomplete: 'email', required: true })),
        h('label', { class: 'f' }, 'Crie uma senha', h('input', { name: 'password', type: 'password', autocomplete: 'new-password', required: true }), h('span', { class: 'small muted' }, 'Mínimo 10 caracteres, com letras e números.')),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'terms' }), h('span', {}, 'Li e aceito os Termos de Uso e a Política de Privacidade (LGPD).')));
      btn.textContent = 'Começar teste grátis';
      switchLink.textContent = 'Já tem conta? Entrar';
    }
  }
  build();
  form.append(fields, err, btn, h('p', { class: 'small', style: { marginTop: '14px', textAlign: 'center' } }, switchLink));

  async function submit(e) {
    e.preventDefault(); err.textContent = ''; btn.disabled = true;
    const fd = Object.fromEntries(new FormData(form).entries());
    try {
      if (mode === 'login') {
        const r = await post('/api/auth/login', { email: fd.email, password: fd.password, code: fd.code });
        if (r.need_2fa) { need2fa = true; build(); form.querySelector('[name=email]').value = fd.email; form.querySelector('[name=password]').value = fd.password; form.querySelector('[name=code]').focus(); btn.disabled = false; return; }
      } else {
        await post('/api/auth/signup', { ...fd, terms: form.querySelector('[name=terms]').checked });
      }
      session = await get('/api/auth/me');
      renderShell(); route(); refreshBadge();
    } catch (ex) {
      err.textContent = ex.fields ? Object.values(ex.fields).join(' · ') + ' — ' + ex.message : ex.message;
    } finally { btn.disabled = false; }
  }

  clear(root).append(h('div', { class: 'auth' },
    h('section', { class: 'hero' },
      h('div', { class: 'brand' }, h('div', { class: 'mark' }, 'S'), h('div', {}, h('b', {}, 'Studio Beauty Barber'), h('span', {}, 'Gestão para salões e barbearias'))),
      h('div', {}, h('h1', {}, 'A agenda cheia, ', h('em', {}, 'sem'), ' perder a elegância.'),
        h('ul', {}, ['Agenda online e robô de atendimento no WhatsApp', 'Funil de leads, campanhas e lembretes automáticos', 'Cobrança por Pix, boleto e cartão', 'Seus dados protegidos e em conformidade com a LGPD'].map((t) => h('li', {}, t)))),
      h('p', { class: 'small', style: { color: '#9c9384' } }, '© Studio Beauty Barber · WMundi Technologies')),
    h('section', { class: 'panel' }, h('div', { style: { width: '100%', maxWidth: '400px' } },
      h('h2', { style: { marginBottom: '6px' } }, mode === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta'),
      h('p', { class: 'muted', style: { marginBottom: '18px' } }, mode === 'login' ? 'Entre para gerenciar o seu salão.' : '14 dias grátis, sem cartão de crédito.'),
      form))));
}

boot();
