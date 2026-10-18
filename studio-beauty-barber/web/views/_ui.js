// Helpers compartilhados pelas telas: formulário em modal e cabeçalho de página.
import { h, modal, field, toast, fail, showFieldErrors } from '../lib.js';

export function pageHead(title, sub, ...actions) {
  return h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, title), sub ? h('p', {}, sub) : null), h('div', { class: 'row wrap' }, actions));
}

// fields: [{name,label,type,value,options:[[v,l]],hint,placeholder,required,rows,half}]
export function formModal(title, fields, onSubmit, { submitLabel = 'Salvar', wide = false } = {}) {
  return modal(title, (body, close) => {
    const form = h('form', { class: 'stack', novalidate: true });
    const grid = h('div', { class: 'grid g2' });
    for (const f of fields) {
      let input;
      if (f.type === 'select') input = h('select', { name: f.name }, f.options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(f.value ?? '') }, l)));
      else if (f.type === 'textarea') input = h('textarea', { name: f.name, rows: f.rows || 3, placeholder: f.placeholder }, f.value ?? '');
      else if (f.type === 'checkbox') input = null;
      else input = h('input', { name: f.name, type: f.type || 'text', value: f.value ?? '', placeholder: f.placeholder, required: f.required, inputmode: f.inputmode, maxlength: f.maxlength, autocomplete: 'off' });
      const el = f.type === 'checkbox'
        ? h('label', { class: 'check' }, h('input', { type: 'checkbox', name: f.name, checked: !!f.value }), h('span', {}, f.label))
        : field(f.label, input, f.hint);
      if (!f.half) el.style.gridColumn = '1 / -1';
      grid.append(el);
    }
    const btn = h('button', { class: 'btn primary', type: 'submit' }, submitLabel);
    form.append(grid, h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancelar'), btn));
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); btn.disabled = true;
      const v = {};
      for (const f of fields) {
        const el = form.elements[f.name];
        v[f.name] = f.type === 'checkbox' ? el.checked : el.value.trim();
      }
      try { await onSubmit(v); close(); }
      catch (ex) { if (ex.fields) showFieldErrors(form, ex.fields); fail(ex); btn.disabled = false; }
    });
    body.append(form);
    form.querySelector('input,select,textarea')?.focus();
  }, { wide });
}
export { toast };
