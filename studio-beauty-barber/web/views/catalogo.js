import { h, get, post, patch, brl, parseMoney, moneyInput, clear, toast, fail, fmtPhone, modal } from '../lib.js';
import { pageHead, formModal } from './_ui.js';

export async function render(root) {
  let tab = 'servicos';
  const body = h('div', {});
  const tabs = h('div', { class: 'tabs' });
  const T = [['servicos', 'Serviços'], ['equipe', 'Equipe'], ['produtos', 'Produtos e estoque']];
  const draw = async () => {
    clear(tabs).append(T.map(([k, l]) => h('button', { class: `tab ${tab === k ? 'active' : ''}`, onclick: () => { tab = k; draw(); } }, l)));
    clear(body);
    try { await ({ servicos, equipe, produtos })[tab](body, draw); } catch (e) { fail(e); }
  };
  root.append(pageHead('Serviços e equipe', 'Catálogo, profissionais, comissões e estoque.'), tabs, body);
  await draw();
}

async function servicos(body, redraw) {
  const { services } = await get('/api/services');
  const f = (s = {}) => [
    { name: 'name', label: 'Nome do serviço', value: s.name },
    { name: 'category', label: 'Categoria', value: s.category, half: true },
    { name: 'duration_min', label: 'Duração (min)', value: s.duration_min ?? 30, type: 'number', half: true },
    { name: 'price', label: 'Preço (R$)', value: s.price_cents != null ? moneyInput(s.price_cents) : '', half: true, inputmode: 'decimal' },
    { name: 'description', label: 'Descrição', value: s.description, type: 'textarea' },
  ];
  const pay = (v) => ({ name: v.name, category: v.category || undefined, description: v.description || undefined, duration_min: Number(v.duration_min), price_cents: parseMoney(v.price) });
  body.append(h('div', { style: { marginBottom: '12px' } }, h('button', { class: 'btn primary', onclick: () => formModal('Novo serviço', f(), async (v) => { await post('/api/services', pay(v)); toast('Serviço criado', 'ok'); redraw(); }) }, '+ Novo serviço')),
    h('div', { class: 'card scroll-x', style: { padding: 0 } }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ['Serviço', 'Categoria', 'Duração', 'Preço', 'Situação', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, services.map((s) => h('tr', {},
        h('td', {}, h('b', {}, s.name)), h('td', {}, s.category || '—'), h('td', {}, `${s.duration_min} min`), h('td', {}, brl(s.price_cents)),
        h('td', {}, s.active ? h('span', { class: 'chip ok' }, 'Ativo') : h('span', { class: 'chip' }, 'Inativo')),
        h('td', { class: 'nowrap' },
          h('button', { class: 'btn sm', onclick: () => formModal('Editar serviço', f(s), async (v) => { await patch(`/api/services/${s.id}`, pay(v)); toast('Salvo', 'ok'); redraw(); }) }, 'Editar'), ' ',
          h('button', { class: 'btn sm', onclick: async () => { try { await patch(`/api/services/${s.id}`, { active: !s.active }); redraw(); } catch (e) { fail(e); } } }, s.active ? 'Desativar' : 'Ativar'))))))));
}

