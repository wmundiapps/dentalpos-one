// AlignSystem — cartões da rede, cartões de visita e lembretes (painel). Sem bibliotecas externas:
// o servidor desenha em SVG; aqui o navegador converte para PNG e monta o PDF.
(function () {
  'use strict';
  var A = window.AS, esc = A.esc, root = document.getElementById('root');
  var S = { tab: (location.hash || '#paciente').slice(1), data: null, caseId: '', dentistId: '', ate: '', orient: 'h', apptId: '', tipo: 'lembrete24', roles: {} };

  /* ---------------- conversões ---------------- */
  function fetchSvg(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.error || ('Erro ' + r.status)); });
      return r.text();
    });
  }
  function svgToCanvas(svgText) {
    return new Promise(function (res, rej) {
      var blob = new Blob([svgText], { type: 'image/svg+xml' }), url = URL.createObjectURL(blob), img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Não foi possível desenhar a imagem.')); };
      img.src = url;
    });
  }
  function canvasBlob(c, type, q) { return new Promise(function (res) { c.toBlob(res, type, q); }); }
  function save(name, blob) {
    var u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
  }
  // PDF mínimo: uma página por imagem JPEG, no tamanho da imagem a 300 dpi.
  function pdfFromJpegs(pages) {
    var enc = new TextEncoder(), parts = [], offs = [], len = 0;
    function push(x) { var b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; }
    function obj(n, body, stream) { offs[n] = len; push(n + ' 0 obj\n' + body); if (stream) { push('\nstream\n'); push(stream); push('\nendstream'); } push('\nendobj\n'); }
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    var n = pages.length, kids = [];
    for (var i = 0; i < n; i++) kids.push((3 + i * 3) + ' 0 R');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Count ' + n + ' /Kids [' + kids.join(' ') + '] >>');
    pages.forEach(function (p, i) {
      var pg = 3 + i * 3, im = pg + 1, ct = pg + 2, w = (p.w * 0.24).toFixed(2), h = (p.h * 0.24).toFixed(2);
      var content = enc.encode('q ' + w + ' 0 0 ' + h + ' 0 0 cm /Im Do Q');
      obj(pg, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + w + ' ' + h + '] /Resources << /XObject << /Im ' + im + ' 0 R >> >> /Contents ' + ct + ' 0 R >>');
      obj(im, '<< /Type /XObject /Subtype /Image /Width ' + p.w + ' /Height ' + p.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpg.length + ' >>', p.jpg);
      obj(ct, '<< /Length ' + content.length + ' >>', content);
    });
    var total = 3 + n * 3, xref = len, x = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
    for (var k = 1; k < total; k++) x += String(offs[k]).padStart(10, '0') + ' 00000 n \n';
    push(x + 'trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF');
    return new Blob(parts, { type: 'application/pdf' });
  }
  function jpegPage(svgText) {
    return svgToCanvas(svgText).then(function (c) {
      return canvasBlob(c, 'image/jpeg', 0.93).then(function (b) { return b.arrayBuffer(); }).then(function (ab) { return { w: c.width, h: c.height, jpg: new Uint8Array(ab) }; });
    });
  }
  function download(item, kind, btn) {
    var label = btn && btn.textContent; if (btn) { btn.disabled = true; btn.textContent = 'Gerando…'; }
    return fetchSvg(item.url).then(function (svg) {
      if (kind === 'svg') return save(item.file + '.svg', new Blob([svg], { type: 'image/svg+xml' }));
      if (kind === 'png') return svgToCanvas(svg).then(function (c) { return canvasBlob(c, 'image/png'); }).then(function (b) { save(item.file + '.png', b); });
      return jpegPage(svg).then(function (p) { save(item.file + '.pdf', pdfFromJpegs([p])); });
    }).catch(function (e) { flash(e.message, 'err'); }).then(function () { if (btn) { btn.disabled = false; btn.textContent = label; } });
  }
  function downloadAllPdf(items, name, btn) {
    btn.disabled = true; var label = btn.textContent; btn.textContent = 'Gerando…';
    items.reduce(function (p, it) { return p.then(function (acc) { return fetchSvg(it.url).then(jpegPage).then(function (pg) { acc.push(pg); return acc; }); }); }, Promise.resolve([]))
      .then(function (pages) { save(name + '.pdf', pdfFromJpegs(pages)); })
      .catch(function (e) { flash(e.message, 'err'); })
      .then(function () { btn.disabled = false; btn.textContent = label; });
  }

  /* ---------------- utilidades de tela ---------------- */
  function flash(t, kind) { var m = document.getElementById('flash'); if (!m) return; m.className = 'msg ' + (kind || 'ok'); m.textContent = t; m.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(function () { m.hidden = true; }, 5000); }
  function slug(s) { return String(s || 'arquivo').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'arquivo'; }
  function sel(id, label, opts, val, empty) {
    return '<div class="field"><label for="' + id + '">' + esc(label) + '</label><select id="' + id + '">' + (empty ? '<option value="">' + esc(empty) + '</option>' : '') +
      opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></div>';
  }
  function itemHTML(it) {
    return '<div class="kit-item"><div class="kit-bar"><b>' + esc(it.label) + '</b>' +
      ['png', 'pdf', 'svg'].map(function (k, i) { return '<button class="btn btn-sm ' + (i === 0 ? 'btn-green' : 'btn-line') + '" data-dl="' + esc(it.id) + '" data-kind="' + k + '">Baixar ' + k.toUpperCase() + '</button>'; }).join('') +
      '</div><img class="kit-img" src="' + esc(it.url) + '" alt="' + esc(it.label) + '" loading="lazy"></div>';
  }
  var ITEMS = [];
  function q(o) { var s = Object.keys(o).filter(function (k) { return o[k]; }).map(function (k) { return k + '=' + encodeURIComponent(o[k]); }).join('&'); return s ? '?' + s : ''; }

  /* ---------------- mensagens dos lembretes ---------------- */
  var DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  function sp(d) { var x = new Date(d); return { date: x.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }), time: x.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }), wd: DIAS[new Date(x.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getDay()] }; }
  function messages(a, tipo, org) {
    var n = String(a.patient || '').split(/\s+/)[0], t = sp(a.startsAt), kind = S.data.labels.appt[a.kind] || a.kind;
    var L = { confirmacao: ['Seu horário está agendado', 'Seu horário na *AlignSystem* está agendado.'], lembrete24: ['Sua consulta é amanhã', 'Passando para lembrar da sua consulta *amanhã* na *AlignSystem*.'], lembretedia: ['Sua consulta é hoje', 'Hoje é dia da sua consulta na *AlignSystem*.'], reagendamento: ['Sua consulta foi reagendada', 'Sua consulta na *AlignSystem* foi reagendada.'] }[tipo];
    var plain = L[1].replace(/\*/g, ''), contact = org.whatsapp ? A.phone(org.whatsapp) : org.email;
    var wa = 'Olá, ' + n + '! ' + L[1] + '\n\n📅 *' + t.wd + ', ' + t.date + '*\n🕑 *' + t.time + '*\n🦷 ' + kind + (a.dentist ? ' com ' + a.dentist : '') + (a.place ? '\n📍 ' + a.place : '') + '\n\nResponda *1* para confirmar ou *2* para reagendar.';
    var sms = ('AlignSystem: Ola ' + n + ', ' + L[0].toLowerCase() + ': ' + t.date + ' as ' + t.time + (a.dentist ? ' com ' + a.dentist : '') + '. Responda 1 p/ confirmar ou 2 p/ reagendar.').normalize('NFD').replace(/[̀-ͯ]/g, '');
    var mail = 'Assunto: ' + L[0] + ' – ' + t.date + ' às ' + t.time + ' | AlignSystem\n\nOlá, ' + a.patient + ',\n\n' + plain + '\n\nData: ' + t.wd + ', ' + t.date + '\nHorário: ' + t.time + '\nAtendimento: ' + kind + (a.dentist ? '\nProfissional: ' + a.dentist + (a.cro ? ' – ' + a.cro : '') : '') + (a.place ? '\nLocal: ' + a.place : '') + '\n\nPara confirmar ou reagendar, responda este e-mail ou fale conosco pelo WhatsApp ' + contact + '.\n\nAtenciosamente,\nEquipe AlignSystem' + (org.rt ? '\nResponsável técnico: ' + org.rt : '');
    var dm = 'Olá, ' + n + '! ' + plain + '\n' + t.wd + ', ' + t.date + ' às ' + t.time + (a.dentist ? ', com ' + a.dentist : '') + '.' + (a.place ? '\nLocal: ' + a.place : '') + '\nResponda 1 para confirmar ou 2 para reagendar.';
    return [['WhatsApp', wa, 'whatsapp'], ['SMS', sms, 'sms'], ['E-mail', mail, 'email'], ['Instagram / Messenger', dm, 'dm']];
  }

  /* ---------------- telas ---------------- */
  function tabs() {
    var admin = S.data.role === 'admin';
    var t = [['paciente', 'Cartão do paciente'], ['credenciado', admin ? 'Credenciados' : 'Meu credenciamento'], ['visita', 'Cartões de visita'], ['lembretes', 'Lembretes'], ['validar', 'Validar cartão']];
    return '<nav class="kit-tabs">' + t.map(function (x) { return '<a href="#' + x[0] + '" class="' + (S.tab === x[0] ? 'on' : '') + '">' + esc(x[1]) + '</a>'; }).join('') + '</nav>';
  }
  function view() {
    var D = S.data, admin = D.role === 'admin', form = '', items = [], extra = '';
    var ate = S.ate || D.defaultValidity;
    if (S.tab === 'paciente') {
      var cs = D.cases;
      if (!S.caseId) { var a0 = cs.filter(function (c) { return c.active; })[0] || cs[0]; S.caseId = a0 ? a0.id : ''; }
      form = sel('caseId', 'Paciente', cs.map(function (c) { return [c.id, '#' + c.code + ' · ' + c.name + (c.active ? '' : ' (' + (D.labels.CASE_STATUS[c.status] || c.status) + ')')]; }), S.caseId) +
        '<div class="field"><label for="ate">Válido até</label><input type="month" id="ate" value="' + esc(ate) + '"></div>' +
        '<p class="small muted">O QR leva à página de validação. A conferência aceita só tratamentos com contrato assinado ou em andamento; o paciente também baixa o cartão no portal dele.</p>';
      var c = cs.filter(function (x) { return x.id === S.caseId; })[0];
      if (c) {
        if (!c.active) extra = '<div class="msg warn small">Este paciente ainda não tem tratamento ativo: o cartão será recusado na validação até o contrato ser assinado.</div>';
        items = [{ id: 'pac', label: 'Cartão de ' + c.name, url: '/api/kit/paciente/' + c.id + q({ ate: ate }), file: 'alignsystem-paciente-' + c.code + '-' + slug(c.name) }];
        if (c.whatsapp) extra += '<p><a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="' + esc(A.waLink(c.whatsapp, 'Olá, ' + c.name.split(' ')[0] + '! Este é o seu cartão da rede AlignSystem. Apresente-o em qualquer clínica credenciada. Você também encontra o cartão no seu portal.')) + '">Abrir conversa no WhatsApp</a> <span class="small muted">Baixe a imagem e anexe na conversa.</span></p>';
      }
    } else if (S.tab === 'credenciado') {
      var ds = D.dentists;
      if (!S.dentistId && ds[0]) S.dentistId = ds[0].id;
      form = (admin ? sel('dentistId', 'Dentista', ds.map(function (d) { return [d.id, d.name + ' · ' + d.city + (d.status === 'ativo' ? '' : ' (aprovado, termo pendente)')]; }), S.dentistId) : '') +
        '<div class="field"><label for="ate">Válido até</label><input type="month" id="ate" value="' + esc(ate) + '"></div>' +
        '<p class="small muted">Na validação, só credenciados com termo aceito (status ativo) aparecem como válidos.</p>';
      var d = ds.filter(function (x) { return x.id === S.dentistId; })[0];
      if (d) items = [{ id: 'cred', label: 'Credenciado: ' + d.name, url: '/api/kit/credenciado/' + d.id + q({ ate: ate }), file: 'alignsystem-credenciado-' + slug(d.name) }];
    } else if (S.tab === 'visita') {
      form = sel('orient', 'Formato', [['h', 'Horizontal (cartão de visita)'], ['v', 'Vertical (celular / status)']], S.orient) +
        (admin && D.team.length ? '<h3 style="margin:14px 0 6px">Equipe AlignSystem</h3>' + D.team.map(function (t) { var r = S.roles[t.id] || {}; return '<div class="grid2"><div class="field"><label for="cargo-' + t.id + '">' + esc(t.name) + ': cargo</label><input id="cargo-' + t.id + '" data-role="' + t.id + '" data-k="cargo" value="' + esc(r.cargo || '') + '" placeholder="Equipe AlignSystem"></div><div class="field"><label for="tel-' + t.id + '">Telefone</label><input id="tel-' + t.id + '" data-role="' + t.id + '" data-k="tel" value="' + esc(r.tel || '') + '"></div></div>'; }).join('') : '') +
        '<p class="small muted">QR da rede abre o WhatsApp; QR das pessoas salva o contato no celular. Dados dos dentistas vêm do cadastro do parceiro.</p>';
      items.push({ id: 'v-rede', label: 'AlignSystem (rede)', url: '/api/kit/visita/rede/-' + q({ formato: S.orient }), file: 'alignsystem-cartao-rede' });
      if (admin) D.team.forEach(function (t) { var r = S.roles[t.id] || {}; items.push({ id: 'v-u-' + t.id, label: t.name, url: '/api/kit/visita/equipe/' + t.id + q({ formato: S.orient, cargo: r.cargo, tel: r.tel }), file: 'alignsystem-cartao-' + slug(t.name) }); });
      D.dentists.forEach(function (d) { items.push({ id: 'v-d-' + d.id, label: d.name + ' (credenciado)', url: '/api/kit/visita/dentista/' + d.id + q({ formato: S.orient }), file: 'alignsystem-cartao-' + slug(d.name) }); });
    } else if (S.tab === 'lembretes') {
      var ap = D.appointments;
      if (!S.apptId && ap[0]) S.apptId = ap[0].id;
      form = (ap.length ? sel('apptId', 'Agendamento', ap.map(function (a) { var t = sp(a.startsAt); return [a.id, t.date + ' ' + t.time + ' · ' + a.patient]; }), S.apptId) : '<div class="msg warn small">Nenhum agendamento futuro.</div>') +
        sel('tipo', 'Tipo de aviso', Object.keys(D.labels.reminder).map(function (k) { return [k, D.labels.reminder[k]]; }), S.tipo);
      var a = ap.filter(function (x) { return x.id === S.apptId; })[0];
      if (a) {
        items = [{ id: 'rem', label: 'Cartão de lembrete', url: '/api/kit/lembrete/' + a.id + q({ tipo: S.tipo }), file: 'alignsystem-lembrete-' + slug(a.patient) }];
        extra = '<h3 style="margin-top:8px">Mensagens prontas por canal</h3>' + messages(a, S.tipo, D.org).map(function (m) {
          var over = m[2] === 'sms' && m[1].length > 160;
          return '<div class="card kit-msg"><div class="kit-bar"><b>' + esc(m[0]) + '</b>' + (m[2] === 'sms' ? '<span class="small ' + (over ? '' : 'muted') + '" style="' + (over ? 'color:var(--danger)' : '') + '">' + m[1].length + '/160</span>' : '') +
            '<button class="btn btn-sm btn-green" data-copy="' + m[2] + '">Copiar</button>' + (m[2] === 'whatsapp' && a.whatsapp ? '<a class="btn btn-sm btn-line" target="_blank" rel="noopener" href="' + esc(A.waLink(a.whatsapp, m[1])) + '">Abrir no WhatsApp</a>' : '') +
            '</div><pre id="m-' + m[2] + '">' + esc(m[1]) + '</pre></div>';
        }).join('');
      }
    } else if (S.tab === 'validar') {
      form = '<div class="field"><label for="code">Código ou link do QR</label><input id="code" placeholder="ASP-001042-2710-XXXXXXXX" autocomplete="off"></div><button class="btn btn-green" id="check">Validar</button><div id="vres"></div>' +
        '<p class="small muted">A mesma conferência está aberta ao público em <a href="/validar" target="_blank">/validar</a>, que é para onde o QR do cartão leva.</p>';
    }
    ITEMS = items;
    var many = items.length > 1;
    root.innerHTML = '<main class="container wide"><p><a href="/painel">← Painel</a></p><h1>Cartões e lembretes</h1>' + tabs() + '<div id="flash" hidden></div>' +
      '<div class="kit-grid"><section class="card kit-form">' + form + '</section><section class="kit-prev">' + extra +
      '<div class="' + (S.tab === 'visita' ? 'kit-cards' : '') + '">' + items.map(itemHTML).join('') + '</div></section></div>' +
      (items.length ? '<div class="kit-dock"><div><b>' + esc(many ? items.length + ' cartões' : items[0].label) + '</b><br><span class="small muted">PNG para WhatsApp e redes · PDF para imprimir</span></div>' +
        (many ? '<button class="btn btn-green" id="allpdf">Baixar todos em PDF</button>' : '<button class="btn btn-green" data-dl="' + esc(items[0].id) + '" data-kind="png">Baixar PNG</button><button class="btn btn-line" data-dl="' + esc(items[0].id) + '" data-kind="pdf">Baixar PDF</button>') + '</div>' : '') +
      '</main>';
    root.querySelectorAll('.kit-img').forEach(function (img) { img.onerror = function () { fetchSvg(img.src).catch(function (e) { img.replaceWith(Object.assign(document.createElement('div'), { className: 'msg err small', textContent: e.message })); }); }; });
  }

  /* ---------------- eventos ---------------- */
  root.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'caseId') S.caseId = t.value; else if (t.id === 'dentistId') S.dentistId = t.value; else if (t.id === 'ate') S.ate = t.value;
    else if (t.id === 'orient') S.orient = t.value; else if (t.id === 'apptId') S.apptId = t.value; else if (t.id === 'tipo') S.tipo = t.value;
    else if (t.dataset.role) { S.roles[t.dataset.role] = S.roles[t.dataset.role] || {}; S.roles[t.dataset.role][t.dataset.k] = t.value; }
    else return;
    view();
  });
  root.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.dl) { var it = ITEMS.filter(function (x) { return x.id === b.dataset.dl; })[0]; if (it) download(it, b.dataset.kind, b); return; }
    if (b.id === 'allpdf') { downloadAllPdf(ITEMS, 'alignsystem-cartoes-' + (S.orient === 'v' ? 'vertical' : 'horizontal'), b); return; }
    if (b.dataset.copy) { var txt = document.getElementById('m-' + b.dataset.copy).textContent; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { flash('Mensagem copiada'); }, function () { flash('Selecione o texto e copie.', 'warn'); }); return; }
    if (b.id === 'check') {
      var out = document.getElementById('vres'), c = document.getElementById('code').value;
      A.api('/api/public/cartao?c=' + encodeURIComponent(c)).then(function (r) {
        out.innerHTML = r.valid ? '<div class="msg ok"><b>' + esc(r.status) + '</b><br>' + esc(r.type) + '<br>' + esc(r.name) + (r.detail ? ' · ' + esc(r.detail) : '') + '<br>' + esc(r.city || '') + ' · válido até ' + esc(r.validUntil) + '</div>' : '<div class="msg err">' + esc(r.message) + '</div>';
      }).catch(function (er) { out.innerHTML = '<div class="msg err">' + esc(er.message) + '</div>'; });
    }
  });
  window.addEventListener('hashchange', function () { S.tab = location.hash.slice(1) || 'paciente'; if (S.data) view(); });

  A.api('/api/kit/bootstrap').then(function (d) { S.data = d; view(); }).catch(function (e) {
    if (e.status === 401) { location.href = '/painel'; return; }
    root.innerHTML = '<main class="container"><div class="msg err">' + esc(e.message) + '</div><p><a href="/painel">Voltar ao painel</a></p></main>';
  });
})();
