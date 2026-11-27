(function () {
  var secs = [].slice.call(document.querySelectorAll('#stage .s')), cur = 0, st = document.getElementById('stage');
  var q = document.getElementById('q'), res = document.getElementById('res'), pos = document.getElementById('pos');
  function fit() { var k = Math.min(window.innerWidth / 1280, (window.innerHeight - 40) / 720); st.style.transform = 'scale(' + k + ')'; st.style.left = Math.max(0, (window.innerWidth - 1280 * k) / 2) + 'px'; st.style.top = '0px'; }
  function go(i) { cur = Math.max(0, Math.min(secs.length - 1, i)); secs.forEach(function (s, j) { s.classList.toggle('on', j === cur); }); pos.textContent = (cur + 1) + ' / ' + secs.length; try { history.replaceState(null, '', '#' + (cur + 1)); } catch (e) {} }
  var norm = function (t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
  function busca(txt) {
    var ts = norm(txt).split(/\s+/).filter(Boolean); if (!ts.length) { res.style.display = 'none'; return; }
    var r = window.IDX.map(function (e) { var a = norm(e.t), b = norm(e.k + ' ' + e.d), sc = 0; ts.forEach(function (w) { if (a.indexOf(w) >= 0) sc += 3; else if (b.indexOf(w) >= 0) sc += 1; else sc -= 5; }); return { e: e, sc: sc }; }).filter(function (x) { return x.sc > 0; }).sort(function (a, b) { return b.sc - a.sc; }).slice(0, 8);
    res.innerHTML = r.length ? r.map(function (x) { var e = x.e; return '<div class="it"><b>' + e.t + '</b><span>' + e.d + '</span>' + (e.r ? '<a href="' + window.BASE + e.r + '" target="_blank" rel="noopener">Abrir na demo ↗</a>' : '') + (e.s ? '<button data-s="' + e.s + '">Ver no slide ' + e.s + '</button>' : '') + '</div>'; }).join('') : '<div class="vz">Nada encontrado. Tente outra palavra (ex.: polo, MEC, AVA, prova, LGPD, preço).</div>';
    res.style.display = 'block';
  }
  q.addEventListener('input', function () { busca(q.value); });
  res.addEventListener('click', function (ev) { var s = ev.target.getAttribute && ev.target.getAttribute('data-s'); if (s) { go(Number(s) - 1); res.style.display = 'none'; } });
  document.getElementById('ant').onclick = function () { go(cur - 1); }; document.getElementById('prox').onclick = function () { go(cur + 1); };
  document.addEventListener('keydown', function (ev) { var tg = ev.target && ev.target.tagName; if (tg === 'TEXTAREA' || (tg === 'INPUT' && ev.target !== q) || tg === 'SELECT') return; if (ev.target === q) { if (ev.key === 'Escape') { q.value = ''; res.style.display = 'none'; q.blur(); } return; } if (ev.key === 'ArrowRight' || ev.key === 'PageDown' || ev.key === ' ') go(cur + 1); else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') go(cur - 1); else if (ev.key === '/') { ev.preventDefault(); q.focus(); } else if (ev.key === 'n' || ev.key === 'N') { ev.preventDefault(); abrirPedidos(true); } });

  /* ---- Pedidos do cliente: anotados na hora, salvos neste aparelho e enviados à caixinha de sugestões do sistema ---- */
  var KEY = 'edu.apres.pedidos', pedidos = [];
  try { pedidos = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { pedidos = []; }
  function salvar() { try { localStorage.setItem(KEY, JSON.stringify(pedidos)); } catch (e) {} atualizar(); }
  var btn = document.createElement('button'); btn.id = 'bpedido'; btn.type = 'button';
  document.getElementById('busca').appendChild(btn);
  var painel = document.createElement('div'); painel.id = 'ppedido';
  painel.innerHTML = '<h3>Pedidos do cliente</h3><p class="dica">Anote na hora. Fica salvo neste aparelho e vai para a caixinha de sugestões do sistema quando você enviar.</p>' +
    '<textarea id="ptxt" rows="3" placeholder="O que o cliente pediu?"></textarea>' +
    '<div class="lin"><input id="pquem" placeholder="Quem pediu (cargo ou nome)"><select id="ppri"><option value="MEDIA">Prioridade média</option><option value="ALTA">Alta</option><option value="BAIXA">Baixa</option></select></div>' +
    '<div class="lin"><button id="padd" type="button">Salvar pedido</button><button id="pfecha" type="button" class="sec">Fechar</button></div>' +
    '<div id="plista"></div><div class="lin"><button id="penv" type="button">Enviar à caixinha</button><button id="pcsv" type="button" class="sec">Baixar lista</button><button id="pcop" type="button" class="sec">Copiar</button></div><p id="pmsg" class="dica"></p>';
  document.body.appendChild(painel);
  var $ = function (id) { return document.getElementById(id); };
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function msg(t) { $('pmsg').textContent = t || ''; }
  function atualizar() {
    var pend = pedidos.filter(function (x) { return !x.numero; }).length;
    btn.textContent = '✎ Anotar pedido' + (pedidos.length ? ' (' + pedidos.length + (pend ? ', ' + pend + ' a enviar' : '') + ')' : '');
    $('plista').innerHTML = pedidos.length ? pedidos.map(function (x, i) { return '<div class="pit"><b>' + esc(x.texto.slice(0, 140)) + (x.texto.length > 140 ? '…' : '') + '</b><span>' + esc(x.quem || 'cliente') + ' · slide ' + x.slide + ' · ' + esc(x.pri) + (x.numero ? ' · enviado ' + esc(x.numero) : ' · a enviar') + '</span><button type="button" data-d="' + i + '" class="sec">Apagar</button></div>'; }).join('') : '<p class="dica">Nenhum pedido anotado ainda.</p>';
  }
  function abrirPedidos(foco) { painel.style.display = 'block'; if (foco) $('ptxt').focus(); }
  btn.onclick = function () { painel.style.display = painel.style.display === 'block' ? 'none' : 'block'; };
  $('pfecha').onclick = function () { painel.style.display = 'none'; };
  $('padd').onclick = function () {
    var t = $('ptxt').value.trim(); if (t.length < 3) { msg('Escreva o pedido.'); return; }
    var tit = (secs[cur].querySelector('h2') || {}).textContent || '';
    pedidos.push({ id: Date.now(), texto: t, quem: $('pquem').value.trim(), pri: $('ppri').value, slide: cur + 1, tela: tit, em: new Date().toISOString(), numero: '' });
    $('ptxt').value = ''; msg('Pedido salvo.'); salvar();
  };
  $('plista').addEventListener('click', function (ev) { var d = ev.target.getAttribute && ev.target.getAttribute('data-d'); if (d !== null && d !== undefined) { pedidos.splice(Number(d), 1); salvar(); } });
  function texto() { return pedidos.map(function (x, i) { return (i + 1) + '. ' + x.texto + '\n   Quem pediu: ' + (x.quem || 'não informado') + ' · Prioridade: ' + x.pri + ' · Slide ' + x.slide + ' (' + x.tela + ') · ' + new Date(x.em).toLocaleString('pt-BR') + (x.numero ? ' · enviado como ' + x.numero : ''); }).join('\n\n'); }
  $('pcop').onclick = function () { try { navigator.clipboard.writeText(texto()); msg('Lista copiada.'); } catch (e) { msg('Não foi possível copiar neste navegador.'); } };
  $('pcsv').onclick = function () {
    var l = ['pedido;quem pediu;prioridade;slide;data'].concat(pedidos.map(function (x) { return [x.texto, x.quem, x.pri, x.slide + ' ' + x.tela, x.em].map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(';'); }));
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + l.join('\n')], { type: 'text/csv;charset=utf-8' })); a.download = 'pedidos-do-cliente.csv'; a.click();
  };
  $('penv').onclick = function () {
    var token = ''; try { token = localStorage.getItem('dentalpos.token') || ''; } catch (e) {}
    var fila = pedidos.filter(function (x) { return !x.numero; });
    if (!fila.length) { msg('Nada a enviar.'); return; }
    if (!token) { msg('Entre no sistema neste mesmo navegador para enviar. Os pedidos continuam salvos aqui.'); return; }
    var feitos = 0, falhas = 0;
    (function prox(i) {
      if (i >= fila.length) { salvar(); msg(feitos + ' enviado(s)' + (falhas ? ', ' + falhas + ' com falha (tente de novo ou baixe a lista)' : '') + '.'); return; }
      var x = fila[i], tit = ('Pedido do cliente: ' + x.texto).slice(0, 150);
      var desc = x.texto + '\n\nQuem pediu: ' + (x.quem || 'não informado') + '\nAnotado na apresentação, slide ' + x.slide + ' (' + x.tela + ') em ' + new Date(x.em).toLocaleString('pt-BR');
      fetch(window.APIB + '/edu/feedback/itens', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ tipo: 'SUGESTAO', categoria: 'OUTRO', prioridade: x.pri, titulo: tit, descricao: desc, contexto: { tela: 'Apresentação · slide ' + x.slide } }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (r) { if (r.ok && r.j && r.j.numero) { x.numero = r.j.numero; feitos++; } else falhas++; })
        .catch(function () { falhas++; })
        .then(function () { prox(i + 1); });
    })(0);
  };
  atualizar();
  window.addEventListener('resize', fit); fit();
  go((parseInt((location.hash || '').slice(1), 10) || 1) - 1);
})();
