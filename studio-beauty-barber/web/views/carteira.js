// Carteira de crédito: saldo dos clientes, recargas por Pix, extrato e controles do gerente.
import { h, get, post, brl, clear, toast, fail, confirmBox, fmtDateTime, modal, field, copyText, parseMoney, debounce } from '../lib.js';
import { pageHead } from './_ui.js';

const KIND = { topup: 'Recarga', spend: 'Pagamento de comanda', refund: 'Estorno', adjust: 'Ajuste do gerente', reversal: 'Pix estornado' };
const METHOD = { pix: 'Pix', cash: 'Dinheiro', card: 'Cartão', pix_manual: 'Pix (fora do Asaas)' };

const kpi = (l, v, sub) => h('div', { class: 'card kpi' }, h('div', { class: 'label' }, l), h('div', { class: 'value' }, v), sub ? h('div', { class: 'small muted' }, sub) : null);

export async function render(root, { session }) {
  const tz = session.salon.timezone;
  const isMgr = ['owner', 'manager'].includes(session.user.role);
  const host = h('div', {});

  async function load() {
    const w = await get('/api/wallet');
    const s = w.summary;
    clear(host).append(
      !w.enabled ? h('div', { class: 'card' }, h('p', { class: 'muted' }, 'A carteira está desligada. Ligue em Configurações para voltar a receber recargas e pagar com crédito.')) : null,
      h('div', { class: 'grid g3' },
        kpi('Saldo dos clientes (a prestar contas)', brl(s.held_cents), `${s.clients_with_balance} cliente(s) com saldo`),
        kpi('Recargas no mês', brl(s.topups_cents), s.pending_count ? `${s.pending_count} Pix aguardando (${brl(s.pending_cents)})` : null),
        kpi('Crédito usado no mês', brl(s.spent_cents), `Desconto dado: ${brl(s.discount_given_cents)} (${w.discount_pct}% nos serviços)`)),
      w.pending.length ? h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, 'Recargas aguardando pagamento'),
        h('div', { class: 'scroll-x' }, h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, ['Cliente', 'Valor', 'Criada em', ''].map((t) => h('th', {}, t)))),
          h('tbody', {}, w.pending.map((p) => h('tr', {},
            h('td', {}, p.client_name), h('td', {}, brl(p.amount_cents)), h('td', { class: 'nowrap' }, fmtDateTime(p.created_at, tz)),
            h('td', { class: 'nowrap' },
              p.pix_payload ? h('button', { class: 'btn sm', onclick: () => copyText(p.pix_payload) }, 'Copiar Pix') : null,
              isMgr ? h('button', { class: 'btn sm', onclick: async () => {
                if (!(await confirmBox(`Confirmar que ${brl(p.amount_cents)} de ${p.client_name} já foi recebido? O crédito será liberado agora.`, 'Confirmar recebimento'))) return;
                try { await post(`/api/wallet/topups/${p.id}/confirm`); toast('Crédito liberado', 'ok'); load(); } catch (e) { fail(e); }
              } }, 'Confirmar recebimento') : null,
              h('button', { class: 'btn sm danger', onclick: async () => { try { await post(`/api/wallet/topups/${p.id}/cancel`); load(); } catch (e) { fail(e); } } }, 'Cancelar')))))))) : null,
      h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, 'Saldo por cliente'),
        w.accounts.length ? h('div', { class: 'scroll-x' }, h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, ['Cliente', 'Saldo', 'Última movimentação', ''].map((t) => h('th', {}, t)))),
          h('tbody', {}, w.accounts.map((a) => h('tr', {},
            h('td', {}, h('b', {}, a.name), a.phone ? h('div', { class: 'small muted' }, a.phone) : null), h('td', {}, h('b', {}, brl(a.balance_cents))), h('td', { class: 'nowrap' }, fmtDateTime(a.updated_at, tz)),
            h('td', { class: 'nowrap' },
              h('button', { class: 'btn sm primary', onclick: () => topup(w, { id: a.client_id, name: a.name }) }, 'Recarregar'),
              h('button', { class: 'btn sm', onclick: () => statement(a.client_id).catch(fail) }, 'Extrato'),
              isMgr ? h('button', { class: 'btn sm', onclick: () => adjust(a.client_id, a.name) }, 'Ajustar') : null)))))) : h('p', { class: 'empty' }, 'Nenhum cliente com carteira ainda. Use “+ Recarga” para começar.')));
  }

  async function pickClient(onPick) {
    const { clients } = await get('/api/clients');
    modal('Escolher cliente', (body, close) => {
      const q = h('input', { placeholder: 'Buscar por nome ou telefone', autocomplete: 'off' });
      const list = h('div', { class: 'stack-sm' });
      const paint = () => {
        const t = q.value.trim().toLowerCase();
        clear(list).append(clients.filter((c) => !t || c.name.toLowerCase().includes(t) || String(c.phone || '').includes(t)).slice(0, 30)
          .map((c) => h('button', { class: 'btn block', style: { textAlign: 'left' }, onclick: () => { close(); onPick({ id: c.id, name: c.name }); } }, c.name, c.phone ? h('span', { class: 'small muted' }, ` · ${c.phone}`) : null)));
      };
      q.addEventListener('input', debounce(paint, 120));
      body.append(h('div', { class: 'stack' }, q, list)); paint(); q.focus();
    });
  }

  function topup(w, client) {
    modal(`Recarga para ${client.name}`, (body, close) => {
      const val = h('input', { inputmode: 'decimal', placeholder: 'Ex.: 200,00' });
      const quick = [10000, 20000, 50000].map((c) => h('button', { type: 'button', class: 'btn sm', onclick: () => { val.value = (c / 100).toFixed(2).replace('.', ','); } }, brl(c)));
      const method = h('select', {}, Object.entries(METHOD).map(([v, l]) => h('option', { value: v }, l)));
      const doc = h('input', { inputmode: 'numeric', placeholder: 'CPF/CNPJ (algumas contas Asaas exigem)' });
      const send = h('input', { type: 'checkbox', checked: true });
      const out = h('div', {});
      const hint = h('p', { class: 'small muted' });
      const paintHint = () => { hint.textContent = method.value === 'pix' ? 'Gera um Pix pelo Asaas do salão. O crédito entra sozinho quando o Pix for pago.' : `Use quando o cliente pagou agora no balcão. O crédito entra na hora${isMgr ? '' : ` (recepção lança até ${brl(w.limits.counter_cents)})`}.`; };
      method.addEventListener('change', paintHint); paintHint();
      const btn = h('button', { class: 'btn primary block', onclick: async () => {
        btn.disabled = true;
        try {
          const r = await post('/api/wallet/topups', { client_id: client.id, amount_cents: parseMoney(val.value), method: method.value, cpf_cnpj: doc.value || undefined, send: method.value === 'pix' && send.checked });
          load();
          if (r.status === 'paid') { toast(`Crédito liberado. Saldo: ${brl(r.balance_cents)}`, 'ok'); close(); return; }
          clear(out).append(h('div', { class: 'card flat' }, h('h3', {}, 'Pix gerado'), r.pix.image ? h('img', { src: `data:image/png;base64,${r.pix.image}`, alt: 'QR Code Pix', width: 200, height: 200 }) : null,
            h('code', { class: 'break' }, r.pix.payload), h('button', { class: 'btn sm', onclick: () => copyText(r.pix.payload) }, 'Copiar Pix copia e cola'),
            r.pix.note ? h('p', { class: 'small muted' }, r.pix.note) : null,
            r.sent ? h('p', { class: 'small' }, r.sent === 'sent' || r.sent === 'simulated' ? 'Pix enviado ao cliente por mensagem.' : 'Não consegui enviar a mensagem agora; copie o Pix e mande ao cliente.') : null,
            h('p', { class: 'small muted' }, 'O crédito entra automaticamente quando o Pix for pago.')));
          btn.remove();
        } catch (e) { fail(e); btn.disabled = false; }
      } }, 'Criar recarga');
      body.append(h('div', { class: 'stack' }, h('div', { class: 'row wrap' }, quick), field('Valor (R$)', val), field('Forma', method), hint, field('CPF/CNPJ do cliente (opcional)', doc),
        h('label', { class: 'check' }, send, h('span', {}, 'Enviar o Pix ao cliente por WhatsApp/e-mail')), btn, out));
      val.focus();
    });
  }

  async function statement(clientId) {
    const r = await get(`/api/wallet/clients/${clientId}`);
    modal(`Extrato — ${r.client.name}`, (body) => {
      body.append(h('div', { class: 'stack' }, h('div', { class: 'big' }, `Saldo: ${brl(r.balance_cents)}`),
        r.ledger.length ? h('div', { class: 'scroll-x' }, h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, ['Quando', 'Movimento', 'Valor', 'Saldo'].map((t) => h('th', {}, t)))),
          h('tbody', {}, r.ledger.map((l) => h('tr', {}, h('td', { class: 'nowrap' }, fmtDateTime(l.created_at, tz)),
            h('td', {}, KIND[l.kind] || l.kind, l.note ? h('div', { class: 'small muted' }, l.note) : null),
            h('td', {}, h('span', { class: `chip ${l.amount_cents > 0 ? 'ok' : 'warn'}` }, `${l.amount_cents > 0 ? '+' : '−'}${brl(Math.abs(l.amount_cents))}`)), h('td', {}, brl(l.balance_after))))))) : h('p', { class: 'empty' }, 'Sem movimentações.')));
    }, { wide: true });
  }

  function adjust(clientId, name) {
    modal(`Ajustar saldo — ${name}`, (body, close) => {
      const kind = h('select', {}, h('option', { value: '1' }, 'Adicionar crédito (cortesia/correção)'), h('option', { value: '-1' }, 'Tirar crédito (correção/devolução em dinheiro)'));
      const val = h('input', { inputmode: 'decimal', placeholder: 'Ex.: 50,00' });
      const note = h('input', { placeholder: 'Motivo (obrigatório, fica no extrato)' });
      const btn = h('button', { class: 'btn primary block', onclick: async () => {
        btn.disabled = true;
        try { const r = await post('/api/wallet/adjust', { client_id: clientId, amount_cents: Number(kind.value) * parseMoney(val.value), note: note.value }); toast(`Saldo ajustado: ${brl(r.balance_cents)}`, 'ok'); close(); load(); } catch (e) { fail(e); btn.disabled = false; }
      } }, 'Salvar ajuste');
      body.append(h('div', { class: 'stack' }, field('Tipo', kind), field('Valor (R$)', val), field('Motivo', note), btn, h('p', { class: 'small muted' }, 'Todo ajuste fica registrado com o seu nome.')));
    });
  }

  root.append(pageHead('Carteira de crédito', 'Cliente recarrega, usa o saldo nos serviços e ganha desconto. Tudo registrado no extrato.',
    h('button', { class: 'btn primary', onclick: () => get('/api/wallet').then((w) => pickClient((c) => topup(w, c))).catch(fail) }, '+ Recarga')), host);
  await load();
}
