// AlignSystem — painel da equipe (admin) e do dentista parceiro.
(function () {
  'use strict';
  var esc = AS.esc;
  var api = AS.api;
  var root = document.getElementById('root');
  var me = null;

  // ------------------------------------------------------------ helpers de UI
  function $(s, el) { return (el || document).querySelector(s); }
  function $all(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function opt(value, label, sel) { return '<option value="' + esc(value) + '"' + (String(sel) === String(value) ? ' selected' : '') + '>' + esc(label) + '</option>'; }
  function options(map, sel, empty) {
    var out = empty !== undefined ? opt('', empty, sel) : '';
    Object.keys(map).forEach(function (k) { out += opt(k, map[k], sel); });
    return out;
  }
  function field(id, label, value, attrs) {
    return '<div class="field"><label for="' + id + '">' + esc(label) + '</label><input id="' + id + '" name="' + id + '" value="' + esc(value == null ? '' : value) + '" ' + (attrs || '') + '></div>';
  }
  function area(id, label, value) {
    return '<div class="field"><label for="' + id + '">' + esc(label) + '</label><textarea id="' + id + '" name="' + id + '">' + esc(value || '') + '</textarea></div>';
  }
  function formData(form) {
    var o = {};
    $all('input,select,textarea', form).forEach(function (el) {
      if (!el.name) return;
      o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return o;
  }
  function flash(el, kind, text) {
    if (!el) return;
    el.innerHTML = '<div class="msg ' + kind + '">' + esc(text) + '</div>';
    if (kind === 'ok') setTimeout(function () { if (el) el.innerHTML = ''; }, 3500);
  }
  function busyBtn(btn, p) {
    if (btn) btn.disabled = true;
    return p.then(function (x) { if (btn) btn.disabled = false; return x; }, function (e) { if (btn) btn.disabled = false; throw e; });
  }
  function onSubmit(form, fn) {
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('button[type=submit]', form);
      var msg = $('.fmsg', form);
      busyBtn(btn, Promise.resolve().then(function () { return fn(formData(form), form); }))
        .then(function (text) { if (text !== false) flash(msg, 'ok', text || 'Salvo.'); })
        .catch(function (err) { flash(msg, 'err', err.message); });
    });
  }
  function statusBadge(label, kind) { return '<span class="badge ' + (kind || '') + '">' + esc(label) + '</span>'; }
  function photoUrl(id) { return '/api/photos/' + id; }
  function gallery(photos, opts) {
    opts = opts || {};
    if (!photos.length) return '<p class="muted small">Nenhuma foto.</p>';
    return '<div class="gallery">' + photos.map(function (p) {
      var isPdf = p.mime === 'application/pdf';
      var cap = p.slot ? (opts.slots && opts.slots[p.slot - 1] ? p.slot + '. ' + opts.slots[p.slot - 1].title : 'Foto ' + p.slot) : (p.kind === 'documento' ? 'Documento' : p.kind === 'evidencia' ? 'Atendimento' : 'Extra');
      return '<figure>' + (isPdf ? '<a href="' + photoUrl(p.id) + '" target="_blank" style="display:flex;aspect-ratio:4/3;align-items:center;justify-content:center">PDF</a>'
        : '<img loading="lazy" alt="' + esc(cap) + '" src="' + photoUrl(p.id) + '">') +
        '<figcaption><span>' + esc(cap) + '</span>' + (opts.canDelete ? '<button class="btn btn-sm btn-danger" data-delphoto="' + p.id + '" title="Excluir">×</button>' : '') + '</figcaption></figure>';
    }).join('') + '</div>';
  }
  function bindGallery(scope, reload) {
    $all('.gallery img', scope).forEach(function (img) { img.addEventListener('click', function () { AS.lightbox(img.src); }); });
    $all('[data-delphoto]', scope).forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Excluir esta foto?')) return;
        api('/api/admin/photos/' + b.getAttribute('data-delphoto'), { method: 'DELETE' }).then(reload).catch(function (e) { alert(e.message); });
      });
    });
  }
  function uploadFiles(files, url) {
    var list = Array.prototype.slice.call(files || []);
    return list.reduce(function (p, f) {
      return p.then(function () { return AS.compress(f); }).then(function (blob) { return api(url, { method: 'POST', body: blob }); });
    }, Promise.resolve());
  }
  function toLocalInput(d) {
    var x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return x.toISOString().slice(0, 16);
  }
  var KIND_APPT = { teleorientacao: 'Teleorientação (vídeo)', documentacao: 'Documentação (presencial)', consulta: 'Consulta (presencial)' };
  var APPT_STATUS = { agendado: 'Agendado', realizado: 'Realizado', cancelado: 'Cancelado', faltou: 'Faltou' };

  // ------------------------------------------------------------ layout
  function shell(content, active) {
    var nav = me.role === 'admin'
      ? [['#/', 'Início', 'inicio'], ['#/casos', 'Pacientes', 'casos'], ['#/parceiros', 'Dentistas parceiros', 'parceiros'], ['#/equipe', 'Equipe', 'equipe'], ['#/conta', 'Minha conta', 'conta']]
      : [['#/', 'Meus casos', 'inicio'], ['#/conta', 'Minha conta', 'conta']];
    return '<div class="mobile-top"><span class="logo">Align<em>System</em></span><button class="btn btn-sm btn-line" style="color:#fff;border-color:rgba(255,255,255,.4)" id="menuBtn">Menu</button></div>' +
      '<div class="shell"><aside class="side" id="side"><span class="logo">Align<em>System</em></span>' +
      nav.map(function (n) { return '<a class="nav' + (n[2] === active ? ' on' : '') + '" href="' + n[0] + '">' + esc(n[1]) + '</a>'; }).join('') +
      '<div class="who">' + esc(me.name) + '<br>' + esc(me.email) + '<br><a href="#" id="logout" style="color:#6FD1C2">Sair</a></div></aside>' +
      '<main class="main" id="main">' + content + '</main></div>';
  }
  function mount(content, active) {
    root.innerHTML = shell(content, active);
    $('#menuBtn').addEventListener('click', function () { $('#side').classList.toggle('open'); });
    $('#logout').addEventListener('click', function (e) {
      e.preventDefault();
      api('/api/auth/logout', { method: 'POST', body: {} }).then(function () { location.hash = ''; boot(); });
    });
    return $('#main');
  }
  function loading(active) { mount('<div class="center" style="padding:40px"><span class="spinner"></span></div>', active); }
  function errorView(e, active) { mount('<div class="msg err">' + esc(e.message) + '</div>', active); }

  // ------------------------------------------------------------ login
  function loginView() {
    root.innerHTML = '<div class="top"><div class="in"><a class="logo" href="/">Align<em>System</em></a></div></div>' +
      '<main class="container" style="max-width:440px"><form class="card" id="lf"><h1>Entrar no painel</h1>' +
      '<p class="muted small">Equipe AlignSystem e dentistas parceiros.</p>' +
      field('email', 'E-mail', '', 'type="email" autocomplete="username" required') +
      field('password', 'Senha', '', 'type="password" autocomplete="current-password" required') +
      '<button class="btn btn-primary" type="submit">Entrar</button> <a href="#" id="forgot" class="small" style="margin-left:10px">Esqueci a senha</a><div class="fmsg"></div></form>' +
      '<p class="small muted center">Dentista e ainda não é parceiro? <a href="/parceiros#credenciamento">Cadastre-se</a></p></main>';
    onSubmit($('#lf'), function (d) {
      return api('/api/auth/login', { method: 'POST', body: d }).then(function () { boot(); return false; });
    });
    $('#forgot').addEventListener('click', function (e) {
      e.preventDefault();
      var email = $('#email').value || prompt('Seu e-mail:');
      if (!email) return;
      api('/api/auth/forgot', { method: 'POST', body: { email: email } }).then(function () {
        flash($('.fmsg'), 'ok', 'Se o e-mail estiver cadastrado, enviamos um link para criar nova senha.');
      }).catch(function (err) { flash($('.fmsg'), 'err', err.message); });
    });
  }

  // ------------------------------------------------------------ conta
  function accountView() {
    var m = mount('<h1>Minha conta</h1><form class="card" id="pf" style="max-width:480px"><h2>Trocar senha</h2>' +
      field('current', 'Senha atual', '', 'type="password" autocomplete="current-password" required') +
      field('password', 'Nova senha (mín. 10 caracteres, letras e números)', '', 'type="password" autocomplete="new-password" minlength="10" required') +
      '<button class="btn btn-primary" type="submit">Salvar nova senha</button><div class="fmsg"></div></form>', 'conta');
    onSubmit($('#pf', m), function (d, f) {
      return api('/api/auth/password', { method: 'POST', body: d }).then(function () { f.reset(); return 'Senha alterada.'; });
    });
  }

  // ------------------------------------------------------------ ADMIN: início
  function adminHome() {
    loading('inicio');
    api('/api/admin/overview').then(function (d) {
      var L = d.labels;
      var warn = [];
      if (!d.integrations.asaas) warn.push('Cobranças: configure a chave do Asaas (ASAAS_API_KEY) na Vercel para emitir cobranças com split.');
      else if (d.integrations.asaas === 'sandbox') warn.push('Cobranças em modo de TESTE (sandbox do Asaas). Troque ASAAS_ENV para "production" quando a conta real estiver aprovada.');
      if (!d.integrations.email) warn.push('E-mail: configure SMTP (contato@alignsystem.com.br) ou Resend para enviar avisos automáticos.');
      if (!d.integrations.whatsapp) warn.push('WhatsApp: defina o número real em PUBLIC_WHATSAPP (os botões das páginas usam esse número).');
      if (!d.integrations.contractsReviewed) warn.push('Contratos: exibidos como "minuta em revisão jurídica" até CONTRACTS_REVIEWED=true.');
      var cs = function (k) { return d.cases[k] || 0; };
      var html = '<h1>Início</h1>' +
        (warn.length ? '<div class="card"><h2>Pendências de configuração</h2>' + warn.map(function (w) { return '<div class="msg warn">' + esc(w) + '</div>'; }).join('') + '</div>' : '') +
        '<div class="stats">' +
        '<a class="stat" href="#/casos?status=novo" style="text-decoration:none;color:inherit"><b>' + cs('novo') + '</b><span>Novos contatos</span></a>' +
        '<a class="stat" href="#/casos?status=fotos_enviadas" style="text-decoration:none;color:inherit"><b>' + cs('fotos_enviadas') + '</b><span>Fotos aguardando parecer</span></a>' +
        '<a class="stat" href="#/casos?status=contrato_enviado" style="text-decoration:none;color:inherit"><b>' + cs('contrato_enviado') + '</b><span>Contratos aguardando aceite</span></a>' +
        '<a class="stat" href="#/casos?status=em_tratamento" style="text-decoration:none;color:inherit"><b>' + cs('em_tratamento') + '</b><span>Em tratamento</span></a>' +
        '<a class="stat" href="#/parceiros" style="text-decoration:none;color:inherit"><b>' + ((d.dentists.lead || 0) + (d.dentists.em_analise || 0)) + '</b><span>Dentistas aguardando análise</span></a>' +
        '<div class="stat"><b>' + esc(AS.money(d.paid30.total)) + '</b><span>Recebido em 30 dias</span></div>' +
        '</div><div class="card"><h2>Funil de pacientes</h2><div class="list">' +
        Object.keys(L.CASE_STATUS).map(function (k) { return '<div class="it"><a href="#/casos?status=' + k + '">' + esc(L.CASE_STATUS[k]) + '</a><b>' + cs(k) + '</b></div>'; }).join('') +
        '</div></div>';
      mount(html, 'inicio');
    }).catch(function (e) { errorView(e, 'inicio'); });
  }

  // ------------------------------------------------------------ ADMIN: lista de casos
  function adminCases(query) {
    loading('casos');
    var status = query.status || '';
    var q = query.q || '';
    api('/api/admin/cases?status=' + encodeURIComponent(status) + '&q=' + encodeURIComponent(q)).then(function (d) {
      var L = d.labels;
      var html = '<h1>Pacientes</h1><form class="row" id="sf" style="margin-bottom:12px"><input name="q" value="' + esc(q) + '" placeholder="Buscar por nome, cidade, WhatsApp ou nº do caso" style="max-width:380px"><button class="btn btn-line btn-sm" type="submit">Buscar</button></form>' +
        '<div class="tabs"><button data-st=""' + (status ? '' : ' class="on"') + '>Todos</button>' +
        Object.keys(L).map(function (k) { return '<button data-st="' + k + '"' + (status === k ? ' class="on"' : '') + '>' + esc(L[k]) + '</button>'; }).join('') + '</div>' +
        '<div class="card table-wrap" style="padding:8px 12px">' + (d.cases.length ? '<table class="t"><thead><tr><th>#</th><th>Paciente</th><th>Cidade</th><th>Situação</th><th>Fotos</th><th>Dentista</th><th>Entrada</th></tr></thead><tbody>' +
        d.cases.map(function (c) {
          return '<tr class="click" data-go="#/caso/' + c.id + '"><td>' + c.code + '</td><td><b>' + esc(c.name) + '</b><div class="small muted">' + esc(AS.phone(c.whatsapp)) + '</div></td><td>' + esc(c.city) + '</td><td>' +
            statusBadge(L[c.status], c.status === 'fotos_enviadas' ? 'honey' : c.status === 'perdido' ? 'red' : '') + '</td><td>' + c.photo_count + '/7</td><td>' + esc(c.dentist_name || '—') + '</td><td class="small">' + esc(AS.date(c.created_at)) + '</td></tr>';
        }).join('') + '</tbody></table>' : '<p class="muted" style="padding:14px">Nenhum paciente encontrado.</p>') + '</div>';
      var m = mount(html, 'casos');
      $all('[data-go]', m).forEach(function (tr) { tr.addEventListener('click', function () { location.hash = tr.getAttribute('data-go'); }); });
      $all('[data-st]', m).forEach(function (b) { b.addEventListener('click', function () { location.hash = '#/casos?status=' + b.getAttribute('data-st') + (q ? '&q=' + encodeURIComponent(q) : ''); }); });
      $('#sf', m).addEventListener('submit', function (e) { e.preventDefault(); location.hash = '#/casos?status=' + status + '&q=' + encodeURIComponent($('#sf input', m).value); });
    }).catch(function (e) { errorView(e, 'casos'); });
  }

  // ------------------------------------------------------------ ADMIN: caso
  function adminCase(id) {
    loading('casos');
    Promise.all([api('/api/admin/cases/' + id), api('/api/admin/dentists')]).then(function (res) {
      var d = res[0];
      var dentists = res[1].dentists.filter(function (x) { return x.status === 'ativo' || x.status === 'aprovado' || x.id === d.case.dentist_id; });
      var c = d.case;
      var L = d.labels;
      var plan = c.plan || {};
      var dentistName = (dentists.filter(function (x) { return x.id === c.dentist_id; })[0] || {}).name;
      var evalPhotos = d.photos.filter(function (p) { return p.kind === 'avaliacao'; });
      var otherPhotos = d.photos.filter(function (p) { return p.kind === 'extra' || p.kind === 'documento'; });
      var portalMsg = 'Olá, ' + c.name.split(' ')[0] + '! Aqui é da AlignSystem. Este é o seu link pessoal da avaliação, onde você envia as fotos e acompanha tudo: ' + c.portalUrl;

      var html = '<p><a href="#/casos">← Pacientes</a></p>' +
        '<div class="row" style="justify-content:space-between"><div><h1 style="margin:0">' + esc(c.name) + '</h1><p class="muted">Caso nº ' + c.code + ' · ' + esc(c.city) + ' · entrou em ' + esc(AS.date(c.created_at, true)) + '</p></div>' +
        '<div class="row"><a class="btn btn-green btn-sm" target="_blank" rel="noopener" href="' + esc(AS.waLink(c.whatsapp)) + '">WhatsApp</a>' +
        '<a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="' + esc(AS.waLink(c.whatsapp, portalMsg)) + '">Enviar link das fotos</a>' +
        '<button class="btn btn-line btn-sm" id="copyPortal">Copiar link do paciente</button></div></div>' +

        '<div class="grid2">' +
        // status + parecer
        '<form class="card" id="stf"><h2>Situação e parecer</h2>' +
        '<div class="field"><label for="status">Situação</label><select id="status" name="status">' + options(L.CASE_STATUS, c.status) + '</select></div>' +
        '<div class="field"><label for="assessment">Parecer da pré-avaliação</label><select id="assessment" name="assessment">' + options(L.ASSESSMENT, c.assessment || '', '— sem parecer —') + '</select></div>' +
        area('assessment_notes', 'Texto do parecer (o paciente vê)', c.assessment_notes) +
        '<div class="field"><label for="dentist_id">Dentista responsável</label><select id="dentist_id" name="dentist_id">' + opt('', '— definir —', c.dentist_id || '') +
        dentists.map(function (x) { return opt(x.id, x.name + ' · ' + x.city, c.dentist_id || ''); }).join('') + '</select></div>' +
        '<div class="row"><button class="btn btn-primary" type="submit">Salvar</button>' +
        '<button class="btn btn-green" type="button" id="publish">' + (c.assessment_published_at ? 'Republicar parecer' : 'Publicar parecer ao paciente') + '</button></div>' +
        (c.assessment_published_at ? '<p class="small muted" style="margin-top:8px">Publicado em ' + esc(AS.date(c.assessment_published_at, true)) + '</p>' : '') +
        '<div class="fmsg"></div></form>' +

        // dados
        '<form class="card" id="df"><h2>Dados do paciente</h2><div class="grid2">' +
        field('name', 'Nome', c.name) + field('whatsapp', 'WhatsApp', c.whatsapp) +
        field('email', 'E-mail', c.email, 'type="email"') + field('city', 'Cidade', c.city) +
        field('cpf', 'CPF (para contrato e cobrança)', c.cpf) + field('postal_code', 'CEP', c.postal_code) + '</div>' +
        field('address', 'Endereço completo', c.address) +
        '<div class="grid2">' + field('reason', 'Motivo', c.reason) + field('referred_by', 'Indicado por', c.referred_by) + '</div>' +
        area('internal_notes', 'Anotações internas (o paciente não vê)', c.internal_notes) +
        '<p class="small muted">Idade: ' + esc(c.age) + ' · Consentimento LGPD em ' + esc(AS.date(c.consent_at, true)) + (c.source && c.source.utm_source ? ' · Origem: ' + esc(c.source.utm_source + (c.source.utm_campaign ? ' / ' + c.source.utm_campaign : '')) : '') + '</p>' +
        '<button class="btn btn-primary" type="submit">Salvar dados</button><div class="fmsg"></div></form>' +
        '</div>' +

        // termo de consentimento (TCLE)
        '<div class="card"><h2>Termo de consentimento (atendimento a distância)</h2>' +
        (d.consents && d.consents.length ? '<div class="list">' + d.consents.map(function (k) {
          return '<div class="it"><div><b>Aceito em ' + esc(AS.date(k.accepted_at, true)) + '</b><div class="small muted">por ' + esc(k.accepted_name) +
            (k.accepted_by_guardian ? ' (responsável legal)' : '') + ' · IP ' + esc(k.ip) + ' · versão ' + esc(k.version) + '</div></div>' +
            '<a class="btn btn-line btn-sm" target="_blank" href="/api/admin/consents/' + k.id + '/comprovante">Comprovante</a></div>';
        }).join('') + '</div>' : '<div class="msg warn">O paciente ainda não aceitou o termo. O envio de fotos e a teleorientação ficam bloqueados até o aceite.</div>') +
        '</div>' +

        // fotos
        '<div class="card" id="photosCard"><h2>Fotos da pré-avaliação (' + evalPhotos.length + '/7)</h2>' +
        (c.photos_submitted_at ? '<p class="small muted">Enviadas pelo paciente em ' + esc(AS.date(c.photos_submitted_at, true)) + '</p>' : '') +
        gallery(evalPhotos, { slots: d.slots, canDelete: true }) +
        '<h3 style="margin-top:18px">Outras fotos e documentos</h3>' + gallery(otherPhotos, { canDelete: true }) +
        '<div class="row" style="margin-top:12px"><label class="btn btn-line btn-sm" style="margin:0">Anexar fotos/PDF (documentação, radiografia)<input type="file" id="docUp" multiple accept="image/*,application/pdf" class="hidden"></label><span class="upmsg small"></span></div></div>' +

        // agenda
        '<div class="card"><h2>Teleorientação e agendamentos</h2>' +
        (d.appointments.length ? '<div class="list">' + d.appointments.map(function (a) {
          return '<div class="it"><div><b>' + esc(KIND_APPT[a.kind]) + '</b> · ' + esc(AS.date(a.starts_at, true)) + '<div class="small muted">' + esc(a.dentist_name || 'Equipe') + (a.location ? ' · ' + esc(a.location) : '') +
            (a.room_url ? ' · <a target="_blank" rel="noopener" href="' + esc(a.room_url) + '">sala de vídeo</a>' : '') + '</div></div>' +
            '<select data-appt="' + a.id + '" style="max-width:160px">' + options(APPT_STATUS, a.status) + '</select></div>';
        }).join('') + '</div>' : '<p class="muted small">Nada agendado.</p>') +
        '<form id="apf" style="margin-top:14px"><div class="grid3">' +
        '<div class="field"><label for="kind">Tipo</label><select id="kind" name="kind">' + options(KIND_APPT, 'teleorientacao') + '</select></div>' +
        field('starts_at', 'Data e hora', toLocalInput(new Date(Date.now() + 86400000)), 'type="datetime-local" required') +
        field('duration_min', 'Duração (min)', 30, 'type="number" min="10" max="180"') + '</div>' +
        field('location', 'Local (presencial) ou observação', '') +
        '<button class="btn btn-green btn-sm" type="submit">Agendar e avisar</button><span class="small muted" style="margin-left:8px">Teleorientação gera a sala de vídeo automaticamente.</span><div class="fmsg"></div></form></div>' +

        // plano + contrato
        '<div class="grid2"><form class="card" id="plf"><h2>Plano e contrato</h2><p class="small muted">Valores tratados em particular com o paciente; nunca aparecem nas páginas públicas.</p><div class="grid2">' +
        '<div class="field"><label for="brand">Marca do alinhador</label><input id="brand" name="brand" list="brands" value="' + esc(plan.brand || '') + '"><datalist id="brands"><option>ClearCorrect</option><option>Invisalign</option><option>Marca nacional</option></datalist></div>' +
        field('months', 'Duração estimada (meses)', plan.months, 'type="number" min="1" max="36"') +
        field('total', 'Valor total (R$)', plan.total, 'inputmode="decimal"') +
        field('entry', 'Entrada (R$)', plan.entry, 'inputmode="decimal"') +
        field('entryInstallments', 'Entrada em até (x no cartão)', plan.entryInstallments || 18, 'type="number" min="1" max="18"') +
        field('monthlyCount', 'Nº de mensalidades', plan.monthlyCount, 'type="number" min="1" max="36"') +
        field('monthlyValue', 'Valor da mensalidade (R$)', plan.monthlyValue, 'inputmode="decimal"') +
        field('dueDay', 'Dia do vencimento', plan.dueDay, 'type="number" min="1" max="28"') +
        field('replacementValue', 'Reposição de alinhador (R$/un.)', plan.replacementValue, 'inputmode="decimal"') + '</div>' +
        area('treatmentNotes', 'Anexo I — resumo do plano de tratamento', plan.treatmentNotes) +
        '<div class="row"><button class="btn btn-primary" type="submit">Salvar plano</button><button class="btn btn-green" type="button" id="genContract">Gerar contrato para aceite</button></div><div class="fmsg"></div>' +
        (d.contracts.length ? '<div class="list" style="margin-top:14px">' + d.contracts.map(function (ct) {
          return '<div class="it"><div><b>' + esc(ct.title) + '</b><div class="small muted">' + esc(AS.date(ct.created_at, true)) + ' · ' +
            (ct.status === 'aceito' ? 'aceito por ' + esc(ct.accepted_name) + ' em ' + esc(AS.date(ct.accepted_at, true)) + ' (IP ' + esc(ct.accepted_ip) + ')' : esc(ct.status)) + '</div></div>' +
            (ct.status !== 'cancelado' ? '<div class="row"><a class="btn btn-line btn-sm" target="_blank" href="' + esc(ct.url) + '">Abrir</a><button type="button" class="btn btn-line btn-sm" data-copy="' + esc(ct.url) + '">Copiar link</button>' +
              (ct.status === 'enviado' ? '<a class="btn btn-green btn-sm" target="_blank" rel="noopener" href="' + esc(AS.waLink(c.whatsapp, 'Olá, ' + c.name.split(' ')[0] + '! Seu contrato AlignSystem está pronto para leitura e aceite: ' + ct.url)) + '">Enviar no WhatsApp</a>' : '') + '</div>' : '') + '</div>';
        }).join('') + '</div>' : '') + '</form>' +

        // cobranças
        '<form class="card" id="chf"><h2>Cobranças (Asaas)</h2>' +
        '<div class="grid2"><div class="field"><label for="ckind">Tipo</label><select id="ckind" name="kind">' +
        opt('parcelada', 'Entrada parcelada no cartão', 'parcelada') + opt('avulsa', 'Cobrança única (ex.: documentação)', '') + opt('assinatura', 'Mensalidades (recorrente)', '') + '</select></div>' +
        '<div class="field"><label for="billingType">Forma</label><select id="billingType" name="billingType">' +
        opt('CREDIT_CARD', 'Cartão de crédito', 'CREDIT_CARD') + opt('UNDEFINED', 'Paciente escolhe (Pix, boleto ou cartão)', '') + opt('PIX', 'Pix', '') + opt('BOLETO', 'Boleto', '') + '</select></div>' +
        field('description', 'Descrição', 'AlignSystem — entrada do tratamento (caso ' + c.code + ')') +
        field('value', 'Valor total (R$) — na recorrente, valor de cada mensalidade', plan.entry || '', 'inputmode="decimal" required') +
        field('installmentCount', 'Parcelas (cartão até 18x)', plan.entryInstallments || 18, 'type="number" min="2" max="36"') +
        field('maxPayments', 'Nº de mensalidades (recorrente)', plan.monthlyCount || '', 'type="number" min="1" max="36"') +
        field('dueDate', 'Primeiro vencimento', new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), 'type="date"') +
        '<div class="field"><label for="splitType">Repasse ao dentista (split)</label><select id="splitType" name="splitType">' + opt('none', 'Sem repasse nesta cobrança', 'none') + opt('fixed', 'Valor fixo (R$, total)', '') + opt('percent', 'Percentual (%)', '') + '</select></div>' +
        field('splitValue', 'Valor do repasse', '', 'inputmode="decimal"') + '</div>' +
        '<p class="small muted">Repasse vai para a conta de recebimento de ' + esc(dentistName || 'o dentista do caso') + '. Taxas do Asaas são descontadas da AlignSystem.</p>' +
        '<button class="btn btn-primary" type="submit">Criar cobrança e enviar ao paciente</button><div class="fmsg"></div>' +
        (d.charges.length ? '<div class="list" style="margin-top:14px">' + d.charges.map(function (ch) {
          var pays = d.payments.filter(function (p) { return p.charge_id === ch.id; });
          var paid = pays.filter(function (p) { return /RECEIVED|CONFIRMED/.test(p.status); }).length;
          return '<div class="it"><div><b>' + esc(ch.description) + '</b><div class="small muted">' + esc(AS.money(ch.value)) + ' · ' + esc(ch.kind) +
            (pays.length ? ' · ' + paid + '/' + pays.length + ' pagas' : '') + (ch.split ? ' · repasse ' + (ch.split.type === 'percent' ? ch.split.value + '%' : AS.money(ch.split.value)) : '') + ' · ' + statusBadge(ch.statusLabel, ch.status === 'cancelado' || ch.status === 'erro' ? 'red' : '') + '</div></div>' +
            '<div class="row">' + (ch.invoice_url ? '<a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="' + esc(ch.invoice_url) + '">Fatura</a><button type="button" class="btn btn-line btn-sm" data-copy="' + esc(ch.invoice_url) + '">Copiar</button>' : '') +
            (ch.status !== 'cancelado' && ch.status !== 'erro' ? '<button type="button" class="btn btn-line btn-sm" data-sync="' + ch.id + '">Atualizar</button><button type="button" class="btn btn-danger btn-sm" data-cancel="' + ch.id + '">Cancelar</button>' : '') + '</div></div>';
        }).join('') + '</div>' : '') + '</form></div>' +

        // evidências
        '<div class="card"><h2>Atendimentos registrados pelo dentista</h2>' + (d.evidences.length ? '<div class="list">' + d.evidences.map(function (e) {
          var ph = d.photos.filter(function (p) { return p.evidence_id === e.id; });
          return '<div class="it" style="display:block"><div class="row" style="justify-content:space-between"><div><b>' + esc(L.MILESTONES[e.milestone]) + '</b> · ' + esc(AS.date(e.performed_at)) + ' · ' + esc(e.dentist_name || '') + '</div>' +
            (e.validated_at ? statusBadge('Validado em ' + AS.date(e.validated_at), 'green') : '<button class="btn btn-green btn-sm" data-validate="' + e.id + '">Validar atendimento</button>') + '</div>' +
            (e.notes ? '<p class="small" style="white-space:pre-line;margin-top:6px">' + esc(e.notes) + '</p>' : '') + gallery(ph) + '</div>';
        }).join('') + '</div>' : '<p class="muted small">Nenhum atendimento registrado ainda.</p>') + '</div>' +

        '<div class="card"><h2>Histórico</h2><div class="timeline">' + d.events.map(function (ev) {
          return '<div>' + esc(AS.date(ev.created_at, true)) + ' — <b>' + esc(ev.type.replace(/_/g, ' ')) + '</b> · ' + esc(ev.actor) + '</div>';
        }).join('') + '</div><button class="btn btn-danger btn-sm" id="delCase" style="margin-top:14px">Excluir caso (LGPD)</button></div>';

      var m = mount(html, 'casos');
      var reload = function () { adminCase(id); };
      bindGallery(m, reload);
      $('#copyPortal', m).addEventListener('click', function (e) { AS.copy(c.portalUrl, e.target); });
      $all('[data-copy]', m).forEach(function (b) { b.addEventListener('click', function () { AS.copy(b.getAttribute('data-copy'), b); }); });

      onSubmit($('#stf', m), function (f) {
        return api('/api/admin/cases/' + id, { method: 'PATCH', body: f }).then(function () { setTimeout(reload, 600); return 'Salvo.'; });
      });
      $('#publish', m).addEventListener('click', function (e) {
        var f = formData($('#stf', m));
        f.publish_assessment = true;
        busyBtn(e.target, api('/api/admin/cases/' + id, { method: 'PATCH', body: f })).then(reload).catch(function (err) { flash($('#stf .fmsg', m), 'err', err.message); });
      });
      onSubmit($('#df', m), function (f) { return api('/api/admin/cases/' + id, { method: 'PATCH', body: f }).then(function () { return 'Dados salvos.'; }); });
      $('#docUp', m).addEventListener('change', function (e) {
        var span = $('.upmsg', m);
        span.textContent = 'Enviando…';
        uploadFiles(e.target.files, '/api/admin/cases/' + id + '/photos').then(reload).catch(function (err) { span.textContent = err.message; });
      });
      onSubmit($('#apf', m), function (f) {
        f.starts_at = new Date(f.starts_at).toISOString();
        return api('/api/admin/cases/' + id + '/appointments', { method: 'POST', body: f }).then(function () { reload(); return false; });
      });
      $all('[data-appt]', m).forEach(function (s) {
        s.addEventListener('change', function () {
          api('/api/admin/appointments/' + s.getAttribute('data-appt'), { method: 'PATCH', body: { status: s.value } }).catch(function (e) { alert(e.message); });
        });
      });
      onSubmit($('#plf', m), function (f) {
        return api('/api/admin/cases/' + id, { method: 'PATCH', body: { plan: f } }).then(function () { return 'Plano salvo.'; });
      });
      $('#genContract', m).addEventListener('click', function (e) {
        var f = formData($('#plf', m));
        busyBtn(e.target, api('/api/admin/cases/' + id, { method: 'PATCH', body: { plan: f } })
          .then(function () { return api('/api/admin/cases/' + id + '/contract', { method: 'POST', body: {} }); }))
          .then(reload).catch(function (err) { flash($('#plf .fmsg', m), 'err', err.message); });
      });
      onSubmit($('#chf', m), function (f) {
        var body = {
          kind: f.kind, billingType: f.billingType, description: f.description, value: f.value, dueDate: f.dueDate,
          installmentCount: f.installmentCount, maxPayments: f.maxPayments,
          split: f.splitType !== 'none' && f.splitValue ? { type: f.splitType, value: f.splitValue } : null,
        };
        if (!confirm('Criar a cobrança de ' + AS.money(String(f.value).replace(',', '.')) + ' no Asaas e enviar ao paciente?')) return false;
        return api('/api/admin/cases/' + id + '/charges', { method: 'POST', body: body }).then(function () { reload(); return false; });
      });
      $all('[data-sync]', m).forEach(function (b) { b.addEventListener('click', function () { busyBtn(b, api('/api/admin/charges/' + b.getAttribute('data-sync') + '/sync', { method: 'POST', body: {} })).then(reload).catch(function (e) { alert(e.message); }); }); });
      $all('[data-cancel]', m).forEach(function (b) {
        b.addEventListener('click', function () {
          if (!confirm('Cancelar esta cobrança no Asaas? Parcelas já pagas não são estornadas.')) return;
          busyBtn(b, api('/api/admin/charges/' + b.getAttribute('data-cancel') + '/cancel', { method: 'POST', body: {} })).then(reload).catch(function (e) { alert(e.message); });
        });
      });
      $all('[data-validate]', m).forEach(function (b) { b.addEventListener('click', function () { busyBtn(b, api('/api/admin/evidences/' + b.getAttribute('data-validate') + '/validate', { method: 'POST', body: {} })).then(reload).catch(function (e) { alert(e.message); }); }); });
      $('#delCase', m).addEventListener('click', function () {
        if (prompt('Isto apaga o caso, fotos e histórico. Digite EXCLUIR para confirmar.') !== 'EXCLUIR') return;
        api('/api/admin/cases/' + id, { method: 'DELETE' }).then(function () { location.hash = '#/casos'; }).catch(function (e) { alert(e.message); });
      });
    }).catch(function (e) { errorView(e, 'casos'); });
  }

  // ------------------------------------------------------------ ADMIN: parceiros
  function adminDentists() {
    loading('parceiros');
    api('/api/admin/dentists').then(function (d) {
      var L = d.labels;
      var html = '<h1>Dentistas parceiros</h1><p class="muted">Cadastros chegam pela página <a href="/parceiros" target="_blank">/parceiros</a>.</p>' +
        '<div class="card table-wrap" style="padding:8px 12px">' + (d.dentists.length ? '<table class="t"><thead><tr><th>Dentista</th><th>CRO</th><th>Cidade</th><th>Situação</th><th>Termo</th><th>Recebimento</th><th>Casos</th></tr></thead><tbody>' +
        d.dentists.map(function (x) {
          return '<tr class="click" data-go="#/parceiro/' + x.id + '"><td><b>' + esc(x.name) + '</b><div class="small muted">' + esc(AS.phone(x.phone)) + '</div></td><td>' + esc(x.cro) + '/' + esc(x.cro_uf || '') + '</td><td>' + esc(x.city) + '</td><td>' +
            statusBadge(L[x.status], x.status === 'ativo' ? 'green' : x.status === 'lead' ? 'honey' : '') + '</td><td>' + esc(x.term_status || '—') + '</td><td>' + (x.has_wallet ? statusBadge('ok', 'green') : '—') + '</td><td>' + x.case_count + '</td></tr>';
        }).join('') + '</tbody></table>' : '<p class="muted" style="padding:14px">Nenhum cadastro ainda.</p>') + '</div>';
      var m = mount(html, 'parceiros');
      $all('[data-go]', m).forEach(function (tr) { tr.addEventListener('click', function () { location.hash = tr.getAttribute('data-go'); }); });
    }).catch(function (e) { errorView(e, 'parceiros'); });
  }

  function adminDentist(id) {
    loading('parceiros');
    api('/api/admin/dentists/' + id).then(function (d) {
      var x = d.dentist;
      var L = d.labels;
      var T = d.partnerDefaults;
      var hasUser = d.users.length > 0;
      var html = '<p><a href="#/parceiros">← Dentistas parceiros</a></p>' +
        '<div class="row" style="justify-content:space-between"><div><h1 style="margin:0">' + esc(x.name) + '</h1><p class="muted">CRO ' + esc(x.cro) + '/' + esc(x.cro_uf || '') + ' · ' + esc(x.city) + ' · ' + esc(x.experience || '') + '</p></div>' +
        '<div class="row"><a class="btn btn-green btn-sm" target="_blank" rel="noopener" href="' + esc(AS.waLink(x.phone)) + '">WhatsApp</a>' +
        '<a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="https://website.cfo.org.br/busca-profissionais/">Consultar CRO (CFO)</a></div></div>' +
        '<div class="grid2">' +
        '<form class="card" id="xf"><h2>Cadastro</h2><div class="field"><label for="status">Situação</label><select id="status" name="status">' + options(L.DENTIST_STATUS, x.status) + '</select></div><div class="grid2">' +
        field('name', 'Nome completo', x.name) + field('email', 'E-mail', x.email, 'type="email"') +
        field('phone', 'WhatsApp', x.phone) + field('cro', 'CRO', x.cro) + field('cro_uf', 'UF do CRO', x.cro_uf, 'maxlength="2"') + field('city', 'Cidade', x.city) +
        field('cpf_cnpj', 'CPF ou CNPJ', x.cpf_cnpj) + field('birth_date', 'Nascimento (se CPF)', x.birth_date ? String(x.birth_date).slice(0, 10) : '', 'type="date"') +
        '<div class="field"><label for="company_type">Tipo de empresa (se CNPJ)</label><select id="company_type" name="company_type">' + opt('', '—', x.company_type || '') + opt('MEI', 'MEI', x.company_type) + opt('LIMITED', 'Limitada', x.company_type) + opt('INDIVIDUAL', 'Individual', x.company_type) + opt('ASSOCIATION', 'Associação', x.company_type) + '</select></div>' +
        field('income_value', 'Faturamento/renda mensal (R$)', x.income_value, 'inputmode="decimal"') +
        field('address', 'Rua', x.address) + field('address_number', 'Número', x.address_number) + field('province', 'Bairro', x.province) + field('postal_code', 'CEP', x.postal_code) + '</div>' +
        area('notes', 'Anotações internas', x.notes) + '<button class="btn btn-primary" type="submit">Salvar</button><div class="fmsg"></div></form>' +

        '<div>' +
        '<form class="card" id="apf"><h2>Credenciamento e Termo de Adesão</h2><p class="small muted">Ao aprovar, o sistema cria o acesso ao painel e o Termo de Adesão com os valores abaixo (o dentista recebe por e-mail; você também pode enviar pelo WhatsApp).</p><div class="grid2">' +
        field('caseValue', 'Coparticipação por caso completo (R$)', T.caseValue, 'inputmode="decimal"') + field('avulsaValue', 'Consulta avulsa (R$)', T.avulsaValue, 'inputmode="decimal"') +
        field('pctInstall', '% na instalação/documentação', T.pctInstall, 'type="number"') + field('pctStart', '% no início dos alinhadores', T.pctStart, 'type="number"') +
        field('pctFinish', '% na finalização', T.pctFinish, 'type="number"') + field('payoutDays', 'Prazo de repasse (dias úteis)', T.payoutDays, 'type="number"') +
        field('noticeDays', 'Aviso prévio (dias)', T.noticeDays, 'type="number"') + field('lockMonths', 'Multa se sair antes de (meses)', T.lockMonths, 'type="number"') +
        field('penaltyRepasses', 'Multa: nº de repasses médios', T.penaltyRepasses, 'type="number"') + field('penaltyFixed', 'Multa mínima (R$)', T.penaltyFixed, 'inputmode="decimal"') +
        field('nonSolicitMonths', 'Não desvio após saída (meses)', T.nonSolicitMonths, 'type="number"') + '</div>' +
        '<button class="btn btn-green" type="submit">' + (hasUser ? 'Gerar novo Termo e reenviar acesso' : 'Aprovar e enviar Termo de Adesão') + '</button><div class="fmsg"></div><div id="links"></div>' +
        (hasUser ? '<p class="small muted" style="margin-top:10px">Acesso: ' + esc(d.users[0].email) + (d.users[0].has_password ? ' · senha criada' : ' · senha ainda não criada') + (d.users[0].last_login_at ? ' · último acesso ' + esc(AS.date(d.users[0].last_login_at, true)) : '') +
          ' <button type="button" class="btn btn-line btn-sm" id="accessLink">Gerar link de acesso</button></p>' : '') +
        (d.contracts.length ? '<div class="list" style="margin-top:12px">' + d.contracts.map(function (ct) {
          return '<div class="it"><div><b>Termo de Adesão</b><div class="small muted">' + esc(AS.date(ct.created_at, true)) + ' · ' + (ct.status === 'aceito' ? 'aceito em ' + esc(AS.date(ct.accepted_at, true)) + ' (IP ' + esc(ct.accepted_ip) + ')' : esc(ct.status)) + '</div></div>' +
            (ct.status !== 'cancelado' ? '<div class="row"><a class="btn btn-line btn-sm" target="_blank" href="' + esc(ct.url) + '">Abrir</a><a class="btn btn-green btn-sm" target="_blank" rel="noopener" href="' + esc(AS.waLink(x.phone, 'Olá, Dr(a). ' + x.name.split(' ')[0] + '! Segue o Termo de Adesão da rede AlignSystem para leitura e aceite: ' + ct.url)) + '">WhatsApp</a></div>' : '') + '</div>';
        }).join('') + '</div>' : '') + '</form>' +

        '<form class="card" id="wf"><h2>Conta de recebimento (split)</h2>' +
        (x.asaas_wallet_id ? '<div class="msg ok">Conta de recebimento ativa: <code>' + esc(x.asaas_wallet_id) + '</code></div>' :
          '<p class="small muted">Os repasses caem direto na conta do dentista no Asaas. Crie uma subconta automaticamente (usa CPF/CNPJ, nascimento, endereço e renda do cadastro) ou informe o walletId de uma conta Asaas que ele já tenha.</p>' +
          '<button type="button" class="btn btn-green btn-sm" id="mkAcc"' + (d.asaas ? '' : ' disabled title="Configure o Asaas"') + '>Criar subconta no Asaas</button>') +
        field('asaas_wallet_id', 'walletId (informar manualmente)', x.asaas_wallet_id) + '<button class="btn btn-line btn-sm" type="submit">Salvar walletId</button><div class="fmsg"></div></form>' +
        '</div></div>' +

        '<div class="card"><h2>Casos deste dentista</h2>' + (d.cases.length ? '<div class="list">' + d.cases.map(function (c) {
          return '<div class="it"><a href="#/caso/' + c.id + '">#' + c.code + ' · ' + esc(c.name) + '</a><span class="small muted">' + esc(c.city) + ' · ' + esc(L.CASE_STATUS[c.status]) + '</span></div>';
        }).join('') + '</div>' : '<p class="muted small">Nenhum caso direcionado ainda.</p>') + '</div>' +
        '<div class="card"><h2>Atendimentos registrados</h2>' + (d.evidences.length ? '<div class="list">' + d.evidences.map(function (e) {
          return '<div class="it"><span>#' + e.code + ' · ' + esc(L.MILESTONES[e.milestone]) + ' · ' + esc(AS.date(e.performed_at)) + '</span>' + (e.validated_at ? statusBadge('validado', 'green') : statusBadge('aguardando validação', 'honey')) + '</div>';
        }).join('') + '</div>' : '<p class="muted small">Nenhum.</p>') + '</div>' +
        '<div class="card"><h2>Histórico</h2><div class="timeline">' + d.events.map(function (ev) { return '<div>' + esc(AS.date(ev.created_at, true)) + ' — <b>' + esc(ev.type.replace(/_/g, ' ')) + '</b> · ' + esc(ev.actor) + '</div>'; }).join('') + '</div></div>';

      var m = mount(html, 'parceiros');
      var reload = function () { adminDentist(id); };
      onSubmit($('#xf', m), function (f) { return api('/api/admin/dentists/' + id, { method: 'PATCH', body: f }).then(function () { setTimeout(reload, 700); return 'Salvo.'; }); });
      onSubmit($('#apf', m), function (f) {
        return api('/api/admin/dentists/' + id + '/approve', { method: 'POST', body: { terms: f } }).then(function (r) {
          $('#links', m).innerHTML = '<div class="msg ok">' + (r.emailed ? 'E-mail enviado ao dentista. ' : 'E-mail não configurado — envie os links pelo WhatsApp. ') +
            '<br>Termo: <a target="_blank" href="' + esc(r.contractUrl) + '">abrir</a> · Criar senha: <button type="button" class="btn btn-line btn-sm" data-copy="' + esc(r.setPasswordUrl) + '">copiar link</button> ' +
            '<a class="btn btn-green btn-sm" target="_blank" rel="noopener" href="' + esc(AS.waLink(x.phone, 'Olá! Seu credenciamento AlignSystem foi aprovado. 1) Leia e aceite o Termo de Adesão: ' + r.contractUrl + ' 2) Crie sua senha do painel: ' + r.setPasswordUrl)) + '">Enviar tudo no WhatsApp</a></div>';
          $all('#links [data-copy]', m).forEach(function (b) { b.addEventListener('click', function () { AS.copy(b.getAttribute('data-copy'), b); }); });
          return false;
        });
      });
      var al = $('#accessLink', m);
      if (al) al.addEventListener('click', function () {
        busyBtn(al, api('/api/admin/dentists/' + id + '/access-link', { method: 'POST', body: {} })).then(function (r) { AS.copy(r.setPasswordUrl, al); }).catch(function (e) { alert(e.message); });
      });
      var mk = $('#mkAcc', m);
      if (mk) mk.addEventListener('click', function () {
        if (!confirm('Criar a subconta de recebimento no Asaas com os dados do cadastro?')) return;
        busyBtn(mk, api('/api/admin/dentists/' + id + '/asaas-account', { method: 'POST', body: {} })).then(reload).catch(function (e) { flash($('#wf .fmsg', m), 'err', e.message); });
      });
      onSubmit($('#wf', m), function (f) { return api('/api/admin/dentists/' + id, { method: 'PATCH', body: { asaas_wallet_id: f.asaas_wallet_id } }).then(function () { setTimeout(reload, 600); return 'Salvo.'; }); });
    }).catch(function (e) { errorView(e, 'parceiros'); });
  }

  // ------------------------------------------------------------ ADMIN: equipe
  function adminTeam() {
    loading('equipe');
    api('/api/admin/users').then(function (d) {
      var html = '<h1>Equipe</h1><div class="card"><div class="list">' + d.users.map(function (u) {
        return '<div class="it"><div><b>' + esc(u.name) + '</b><div class="small muted">' + esc(u.email) + (u.last_login_at ? ' · último acesso ' + esc(AS.date(u.last_login_at, true)) : '') + '</div></div>' +
          (u.id === me.id ? statusBadge('você', 'green') : '<button class="btn btn-sm ' + (u.active ? 'btn-danger' : 'btn-line') + '" data-toggle="' + u.id + '" data-active="' + (u.active ? '0' : '1') + '">' + (u.active ? 'Desativar' : 'Reativar') + '</button>') + '</div>';
      }).join('') + '</div></div>' +
        '<form class="card" id="uf" style="max-width:520px"><h2>Adicionar administrador</h2>' + field('name', 'Nome', '') + field('email', 'E-mail', '', 'type="email" required') +
        '<button class="btn btn-primary" type="submit">Criar acesso</button><div class="fmsg"></div><div id="ul"></div></form>';
      var m = mount(html, 'equipe');
      onSubmit($('#uf', m), function (f) {
        return api('/api/admin/users', { method: 'POST', body: f }).then(function (r) {
          $('#ul', m).innerHTML = '<div class="msg ok">Acesso criado. Link para criar a senha: <button type="button" class="btn btn-line btn-sm" id="cu">copiar</button></div>';
          $('#cu', m).addEventListener('click', function (e) { AS.copy(r.setPasswordUrl, e.target); });
          return false;
        });
      });
      $all('[data-toggle]', m).forEach(function (b) {
        b.addEventListener('click', function () {
          api('/api/admin/users/' + b.getAttribute('data-toggle'), { method: 'PATCH', body: { active: b.getAttribute('data-active') === '1' } }).then(adminTeam).catch(function (e) { alert(e.message); });
        });
      });
    }).catch(function (e) { errorView(e, 'equipe'); });
  }

  // ------------------------------------------------------------ DENTISTA
  function dentistHome() {
    loading('inicio');
    api('/api/dentist/overview').then(function (d) {
      var L = d.labels;
      var html = '<h1>Olá, ' + esc(d.dentist.name.split(' ')[0]) + '</h1>';
      if (!d.term || d.term.status !== 'aceito') {
        html += '<div class="msg warn"><b>Termo de Adesão pendente.</b> Leia e aceite para começar a receber casos. ' + (d.term ? '<a href="' + esc(d.term.url) + '">Abrir Termo de Adesão</a>' : 'A equipe vai enviar o termo em breve.') + '</div>';
      }
      if (!d.dentist.hasWallet) html += '<div class="msg warn">Conta de recebimento ainda não configurada. A equipe AlignSystem vai entrar em contato para ativar os repasses.</div>';
      html += '<div class="card"><h2>Próximos agendamentos</h2>' + (d.appointments.length ? '<div class="list">' + d.appointments.map(function (a) {
        return '<div class="it"><div><b>' + esc(KIND_APPT[a.kind]) + '</b> · ' + esc(AS.date(a.starts_at, true)) + '<div class="small muted"><a href="#/caso/' + a.case_id + '">#' + a.code + ' · ' + esc(a.name) + '</a>' + (a.location ? ' · ' + esc(a.location) : '') + '</div></div>' +
          (a.room_url ? '<a class="btn btn-green btn-sm" target="_blank" rel="noopener" href="' + esc(a.room_url) + '">Entrar na chamada</a>' : '') + '</div>';
      }).join('') + '</div>' : '<p class="muted small">Nenhum agendamento.</p>') + '</div>';
      html += '<div class="card"><h2>Meus casos</h2>' + (d.cases.length ? '<div class="list">' + d.cases.map(function (c) {
        return '<div class="it"><a href="#/caso/' + c.id + '"><b>#' + c.code + ' · ' + esc(c.name) + '</b></a><span class="small muted">' + esc(c.city) + ' · ' + esc(L.CASE_STATUS[c.status]) + '</span></div>';
      }).join('') + '</div>' : '<p class="muted small">Nenhum caso direcionado a você ainda.</p>') + '</div>';
      html += '<div class="card"><h2>Meus registros de atendimento</h2>' + (d.evidences.length ? '<div class="list">' + d.evidences.map(function (e) {
        return '<div class="it"><span>#' + e.code + ' · ' + esc(L.MILESTONES[e.milestone]) + ' · ' + esc(AS.date(e.performed_at)) + '</span>' + (e.validated_at ? statusBadge('validado', 'green') : statusBadge('aguardando validação', 'honey')) + '</div>';
      }).join('') + '</div>' : '<p class="muted small">Nenhum.</p>') + '</div>';
      mount(html, 'inicio');
    }).catch(function (e) { errorView(e, 'inicio'); });
  }

  function dentistCase(id) {
    loading('inicio');
    api('/api/dentist/cases/' + id).then(function (d) {
      var c = d.case;
      var L = d.labels;
      var evalPhotos = d.photos.filter(function (p) { return p.kind === 'avaliacao'; });
      var others = d.photos.filter(function (p) { return p.kind === 'extra' || p.kind === 'documento'; });
      var html = '<p><a href="#/">← Meus casos</a></p><h1>#' + c.code + ' · ' + esc(c.name) + '</h1>' +
        '<p class="muted">' + esc(c.age) + ' anos · ' + esc(c.city) + ' · ' + esc(L.CASE_STATUS[c.status]) + ' · <a target="_blank" rel="noopener" href="' + esc(AS.waLink(c.whatsapp)) + '">WhatsApp ' + esc(AS.phone(c.whatsapp)) + '</a></p>' +
        '<div class="grid2"><div class="card"><h2>Pré-avaliação</h2><dl class="kv"><dt>Motivo</dt><dd>' + esc(c.reason || '—') + '</dd><dt>Parecer</dt><dd>' + esc(c.assessment ? L.ASSESSMENT[c.assessment] : '—') + '</dd>' +
        '<dt>Observações</dt><dd style="white-space:pre-line">' + esc(c.assessment_notes || '—') + '</dd><dt>Alinhador</dt><dd>' + esc(c.plan.brand || '—') + (c.plan.months ? ' · ' + esc(c.plan.months) + ' meses' : '') + '</dd>' +
        '<dt>Plano</dt><dd style="white-space:pre-line">' + esc(c.plan.treatmentNotes || '—') + '</dd></dl></div>' +
        '<form class="card" id="apf"><h2>Agendar</h2><div class="grid2"><div class="field"><label for="kind">Tipo</label><select id="kind" name="kind">' + options(KIND_APPT, 'consulta') + '</select></div>' +
        field('starts_at', 'Data e hora', toLocalInput(new Date(Date.now() + 86400000)), 'type="datetime-local" required') + '</div>' +
        field('location', 'Local / observação', '') + '<button class="btn btn-green btn-sm" type="submit">Agendar e avisar paciente</button><div class="fmsg"></div>' +
        (d.appointments.length ? '<div class="list" style="margin-top:12px">' + d.appointments.map(function (a) {
          return '<div class="it"><div>' + esc(KIND_APPT[a.kind]) + ' · ' + esc(AS.date(a.starts_at, true)) + (a.room_url ? ' · <a target="_blank" rel="noopener" href="' + esc(a.room_url) + '">sala de vídeo</a>' : '') + '</div>' +
            '<select data-appt="' + a.id + '" style="max-width:150px">' + options(APPT_STATUS, a.status) + '</select></div>';
        }).join('') + '</div>' : '') + '</form></div>' +
        '<div class="card"><h2>Fotos do paciente</h2>' + gallery(evalPhotos, { slots: d.slots }) + (others.length ? '<h3 style="margin-top:14px">Documentação</h3>' + gallery(others) : '') + '</div>' +
        '<form class="card" id="evf"><h2>Registrar atendimento</h2><p class="small muted">Registre cada atendimento com fotos: é o que libera o repasse após a validação da equipe.</p><div class="grid2">' +
        '<div class="field"><label for="milestone">Tipo de atendimento</label><select id="milestone" name="milestone" required>' + options(L.MILESTONES, '', '— escolha —') + '</select></div>' +
        field('performed_at', 'Data', new Date().toISOString().slice(0, 10), 'type="date" required') + '</div>' +
        area('notes', 'Anotações clínicas', '') +
        '<div class="field"><label for="evPhotos">Fotos / arquivos do atendimento</label><input id="evPhotos" type="file" multiple accept="image/*,application/pdf"></div>' +
        '<button class="btn btn-primary" type="submit">Salvar registro</button><div class="fmsg"></div></form>' +
        '<div class="card"><h2>Registros anteriores</h2>' + (d.evidences.length ? '<div class="list">' + d.evidences.map(function (e) {
          var ph = d.photos.filter(function (p) { return p.evidence_id === e.id; });
          return '<div class="it" style="display:block"><div class="row" style="justify-content:space-between"><b>' + esc(L.MILESTONES[e.milestone]) + ' · ' + esc(AS.date(e.performed_at)) + '</b>' +
            (e.validated_at ? statusBadge('validado', 'green') : statusBadge('aguardando validação', 'honey')) + '</div>' + (e.notes ? '<p class="small" style="white-space:pre-line">' + esc(e.notes) + '</p>' : '') + gallery(ph) + '</div>';
        }).join('') + '</div>' : '<p class="muted small">Nenhum registro ainda.</p>') + '</div>';
      var m = mount(html, 'inicio');
      var reload = function () { dentistCase(id); };
      bindGallery(m, reload);
      onSubmit($('#apf', m), function (f) {
        f.starts_at = new Date(f.starts_at).toISOString();
        return api('/api/dentist/cases/' + id + '/appointments', { method: 'POST', body: f }).then(function () { reload(); return false; });
      });
      $all('[data-appt]', m).forEach(function (s) {
        s.addEventListener('change', function () { api('/api/dentist/appointments/' + s.getAttribute('data-appt'), { method: 'PATCH', body: { status: s.value } }).catch(function (e) { alert(e.message); }); });
      });
      onSubmit($('#evf', m), function (f) {
        var files = $('#evPhotos', m).files;
        return api('/api/dentist/cases/' + id + '/evidences', { method: 'POST', body: f }).then(function (ev) {
          return uploadFiles(files, '/api/dentist/evidences/' + ev.id + '/photos');
        }).then(function () { reload(); return false; });
      });
    }).catch(function (e) { errorView(e, 'inicio'); });
  }

  // ------------------------------------------------------------ roteamento
  function parseHash() {
    var raw = location.hash.replace(/^#/, '') || '/';
    var parts = raw.split('?');
    var q = {};
    new URLSearchParams(parts[1] || '').forEach(function (v, k) { q[k] = v; });
    return { path: parts[0], query: q };
  }

  function route() {
    if (!me) return loginView();
    var r = parseHash();
    var m;
    if (r.path === '/conta') return accountView();
    if (me.role === 'admin') {
      if (r.path === '/casos') return adminCases(r.query);
      if ((m = r.path.match(/^\/caso\/([0-9a-f-]{36})$/))) return adminCase(m[1]);
      if (r.path === '/parceiros') return adminDentists();
      if ((m = r.path.match(/^\/parceiro\/([0-9a-f-]{36})$/))) return adminDentist(m[1]);
      if (r.path === '/equipe') return adminTeam();
      return adminHome();
    }
    if ((m = r.path.match(/^\/caso\/([0-9a-f-]{36})$/))) return dentistCase(m[1]);
    return dentistHome();
  }

  function boot() {
    api('/api/auth/me').then(function (d) {
      me = d.user;
      route();
    }).catch(function (e) {
      root.innerHTML = '<main class="container"><div class="msg err">Não foi possível conectar: ' + esc(e.message) + '</div></main>';
    });
  }

  window.addEventListener('hashchange', function () { if (me) route(); });
  boot();
})();
