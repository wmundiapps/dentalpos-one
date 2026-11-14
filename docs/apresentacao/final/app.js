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
  document.addEventListener('keydown', function (ev) { if (ev.target === q) { if (ev.key === 'Escape') { q.value = ''; res.style.display = 'none'; q.blur(); } return; } if (ev.key === 'ArrowRight' || ev.key === 'PageDown' || ev.key === ' ') go(cur + 1); else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') go(cur - 1); else if (ev.key === '/') { ev.preventDefault(); q.focus(); } });
  window.addEventListener('resize', fit); fit();
  go((parseInt((location.hash || '').slice(1), 10) || 1) - 1);
})();
