import { h, get, post, clear, toast, fail, confirmBox, copyBox, fmtPhone } from '../lib.js';
import { pageHead, formModal } from './_ui.js';

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

export async function render(root) {
  const st = await get('/api/prospect/status');
  const box = h('div', { class: 'stack' });
  root.append(pageHead('Captação de empresas', 'Encontre salões e barbearias pelos dados abertos da Receita Federal e leve para o funil.'), box);

  if (!st.terms.accepted) return termsView();
  if (!st.base.available) box.append(baseMissing());
  mainView();

  function termsView() {
    const name = h('input', { autocomplete: 'name' }), doc = h('input', { inputmode: 'numeric', placeholder: 'CPF ou CNPJ' });
    box.append(h('div', { class: 'card stack' }, h('h3', {}, 'Termo de responsabilidade'), h('pre', { class: 'pre' }, st.terms.text),
      h('p', { class: 'small muted' }, 'Texto modelo: precisa de revisão jurídica antes do uso comercial.'),
      h('label', { class: 'f' }, 'Nome de quem aceita', name), h('label', { class: 'f' }, 'CPF ou CNPJ', doc),
      h('button', { class: 'btn primary', onclick: async () => { try { await post('/api/prospect/terms', { signer_name: name.value, signer_document: doc.value }); toast('Termo aceito', 'ok'); location.reload(); } catch (e) { fail(e); } } }, 'Li e aceito')));
  }

  function baseMissing() {
    return h('div', { class: 'card stack', style: { borderColor: 'var(--warn)' } }, h('h3', {}, 'A base da Receita ainda não foi carregada'),
      h('p', { class: 'small' }, 'A carga baixa os dados abertos de CNPJ (só vale rodar de um computador no Brasil) e grava só salões, barbearias e segmentos de beleza. Rode na pasta do projeto, trocando o estado:'),
      copyBox('node tools/receita-import/importar.mjs --ufs=PR'), h('p', { class: 'small muted' }, 'Precisa do DATABASE_URL do app na variável de ambiente. Para testar sem gravar, acrescente --dry-run. Enquanto isso, a consulta de um CNPJ avulso já funciona.'));
  }

  function mainView() {
    const segs = st.segments.map((s, i) => ({ ...s, el: h('input', { type: 'checkbox', checked: i < 2 }) }));
    const uf = h('select', {}, h('option', { value: '' }, 'Estado'), UFS.map((u) => h('option', { value: u, selected: u === 'PR' }, u)));
    const city = h('input', { placeholder: 'Cidade (opcional)' });
    const mei = h('select', {}, [['ALL', 'MEI e demais'], ['EXCLUDE', 'Sem MEI'], ['ONLY', 'Só MEI']].map(([v, l]) => h('option', { value: v }, l)));
    const limit = h('input', { type: 'number', min: 1, max: 200, value: 50 });
    const out = h('div', { class: 'stack' });
    let results = [];

    const cnpjIn = h('input', { inputmode: 'numeric', placeholder: 'CNPJ' });
    box.append(
      h('div', { class: 'card stack' }, h('h3', {}, 'Buscar por segmento e local'),
        h('div', { class: 'stack-sm' }, segs.map((s) => h('label', { class: 'check' }, s.el, h('span', {}, s.name)))),
        h('div', { class: 'grid g4' }, h('label', { class: 'f' }, 'Estado', uf), h('label', { class: 'f' }, 'Cidade', city), h('label', { class: 'f' }, 'MEI', mei), h('label', { class: 'f' }, 'Quantidade', limit)),
        h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', onclick: search }, 'Buscar'),
          h('span', { class: 'small muted' }, st.base.available ? `Base de ${st.base.ref_month || '—'} com ${st.base.total.toLocaleString('pt-BR')} empresas.` : 'Base ainda não carregada.'))),
      h('div', { class: 'card row wrap' }, h('b', {}, 'Consultar um CNPJ'), cnpjIn, h('button', { class: 'btn', onclick: lookup }, 'Consultar')),
      out,
      h('div', { class: 'card stack' }, h('h3', {}, 'Empresas já salvas no funil'), h('p', { class: 'small muted' }, 'Baixe a planilha com o link de WhatsApp de cada empresa, agende o convite por e-mail ou marque quem pediu para não receber.'),
        h('div', { class: 'row wrap' }, h('a', { class: 'btn', href: '/api/prospect/export' }, 'Baixar planilha (Excel) com WhatsApp'), h('button', { class: 'btn', onclick: invite }, 'Agendar convite por e-mail'), h('a', { class: 'btn', href: '#/leads' }, 'Abrir funil de leads'))));

    function renderResults() {
      clear(out);
      if (!results.length) return out.append(h('p', { class: 'empty' }, 'Nenhuma empresa nova para esses filtros.'));
      const checks = results.map(() => h('input', { type: 'checkbox', checked: true }));
      out.append(h('div', { class: 'card stack' }, h('div', { class: 'row spread wrap' }, h('h3', {}, `${results.length} empresas encontradas`),
          h('button', { class: 'btn primary', onclick: async () => {
            const docs = results.filter((_, i) => checks[i].checked).map((r) => r.document);
            if (!docs.length) return toast('Marque ao menos uma empresa.', 'bad');
            try { const r = await post('/api/prospect/save', { documents: docs }); toast(`${r.saved} empresa(s) salva(s) no funil.`, 'ok'); results = results.filter((_, i) => !checks[i].checked); renderResults(); } catch (e) { fail(e); }
          } }, 'Salvar marcadas no funil')),
        h('div', { class: 'scroll-x' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, ['', 'Empresa', 'Segmento', 'Cidade', 'Contato'].map((t) => h('th', {}, t)))),
          h('tbody', {}, results.map((r, i) => h('tr', {}, h('td', {}, checks[i]), h('td', {}, h('b', {}, r.name), h('div', { class: 'small muted' }, r.document + (r.is_mei ? ' · MEI' : ''))),
            h('td', {}, r.category || '—'), h('td', {}, [r.city, r.state].filter(Boolean).join(' / ')),
            h('td', {}, r.phone ? fmtPhone(r.phone) : '', r.email ? h('div', { class: 'small' }, r.email) : null))))))));
    }
    async function search() {
      try {
        const r = await post('/api/prospect/search', { cnaes: segs.filter((s) => s.el.checked).map((s) => s.code), uf: uf.value || undefined, city: city.value || undefined, mei: mei.value, limit: Number(limit.value) || 50 });
        results = r.results; renderResults();
      } catch (e) { fail(e); }
    }
    async function lookup() {
      try { const r = await post('/api/prospect/lookup', { cnpj: cnpjIn.value }); results = [r.company]; renderResults(); } catch (e) { fail(e); }
    }
    async function invite() {
      const { leads } = await get('/api/leads');
      const eligible = leads.filter((l) => l.source === 'cnpj_public' && l.email && l.stage === 'new');
      if (!st.email_ready) return toast('Conecte o e-mail (Resend) em Integrações antes.', 'bad');
      if (!eligible.length) return toast('Nenhum lead novo com e-mail para convidar.', 'bad');
      formModal(`Convite por e-mail para ${eligible.length} empresas`, [
        { name: 'subject', label: 'Assunto', value: 'Agenda cheia no seu salão, sem planilha' },
        { name: 'body', label: 'Mensagem (o link para sair é incluído automaticamente)', type: 'textarea', rows: 7, value: 'Olá! Sou da WMundi Technologies, de Maringá. Criamos o Studio Beauty Barber: agenda online, robô no WhatsApp, reserva paga e clube de assinatura para salões e barbearias. Planos a partir de R$ 59,90 por mês, com 14 dias grátis. Veja a demonstração: https://studiobeautybarber.com/demo/' },
        { name: 'per_day', label: 'Máximo por dia útil', type: 'number', value: '30', half: true },
      ], async (v) => { const r = await post('/api/prospect/invites', { lead_ids: eligible.map((l) => l.id), subject: v.subject, body: v.body, per_day: Number(v.per_day) || 30 }); toast(`${r.scheduled} convites agendados (em horário comercial, dias úteis).`, 'ok'); }, { submitLabel: 'Agendar' });
    }
  }
}
