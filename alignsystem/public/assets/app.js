// AlignSystem — utilitários das telas de aplicação.
(function (w) {
  'use strict';
  var A = {};

  A.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  A.api = function (path, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
    if (opts.body instanceof Blob) {
      init.body = opts.body;
      init.headers['Content-Type'] = opts.body.type || 'application/octet-stream';
    } else if (opts.body !== undefined) {
      init.body = JSON.stringify(opts.body);
      init.headers['Content-Type'] = 'application/json';
    }
    return fetch(path, init).then(function (r) {
      var ct = r.headers.get('content-type') || '';
      var p = ct.indexOf('json') >= 0 ? r.json() : r.text().then(function (t) { return { error: t }; });
      return p.then(function (d) {
        if (!r.ok) {
          var err = new Error((d && d.error) || ('Erro ' + r.status));
          err.status = r.status;
          throw err;
        }
        return d;
      });
    });
  };

  A.date = function (d, withTime) {
    if (!d) return '';
    var x = new Date(d);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(d))) x = new Date(d + 'T12:00:00');
    return x.toLocaleString('pt-BR', withTime
      ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }
      : { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
  };

  A.money = function (n) {
    return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  A.phone = function (d) {
    d = String(d || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return d;
  };

  A.waLink = function (phone, text) {
    var d = String(phone || '').replace(/\D/g, '');
    if (d.length <= 11) d = '55' + d;
    return 'https://wa.me/' + d + (text ? '?text=' + encodeURIComponent(text) : '');
  };

  // Reduz a foto no navegador (até 1600 px, JPEG) para envio rápido e dentro do limite.
  A.compress = function (file) {
    var MAX = 1600;
    var LIMIT = 4 * 1024 * 1024;
    if (!/^image\//.test(file.type) && !/\.(heic|heif)$/i.test(file.name)) {
      return file.size <= LIMIT ? Promise.resolve(file) : Promise.reject(new Error('Arquivo acima de 4 MB.'));
    }
    if (!w.createImageBitmap) return file.size <= LIMIT ? Promise.resolve(file) : Promise.reject(new Error('Foto grande demais.'));
    return createImageBitmap(file, { imageOrientation: 'from-image' }).then(function (bmp) {
      var scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
      var c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(function (res) { c.toBlob(res, 'image/jpeg', 0.82); });
    }).then(function (blob) {
      if (!blob) throw new Error('decode');
      return blob;
    }).catch(function () {
      if (file.size <= LIMIT) return file;
      throw new Error('Não conseguimos ler esta foto. Tente tirar de novo com a câmera do celular (formato JPG).');
    });
  };

  A.lightbox = function (src) {
    var d = document.createElement('div');
    d.className = 'lightbox';
    d.innerHTML = '<img alt="Foto ampliada" src="' + A.esc(src) + '">';
    d.addEventListener('click', function () { d.remove(); });
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { d.remove(); document.removeEventListener('keydown', k); } });
    document.body.appendChild(d);
  };

  A.copy = function (text, btn) {
    var done = function () { if (btn) { var t = btn.textContent; btn.textContent = 'Copiado ✓'; setTimeout(function () { btn.textContent = t; }, 1600); } };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { prompt('Copie:', text); });
    else { prompt('Copie:', text); }
  };

  w.AS = A;
})(window);
