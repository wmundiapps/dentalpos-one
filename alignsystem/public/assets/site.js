// AlignSystem — scripts das páginas públicas (landing do paciente e do parceiro).
(function () {
  'use strict';

  var FALLBACK = { whatsapp: '', contactEmail: 'contato@alignsystem.com.br', supportEmail: 'suporte@alignsystem.com.br' };
  var cfg = FALLBACK;

  function $(s, el) { return (el || document).querySelector(s); }
  function $all(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }

  // ---------- menu mobile
  var burger = $('.burger');
  if (burger) {
    burger.setAttribute('aria-expanded', 'false');
    burger.addEventListener('click', function () {
      var m = document.getElementById('mnav');
      var open = m.classList.toggle('open');
      burger.setAttribute('aria-expanded', String(open));
    });
    $all('#mnav a').forEach(function (a) {
      a.addEventListener('click', function () { document.getElementById('mnav').classList.remove('open'); });
    });
  }

  // ---------- origem da visita (UTM) guardada na sessão
  var SOURCE_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid'];
  function readSource() {
    var src = {};
    try { src = JSON.parse(sessionStorage.getItem('as_source') || '{}'); } catch (e) { src = {}; }
    var q = new URLSearchParams(location.search);
    SOURCE_KEYS.forEach(function (k) { if (q.get(k)) src[k] = q.get(k); });
    try { sessionStorage.setItem('as_source', JSON.stringify(src)); } catch (e) { /* sem storage */ }
    src.page = location.pathname;
    return src;
  }
  var source = readSource();

  function waLink(text) {
    if (!cfg.whatsapp) return null;
    return 'https://wa.me/' + cfg.whatsapp + '?text=' + encodeURIComponent(text);
  }

  function applyConfig() {
    $all('[data-wa]').forEach(function (a) {
      var href = waLink(a.getAttribute('data-wa'));
      if (href) { a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.hidden = false; }
      else if (a.classList.contains('wa-float')) a.hidden = true;
      else { a.href = 'mailto:' + cfg.contactEmail; }
    });
    $all('[data-cfg]').forEach(function (el) {
      var v = cfg[el.getAttribute('data-cfg')];
      if (v) {
        if (el.tagName === 'A' && /Email$/.test(el.getAttribute('data-cfg'))) { el.href = 'mailto:' + v; }
        el.textContent = v;
      }
    });
    loadTracking();
  }

  function loadTracking() {
    if (cfg.metaPixelId && !window.fbq) {
      /* Meta Pixel */
      !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', cfg.metaPixelId);
      window.fbq('track', 'PageView');
    }
    if (cfg.googleTagId && !window.gtag) {
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(cfg.googleTagId);
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', cfg.googleTagId);
    }
  }

  function trackLead(kind) {
    try { if (window.fbq) window.fbq('track', 'Lead', { content_category: kind }); } catch (e) { /* ignore */ }
    try { if (window.gtag) window.gtag('event', 'generate_lead', { lead_type: kind }); } catch (e) { /* ignore */ }
  }

  fetch('/api/config').then(function (r) { return r.ok ? r.json() : FALLBACK; })
    .catch(function () { return FALLBACK; })
    .then(function (c) { cfg = c || FALLBACK; applyConfig(); });

  // ---------- formulários de captação
  function val(form, name) { var el = form.elements[name]; return el ? String(el.value || '').trim() : ''; }

  function showMsg(form, kind, html) {
    var m = $('.form-msg', form);
    m.className = 'form-msg ' + kind;
    m.innerHTML = html;
    m.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  }

  $all('form[data-lead]').forEach(function (form) {
    var kind = form.getAttribute('data-lead');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('button[type=submit]', form);
      var label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Enviando…';
      var body = {
        name: val(form, 'nome'), whatsapp: val(form, 'whats'), city: val(form, 'cidade'), uf: val(form, 'uf'), email: val(form, 'email'),
        consent: form.elements.consent.checked, website: val(form, 'website'), source: source,
      };
      if (kind === 'paciente') {
        body.age = val(form, 'idade'); body.reason = val(form, 'motivo'); body.referredBy = val(form, 'indicacao');
      } else {
        body.cro = val(form, 'cro'); body.experience = val(form, 'motivo');
      }
      fetch('/api/leads/' + kind, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); })
        .then(function (res) {
          if (!res.ok) throw Object.assign(new Error(res.d.error || 'Falha ao enviar'), { user: res.status < 500 });
          trackLead(kind);
          if (kind === 'paciente' && res.d.portalUrl) {
            location.href = res.d.portalUrl + '&novo=1';
            return;
          }
          form.reset();
          var wa = waLink('Olá! Sou dentista (' + body.name + ', CRO ' + body.cro + ') e acabei de enviar meu cadastro na página AlignSystem Partner.');
          showMsg(form, 'ok', '<b>Cadastro recebido!</b> Nossa equipe confere seu CRO e envia os Termos de Adesão no seu WhatsApp e e-mail.' +
            (wa ? ' <a href="' + wa + '" target="_blank" rel="noopener">Quer adiantar? Fale agora no WhatsApp.</a>' : ''));
          btn.textContent = 'Enviado ✓';
        })
        .catch(function (err) {
          btn.disabled = false;
          btn.textContent = label;
          if (err.user) return showMsg(form, 'err', err.message);
          // Sem servidor: não perde o contato — segue pelo WhatsApp
          var msg = kind === 'paciente'
            ? 'Olá! Meu nome é ' + body.name + ', tenho ' + body.age + ' anos e sou de ' + body.city + '. Quero fazer minha pré-avaliação para alinhadores. O que eu gostaria de melhorar: ' + body.reason + '. WhatsApp: ' + body.whatsapp
            : 'Olá! Meu nome é ' + body.name + ', CRO ' + body.cro + ', atendo em ' + body.city + '. Quero conhecer a parceria AlignSystem. Experiência: ' + body.experience;
          var link = waLink(msg);
          showMsg(form, 'err', 'Não conseguimos enviar agora. ' + (link ? '<a href="' + link + '" target="_blank" rel="noopener">Clique aqui para continuar pelo WhatsApp</a>.' : 'Escreva para ' + cfg.contactEmail + '.'));
        });
    });
  });
  // Cidades com dentista credenciado (seção "Onde já atendemos")
  var covSec = document.getElementById('onde-atendemos');
  if (covSec) {
    fetch('/api/public/cobertura').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.cities.length) return;
      document.getElementById('cities').innerHTML = d.cities.map(function (c) {
        return '<li>' + c.city.replace(/[<>&"]/g, '') + '<span>' + c.uf + '</span></li>';
      }).join('');
      covSec.hidden = false;
    }).catch(function () {});
  }
})();