async function equipe(body, redraw) {
  const [{ staff }, { services }] = await Promise.all([get('/api/staff'), get('/api/services')]);
  const f = (s = {}) => [
    { name: 'name', label: 'Nome', value: s.name },
    { name: 'role', label: 'Função (ex.: Barbeiro, Cabeleireira)', value: s.role, half: true },
    { name: 'phone', label: 'WhatsApp', value: s.phone ? fmtPhone(s.phone) : '', half: true, inputmode: 'tel' },
    { name: 'commission_pct', label: 'Comissão (%)', value: s.commission_pct ?? 40, type: 'number', half: true },
  ];
  const pay = (v) => ({ name: v.name, role: v.role || undefined, phone: v.phone || undefined, commission_pct: Number(v.commission_pct) });
  function skillsModal(s) {
    const set = new Set(s.service_ids);
    modal(`Serviços de ${s.name}`, (b, close) => {
      b.append(h('div', { class: 'stack-sm' }, services.filter((x) => x.active).map((x) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: set.has(x.id), onchange: (e) => e.target.checked ? set.add(x.id) : set.delete(x.id) }), h('span', {}, x.name)))),
        h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '14px' } }, h('button', { class: 'btn primary', onclick: async () => { try { await patch(`/api/staff/${s.id}`, { service_ids: [...set] }); toast('Salvo', 'ok'); close(); redraw(); } catch (e) { fail(e); } } }, 'Salvar')));
    });
  }
  body.append(h('div', { style: { marginBottom: '12px' } }, h('button', { class: 'btn primary', onclick: () => formModal('Novo profissional', f(), async (v) => { await post('/api/staff', pay(v)); toast('Profissional cadastrado', 'ok'); redraw(); }) }, '+ Novo profissional')),
    h('div', { class: 'grid g3' }, staff.map((s) => h('div', { class: 'card' + (s.active ? '' : ' dim') },
      h('div', { class: 'row' }, h('span', { style: { width: '12px', height: '12px', borderRadius: '50%', background: s.color, display: 'inline-block' } }), h('h3', { style: { margin: 0 } }, s.name)),
      h('p', { class: 'muted small' }, `${s.role || 'Profissional'} · comissão ${s.commission_pct}%`),
      h('p', { class: 'small' }, `${s.service_ids.length} serviços habilitados`),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn sm', onclick: () => formModal('Editar profissional', f(s), async (v) => { await patch(`/api/staff/${s.id}`, pay(v)); toast('Salvo', 'ok'); redraw(); }) }, 'Editar'),
        h('button', { class: 'btn sm', onclick: () => skillsModal(s) }, 'Serviços'),
        h('button', { class: 'btn sm', onclick: async () => { try { await patch(`/api/staff/${s.id}`, { active: !s.active }); redraw(); } catch (e) { fail(e); } } }, s.active ? 'Desativar' : 'Ativar'))))));
}

async function produtos(body, redraw) {
  const { products } = await get('/api/products');
  const f = (p = {}) => [
    { name: 'name', label: 'Produto', value: p.name },
    { name: 'price', label: 'Preço de venda (R$)', value: p.price_cents != null ? moneyInput(p.price_cents) : '', half: true, inputmode: 'decimal' },
    { name: 'cost', label: 'Custo (R$)', value: p.cost_cents != null ? moneyInput(p.cost_cents) : '', half: true, inputmode: 'decimal' },
    { name: 'stock', label: 'Estoque', value: p.stock ?? 0, type: 'number', half: true },
    { name: 'min_stock', label: 'Estoque mínimo', value: p.min_stock ?? 2, type: 'number', half: true },
  ];
  const pay = (v) => ({ name: v.name, price_cents: parseMoney(v.price), cost_cents: parseMoney(v.cost), stock: Number(v.stock), min_stock: Number(v.min_stock) });
  body.append(h('div', { style: { marginBottom: '12px' } }, h('button', { class: 'btn primary', onclick: () => formModal('Novo produto', f(), async (v) => { await post('/api/products', pay(v)); toast('Produto criado', 'ok'); redraw(); }) }, '+ Novo produto')),
    h('div', { class: 'card scroll-x', style: { padding: 0 } }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ['Produto', 'Preço', 'Custo', 'Estoque', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, products.map((p) => h('tr', {},
        h('td', {}, h('b', {}, p.name)), h('td', {}, brl(p.price_cents)), h('td', {}, brl(p.cost_cents)),
        h('td', {}, h('span', { class: `chip ${p.stock <= p.min_stock ? 'warn' : 'ok'}` }, `${p.stock} un.`)),
        h('td', {}, h('button', { class: 'btn sm', onclick: () => formModal('Editar produto', f(p), async (v) => { await patch(`/api/products/${p.id}`, pay(v)); toast('Salvo', 'ok'); redraw(); }) }, 'Editar'))))))));
}
