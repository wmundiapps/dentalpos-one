import { h, get, post, patch, api, clear, toast, fail, copyBox, fmtDateTime, modal, passwordInput } from '../lib.js';
import { pageHead } from './_ui.js';
import { applyBrand, luminance } from '../theme.js';

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ROLES = { owner: 'Proprietário', manager: 'Gerente', reception: 'Recepção', staff: 'Profissional' };

export async function render(root, { session }) {
  const isOwner = session.user.role === 'owner';
  const { salon: s } = await get('/api/settings');
  const text = (v, o = {}) => h('input', { value: v ?? '', ...o });
  const name = text(s.name), phone = text(s.phone, { inputmode: 'tel' }), email = text(s.email, { type: 'email' }), address = text(s.address), city = text(s.city);
  const domains = text(s.allowed_domains, { placeholder: 'seusalao.com.br, instagram.com/seusalao' });
  const qs = h('input', { type: 'number', min: 0, max: 23, value: s.quiet_start }), qe = h('input', { type: 'number', min: 0, max: 23, value: s.quiet_end });
  const bot = h('input', { type: 'checkbox', checked: s.bot_enabled });
  const A = s.automations || {};
  const aConf = h('input', { type: 'checkbox', checked: A.confirmation !== false }), aRec = h('input', { type: 'checkbox', checked: A.recall });
  const cb = h('input', { type: 'checkbox', checked: !!s.cashback?.enabled });
  const fd = h('input', { type: 'checkbox', checked: !!s.finder?.enabled });
  const aRem = h('input', { type: 'checkbox', checked: A.reminders }), aBd = h('input', { type: 'checkbox', checked: A.birthday }), aRe = h('input', { type: 'checkbox', checked: A.reactivation });
  const hoursRows = DAYS.map((d, i) => {
    const v = s.hours?.[i]; const on = h('input', { type: 'checkbox', checked: !!v });
    const a = h('input', { type: 'time', value: v?.[0] || '09:00' }), b = h('input', { type: 'time', value: v?.[1] || '19:00' });
    return { i, on, a, b, el: h('div', { class: 'row', style: { padding: '4px 0' } }, h('label', { class: 'check', style: { width: '120px' } }, on, h('span', {}, d)), a, '–', b) };
  });
  const dep = h('input', { type: 'checkbox', checked: s.deposit_required });
  const ret = h('input', { type: 'number', min: 0, max: 100, value: s.noshow_retention_pct ?? 30 }), fch = h('input', { type: 'number', min: 0, max: 168, value: s.free_cancel_hours ?? 24 });
  // ----- Identidade visual e contato -----
  const B = s.brand, DEF = s.brand_defaults, MODES = [['masc', 'Barbearia', 'Preto com letras em ouro'], ['fem', 'Studio feminino', 'Rosa claro'], ['mix', 'Barbearia e Studio', 'Grafite com rosé']];
  let mode = B.mode, colors = { ...B.colors };
  const cMenu = h('input', { type: 'color', value: colors.menu, 'aria-label': 'Cor do menu' }), cAcc = h('input', { type: 'color', value: colors.accent, 'aria-label': 'Cor de destaque' }), cBg = h('input', { type: 'color', value: colors.bg, 'aria-label': 'Cor de fundo' });
  const tagline = text(B.tagline, { maxlength: 90, placeholder: 'Ex.: Cortes e barba com hora marcada' });
  const about = h('textarea', { rows: 3, maxlength: 400, placeholder: 'Conte em poucas linhas o que o seu espaço oferece.' }, B.about || '');
  const wa = text(B.whatsapp, { inputmode: 'tel', placeholder: '(44) 91234-5678' }), ig = text(B.instagram, { placeholder: '@seusalao' }), fb = text(B.facebook, { placeholder: 'seusalao' }), site = text(B.website, { placeholder: 'https://seusite.com.br' });
  const modeBox = h('div', { class: 'seg3', role: 'group', 'aria-label': 'Tipo de espaço' });
  const preview = h('div', { class: 'preview' });
  const logoBox = h('div', { class: 'logo-box' }, s.logo ? h('img', { src: s.logo, alt: 'Logo do salão' }) : (s.name || 'S')[0].toUpperCase());
  function paintPreview() {
    const menuLight = luminance(colors.menu) > 0.45, accLight = luminance(colors.accent) > 0.4;
    clear(preview);
    preview.style.background = colors.bg;
    preview.append(
      h('div', { class: 'pv-side', style: { background: colors.menu, color: menuLight ? '#4a453e' : colors.accent } }, h('b', {}, name.value || 'Seu salão'), h('i', {}), h('i', {}), h('i', {})),
      h('div', { class: 'pv-main' }, h('b', {}, tagline.value || 'Sua frase de destaque'), h('span', { class: 'small muted' }, 'Prévia das cores no painel e na página de agendamento'),
        h('span', { class: 'pv-btn', style: { background: colors.accent, color: accLight ? '#1b1916' : '#fff' } }, 'Agendar horário')));
  }
  function drawModes() {
    clear(modeBox).append(MODES.map(([k, t, d]) => h('button', { type: 'button', class: mode === k ? 'on' : '', 'aria-pressed': String(mode === k), onclick: () => {
      mode = k; colors = { ...DEF[k] }; cMenu.value = colors.menu; cAcc.value = colors.accent; cBg.value = colors.bg; drawModes(); paintPreview();
    } }, h('b', {}, t), h('span', {}, d))));
  }
  for (const [el, key] of [[cMenu, 'menu'], [cAcc, 'accent'], [cBg, 'bg']]) el.addEventListener('input', () => { colors[key] = el.value; paintPreview(); });
  tagline.addEventListener('input', paintPreview); name.addEventListener('input', paintPreview);
  drawModes(); paintPreview();
  async function starter() {
    try { const r = await post('/api/settings/starter-services', { mode }); toast(r.added ? `${r.added} serviços sugeridos cadastrados. Ajuste preços e tempos em Serviços e equipe.` : 'Todos os serviços sugeridos já estão cadastrados.', 'ok'); } catch (ex) { fail(ex); }
  }
  const chk = (el, label) => h('label', { class: 'check' }, el, h('span', {}, label));

  async function save(e) {
    e.preventDefault();
    const hours = Object.fromEntries(hoursRows.map((r) => [r.i, r.on.checked ? [r.a.value, r.b.value] : null]));
    try {
      await patch('/api/settings', { name: name.value, phone: phone.value || undefined, email: email.value || undefined, address: address.value || undefined, city: city.value || undefined,
        brand: { mode, colors, tagline: tagline.value, about: about.value, whatsapp: wa.value, instagram: ig.value, facebook: fb.value, website: site.value },
        allowed_domains: domains.value, quiet_start: Number(qs.value), quiet_end: Number(qe.value), deposit_required: dep.checked, noshow_retention_pct: Number(ret.value), free_cancel_hours: Number(fch.value), bot_enabled: bot.checked, hours,
        cashback: { enabled: cb.checked },
        finder: { enabled: fd.checked },
        automations: { confirmation: aConf.checked, recall: aRec.checked, reminders: aRem.checked, birthday: aBd.checked, reactivation: aRe.checked } });
      toast('Configurações salvas', 'ok');
      if (!session.salon.brand || session.salon.brand.mode !== mode || JSON.stringify(session.salon.brand.colors) !== JSON.stringify(colors) || session.salon.name !== name.value) setTimeout(() => location.reload(), 700);
    } catch (ex) { fail(ex); }
  }
  async function logoUpload(e) {
    const f = e.target.files[0]; if (!f) return;
    try { const r = await api('POST', '/api/settings/logo', await f.arrayBuffer(), { raw: true, contentType: f.type }); clear(logoBox).append(h('img', { src: r.logo, alt: 'Logo do salão' })); toast('Logo atualizada', 'ok'); } catch (ex) { fail(ex); }
  }
  const users = h('div', {});
  async function loadUsers() {
    const { users: list } = await get('/api/users');
    clear(users).append(h('div', { class: 'scroll-x' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, ['Nome', 'E-mail', 'Função', '2FA', 'Último acesso', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, list.map((u) => h('tr', {}, h('td', {}, u.name), h('td', {}, u.email), h('td', {}, ROLES[u.role]), h('td', {}, u.totp_enabled ? '✓' : '—'), h('td', {}, u.last_login_at ? fmtDateTime(u.last_login_at, session.salon.timezone) : '—'),
        h('td', {}, isOwner && u.role !== 'owner' ? h('button', { class: 'btn sm', onclick: async () => { try { await patch(`/api/users/${u.id}`, { active: u.active ? 0 : 1 }); loadUsers(); } catch (ex) { fail(ex); } } }, u.active ? 'Desativar' : 'Ativar') : null)))))));
  }
  function newUser() {
    modal('Novo usuário', (b, close) => {
      const n = h('input'), em = h('input', { type: 'email' }), pw = passwordInput({ autocomplete: 'new-password' }), role = h('select', {}, ['manager', 'reception', 'staff'].map((r) => h('option', { value: r }, ROLES[r])));
      b.append(h('div', { class: 'stack' }, h('label', { class: 'f' }, 'Nome', n), h('label', { class: 'f' }, 'E-mail', em), h('label', { class: 'f' }, 'Senha inicial', pw), h('label', { class: 'f' }, 'Função', role),
        h('button', { class: 'btn primary', onclick: async () => { try { await post('/api/users', { name: n.value, email: em.value, password: pw.value, role: role.value }); toast('Usuário criado', 'ok'); close(); loadUsers(); } catch (ex) { fail(ex); } } }, 'Criar')));
    });
  }
  root.append(pageHead('Configurações', 'Dados do salão, horários, automações e equipe de acesso.'),
    h('form', { class: 'stack', onsubmit: save },
      h('div', { class: 'card stack' }, h('h3', {}, 'Identidade visual'),
        h('p', { class: 'small muted' }, 'Escolha o tipo do seu espaço. As cores mudam para o padrão do tipo, e você pode ajustar cada uma.'),
        modeBox,
        h('div', { class: 'swatches' }, f('Cor do menu', cMenu), f('Cor de destaque (botões e letras)', cAcc), f('Cor de fundo', cBg)),
        h('button', { type: 'button', class: 'btn sm', style: { alignSelf: 'flex-start' }, onclick: () => { colors = { ...DEF[mode] }; cMenu.value = colors.menu; cAcc.value = colors.accent; cBg.value = colors.bg; paintPreview(); } }, 'Voltar às cores padrão do tipo'),
        preview,
        h('div', { class: 'row wrap' }, logoBox, h('label', { class: 'f grow' }, 'Logo (PNG, JPG ou WEBP, até 2 MB)', h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', onchange: logoUpload }))),
        f('Frase de destaque', tagline), f('Sobre o espaço', about),
        h('div', { class: 'row wrap' }, h('button', { type: 'button', class: 'btn sm', onclick: starter }, 'Cadastrar serviços sugeridos deste tipo'), h('span', { class: 'small muted' }, 'Só adiciona os que ainda não existem.'))),
      h('div', { class: 'card' }, h('h3', {}, 'Dados e contato do salão'), h('p', { class: 'small muted', style: { marginBottom: '10px' } }, 'Aparecem na página de agendamento para o cliente falar com você.'),
        h('div', { class: 'grid g2' }, f('Nome do salão', name), f('WhatsApp', wa), f('Telefone', phone), f('E-mail', email), f('Instagram', ig), f('Facebook', fb), f('Site', site), f('Cidade', city)), f('Endereço', address)),
      h('div', { class: 'card' }, h('h3', {}, 'Página de agendamento online'), copyBox(s.booking_url), h('p', { class: 'small muted' }, 'Divulgue este link no Instagram, Google e WhatsApp.')),
      h('div', { class: 'card' }, h('h3', {}, 'Reserva paga e política de não comparecimento'),
        h('div', { class: 'stack-sm' }, chk(dep, 'Exigir pagamento antecipado (Pix ou cartão, pelo seu Asaas) na página de agendamento')),
        h('div', { class: 'row', style: { marginTop: '10px' } }, f('Retenção por falta (%)', ret), f('Cancelamento sem custo até (h antes)', fch)),
        h('p', { class: 'small muted' }, 'O cliente precisa aceitar a política para reservar. Falta: o salão retém o percentual e devolve o resto. Conecte o Asaas em Integrações antes de ativar.')),
      h('div', { class: 'card' }, h('h3', {}, 'Horário de funcionamento'), hoursRows.map((r) => r.el)),
      h('div', { class: 'card' }, h('h3', {}, 'Automações e robô'),
        h('div', { class: 'stack-sm' }, chk(bot, 'Robô de atendimento ligado (WhatsApp, Instagram, Facebook)'), chk(aConf, 'Confirmação na hora do agendamento (cliente responde 1 para confirmar)'), chk(aRem, 'Lembretes de agendamento (24h e 2h antes)'), chk(aRec, 'Recall: chamar o cliente para voltar no ciclo de cada serviço (só quem autorizou)'), chk(aBd, 'Mensagem de aniversário'), chk(aRe, 'Reativar clientes sumidos (só quem autorizou)')),
        h('div', { class: 'row', style: { marginTop: '10px' } }, f('Sem envios a partir das (h)', qs), f('até as (h)', qe))),
      h('div', { class: 'card stack' }, h('h3', {}, 'Cashbacksmart'),
        h('p', { class: 'small muted' }, 'Programa de cashback: o cliente ganha parte do valor de volta para usar no seu espaço. Marque para o seu salão participar. Cada cliente também escolhe participar na página de agendamento ou no cadastro.'),
        chk(cb, 'Quero que o meu salão participe do Cashbacksmart'),
        s.cashback?.enabled ? h('p', { class: 'small' }, `Adesão registrada em ${new Date(s.cashback.accepted_at).toLocaleDateString('pt-BR')}. A liberação do saldo acontece quando a integração com o Cashbacksmart for concluída.`) : null),
      h('div', { class: 'card stack' }, h('h3', {}, 'Indicador de profissionais'),
        h('p', { class: 'small muted' }, 'Clientes que procuram um serviço na sua cidade podem encontrar o seu salão. Só aparecem o nome do salão, a cidade e os serviços; telefone, e-mail e endereço nunca são mostrados. O cliente pede contato e você recebe um aviso automático por e-mail (e por WhatsApp ou SMS, se estiverem conectados). O contato do cliente fica em Leads.'),
        chk(fd, 'Quero aparecer no indicador de profissionais da minha cidade'),
        s.finder?.enabled ? h('p', { class: 'small' }, `Participação registrada em ${new Date(s.finder.accepted_at).toLocaleDateString('pt-BR')}. Confira se a cidade do salão está preenchida e se os serviços estão cadastrados.`) : null),
      h('div', { class: 'card' }, h('h3', {}, 'Proteção contra golpes (anti-phishing)'), f('Domínios permitidos em mensagens enviadas', domains), h('p', { class: 'small muted' }, 'Links para outros endereços, encurtadores e domínios suspeitos são bloqueados antes do envio.')),
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn primary', type: 'submit' }, 'Salvar alterações'))),
    h('div', { class: 'card', style: { marginTop: '14px' } }, h('div', { class: 'row spread' }, h('h3', {}, 'Usuários e permissões'), isOwner ? h('button', { class: 'btn sm primary', onclick: newUser }, '+ Novo usuário') : null), users));
  await loadUsers();
}
const f = (l, el) => h('label', { class: 'f' }, l, el);
