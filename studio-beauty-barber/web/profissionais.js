// Indicador de profissionais (público): dados do cliente → escolhe UMA cidade → vê os profissionais dela → pede contato.
// O contato com o profissional acontece só pelo sistema; esta página nunca recebe telefone, e-mail ou endereço dele.
import { h, $, clear, get, post, brl, toast, fail, field } from './lib.js';

const root = $('#root');
const st = { requestId: null, token: null, cities: [], pros: [], remaining: 3, city: null };

function shell(...content) {
  clear(root).append(h('div', { class: 'pub-wrap' },
    h('header', { class: 'pub-hero' }, h('div', { class: 'pub-head', style: { marginBottom: 0 } }, h('div', { class: 'mark' }, 'S'),
      h('div', {}, h('h1', {}, 'Encontre um profissional'), h('p', {}, 'Salões e barbearias da sua cidade')))),
    ...content,
    h('footer', { class: 'small muted', style: { textAlign: 'center', marginTop: '24px' } }, 'Studio Beauty Barber · seus dados são usados só para conectar você ao profissional que escolher.'));
  window.scrollTo(0, 0);
}

async function stepForm() {
  let services = ['Corte', 'Barba', 'Coloração', 'Outro'];
  try { services = (await get('/api/public/finder/services')).services; } catch { /* lista padrão */ }
  const name = h('input', { name: 'name', autocomplete: 'name', maxlength: 80, required: true });
  const phone = h('input', { name: 'phone', type: 'tel', inputmode: 'tel', autocomplete: 'tel', placeholder: '(44) 99999-9999', required: true });
  const service = h('select', { name: 'service' }, services.map((s) => h('option', { value: s }, s)));
  const consent = h('input', { type: 'checkbox', required: true });
  const trap = h('input', { name: 'website', tabindex: '-1', autocomplete: 'off', style: { position: 'absolute', left: '-9999px' }, 'aria-hidden': 'true' });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Ver cidades com profissionais');
  const form = h('form', { class: 'card stack', onsubmit: async (e) => {
    e.preventDefault(); btn.disabled = true;
    try {
      const r = await post('/api/public/finder/search', { name: name.value, phone: phone.value, service: service.value, consent: consent.checked, website: trap.value });
      Object.assign(st, { requestId: r.request_id, token: r.token, cities: r.cities });
      stepCities();
    } catch (ex) { fail(ex); btn.disabled = false; }
  } },
  field('Seu nome', name), field('Seu WhatsApp', phone), field('Que serviço você procura?', service), trap,
  h('label', { class: 'check small' }, consent, h('span', {}, 'Autorizo o uso do meu nome e WhatsApp para me conectar aos profissionais que eu escolher (LGPD). Posso pedir a exclusão a qualquer momento.')),
  btn);
  shell(h('h2', {}, 'Conte o que você procura'), h('p', { class: 'muted small' }, 'Você escolhe a cidade e só os profissionais dela aparecem. O contato é feito pelo sistema.'), form);
}

function stepCities() {
  shell(h('h2', {}, 'Em qual cidade?'),
    st.cities.length
      ? h('div', { class: 'card' }, h('p', { class: 'small muted' }, 'Toque na cidade para ver os profissionais. Só a cidade escolhida é aberta.'),
        st.cities.map((c) => h('button', { class: 'opt', onclick: () => openCity(c) }, h('b', {}, c.label), h('span', { class: 'muted small' }, `${c.count} ${c.count === 1 ? 'profissional' : 'profissionais'}`))))
      : h('div', { class: 'card' }, h('p', { class: 'empty' }, 'Ainda não há profissionais para esse serviço. Tente outro serviço mais tarde.'),
        h('button', { class: 'btn', onclick: stepForm }, 'Buscar outro serviço')));
}

async function openCity(c) {
  try {
    const r = await post('/api/public/finder/open', { request_id: st.requestId, token: st.token, city: c.key });
    Object.assign(st, { pros: r.pros, remaining: r.remaining, city: c });
    stepPros();
  } catch (ex) { fail(ex); }
}

async function ask(p, btn) {
  btn.disabled = true;
  try {
    const r = await post('/api/public/finder/contact', { request_id: st.requestId, token: st.token, ref: p.ref });
    p.contacted = true; if (r.remaining !== undefined) st.remaining = r.remaining;
    toast('Pronto! Avisamos o profissional.', 'ok'); stepPros();
  } catch (ex) { fail(ex); btn.disabled = false; }
}

function stepPros() {
  shell(h('h2', {}, `Profissionais em ${st.city.label}`),
    h('p', { class: 'muted small' }, `Toque em "Pedir contato" e o sistema avisa o profissional na hora. Você pode pedir até ${st.remaining + st.pros.filter((p) => p.contacted).length} contatos.`),
    st.pros.length ? st.pros.map((p) => h('div', { class: 'card', style: { marginBottom: '12px' } }, h('h3', {}, p.name), h('p', { class: 'small muted' }, p.city),
      h('ul', { class: 'small' }, p.services.map((s) => h('li', {}, `${s.name}${s.price_cents ? ' · ' + brl(s.price_cents) : ''}`))),
      p.contacted ? h('p', { class: 'small' }, 'Contato pedido. Aguarde o retorno pelo sistema.')
        : h('button', { class: 'btn primary', disabled: st.remaining <= 0, onclick: (e) => ask(p, e.currentTarget) }, 'Pedir contato')))
      : h('div', { class: 'card' }, h('p', { class: 'empty' }, 'Nenhum profissional encontrado nesta cidade.')));
}

stepForm();
