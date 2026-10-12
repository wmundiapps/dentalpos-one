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
  function coverageBadge(km) {
    if (km == null) return '<span class="badge">?</span>';
    return km <= 300 ? '<span class="badge green">' + km + ' km</span>' : '<span class="badge honey">' + km + ' km</span>';
  }

  function adminCoverage() {
    loading('cobertura');
    api('/api/admin/cobertura').then(function (d) {
      var html = '<h1>Cobertura e marketing</h1>' +
        '<p class="muted">Priorize anúncios para pacientes num raio de até ' + d.radiusKm + ' km das cidades com dentista credenciado ativo. Pacientes fora desse raio pagam os deslocamentos no preço.</p>' +
        '<div class="card"><h2>Onde anunciar (cidades com dentista credenciado)</h2>' + (d.hubs.length ? '<div class="table-wrap"><table class="t"><thead><tr><th>Cidade</th><th>Dentistas</th><th>Pacientes no raio (12 meses)</th><th>Últimos 30 dias</th></tr></thead><tbody>' +
          d.hubs.map(function (h) { return '<tr><td><b>' + esc(h.city + '/' + h.uf) + '</b></td><td>' + h.dentists + '</td><td>' + h.leads + '</td><td>' + h.leads30 + '</td></tr>'; }).join('') +
          '</tbody></table></div>' : '<p class="muted">Nenhum dentista ativo com cidade reconhecida. Confira a cidade e a UF do CRO no cadastro dos parceiros.</p>') +
        '<p class="small muted" style="margin-top:10px">No Meta Ads e no Google Ads, use segmentação por raio em volta de cada cidade (ex.: 50 a 100 km para começar) e marque os links com utm_campaign=nome-da-cidade para medir aqui.</p></div>' +
        '<div class="card"><h2>Onde recrutar dentistas (pacientes fora do raio)</h2>' + (d.outside.length ? '<div class="table-wrap"><table class="t"><thead><tr><th>Cidade</th><th>Pacientes</th><th>Credenciado mais próximo</th></tr></thead><tbody>' +
          d.outside.map(function (o) { return '<tr><td>' + esc(o.city + '/' + o.uf) + '</td><td>' + o.leads + '</td><td>' + (o.nearestKm != null ? o.nearestKm + ' km' : 'nenhum') + '</td></tr>'; }).join('') +
          '</tbody></table></div>' : '<p class="muted">Nenhum paciente fora do raio.</p>') +
        '<p class="small muted" style="margin-top:10px">' + d.totalCases + ' pacientes nos últimos 12 meses · ' + d.unknown + ' sem cidade reconhecida.</p></div>';
      mount(html, 'cobertura');
    }).catch(function (e) { errorView(e, 'cobertura'); });
  }

  var PROSPECT_STATUS = { novo: 'Novos', convidado: 'Convidados', cadastrado: 'Cadastrados', saiu: 'Não querem' };

  function adminProspects(query) {
    loading('captacao');
    var qs = ['status', 'uf', 'city', 'category', 'priority', 'mobile', 'q', 'page'].filter(function (k) { return query[k]; })
      .map(function (k) { return k + '=' + encodeURIComponent(query[k]); }).join('&');
    api('/api/admin/prospects?' + qs).then(function (d) {
      var f = d.filter;
      var link = function (extra) {
        var p = Object.assign({}, query, extra); delete p.page;
        return '#/captacao?' + Object.keys(p).filter(function (k) { return p[k]; }).map(function (k) { return k + '=' + encodeURIComponent(p[k]); }).join('&');
      };
      var html = '<h1>Captação de dentistas</h1>' +
        '<details class="card"><summary><b>Como buscar dentistas na Receita Federal</b></summary>' +
        '<ol class="small" style="padding-left:18px;margin-top:10px">' +
        '<li>Baixe o <b>BuscarDentistas.exe</b> em <a href="https://github.com/wmundiapps/dentalpos-one/releases/tag/buscardentistas" target="_blank" rel="noopener">github.com/wmundiapps/dentalpos-one/releases/tag/buscardentistas</a> (só no Windows).</li>' +
        '<li>Abra no seu computador, com internet do Brasil (a Receita recusa acesso de fora).</li>' +
        '<li>Entre com seu e-mail, senha e o código de 2 etapas; escolha o estado e as cidades.</li>' +
        '<li>A primeira busca do mês baixa cerca de 6 GB e leva de 30 a 60 minutos; as seguintes são rápidas.</li>' +
        '</ol><p class="small muted">Busca clínicas e consultórios com CNAE 8630-5/04 (principal ou secundário). Nomes com ORTO, ALINH, SORRIS ou SMILE ficam marcados como prioridade. Quem pediu para sair nunca volta para a lista. Dentista que atende só como pessoa física (sem CNPJ) não aparece na Receita.</p></details>' +
        '<div class="stats">' + Object.keys(PROSPECT_STATUS).map(function (k) {
          return '<a class="stat" href="' + link({ status: k }) + '" style="text-decoration:none;color:inherit' + (f.status === k ? ';outline:2px solid var(--emerald)' : '') + '"><b>' + (d.counts[k] || 0) + '</b><span>' + PROSPECT_STATUS[k] + '</span></a>';
        }).join('') + '</div>' +
        '<form class="row" id="pff" style="margin-bottom:12px">' +
        '<input name="q" value="' + esc(f.q || '') + '" placeholder="Nome ou CNPJ" style="max-width:220px">' +
        '<input name="city" value="' + esc(f.city || '') + '" placeholder="Cidade" list="pcities" style="max-width:180px"><datalist id="pcities">' + d.cities.map(function (c) { return '<option value="' + esc(c.city) + '">' + esc(c.uf + ' · ' + c.n) + '</option>'; }).join('') + '</datalist>' +
        '<select name="category" style="max-width:260px"><option value="">Todas as categorias</option>' + Object.keys(d.categories).map(function (k) { return '<option value="' + k + '"' + (f.category === k ? ' selected' : '') + '>' + esc(d.categories[k]) + '</option>'; }).join('') + '</select>' +
        '<label class="check" style="margin:0"><input type="checkbox" name="priority" value="1"' + (f.priority ? ' checked' : '') + '><span class="small">Só prioridade (ortodontia)</span></label>' +
        '<label class="check" style="margin:0"><input type="checkbox" name="mobile" value="1"' + (f.mobile ? ' checked' : '') + '><span class="small">Só com celular</span></label>' +
        '<button class="btn btn-line btn-sm" type="submit">Filtrar</button>' + (qs ? ' <a class="small" href="#/captacao">limpar</a>' : '') + '</form>' +
        '<div class="card table-wrap" style="padding:8px 12px">' + (d.prospects.length ? '<table class="t"><thead><tr><th>Nome</th><th>Cidade</th><th>Contato</th><th>Situação</th><th></th></tr></thead><tbody>' +
          d.prospects.map(function (p) {
            return '<tr><td><b>' + esc(p.name) + '</b>' + (p.priority ? ' ' + statusBadge('ortodontia', 'honey') : '') + '<div class="small muted">' + esc(d.categories[p.category] || p.category) + (p.cnpj ? ' · CNPJ ' + esc(p.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')) : '') + '</div></td>' +
              '<td>' + esc(p.city + '/' + p.uf) + '</td>' +
              '<td class="small">' + (p.phone ? esc(AS.phone(p.phone)) + (p.mobile ? '' : ' (fixo)') : '—') + (p.email ? '<br>' + esc(p.email) : '') + '</td>' +
              '<td>' + statusBadge(PROSPECT_STATUS[p.status], p.status === 'saiu' ? 'red' : p.status === 'cadastrado' ? 'green' : '') + (p.invited_at ? '<div class="small muted">' + esc(AS.date(p.invited_at)) + '</div>' : '') + '</td>' +
              '<td>' + (p.status !== 'saiu' ? '<button class="btn btn-line btn-sm" data-optout="' + p.id + '">Não quer</button>' : '') + '</td></tr>';
          }).join('') + '</tbody></table>' : '<p class="muted" style="padding:14px">Nenhum contato. Rode o BuscarDentistas.exe (instruções acima).</p>') + '</div>' +
        (d.total > d.pageSize ? '<div class="row" style="justify-content:center">' + (d.page > 1 ? '<a class="btn btn-line btn-sm" href="' + link({}) + '&page=' + (d.page - 1) + '">Anterior</a>' : '') +
          '<span class="small muted">Página ' + d.page + ' de ' + Math.ceil(d.total / d.pageSize) + ' · ' + d.total + ' contatos</span>' +
          (d.page * d.pageSize < d.total ? '<a class="btn btn-line btn-sm" href="' + link({}) + '&page=' + (d.page + 1) + '">Próxima</a>' : '') + '</div>' : '');
      var m = mount(html, 'captacao');
      $('#pff', m).addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = formData($('#pff', m));
        location.hash = link({ q: fd.q, city: fd.city, category: fd.category, priority: fd.priority ? '1' : '', mobile: fd.mobile ? '1' : '' });
      });
      $all('[data-optout]', m).forEach(function (b) {
        b.addEventListener('click', function () {
          if (!confirm('Marcar como "não quer receber"? O contato sai da lista para sempre e o telefone e o e-mail são apagados.')) return;
          busyBtn(b, api('/api/admin/prospects/' + b.getAttribute('data-optout') + '/optout', { method: 'POST', body: {} })).then(function () { adminProspects(query); }).catch(function (e) { alert(e.message); });
        });
      });
    }).catch(function (e) { errorView(e, 'captacao'); });
  }

  function adminPrices() {
    loading('precos');
    api('/api/admin/settings/prices').then(function (d) {
      var P = d.prices, L = d.consultLimits;
      var html = '<h1>Preços</h1>' +
        '<form class="card" id="prf" style="max-width:560px"><p class="small muted">Estes valores aparecem <b>só na página particular do paciente</b>, depois do parecer (nunca no site público, por causa das normas do CRO). O botão "Agendar escaneamento" só aparece para o paciente quando o valor do escaneamento estiver preenchido.</p>' +
        field('scan', 'Escaneamento e documentação (R$)', P.scan || '', 'inputmode="decimal" required') +
        '<h3>Tratamento por grau de dificuldade</h3>' +
        field('simples', 'Caso simples — até ' + L.simples + ' consultas (R$)', P.simples || '', 'inputmode="decimal"') +
        field('mediano', 'Média complexidade — até ' + L.mediano + ' consultas (R$)', P.mediano || '', 'inputmode="decimal"') +
        field('complexo', 'Caso complexo — até ' + L.complexo + ' consultas (R$)', P.complexo || '', 'inputmode="decimal"') +
        '<h3>Custo dos alinhadores (modelo preço próprio)</h3><p class="small muted">No modelo em que o dentista define o preço, este valor fica com a AlignSystem e o restante é dividido 80% dentista / 20% AlignSystem.</p>' +
        field('aligner_simples', 'Alinhadores — caso simples (R$)', (P.aligner || {}).simples || '', 'inputmode="decimal"') +
        field('aligner_mediano', 'Alinhadores — média complexidade (R$)', (P.aligner || {}).mediano || '', 'inputmode="decimal"') +
        field('aligner_complexo', 'Alinhadores — caso complexo (R$)', (P.aligner || {}).complexo || '', 'inputmode="decimal"') +
        '<button class="btn btn-primary" type="submit">Salvar preços</button><div class="fmsg"></div></form>';
      var m = mount(html, 'precos');
      onSubmit($('#prf', m), function (f) { return api('/api/admin/settings/prices', { method: 'PUT', body: f }).then(function () { return 'Preços salvos.'; }); });
    }).catch(function (e) { errorView(e, 'precos'); });
  }

  // Tabela de preços do dentista: uma coluna por marca de alinhador (nacional ou importado)
  var PRICE_ROWS = [
    ['scan', 'Escaneamento e submissão do caso'],
    ['simples', 'Caso simples'], ['mediano', 'Média complexidade'], ['complexo', 'Caso complexo'],
  ];
  var MAX_BRANDS = 6;
  function brandsOf(P) {
    if (P && P.brands && P.brands.length) return P.brands.slice();
    if (P && (P.simples || P.mediano || P.complexo)) return [{ name: '', origin: 'nacional', simples: P.simples, mediano: P.mediano, complexo: P.complexo }];
    return [];
  }
  function ownPriceForm(P, L, extra) {
    var brands = brandsOf(P);
    while (brands.length < 3) brands.push({ origin: 'nacional' });
    return '<div class="price-table" data-limits="' + esc(JSON.stringify(L)) + '">' + priceTableHtml(brands, L) + '</div>' + (extra || '');
  }
  function priceTableHtml(brands, L) {
    var lim = { simples: L.simples, mediano: L.mediano, complexo: L.complexo };
    var inp = function (i, k, v, attrs) { return '<input name="b' + i + '_' + k + '" value="' + esc(v == null ? '' : v) + '" ' + (attrs || 'inputmode="decimal" placeholder="R$"') + ' style="min-width:110px">'; };
    var head = '<tr><td style="min-width:190px"><b>Marca do alinhador</b></td>' + brands.map(function (b, i) { return '<td>' + inp(i, 'name', b.name, 'placeholder="Marca" maxlength="60"') + '</td>'; }).join('') + '</tr>' +
      '<tr><td><b>Nacional ou importado</b></td>' + brands.map(function (b, i) {
        return '<td><select name="b' + i + '_origin" style="min-width:110px"><option value="nacional"' + (b.origin !== 'importado' ? ' selected' : '') + '>Nacional</option><option value="importado"' + (b.origin === 'importado' ? ' selected' : '') + '>Importado</option></select></td>';
      }).join('') + '</tr>';
    var rows = PRICE_ROWS.map(function (r) {
      return '<tr><td><b>' + esc(r[1]) + '</b>' + (lim[r[0]] ? '<div class="small muted">até ' + lim[r[0]] + ' consultas</div>' : '') + '</td>' +
        brands.map(function (b, i) { return '<td>' + inp(i, r[0], b[r[0]]) + '</td>'; }).join('') + '</tr>';
    }).join('');
    var ref = '<tr><td><b>Refinamento</b><div class="small muted">valor por consulta e quantas consultas</div></td>' + brands.map(function (b, i) {
      return '<td>' + inp(i, 'refValue', b.refValue) + '<input name="b' + i + '_refCount" value="' + esc(b.refCount == null ? '' : b.refCount) + '" type="number" min="0" max="30" placeholder="nº consultas" style="margin-top:6px;min-width:110px"></td>';
    }).join('') + '</tr>';
    return '<div class="table-wrap" style="overflow-x:auto"><table class="t">' + head + rows + ref + '</table></div>' +
      (brands.length < MAX_BRANDS ? '<button type="button" class="btn btn-line btn-sm add-brand" style="margin:8px 0 14px">+ Adicionar marca</button>' : '') +
      '<p class="small muted">Deixe em branco a coluna que não for usar. Valores em reais (R$).</p>';
  }
  function readPriceTable(form) {
    var f = formData(form), brands = [];
    for (var i = 0; i < MAX_BRANDS; i++) {
      if (f['b' + i + '_name'] === undefined) break;
      var b = { name: f['b' + i + '_name'], origin: f['b' + i + '_origin'] };
      ['scan', 'simples', 'mediano', 'complexo', 'refValue', 'refCount'].forEach(function (k) { b[k] = f['b' + i + '_' + k]; });
      if (b.name || b.scan || b.simples || b.mediano || b.complexo || b.refValue || b.refCount) brands.push(b);
    }
    return { brands: brands };
  }
  function wirePriceTable(form) {
    if (!form) return;
    form.addEventListener('click', function (e) {
      if (!e.target.classList.contains('add-brand')) return;
      var box = $('.price-table', form);
      var L = JSON.parse(box.getAttribute('data-limits'));
      var cur = readPriceTable(form).brands;
      var n = $all('input[name$="_name"]', box).length;
      while (cur.length < n) cur.push({ origin: 'nacional' });
      cur.push({ origin: 'nacional' });
      box.innerHTML = priceTableHtml(cur, L);
    });
  }

  // Assinatura com o dedo ou o mouse (fundo branco, traço escuro)
  function sigPadHtml(id, label) {
    return '<div class="field"><label>' + esc(label) + '</label><div style="border:1.5px dashed var(--line,#ccc);border-radius:12px;background:#fff;position:relative">' +
      '<canvas id="' + id + '" width="900" height="300" style="width:100%;height:170px;touch-action:none;display:block;border-radius:12px"></canvas>' +
      '<button type="button" class="btn btn-line btn-sm" data-clear="' + id + '" style="position:absolute;right:8px;top:8px">Limpar</button></div></div>';
  }
  function sigPad(canvas) {
    var ctx = canvas.getContext('2d'), drawing = false, dirty = false, last = null;
    function reset() { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); dirty = false; }
    function pos(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height }; }
    reset();
    ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
    canvas.addEventListener('pointerdown', function (e) { drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId); e.preventDefault(); });
    canvas.addEventListener('pointermove', function (e) {
      if (!drawing) return;
      var p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; dirty = true; e.preventDefault();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) { canvas.addEventListener(t, function () { drawing = false; }); });
    return { clear: reset, empty: function () { return !dirty; }, data: function () { return canvas.toDataURL('image/png'); } };
  }
  function authBadge(a, L) {
    var kind = { solicitada: 'honey', autorizada: 'green', realizada: 'green', negada: 'red', cancelada: '' }[a.status] || '';
    return statusBadge(L.AUTH_STATUS[a.status], kind) + ' ' + (a.urgency === 'urgencia' ? statusBadge('URGÊNCIA', 'red') : statusBadge('Rotina', ''));
  }
  function authInfo(a, L) {
    return '<div><b>' + esc(L.MILESTONES[a.milestone]) + '</b> · pedido em ' + esc(AS.date(a.created_at, true)) + (a.planned_for ? ' · previsto para ' + esc(AS.date(a.planned_for)) : '') +
      (a.dentist_name ? ' · ' + esc(a.dentist_name) : '') + '</div>' +
      '<div class="small" style="white-space:pre-line;margin-top:4px"><b>Justificativa:</b> ' + esc(a.justification) + '</div>' +
      (a.over_limit ? '<div class="small" style="color:#A8452F;margin-top:4px"><b>Acima do limite de consultas do contrato</b>: exige termo aditivo pago pelo paciente.</div>' : '') +
      (a.decision_note ? '<div class="small muted" style="margin-top:4px"><b>Equipe:</b> ' + esc(a.decision_note) + '</div>' : '');
  }
  function payoutHtml(e) {
    return e.payout_date ? '<div class="small" style="margin-top:6px"><b>Pagamento previsto:</b> ' + esc(AS.date(e.payout_date)) + (e.validated_at ? '' : ' (depois da validação)') + '</div>' : '';
  }
  function signaturesHtml(e) {
    if (!e.has_patient_signature || !e.has_dentist_signature) return '<div class="small" style="color:#A8452F;margin-top:6px">Registro sem autorização prévia ou sem assinaturas: não pode ser validado.</div>';
    return '<div class="row" style="gap:14px;margin-top:8px;flex-wrap:wrap">' +
      '<div class="small muted">Paciente (' + esc(e.patient_signer || '') + ')<br><img src="/api/evidences/' + e.id + '/signature/paciente" alt="Assinatura do paciente" style="height:60px;background:#fff;border:1px solid #ddd;border-radius:8px"></div>' +
      '<div class="small muted">Dentista<br><img src="/api/evidences/' + e.id + '/signature/dentista" alt="Assinatura do dentista" style="height:60px;background:#fff;border:1px solid #ddd;border-radius:8px"></div>' +
      '<div class="small muted">Assinado em ' + esc(AS.date(e.signed_at, true)) + '<br>IP ' + esc(e.signed_ip || '') + '</div></div>';
  }

  function dentistPrices() {
    loading('precos');
    api('/api/dentist/prices').then(function (d) {
      var html = '<h1>Meus preços</h1><form class="card" id="dpf">' +
        '<p class="small muted">Valor total do tratamento que o paciente vê na página dele (nunca no site público). Do valor pago, a AlignSystem desconta o custo dos alinhadores, que ela fornece, e o restante é dividido: <b>' + d.dentistPct + '% para você</b> e ' + d.platformPct + '% para a AlignSystem, pelo diagnóstico e planejamento compartilhados. O repasse cai direto na sua conta (split).</p>' +
        ownPriceForm(d.prices || {}, d.consultLimits) +
        '<button class="btn btn-primary" type="submit">Salvar meus preços</button><div class="fmsg"></div></form>';
      var m = mount(html, 'precos');
      wirePriceTable($('#dpf', m));
      onSubmit($('#dpf', m), function (f, form) { return api('/api/dentist/prices', { method: 'PUT', body: readPriceTable(form) }).then(function () { return 'Preços salvos.'; }); });
    }).catch(function (e) { errorView(e, 'precos'); });
  }

  var APPT_STATUS = { agendado: 'Agendado', realizado: 'Realizado', cancelado: 'Cancelado', faltou: 'Faltou' };

  // ------------------------------------------------------------ layout
  function shell(content, active) {
    var nav = me.role === 'admin'
      ? [['#/', 'Início', 'inicio'], ['#/casos', 'Pacientes', 'casos'], ['#/parceiros', 'Dentistas parceiros', 'parceiros'], ['#/cobertura', 'Cobertura e marketing', 'cobertura'], ['#/captacao', 'Captação de dentistas', 'captacao'], ['#/precos', 'Preços', 'precos'], ['#/equipe', 'Equipe', 'equipe'], ['#/conta', 'Minha conta', 'conta']]
      : [['#/', 'Meus casos', 'inicio'], ['#/meus-precos', 'Meus preços', 'precos'], ['#/conta', 'Minha conta', 'conta']];
    return '<div class="mobile-top"><span class="logo"><img src="/assets/logo-branca.svg" alt="AlignSystem" height="28"></span><button class="btn btn-sm btn-line" style="color:#fff;border-color:rgba(255,255,255,.4)" id="menuBtn">Menu</button></div>' +
      '<div class="shell"><aside class="side" id="side"><span class="logo"><img src="/assets/logo-branca.svg" alt="AlignSystem" height="30"></span>' +
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
    root.innerHTML = '<div class="top"><div class="in"><a class="logo" href="/" aria-label="AlignSystem — página inicial"><picture><source srcset="/assets/logo-branca.svg" media="(prefers-color-scheme: dark)"><img src="/assets/logo-cor.svg" alt="AlignSystem" width="210" height="36"></picture></a></div></div>' +
      '<main class="container" style="max-width:440px"><form class="card" id="lf"><h1>Entrar no painel</h1>' +
      '<p class="muted small">Equipe AlignSystem e dentistas parceiros.</p>' +
      field('email', 'E-mail', '', 'type="email" autocomplete="username" required') +
      field('password', 'Senha', '', 'type="password" autocomplete="current-password" required') +
      '<div class="field hidden" id="codeField"><label for="code">Código do aplicativo autenticador</label><input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="6 dígitos (ou código de recuperação)"></div>' +
      '<button class="btn btn-primary" type="submit">Entrar</button> <a href="#" id="forgot" class="small" style="margin-left:10px">Esqueci a senha</a><div class="fmsg"></div></form>' +
      '<p class="small muted center">Dentista e ainda não é parceiro? <a href="/parceiros#credenciamento">Cadastre-se</a></p></main>';
    onSubmit($('#lf'), function (d) {
      return api('/api/auth/login', { method: 'POST', body: d }).then(function () { boot(); return false; }).catch(function (err) {
        if (err.data && err.data.needCode) { $('#codeField').classList.remove('hidden'); $('#code').focus(); }
        throw err;
      });
    });
    $('#forgot').addEventListener('click', function (e) {
      e.preventDefault();
      var box = document.createElement('div');
      box.className = 'lightbox';
      box.style.cursor = 'default';
      box.innerHTML = '<form class="card" id="ff" style="max-width:420px;width:100%;margin:0" role="dialog" aria-modal="true" aria-labelledby="ffT">' +
        '<h2 id="ffT">Recuperar senha</h2><p class="small muted">Digite o e-mail que você usa para entrar no painel.</p>' +
        field('femail', 'E-mail', $('#email').value || '', 'type="email" autocomplete="username" required') +
        '<div class="row"><button class="btn btn-primary" type="submit">Enviar instruções</button><button class="btn btn-line" type="button" id="ffClose">Cancelar</button></div><div class="fmsg"></div></form>';
      document.body.appendChild(box);
      var close = function () { box.remove(); };
      $('#ffClose', box).addEventListener('click', close);
      box.addEventListener('click', function (ev) { if (ev.target === box) close(); });
      $('#femail', box).focus();
      $('#ff', box).addEventListener('submit', function (ev) {
        ev.preventDefault();
        var btn = $('button[type=submit]', box);
        btn.disabled = true;
        api('/api/auth/forgot', { method: 'POST', body: { email: $('#femail', box).value } }).then(function () {
          $('#ff', box).innerHTML = '<h2>Pronto</h2><div class="msg ok">Se o e-mail estiver cadastrado, você vai receber em alguns minutos as instruções para criar uma nova senha. ' +
            'O link vale por 2 horas. Confira também a caixa de spam.</div><button class="btn btn-primary" type="button" id="ffOk">Voltar para o login</button>';
          $('#ffOk', box).addEventListener('click', close);
        }).catch(function (err) { btn.disabled = false; flash($('.fmsg', box), 'err', err.message); });
      });
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
    var box = document.createElement('div');
    box.className = 'card';
    box.style.maxWidth = '480px';
    $('#main').appendChild(box);
    function render2fa() {
      if (me.totpEnabled) {
        box.innerHTML = '<h2>Verificação em duas etapas</h2><div class="msg ok">Ativa. Ao entrar, o painel pede o código do aplicativo autenticador.</div>' +
          '<details><summary class="btn btn-line btn-sm">Desativar</summary><form id="tdf" style="margin-top:12px">' + field('password', 'Senha', '', 'type="password" required') + field('code', 'Código do aplicativo', '', 'inputmode="numeric" required') +
          '<button class="btn btn-danger btn-sm" type="submit">Desativar verificação</button><div class="fmsg"></div></form></details>';
        onSubmit($('#tdf', box), function (d) { return api('/api/auth/totp/disable', { method: 'POST', body: d }).then(function () { me.totpEnabled = false; render2fa(); return false; }); });
        return;
      }
      box.innerHTML = '<h2>Verificação em duas etapas</h2><p class="small muted">Protege o painel mesmo se a senha vazar: além da senha, o login pede um código de 6 dígitos do celular (Google Authenticator, Microsoft Authenticator ou similar).</p>' +
        (me.role === 'admin' ? '<div class="msg warn">Recomendado para administradores.</div>' : '') +
        '<button class="btn btn-primary" id="tsetup">Ativar</button><div id="tbox"></div>';
      $('#tsetup', box).addEventListener('click', function (e) {
        busyBtn(e.target, api('/api/auth/totp/setup', { method: 'POST', body: {} })).then(function (r) {
          $('#tbox', box).innerHTML = '<ol class="small" style="padding-left:18px;margin:14px 0"><li>Instale um aplicativo autenticador no celular.</li><li>No aplicativo, toque em adicionar e leia o QR code abaixo.</li><li>Digite o código de 6 dígitos que aparecer.</li></ol>' +
            '<div style="background:#fff;display:inline-block;padding:8px;border-radius:8px">' + r.qr + '</div>' +
            '<p class="small muted">Sem câmera? Digite a chave: <code style="word-break:break-all">' + esc(r.secret) + '</code></p>' +
            '<form id="tef">' + field('code', 'Código de 6 dígitos', '', 'inputmode="numeric" autocomplete="one-time-code" required') + '<button class="btn btn-green" type="submit">Confirmar e ativar</button><div class="fmsg"></div></form>';
          onSubmit($('#tef', box), function (d) {
            return api('/api/auth/totp/enable', { method: 'POST', body: d }).then(function (x) {
              me.totpEnabled = true;
              box.innerHTML = '<h2>Verificação em duas etapas ativada ✓</h2><div class="msg warn"><b>Guarde estes códigos de recuperação</b> (cada um funciona uma vez, se você perder o celular). Eles não serão mostrados de novo.</div>' +
                '<pre style="font-size:15px;line-height:1.8;background:var(--bg-deep);padding:12px;border-radius:8px">' + x.recoveryCodes.map(esc).join('\n') + '</pre>' +
                '<button class="btn btn-line btn-sm" id="cpc">Copiar códigos</button> <button class="btn btn-primary btn-sm" id="okc">Já guardei</button>';
              $('#cpc', box).addEventListener('click', function (e) { AS.copy(x.recoveryCodes.join('\n'), e.target); });
              $('#okc', box).addEventListener('click', render2fa);
              return false;
            });
          });
        }).catch(function (err) { alert(err.message); });
      });
    }
    render2fa();
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
      if (d.adminsWithout2fa && d.adminsWithout2fa.length) warn.push('Segurança: ative a verificação em duas etapas em "Minha conta" (' + d.adminsWithout2fa.join(', ') + ').');
      if (!d.integrations.contractsReviewed) warn.push('Contratos: exibidos como "minuta em revisão jurídica" até CONTRACTS_REVIEWED=true.');
      var cs = function (k) { return d.cases[k] || 0; };
      var html = '<h1>Início</h1>' +
        (warn.length ? '<div class="card"><h2>Pendências de configuração</h2>' + warn.map(function (w) { return '<div class="msg warn">' + esc(w) + '</div>'; }).join('') + '</div>' : '') +
        '<div class="card"><h2>Avisos por e-mail</h2><p class="small muted">Caso novo, fotos recebidas e pagamentos são avisados por e-mail. Não está chegando? Teste aqui:</p>' +
        '<button class="btn btn-line btn-sm" id="testMail">Testar e-mail de aviso</button><div id="testMailMsg"></div></div>' +
        '<div class="stats">' +
        '<a class="stat" href="#/casos?status=novo" style="text-decoration:none;color:inherit"><b>' + cs('novo') + '</b><span>Novos contatos</span></a>' +
        '<a class="stat" href="#/casos?status=fotos_enviadas" style="text-decoration:none;color:inherit"><b>' + cs('fotos_enviadas') + '</b><span>Fotos aguardando parecer</span></a>' +
        '<a class="stat" href="#/casos?status=contrato_enviado" style="text-decoration:none;color:inherit"><b>' + cs('contrato_enviado') + '</b><span>Contratos aguardando aceite</span></a>' +
        '<a class="stat" href="#/casos?status=em_tratamento" style="text-decoration:none;color:inherit"><b>' + cs('em_tratamento') + '</b><span>Em tratamento</span></a>' +
        '<a class="stat" href="#/parceiros" style="text-decoration:none;color:inherit"><b>' + ((d.dentists.lead || 0) + (d.dentists.em_analise || 0)) + '</b><span>Dentistas aguardando análise</span></a>' +
        '<div class="stat"><b>' + esc(AS.money(d.paid30.total)) + '</b><span>Recebido em 30 dias</span></div>' +
        '</div>' + (d.pendingAuth && d.pendingAuth.length ? '<div class="card"><h2>Pedidos de autorização de atendimento</h2><div class="list">' + d.pendingAuth.map(function (a) {
          return '<div class="it"><a href="#/caso/' + a.case_id + '"><b>#' + a.code + ' · ' + esc(a.name) + '</b> · ' + esc(L.MILESTONES[a.milestone]) + '</a><span>' +
            (a.urgency === 'urgencia' ? statusBadge('URGÊNCIA', 'red') : statusBadge('Rotina', '')) + (a.over_limit ? ' ' + statusBadge('acima do limite', 'honey') : '') + ' <span class="small muted">' + esc(a.dentist_name || '') + ' · ' + esc(AS.date(a.created_at, true)) + '</span></span></div>';
        }).join('') + '</div></div>' : '') + '<div class="card"><h2>Funil de pacientes</h2><div class="list">' +
        Object.keys(L.CASE_STATUS).map(function (k) { return '<div class="it"><a href="#/casos?status=' + k + '">' + esc(L.CASE_STATUS[k]) + '</a><b>' + cs(k) + '</b></div>'; }).join('') +
        '</div></div>';
      var m = mount(html, 'inicio');
      var tb = $('#testMail', m);
      tb.addEventListener('click', function () {
        busyBtn(tb, api('/api/admin/test-email', { method: 'POST', body: {} })).then(function (r) {
          $('#testMailMsg', m).innerHTML = r.sent
            ? '<div class="msg ok">E-mail enviado para <b>' + esc(r.to) + '</b>. Confira a caixa de entrada e o spam em alguns minutos. Se não chegar, o problema está no repasse desse endereço.</div>'
            : '<div class="msg err">Não saiu. ' + esc(r.error || (r.skipped ? 'E-mail não configurado.' : 'Erro desconhecido.')) + '</div>';
        }).catch(function (e) { $('#testMailMsg', m).innerHTML = '<div class="msg err">' + esc(e.message) + '</div>'; });
      });
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
        '<div class="card table-wrap" style="padding:8px 12px">' + (d.cases.length ? '<table class="t"><thead><tr><th>#</th><th>Paciente</th><th>Cidade</th><th>Outras cidades</th><th>Situação</th><th>Fotos</th><th>Dentista</th><th>Entrada</th></tr></thead><tbody>' +
        d.cases.map(function (c) {
          return '<tr class="click" data-go="#/caso/' + c.id + '"><td>' + c.code + '</td><td><b>' + esc(c.name) + '</b><div class="small muted">' + esc(AS.phone(c.whatsapp)) + '</div></td><td>' + esc(c.city + (c.uf ? '/' + c.uf : '')) + '</td><td>' + coverageBadge(c.coverage_km) + '</td><td>' +
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
      var att = c.attendance;
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
        (function () {
          var mo = c.malocclusion || { types: [] };
          return '<fieldset class="field" style="border:1px solid var(--line);border-radius:10px;padding:10px 14px"><legend class="small" style="font-weight:600;color:var(--ink-60);padding:0 6px">Tipo de má oclusão (uso interno)</legend>' +
            '<div class="grid2" style="gap:4px 14px">' + Object.keys(L.MALOCCLUSION).map(function (k) {
              return '<label class="check" style="margin:0;font-weight:400;color:var(--ink)"><input type="checkbox" data-mo="' + k + '"' + (mo.types.indexOf(k) >= 0 ? ' checked' : '') + '><span>' + esc(L.MALOCCLUSION[k]) + '</span></label>';
            }).join('') + '</div>' +
            '<div class="field" style="margin-top:8px"><label for="moTeeth">Agenesias: quais dentes</label><input id="moTeeth" placeholder="Ex.: 12, 22" value="' + esc(mo.agenesisTeeth || '') + '"></div></fieldset>';
        })() +
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
            (k.accepted_by_guardian ? ' (responsável legal)' : '') + (k.accepted_birth_date ? ' · nasc. ' + esc(AS.date(String(k.accepted_birth_date).slice(0, 10))) : '') + ' · IP ' + esc(k.ip) + ' · versão ' + esc(k.version) + '</div></div>' +
            '<a class="btn btn-line btn-sm" target="_blank" href="/api/admin/consents/' + k.id + '/comprovante">Comprovante</a></div>';
        }).join('') + '</div>' : '<div class="msg warn">O paciente ainda não aceitou o termo. O envio de fotos e a teleorientação ficam bloqueados até o aceite.</div>') +
        '</div>' +

        // fotos
        (c.blocked_at ? '<div class="msg err"><b>Caso bloqueado</b> em ' + esc(AS.date(c.blocked_at, true)) + ' (' + esc(c.blocked_reason || '') + '). O link do paciente está desativado. <button class="btn btn-line btn-sm" id="unblock">Desbloquear</button></div>' : '') +
        (d.scanOrders && d.scanOrders.length ? (function () {
          var o = d.scanOrders[0];
          var lab = { aguardando_pagamento: 'aguardando pagamento', pago: 'pago — agendar', agendado: 'agendado', realizado: 'realizado', cancelado: 'cancelado' }[o.status];
          return '<div class="card"><h2>Escaneamento</h2><p>' + statusBadge(lab, o.status === 'pago' ? 'honey' : o.status === 'aguardando_pagamento' ? '' : 'green') + ' ' + esc(AS.money(o.price)) + ' · ' + (o.billing_type === 'PIX' ? 'Pix' : 'cartão') + '</p>' +
            '<p class="small muted">Termo aceito por ' + esc(o.accepted_name) + ' em ' + esc(AS.date(o.accepted_at, true)) + ' (IP ' + esc(o.accepted_ip || '') + ', versão ' + esc(o.terms_version) + ')' + (o.paid_at ? ' · pago em ' + esc(AS.date(o.paid_at, true)) : '') + '</p>' +
            (o.preference ? '<div class="msg warn">Preferência de horário: <b>' + esc(o.preference) + '</b>. Agende abaixo em "Agendamentos" com o tipo Documentação.</div>' : '') + '</div>';
        })() : '') +
        '<div class="card" id="photosCard"><h2>Fotos da pré-avaliação (' + evalPhotos.length + '/7)</h2>' +
        (function () {
          var pend = d.photos.filter(function (p) { return p.uploaded_by === 'paciente' && !p.reviewed_at; }).length;
          return pend ? '<div class="msg warn"><b>' + pend + ' foto(s) do paciente aguardando revisão.</b> O dentista só vê depois que você liberar. ' +
            '<button class="btn btn-green btn-sm" id="releasePhotos">Fotos ok, liberar para o dentista</button> <button class="btn btn-danger btn-sm" id="blockCase">Conteúdo impróprio: bloquear caso</button></div>' : '';
        })() +
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
        field('replacementValue', 'Reposição de alinhador (R$/un.)', plan.replacementValue, 'inputmode="decimal"') +
        '<div class="field"><label for="pcx">Complexidade</label><select id="pcx" name="complexity">' + opt('', '—', plan.complexity || '') + opt('simples', 'Simples (até 8 consultas)', plan.complexity || '') + opt('mediano', 'Média (até 10 consultas)', plan.complexity || '') + opt('complexo', 'Complexo (até 15 consultas)', plan.complexity || '') + '</select></div>' +
        '<div class="field"><label for="pmodel">Modelo</label><select id="pmodel" name="model">' + opt('parceiro', 'Dentista parceiro (50/30/20, split)', plan.model || 'parceiro') + opt('rede', 'AlignSystem 100% (rede credenciada, raio 300 km)', plan.model || 'parceiro') + opt('proprio', 'Preço do dentista (alinhadores + 80/20)', plan.model || 'parceiro') + '</select></div>' +
        field('travel', 'Deslocamentos incluídos (R$)', plan.travel != null ? plan.travel : (att && att.choice === 'mais_proximo_viagem' ? att.travelTotal : ''), 'inputmode="decimal"') + '</div>' +
        (att ? '<div class="msg ' + (att.choice === 'sem_cobertura' ? 'warn' : 'ok') + '"><b>Questionário de atendimento:</b> ' + esc(att.label) + ' · ' + esc(att.city + '/' + att.uf) +
          (att.km != null ? ' · credenciado mais próximo: ' + esc(att.nearestCity + '/' + att.nearestUf) + ' (~' + att.km + ' km)' : '') +
          (att.travelTotal ? ' · 4 deslocamentos estimados: ' + esc(AS.money(att.travelTotal)) + ' (' + esc(AS.money(att.travelPerTrip)) + ' cada)' : '') + '</div>'
          : '<p class="small muted">O paciente ainda não respondeu o questionário de atendimento presencial (obrigatório no modelo AlignSystem 100%).</p>') +
        area('treatmentNotes', 'Anexo I — resumo do plano de tratamento', plan.treatmentNotes) +
        '<div class="row"><button class="btn btn-primary" type="submit">Salvar plano</button><button class="btn btn-green" type="button" id="genContract">Gerar contrato para aceite</button></div><div class="fmsg"></div>' +
        (d.contracts.length ? '<div class="list" style="margin-top:14px">' + d.contracts.map(function (ct) {
          return '<div class="it"><div><b>' + esc(ct.title) + '</b><div class="small muted">' + esc(AS.date(ct.created_at, true)) + ' · ' +
            (ct.status === 'aceito' ? 'aceito por ' + esc(ct.accepted_name) + ' em ' + esc(AS.date(ct.accepted_at, true)) + ' (IP ' + esc(ct.accepted_ip) + ')' : esc(ct.status)) + '</div></div>' +
            (ct.status !== 'cancelado' ? '<div class="row"><a class="btn btn-line btn-sm" target="_blank" href="' + esc(ct.url) + '">Abrir</a><button type="button" class="btn btn-line btn-sm" data-copy="' + esc(ct.url) + '">Copiar link</button>' +
              (ct.status === 'enviado' ? '<a class="btn btn-green btn-sm" target="_blank" rel="noopener" href="' + esc(AS.waLink(c.whatsapp, 'Olá, ' + c.name.split(' ')[0] + '! Seu contrato AlignSystem está pronto para leitura e aceite: ' + ct.url)) + '">Enviar no WhatsApp</a>' : '') + '</div>' : '') + '</div>';
        }).join('') + '</div>' : '') + '</form>' +

        // cobranças
        '<form class="card" id="chf"><h2>Cobrança (Asaas)</h2>' +
        '<p class="small muted">O paciente recebe um link e escolhe: <b>Pix à vista com 12% de desconto</b>, <b>cartão em até 18x sem juros</b> ou <b>boleto</b> (entrada de 50% por Pix/cartão + saldo em até 18 boletos).</p>' +
        '<div class="grid2">' +
        field('description', 'Descrição', 'AlignSystem — tratamento (caso ' + c.code + ')') +
        field('value', 'Valor total (tratamento + deslocamentos) (R$)', plan.total ? Math.round((Number(plan.total) + Number(plan.model === 'rede' ? plan.travel || 0 : 0)) * 100) / 100 : '', 'inputmode="decimal" required') +
        field('boletoMax', 'Boletos do saldo em até (x)', Math.min(18, plan.months || 18), 'type="number" min="1" max="18"') + '</div>' +
        '<div class="check field"><input type="checkbox" id="boleto" name="boleto" checked><label for="boleto">Permitir boleto (só depois de analisar o crédito do paciente)</label></div>' +
        '<div class="field"><label for="dentistShare">Repasse ao dentista do caso (' + esc(dentistName || 'sem dentista') + ')</label><select id="dentistShare">' +
          opt('', 'Sem repasse (AlignSystem recebe tudo)', plan.model === 'rede' || !c.dentist_id ? '' : plan.model === 'proprio' ? '80/20' : '50/30/20') +
          opt('50/30/20', 'Modelo parceiro: 30% do valor ao dentista', plan.model === 'rede' || !c.dentist_id ? '' : plan.model === 'proprio' ? '80/20' : '50/30/20') +
          opt('80/20', 'Preço do dentista: desconta os alinhadores e repassa 80% do restante', plan.model === 'rede' || !c.dentist_id ? '' : plan.model === 'proprio' ? '80/20' : '50/30/20') + '</select></div>' +
        '<button class="btn btn-primary" type="submit">Criar link de pagamento e enviar ao paciente</button><div class="fmsg"></div>' +
        (d.charges.length ? '<div class="list" style="margin-top:14px">' + d.charges.map(function (ch) {
          var pays = d.payments.filter(function (p) { return p.charge_id === ch.id && p.status !== 'DELETED'; });
          var paid = pays.filter(function (p) { return /RECEIVED|CONFIRMED/.test(p.status); }).length;
          return '<div class="it"><div><b>' + esc(ch.description) + '</b><div class="small muted">' + esc(AS.money(ch.value)) + ' · ' + (ch.pay_option === 'PIX' ? 'Pix à vista' : ch.pay_option === 'CREDIT_CARD' ? 'cartão ' + (ch.installment_count || 1) + 'x' : ch.pay_option === 'BOLETO' ? 'boleto: entrada + ' + (ch.installment_count || 1) + 'x' : ch.kind === 'integral' ? 'aguardando escolha' : esc(ch.kind)) +
            (pays.length ? ' · ' + paid + '/' + pays.length + ' pagas' : '') + (ch.split ? ' · repasse ' + (ch.split.model === '80/20' ? ch.split.value + '% (alinhadores ' + AS.money(ch.split.alignerCost) + ' + 80/20)' : ch.split.type === 'percent' ? ch.split.value + '%' : AS.money(ch.split.value)) : '') + ' · ' + statusBadge(ch.statusLabel, ch.status === 'cancelado' || ch.status === 'erro' ? 'red' : '') + '</div></div>' +
            '<div class="row">' + (ch.pay_token ? '<button type="button" class="btn btn-line btn-sm" data-copy="' + esc(location.origin + '/pagamento?t=' + ch.pay_token) + '">Copiar link</button>' +
              '<a class="btn btn-green btn-sm" target="_blank" rel="noopener" href="' + esc(AS.waLink(c.whatsapp, 'Olá, ' + c.name.split(' ')[0] + '! Seu link de pagamento AlignSystem: ' + location.origin + '/pagamento?t=' + ch.pay_token)) + '">WhatsApp</a>' : '') +
            (ch.invoice_url ? '<a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="' + esc(ch.invoice_url) + '">Fatura</a>' : '') +
            (ch.status !== 'cancelado' && ch.status !== 'erro' ? '<button type="button" class="btn btn-line btn-sm" data-sync="' + ch.id + '">Atualizar</button><button type="button" class="btn btn-danger btn-sm" data-cancel="' + ch.id + '">Cancelar</button>' : '') + '</div></div>';
        }).join('') + '</div>' : '') + '</form></div>' +

        // autorizações prévias
        '<div class="card"><h2>Autorizações de atendimento</h2>' + ((d.authorizations || []).length ? '<div class="list">' + d.authorizations.map(function (a) {
          return '<div class="it" style="display:block"><div class="row" style="justify-content:space-between;align-items:flex-start;gap:10px">' + authInfo(a, L) + '<div>' + authBadge(a, L) + '</div></div>' +
            (a.status === 'solicitada' ? '<div class="row" style="margin-top:8px"><button type="button" class="btn btn-green btn-sm" data-auth-ok="' + a.id + '">Autorizar</button><button type="button" class="btn btn-danger btn-sm" data-auth-no="' + a.id + '">Negar</button></div>' : '') + '</div>';
        }).join('') + '</div>' : '<p class="muted small">Nenhum pedido de autorização.</p>') + '</div>' +

        // evidências
        '<div class="card"><h2>Atendimentos registrados pelo dentista</h2>' +
        (c.consultLimit ? (function () {
          var v = d.evidences.filter(function (e) { return e.validated_at; }).length;
          return '<div class="msg ' + (v >= c.consultLimit ? 'warn' : 'ok') + '">Consultas incluídas no contrato: <b>' + v + ' de ' + c.consultLimit + '</b> validadas' +
            ((c.plan || {}).model === 'rede' ? ' (' + esc(AS.money(c.consultValue)) + ' cada ao dentista)' : '') +
            (v >= c.consultLimit ? '. Limite atingido: novas consultas e alinhadores adicionais exigem termo aditivo pago pelo paciente.' : '') + '</div>';
        })() : '') + (d.evidences.length ? '<div class="list">' + d.evidences.map(function (e) {
          var ph = d.photos.filter(function (p) { return p.evidence_id === e.id; });
          return '<div class="it" style="display:block"><div class="row" style="justify-content:space-between"><div><b>' + esc(L.MILESTONES[e.milestone]) + '</b> · ' + esc(AS.date(e.performed_at)) + ' · ' + esc(e.dentist_name || '') + '</div>' +
            (e.validated_at ? statusBadge('Validado em ' + AS.date(e.validated_at), 'green') : (e.authorization_id && e.has_patient_signature && e.has_dentist_signature ? '<button class="btn btn-green btn-sm" data-validate="' + e.id + '">Validar atendimento</button>' : statusBadge('sem autorização/assinaturas', 'red'))) + '</div>' +
            (e.notes ? '<p class="small" style="white-space:pre-line;margin-top:6px">' + esc(e.notes) + '</p>' : '') + signaturesHtml(e) + payoutHtml(e) + gallery(ph) + '</div>';
        }).join('') + '</div>' : '<p class="muted small">Nenhum atendimento registrado ainda.</p>') + '</div>' +

        '<div class="card"><h2>Histórico</h2><div class="timeline">' + d.events.map(function (ev) {
          return '<div>' + esc(AS.date(ev.created_at, true)) + ' — <b>' + esc(ev.type.replace(/_/g, ' ')) + '</b> · ' + esc(ev.actor) + '</div>';
        }).join('') + '</div><button class="btn btn-danger btn-sm" id="delCase" style="margin-top:14px">Excluir caso (LGPD)</button></div>';

      var m = mount(html, 'casos');
      var reload = function () { adminCase(id); };
      bindGallery(m, reload);
      $('#copyPortal', m).addEventListener('click', function (e) { AS.copy(c.portalUrl, e.target); });
      $all('[data-copy]', m).forEach(function (b) { b.addEventListener('click', function () { AS.copy(b.getAttribute('data-copy'), b); }); });

      var withMo = function (f) {
        f.malocclusion = { types: $all('[data-mo]', m).filter(function (x) { return x.checked; }).map(function (x) { return x.getAttribute('data-mo'); }), agenesisTeeth: $('#moTeeth', m).value };
        return f;
      };
      $('#moTeeth', m).addEventListener('input', function () { if (this.value) $('[data-mo="agenesia"]', m).checked = true; });
      onSubmit($('#stf', m), function (f) {
        return api('/api/admin/cases/' + id, { method: 'PATCH', body: withMo(f) }).then(function () { setTimeout(reload, 600); return 'Salvo.'; });
      });
      $('#publish', m).addEventListener('click', function (e) {
        var f = withMo(formData($('#stf', m)));
        f.publish_assessment = true;
        busyBtn(e.target, api('/api/admin/cases/' + id, { method: 'PATCH', body: f })).then(reload).catch(function (err) { flash($('#stf .fmsg', m), 'err', err.message); });
      });
      onSubmit($('#df', m), function (f) { return api('/api/admin/cases/' + id, { method: 'PATCH', body: f }).then(function () { return 'Dados salvos.'; }); });
      var rel = $('#releasePhotos', m);
      if (rel) rel.addEventListener('click', function () { busyBtn(rel, api('/api/admin/cases/' + id + '/photos/release', { method: 'POST', body: {} })).then(reload).catch(function (e) { alert(e.message); }); });
      var blk = $('#blockCase', m);
      if (blk) blk.addEventListener('click', function () {
        var reason = prompt('Isto APAGA todas as fotos enviadas pelo paciente e DESATIVA o link dele. Motivo (fica no histórico):', 'conteúdo impróprio');
        if (reason === null) return;
        busyBtn(blk, api('/api/admin/cases/' + id + '/block', { method: 'POST', body: { reason: reason } })).then(reload).catch(function (e) { alert(e.message); });
      });
      var unb = $('#unblock', m);
      if (unb) unb.addEventListener('click', function () { if (confirm('Reativar o link do paciente?')) busyBtn(unb, api('/api/admin/cases/' + id + '/unblock', { method: 'POST', body: {} })).then(reload).catch(function (e) { alert(e.message); }); });
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
          description: f.description, value: f.value, boletoMax: f.boletoMax,
          boleto: $('#boleto', m).checked, dentistShare: $('#dentistShare', m).value,
        };
        if (!confirm('Criar o link de pagamento de ' + AS.money(String(f.value).replace(',', '.')) + ' e enviar ao paciente?')) return false;
        return api('/api/admin/cases/' + id + '/charges', { method: 'POST', body: body }).then(function () { reload(); return false; });
      });
      $all('[data-sync]', m).forEach(function (b) { b.addEventListener('click', function () { busyBtn(b, api('/api/admin/charges/' + b.getAttribute('data-sync') + '/sync', { method: 'POST', body: {} })).then(reload).catch(function (e) { alert(e.message); }); }); });
      $all('[data-cancel]', m).forEach(function (b) {
        b.addEventListener('click', function () {
          if (!confirm('Cancelar esta cobrança no Asaas? Parcelas já pagas não são estornadas.')) return;
          busyBtn(b, api('/api/admin/charges/' + b.getAttribute('data-cancel') + '/cancel', { method: 'POST', body: {} })).then(reload).catch(function (e) { alert(e.message); });
        });
      });
      $all('[data-auth-ok]', m).forEach(function (b) { b.addEventListener('click', function () {
        busyBtn(b, api('/api/admin/authorizations/' + b.getAttribute('data-auth-ok') + '/decide', { method: 'POST', body: { approve: true } })).then(reload).catch(function (e) { alert(e.message); }); }); });
      $all('[data-auth-no]', m).forEach(function (b) { b.addEventListener('click', function () {
        var note = prompt('Motivo para negar (o dentista vai receber):');
        if (!note) return;
        busyBtn(b, api('/api/admin/authorizations/' + b.getAttribute('data-auth-no') + '/decide', { method: 'POST', body: { approve: false, note: note } })).then(reload).catch(function (e) { alert(e.message); }); }); });
      $all('[data-validate]', m).forEach(function (b) { b.addEventListener('click', function () {
        if (c.consultLimit && d.evidences.filter(function (e) { return e.validated_at; }).length >= c.consultLimit &&
          !confirm('Este caso já atingiu o limite de ' + c.consultLimit + ' consultas incluídas no contrato. Validar mesmo assim (consulta extra contratada por aditivo ou autorizada)?')) return;
        busyBtn(b, api('/api/admin/evidences/' + b.getAttribute('data-validate') + '/validate', { method: 'POST', body: {} })).then(reload).catch(function (e) { alert(e.message); }); }); });
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
        '<div class="card table-wrap" style="padding:8px 12px">' + (d.dentists.length ? '<table class="t"><thead><tr><th>Dentista</th><th>CRO</th><th>Cidade</th><th>Outras cidades</th><th>Situação</th><th>Termo</th><th>Recebimento</th><th>Casos</th></tr></thead><tbody>' +
        d.dentists.map(function (x) {
          return '<tr class="click" data-go="#/parceiro/' + x.id + '"><td><b>' + esc(x.name) + '</b><div class="small muted">' + esc(AS.phone(x.phone)) + '</div></td><td>' + esc(x.cro) + '/' + esc(x.cro_uf || '') + '</td><td>' + esc(x.city) + '</td><td class="small">' + ((x.extra_cities || []).length ? esc((x.extra_cities || []).map(function (c) { return c.city; }).join(', ')) : '<span class="muted">só a cidade principal</span>') + '</td><td>' +
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
        '<div class="row" style="justify-content:space-between"><div><h1 style="margin:0">' + esc(x.name) + '</h1><p class="muted">CRO ' + esc(x.cro) + '/' + esc(x.cro_uf || '') + ' · ' + esc([x.city].concat((x.extra_cities || []).map(function (c) { return c.city; })).join(', ')) + ' · ' + esc(x.experience || '') + '</p></div>' +
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
        area('extra_cities', 'Outras cidades onde atende — mesmo estado, até 9 além da principal (uma por linha, ex.: Londrina/PR)', (x.extra_cities || []).map(function (c) { return c.city + '/' + c.uf; }).join('\n')) +
        area('notes', 'Anotações internas', x.notes) + '<button class="btn btn-primary" type="submit">Salvar</button><div class="fmsg"></div></form>' +

        '<div>' +
        '<form class="card" id="apf"><h2>Credenciamento e Termo de Adesão</h2><p class="small muted">Ao aprovar, o sistema cria o acesso ao painel e o Termo de Adesão com os valores abaixo (o dentista recebe por e-mail; você também pode enviar pelo WhatsApp).</p><div class="grid2">' +
        field('avulsaValue', 'Consulta avulsa (R$)', T.avulsaValue, 'inputmode="decimal"') + field('redeValue', 'Consulta no modelo rede (R$)', T.redeValue, 'inputmode="decimal"') +
        field('noticeDays', 'Aviso prévio (dias)', T.noticeDays, 'type="number"') + field('lockMonths', 'Multa se sair antes de (meses)', T.lockMonths, 'type="number"') +
        field('penaltyFixed', 'Multa rescisória fixa (R$)', T.penaltyFixed, 'inputmode="decimal"') +
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

        '<form class="card" id="opf"><h2>Tabela de preços do parceiro</h2><p class="small muted">Usado no modelo "Preço do dentista": desconta os alinhadores e repassa 80% do restante. O dentista também pode editar em "Meus preços".</p>' +
        ownPriceForm(x.prices || {}, { simples: 8, mediano: 10, complexo: 15 }) + '<button class="btn btn-line btn-sm" type="submit">Salvar preços do parceiro</button><div class="fmsg"></div></form>' +
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
      wirePriceTable($('#opf', m));
      onSubmit($('#opf', m), function (f, form) { return api('/api/admin/dentists/' + id + '/prices', { method: 'PUT', body: readPriceTable(form) }).then(function () { return 'Preços salvos.'; }); });
      onSubmit($('#wf', m), function (f) { return api('/api/admin/dentists/' + id, { method: 'PATCH', body: { asaas_wallet_id: f.asaas_wallet_id } }).then(function () { setTimeout(reload, 600); return 'Salvo.'; }); });
    }).catch(function (e) { errorView(e, 'parceiros'); });
  }

  // ------------------------------------------------------------ ADMIN: equipe
  function adminTeam() {
    loading('equipe');
    api('/api/admin/users').then(function (d) {
      var html = '<h1>Equipe</h1><div class="card"><div class="list">' + d.users.map(function (u) {
        return '<div class="it"><div><b>' + esc(u.name) + '</b><div class="small muted">' + esc(u.email) + (u.last_login_at ? ' · último acesso ' + esc(AS.date(u.last_login_at, true)) : '') + ' · ' + (u.totp_enabled ? 'duas etapas ativa' : 'sem duas etapas') + '</div></div>' +
          '<div class="row">' + (u.totp_enabled && u.id !== me.id ? '<button class="btn btn-line btn-sm" data-reset2fa="' + u.id + '">Zerar duas etapas</button>' : '') + (u.id === me.id ? statusBadge('você', 'green') : '<button class="btn btn-sm ' + (u.active ? 'btn-danger' : 'btn-line') + '" data-toggle="' + u.id + '" data-active="' + (u.active ? '0' : '1') + '">' + (u.active ? 'Desativar' : 'Reativar') + '</button>') + '</div></div>';
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
      $all('[data-reset2fa]', m).forEach(function (b) {
        b.addEventListener('click', function () {
          if (!confirm('Zerar a verificação em duas etapas deste administrador? Use só se ele perdeu o celular e os códigos de recuperação.')) return;
          api('/api/admin/users/' + b.getAttribute('data-reset2fa') + '/reset-2fa', { method: 'POST', body: {} }).then(adminTeam).catch(function (e) { alert(e.message); });
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
        '<dt>Observações</dt><dd style="white-space:pre-line">' + esc(c.assessment_notes || '—') + '</dd>' +
        '<dt>Má oclusão</dt><dd>' + (c.malocclusion && c.malocclusion.types.length ? esc(c.malocclusion.types.map(function (k) { return L.MALOCCLUSION[k] || k; }).join(', ')) + (c.malocclusion.agenesisTeeth ? ' (agenesia: ' + esc(c.malocclusion.agenesisTeeth) + ')' : '') : '—') + '</dd><dt>Alinhador</dt><dd>' + esc(c.plan.brand || '—') + (c.plan.months ? ' · ' + esc(c.plan.months) + ' meses' : '') + '</dd>' +
        '<dt>Plano</dt><dd style="white-space:pre-line">' + esc(c.plan.treatmentNotes || '—') + '</dd>' +
        (c.plan.consultLimit ? '<dt>Consultas incluídas</dt><dd>Até ' + c.plan.consultLimit + ' (caso ' + esc(c.plan.complexity) + ')' + (c.plan.model === 'rede' ? ' · modelo rede: pagamento por consulta validada' : '') + '. Acima disso, só com aditivo do paciente.</dd>' : '') + '</dl></div>' +
        '<form class="card" id="apf"><h2>Agendar</h2><div class="grid2"><div class="field"><label for="kind">Tipo</label><select id="kind" name="kind">' + options(KIND_APPT, 'consulta') + '</select></div>' +
        field('starts_at', 'Data e hora', toLocalInput(new Date(Date.now() + 86400000)), 'type="datetime-local" required') + '</div>' +
        field('location', 'Local / observação', '') + '<button class="btn btn-green btn-sm" type="submit">Agendar e avisar paciente</button><div class="fmsg"></div>' +
        (d.appointments.length ? '<div class="list" style="margin-top:12px">' + d.appointments.map(function (a) {
          return '<div class="it"><div>' + esc(KIND_APPT[a.kind]) + ' · ' + esc(AS.date(a.starts_at, true)) + (a.room_url ? ' · <a target="_blank" rel="noopener" href="' + esc(a.room_url) + '">sala de vídeo</a>' : '') + '</div>' +
            '<select data-appt="' + a.id + '" style="max-width:150px">' + options(APPT_STATUS, a.status) + '</select></div>';
        }).join('') + '</div>' : '') + '</form></div>' +
        '<div class="card"><h2>Fotos do paciente</h2>' + gallery(evalPhotos, { slots: d.slots }) + (others.length ? '<h3 style="margin-top:14px">Documentação</h3>' + gallery(others) : '') + '</div>' +
        '<form class="card" id="auf"><h2>Pedir autorização de atendimento</h2><p class="small muted">Todo atendimento precisa de autorização prévia da AlignSystem. Sem ela, o atendimento não pode ser registrado nem gera repasse.</p><div class="grid2">' +
        '<div class="field"><label for="au_milestone">Tipo de atendimento</label><select id="au_milestone" name="milestone" required>' + options(L.MILESTONES, '', '— escolha —') + '</select></div>' +
        '<div class="field"><label for="au_urgency">Rotina ou urgência</label><select id="au_urgency" name="urgency" required><option value="">— escolha —</option><option value="rotina">Rotina</option><option value="urgencia">Urgência</option></select></div>' +
        field('planned_for', 'Data prevista', new Date().toISOString().slice(0, 10), 'type="date"') + '</div>' +
        area('justification', 'Justificativa', '') +
        '<button class="btn btn-primary" type="submit">Pedir autorização</button><div class="fmsg"></div></form>' +
        '<div class="card"><h2>Autorizações</h2>' + (d.authorizations.length ? '<div class="list">' + d.authorizations.map(function (a) {
          return '<div class="it" style="display:block"><div class="row" style="justify-content:space-between;align-items:flex-start;gap:10px">' + authInfo(a, L) + '<div>' + authBadge(a, L) + '</div></div>' +
            (a.status === 'autorizada' ? '<div class="row" style="margin-top:8px"><button type="button" class="btn btn-green btn-sm" data-register="' + a.id + '">Registrar atendimento e colher assinaturas</button><button type="button" class="btn btn-line btn-sm" data-cancel-auth="' + a.id + '">Cancelar</button></div>' : '') +
            (a.status === 'solicitada' ? '<div class="row" style="margin-top:8px"><button type="button" class="btn btn-line btn-sm" data-cancel-auth="' + a.id + '">Cancelar pedido</button></div>' : '') + '</div>';
        }).join('') + '</div>' : '<p class="muted small">Nenhum pedido ainda.</p>') + '</div>' +
        '<form class="card" id="evf" style="display:none"><h2>Registrar atendimento</h2><input type="hidden" name="authorizationId"><p class="small muted" id="evfInfo"></p><div class="grid2">' +
        field('performed_at', 'Data do atendimento', new Date().toISOString().slice(0, 10), 'type="date" required') + field('patientSigner', 'Nome de quem assina pelo paciente', c.name, 'required') + '</div>' +
        area('notes', 'O que foi feito', '') +
        '<div class="field"><label for="evPhotos">Fotos / arquivos do atendimento (opcional)</label><input id="evPhotos" type="file" multiple accept="image/*,application/pdf"></div>' +
        sigPadHtml('sigPatient', 'Assinatura do paciente (ou responsável)') + sigPadHtml('sigDentist', 'Assinatura do dentista') +
        '<p class="small muted">Ao assinar, o paciente confirma que o atendimento descrito foi realizado nesta data.</p>' +
        '<button class="btn btn-primary" type="submit">Salvar atendimento assinado</button> <button class="btn btn-line" type="button" id="evfClose">Fechar</button><div class="fmsg"></div></form>' +
        '<div class="card"><h2>Registros anteriores</h2>' + (d.evidences.length ? '<div class="list">' + d.evidences.map(function (e) {
          var ph = d.photos.filter(function (p) { return p.evidence_id === e.id; });
          return '<div class="it" style="display:block"><div class="row" style="justify-content:space-between"><b>' + esc(L.MILESTONES[e.milestone]) + ' · ' + esc(AS.date(e.performed_at)) + '</b>' +
            (e.validated_at ? statusBadge('validado', 'green') : statusBadge('aguardando validação', 'honey')) + '</div>' + (e.notes ? '<p class="small" style="white-space:pre-line">' + esc(e.notes) + '</p>' : '') + signaturesHtml(e) + payoutHtml(e) + gallery(ph) + '</div>';
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
      onSubmit($('#auf', m), function (f) {
        return api('/api/dentist/cases/' + id + '/authorizations', { method: 'POST', body: f }).then(function () { reload(); return false; });
      });
      $all('[data-cancel-auth]', m).forEach(function (b) {
        b.addEventListener('click', function () {
          if (!confirm('Cancelar este pedido de autorização?')) return;
          busyBtn(b, api('/api/dentist/authorizations/' + b.getAttribute('data-cancel-auth') + '/cancel', { method: 'POST', body: {} })).then(reload).catch(function (e) { alert(e.message); });
        });
      });
      var evf = $('#evf', m), pads = {};
      pads.p = sigPad($('#sigPatient', m)); pads.d = sigPad($('#sigDentist', m));
      $all('[data-clear]', m).forEach(function (b) { b.addEventListener('click', function () { (b.getAttribute('data-clear') === 'sigPatient' ? pads.p : pads.d).clear(); }); });
      $('#evfClose', m).addEventListener('click', function () { evf.style.display = 'none'; });
      $all('[data-register]', m).forEach(function (b) {
        b.addEventListener('click', function () {
          var a = d.authorizations.filter(function (x) { return x.id === b.getAttribute('data-register'); })[0];
          evf.elements.authorizationId.value = a.id;
          $('#evfInfo', m).textContent = 'Atendimento autorizado: ' + L.MILESTONES[a.milestone] + ' (' + L.URGENCY[a.urgency] + ').';
          evf.style.display = ''; pads.p.clear(); pads.d.clear();
          evf.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
      onSubmit(evf, function (f) {
        if (pads.p.empty()) throw new Error('Falta a assinatura do paciente.');
        if (pads.d.empty()) throw new Error('Falta a assinatura do dentista.');
        f.patientSignature = pads.p.data(); f.dentistSignature = pads.d.data();
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
      if (r.path === '/cobertura') return adminCoverage();
      if (r.path === '/captacao') return adminProspects(r.query);
      if (r.path === '/precos') return adminPrices();
      return adminHome();
    }
    if ((m = r.path.match(/^\/caso\/([0-9a-f-]{36})$/))) return dentistCase(m[1]);
    if (r.path === '/meus-precos') return dentistPrices();
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
