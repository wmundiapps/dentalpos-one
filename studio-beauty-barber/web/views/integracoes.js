import { h, get, put, del, post, copyBox, clear, toast, fail, confirmBox, modal } from '../lib.js';
import { pageHead } from './_ui.js';

const LABELS = {
  phoneNumberId: 'ID do número (Phone number ID)', accessToken: 'Token de acesso permanente', wabaId: 'ID da conta WhatsApp Business', templateReminder: 'Nome do modelo de lembrete', templateMarketing: 'Nome do modelo de promoção',
  pageId: 'ID da página', pageAccessToken: 'Token de acesso da página', igUserId: 'ID da conta Instagram', apiKey: 'Chave de API', from: 'Remetente', accountSid: 'Account SID', authToken: 'Auth token', sandbox: 'Ambiente de testes (true/false)', webhookToken: 'Token do webhook',
};
const SECRET = new Set(['accessToken', 'pageAccessToken', 'apiKey', 'authToken', 'webhookToken']);
const HELP = {
  whatsapp: 'API oficial da Meta. Créditos de conversa são cobrados pela Meta na conta do seu salão.',
  facebook: 'Mensagens da sua página do Facebook.', instagram: 'Direct da conta profissional do Instagram.',
  email: 'Envio por Resend. Use um remetente do seu domínio verificado (ex.: contato@seusalao.com.br).',
  sms: 'Envio por Twilio. Créditos de SMS e ligações são pagos direto à operadora.',
  asaas: 'Cobrança Pix/boleto/cartão do seu salão. Os valores caem direto na sua conta Asaas.',
};

export async function render(root, { session }) {
  const isOwner = session.user.role === 'owner';
  const host = h('div', {});
  async function load() {
    const r = await get('/api/integrations');
    clear(host).append(
      h('div', { class: 'banner' }, r.note),
      h('div', { class: 'grid g2' }, r.integrations.map((i) => h('div', { class: 'card' },
        h('div', { class: 'row spread' }, h('h3', { style: { margin: 0 } }, i.label), i.connected ? h('span', { class: 'chip ok' }, 'Conectado') : h('span', { class: 'chip' }, 'Não conectado')),
        h('p', { class: 'small muted' }, HELP[i.kind]), i.hint ? h('p', { class: 'small' }, `Identificador: ${i.hint}`) : null,
        isOwner ? h('div', { class: 'row wrap' },
          h('button', { class: 'btn sm primary', onclick: () => edit(i) }, i.connected ? 'Atualizar dados' : 'Conectar'),
          i.connected && i.kind !== 'asaas' ? h('button', { class: 'btn sm', onclick: () => test(i) }, 'Enviar teste') : null,
          i.connected ? h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmBox(`Desconectar ${i.label}?`, 'Desconectar')) { try { await del(`/api/integrations/${i.kind}`); load(); } catch (e) { fail(e); } } } }, 'Desconectar') : null)
          : h('p', { class: 'small muted' }, 'Apenas o proprietário configura integrações.')))),
      h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, 'Endereços de webhook (copie e cole no painel de cada serviço)'),
        h('div', { class: 'stack-sm' }, h('div', { class: 'small muted' }, 'Meta (WhatsApp, Facebook, Instagram) — URL de retorno'), copyBox(r.webhooks.meta),
          h('div', { class: 'small muted' }, 'Meta — token de verificação'), copyBox(r.webhooks.meta_verify_token || '(defina META_VERIFY_TOKEN no servidor)'),
          h('div', { class: 'small muted' }, 'Asaas — URL do webhook'), copyBox(r.webhooks.asaas))));
  }
  function edit(i) {
    modal(i.label, (b, close) => {
      const inputs = {};
      b.append(h('form', { class: 'stack', onsubmit: async (e) => {
        e.preventDefault();
        const payload = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value.trim()]).filter(([, v]) => v));
        try { await put(`/api/integrations/${i.kind}`, payload); toast('Integração salva', 'ok'); close(); load(); } catch (ex) { fail(ex); }
      } },
        h('p', { class: 'small muted' }, 'Os dados são criptografados e nunca voltam para a tela. Ao atualizar, preencha todos os campos.'),
        i.fields.map((f) => { inputs[f] = h('input', { name: f, type: SECRET.has(f) ? 'password' : 'text', autocomplete: 'off', placeholder: i.filled.includes(f) ? '•••••• (preenchido)' : '' }); return h('label', { class: 'f' }, LABELS[f] || f, inputs[f]); }),
        h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancelar'), h('button', { class: 'btn primary', type: 'submit' }, 'Salvar'))));
    });
  }
  function test(i) {
    modal(`Testar ${i.label}`, (b, close) => {
      const to = h('input', { placeholder: i.kind === 'email' ? 'seu@email.com' : 'Telefone com DDD' });
      const out = h('p', { class: 'small' });
      b.append(h('div', { class: 'stack' }, h('label', { class: 'f' }, 'Enviar mensagem de teste para', to), out,
        h('button', { class: 'btn primary', onclick: async () => { try { const r = await post(`/api/integrations/${i.kind}/test`, { to: to.value }); out.textContent = (r.status === 'failed' || r.status === 'blocked') ? `Não enviado: ${r.error}` : r.status === 'simulated' ? 'Simulado (modo de testes — nada foi enviado de verdade).' : 'Enviado!'; } catch (e) { fail(e); } } }, 'Enviar')));
    });
  }
  root.append(pageHead('Integrações', 'Conecte os canais do seu salão.'), host);
  await load();
}
