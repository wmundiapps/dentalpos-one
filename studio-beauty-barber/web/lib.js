// Utilitários do painel: DOM seguro (sem innerHTML com dados), API, modal, toast, formatação.
// Element.append nativo converte arrays/null em texto; aqui aceitamos listas aninhadas e ignoramos null/false.
const nativeAppend = Element.prototype.append;
Element.prototype.append = function (...items) {
  nativeAppend.apply(this, items.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
};
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  users: 'M16 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 20v-1a4 4 0 00-3-3.9M16 4.1a3.5 3.5 0 010 6.8',
  scissors: 'M6 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM8.1 7.9L20 20M8.1 16.1L20 4',
  cart: 'M3 4h2l2.4 11h11l2-8H6M9 20a1 1 0 100-2 1 1 0 000 2zM17 20a1 1 0 100-2 1 1 0 000 2z',
  funnel: 'M3 5h18l-7 8v6l-4 2v-8z',
  chat: 'M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z',
  megaphone: 'M3 11v3a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1zM15 8a5 5 0 010 8M18 5a9 9 0 010 14',
  plug: 'M9 3v5M15 3v5M6 8h12v3a6 6 0 01-12 0zM12 17v4',
  shield: 'M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  card: 'M3 6h18v12H3zM3 10h18',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
  menu: 'M4 6h16M4 12h16M4 18h16',
  check: 'M5 12l5 5L20 7',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  eyeoff: 'M3 3l18 18M10.6 6.1A10 10 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.2 4.1M6.6 6.6A17 17 0 002 12s3.5 7 10 7a10 10 0 004.4-1M9.9 9.9a3 3 0 004.2 4.2',
  repeat: 'M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3',
};
export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'icon');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name] || ICONS.check); svg.append(p);
  return svg;
}

// ---------- API ----------
export class ApiError extends Error { constructor(msg, status, fields) { super(msg); this.status = status; this.fields = fields; } }
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function api(method, path, body, opts = {}) {
  const headers = { 'X-Requested-With': 'sbb' };
  let payload;
  if (body !== undefined && !opts.raw) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  if (opts.raw) { payload = body; if (opts.contentType) headers['Content-Type'] = opts.contentType; }
  let res;
  try { res = await fetch(path, { method, headers, body: payload, credentials: 'same-origin' }); }
  catch { throw new ApiError('Sem conexão com o servidor. Verifique sua internet.', 0); }
  let data = null;
  try { data = await res.json(); } catch { /* corpo vazio */ }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/login')) onUnauthorized();
    throw new ApiError(data?.error || `Erro ${res.status}`, res.status, data?.fields);
  }
  return data;
}
export const get = (p) => api('GET', p);
export const post = (p, b) => api('POST', p, b ?? {});
export const patch = (p, b) => api('PATCH', p, b ?? {});
export const put = (p, b) => api('PUT', p, b ?? {});
export const del = (p) => api('DELETE', p);

// ---------- Feedback visual ----------
export function toast(msg, kind = '') {
  let box = $('.toasts');
  if (!box) { box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: `toast ${kind}` }, msg);
  box.append(t);
  setTimeout(() => t.remove(), kind === 'bad' ? 6000 : 3500);
}
export const fail = (e) => toast(e?.message || 'Algo deu errado.', 'bad');

export function modal(title, build, { wide = false } = {}) {
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const body = h('div', {});
  const overlay = h('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(); } },
    h('div', { class: `modal ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'btn sm', onclick: close, 'aria-label': 'Fechar' }, icon('x'))),
      body));
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  build(body, close);
  return close;
}

export async function confirmBox(message, okLabel = 'Confirmar') {
  return new Promise((resolve) => {
    modal('Confirmar', (body, close) => {
      body.append(h('p', {}, message), h('div', { class: 'row', style: { marginTop: '18px', justifyContent: 'flex-end' } },
        h('button', { class: 'btn', onclick: () => { close(); resolve(false); } }, 'Voltar'),
        h('button', { class: 'btn primary', onclick: () => { close(); resolve(true); } }, okLabel)));
    });
  });
}

// ---------- Formulários ----------
export function field(label, input, hint) {
  return h('label', { class: 'f' }, label, input, hint ? h('span', { class: 'small muted' }, hint) : null);
}
export function showFieldErrors(form, fields) {
  form.querySelectorAll('.field-error').forEach((n) => n.remove());
  if (!fields) return;
  for (const [name, msg] of Object.entries(fields)) {
    const input = form.querySelector(`[name="${name}"]`);
    if (input) input.closest('label')?.append(h('span', { class: 'field-error' }, msg));
  }
}
export const formData = (form) => Object.fromEntries(new FormData(form).entries());

// ---------- Formatação ----------
export const brl = (c) => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const parseMoney = (s) => Math.round(Number(String(s).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) * 100) || 0;
export const moneyInput = (c) => (c / 100).toFixed(2).replace('.', ',');
export function fmtPhone(p) {
  if (!p) return '';
  const d = String(p).replace(/^55/, '');
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : p;
}
export const initials = (n) => String(n || '?').split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('');
export const fmtTime = (iso, tz) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso));
export const fmtDate = (iso, tz) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: tz }).format(new Date(iso));
export const fmtDateTime = (iso, tz) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso));
export const todayLocal = (tz = 'America/Sao_Paulo') => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
export function addDays(dateStr, n) { const [y, m, d] = dateStr.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
export const STATUS = {
  scheduled: ['Agendado', 'info'], confirmed: ['Confirmado', 'ok'], done: ['Concluído', ''], cancelled: ['Cancelado', 'bad'], noshow: ['Faltou', 'warn'], pending_payment: ['Aguardando pagamento', 'warn'],
};
export const statusChip = (s) => { const [l, k] = STATUS[s] || [s, '']; return h('span', { class: `chip ${k}` }, l); };

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copiado!', 'ok'); } catch { toast('Não foi possível copiar. Selecione e copie manualmente.', 'bad'); }
}
export function copyBox(text) {
  return h('div', { class: 'copy' }, h('code', {}, text), h('button', { class: 'btn sm', onclick: () => copyText(text) }, 'Copiar'));
}
export function debounce(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// Campo de senha com "olhinho" para ver o que foi digitado.
export function passwordInput(props = {}) {
  const input = h('input', { ...props, type: 'password' });
  const btn = h('button', { type: 'button', class: 'pw-eye', 'aria-label': 'Mostrar senha', 'aria-pressed': 'false', title: 'Mostrar senha' }, icon('eye'));
  btn.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(show)); btn.setAttribute('aria-label', show ? 'Esconder senha' : 'Mostrar senha'); btn.title = btn.getAttribute('aria-label');
    clear(btn).append(icon(show ? 'eyeoff' : 'eye'));
    input.focus();
  });
  const wrap = h('span', { class: 'pw' }, input, btn);
  Object.defineProperty(wrap, 'value', { get: () => input.value, set: (v) => { input.value = v; } }); // quem lê .value continua funcionando
  return wrap;
}
