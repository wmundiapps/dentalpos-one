/*! WMundi Omnichannel v1 — widget sem dependências.
 *  Uso:  <script src="/wmundi-omnichannel.js" data-product="revah" defer></script>
 *  Opções (atributos data-*): product, api, demo="true" (não envia nada), whatsapp, instagram, facebook, telegram, email, phone, color, lang
 *  Cada canal só aparece se tiver valor. O formulário grava o lead em POST {api}/marketing/lead (consentimento obrigatório).
 */
(function () {
  'use strict';
  if (window.WMundiOmni) return;
  var script = document.currentScript || document.querySelector('script[src*="wmundi-omnichannel"]');
  var d = script ? script.dataset : {};
  var DEFAULTS = {
    api: 'https://api.dentalpos.com.br/api',
    whatsapp: '554499466451', instagram: 'wmundimkt', facebook: 'WMundi', email: 'info@wmundi.com', telegram: '', phone: ''
  };
  var NAMES = { wmundi: 'WMundi', revah: 'Revah', edumaster: 'EduMaster', dentalpos: 'DentalPos', studiobeautybarber: 'Studio Beauty Barber', marpe: 'Marpê' };
  var product = (d.product || 'wmundi').toLowerCase();
  var cfg = {};
  Object.keys(DEFAULTS).forEach(function (k) { cfg[k] = d[k] != null ? d[k] : DEFAULTS[k]; });
  var demo = d.demo === 'true' || /[?&]omni_demo=1/.test(location.search);
  var color = /^#[0-9a-f]{3,8}$/i.test(d.color || '') ? d.color : '#0b5fff';
  if (!/^https:\/\//.test(cfg.api)) cfg.api = DEFAULTS.api;
  var label = NAMES[product] || product;
  // Texto aprovado pelo Robson e pela Dra. Roberta em 31/10/2026 (mesmo da página /falar). Mudança exige nova aprovação.
  var CONSENT = 'Autorizo a WMundi a falar comigo pelo WhatsApp (inclusive com atendimento automático por inteligência artificial) sobre o teste do sistema. Posso responder SAIR a qualquer momento para não receber mais mensagens.';

  function digits(v) { return String(v || '').replace(/\D/g, ''); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var msg = encodeURIComponent('Olá! Vim pelo site do ' + label + ' e quero saber mais.');
  var CHANNELS = [
    { id: 'whatsapp', name: 'WhatsApp', icon: '💬', url: function () { return 'https://wa.me/' + digits(cfg.whatsapp) + '?text=' + msg; }, on: digits(cfg.whatsapp) },
    { id: 'instagram', name: 'Instagram', icon: '📸', url: function () { return 'https://ig.me/m/' + encodeURIComponent(cfg.instagram); }, on: cfg.instagram },
    { id: 'facebook', name: 'Messenger', icon: '👥', url: function () { return 'https://m.me/' + encodeURIComponent(cfg.facebook); }, on: cfg.facebook },
    { id: 'telegram', name: 'Telegram', icon: '✈️', url: function () { return 'https://t.me/' + encodeURIComponent(cfg.telegram); }, on: cfg.telegram },
    { id: 'email', name: 'E-mail', icon: '✉️', url: function () { return 'mailto:' + cfg.email + '?subject=' + encodeURIComponent('Contato ' + label); }, on: cfg.email },
    { id: 'phone', name: 'Telefone', icon: '📞', url: function () { return 'tel:+' + digits(cfg.phone); }, on: digits(cfg.phone) }
  ].filter(function (c) { return !!c.on; });

  var host = document.createElement('div');
  host.id = 'wmundi-omni';
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
  root.innerHTML =
    '<style>' +
    ':host,div{font-family:system-ui,Segoe UI,Roboto,sans-serif}' +
    '.fab{position:fixed;right:16px;bottom:16px;z-index:2147483000;width:56px;height:56px;border-radius:50%;border:0;background:' + color + ';color:#fff;font-size:26px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.3)}' +
    '.panel{position:fixed;right:16px;bottom:84px;z-index:2147483000;width:min(340px,calc(100vw - 32px));max-height:calc(100vh - 110px);overflow:auto;background:#fff;color:#111;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.3);display:none}' +
    '.panel.open{display:block}' +
    '.head{background:' + color + ';color:#fff;padding:14px 16px;border-radius:16px 16px 0 0}.head b{display:block;font-size:16px}.head span{font-size:12px;opacity:.9}' +
    '.demo{background:#fef3c7;color:#92400e;font-size:12px;padding:6px 16px}' +
    '.list{padding:10px;display:grid;gap:8px}' +
    '.list a{display:flex;gap:10px;align-items:center;padding:10px 12px;border:1px solid #e5e7eb;border-radius:12px;text-decoration:none;color:#111;font-size:14px}.list a:hover{background:#f3f4f6}' +
    'form{padding:0 12px 14px;display:grid;gap:8px}form h4{margin:6px 4px 0;font-size:14px}' +
    'input,select{padding:9px 10px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;width:100%;box-sizing:border-box}' +
    'label.c{display:flex;gap:8px;font-size:11px;color:#4b5563;align-items:flex-start}label.c input{width:auto;margin-top:2px}' +
    'button.go{background:' + color + ';color:#fff;border:0;padding:11px;border-radius:10px;font-size:14px;cursor:pointer}button.go:disabled{opacity:.5}' +
    '.st{font-size:12px;padding:0 4px}.ok{color:#047857}.er{color:#b91c1c}' +
    '</style>' +
    '<button class="fab" aria-label="Fale com a gente" title="Fale com a gente">💬</button>' +
    '<div class="panel" role="dialog" aria-label="Canais de atendimento ' + esc(label) + '">' +
    '<div class="head"><b>Fale com ' + esc(label) + '</b><span>Escolha o canal de sua preferência</span></div>' +
    (demo ? '<div class="demo">Modo demonstração: nada é enviado de verdade.</div>' : '') +
    '<div class="list">' + CHANNELS.map(function (c) { return '<a data-ch="' + c.id + '" href="' + esc(c.url()) + '" target="_blank" rel="noopener noreferrer"><span>' + c.icon + '</span><span>' + c.name + '</span></a>'; }).join('') + '</div>' +
    '<form novalidate><h4>Prefere que a gente chame você?</h4>' +
    '<input name="name" placeholder="Seu nome" autocomplete="name" required>' +
    '<input name="whatsapp" placeholder="Seu WhatsApp com DDD" autocomplete="tel" inputmode="tel" required>' +
    '<label class="c"><input type="checkbox" name="consent"><span>' + esc(CONSENT) + ' <a href="https://app.dentalpos.com.br/privacidade" target="_blank" rel="noopener">Privacidade</a></span></label>' +
    '<button class="go" type="submit" disabled>Quero ser atendido</button><div class="st" role="status"></div></form></div>';

  var fab = root.querySelector('.fab'), panel = root.querySelector('.panel'), form = root.querySelector('form'), st = root.querySelector('.st'), go = root.querySelector('.go');
  function track(ev, extra) {
    try { document.dispatchEvent(new CustomEvent('wmundi-omni', { detail: Object.assign({ event: ev, product: product }, extra || {}) })); } catch (e) {}
  }
  fab.addEventListener('click', function () { panel.classList.toggle('open'); track('toggle'); });
  Array.prototype.forEach.call(root.querySelectorAll('.list a'), function (a) {
    a.addEventListener('click', function (e) { track('channel_click', { channel: a.getAttribute('data-ch') }); if (demo) { e.preventDefault(); st.className = 'st ok'; st.textContent = 'Demonstração: abriria ' + a.textContent.trim() + '.'; } });
  });
  function sync() { go.disabled = !(form.consent.checked && form.name.value.trim().length > 1 && digits(form.whatsapp.value).length >= 10); }
  form.addEventListener('input', sync); form.addEventListener('change', sync);
  form.addEventListener('submit', function (e) {
    e.preventDefault(); sync(); if (go.disabled) return;
    var body = { name: form.name.value.trim(), whatsapp: form.whatsapp.value.trim(), product: product, consent: true, utm: { source: 'omnichannel', medium: 'widget', campaign: product, content: location.hostname } };
    track('lead_submit');
    if (demo) { st.className = 'st ok'; st.textContent = 'Demonstração: lead de ' + body.name + ' seria registrado para ' + label + '.'; return; }
    go.disabled = true; st.className = 'st'; st.textContent = 'Enviando...';
    fetch(cfg.api.replace(/\/$/, '') + '/marketing/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: (window.AbortController ? (function () { var c = new AbortController(); setTimeout(function () { c.abort(); }, 15000); return c.signal; })() : undefined) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Falha ao enviar'); return j; }); })
      .then(function (j) { st.className = 'st ok'; st.textContent = 'Pronto! Abrindo o WhatsApp...'; if (j.whatsappUrl && /^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(j.whatsappUrl)) window.open(j.whatsappUrl, '_blank', 'noopener'); })
      .catch(function (err) { st.className = 'st er'; st.textContent = (err && err.name === 'AbortError') ? 'Demorou demais. Tente de novo.' : (err.message || 'Não foi possível enviar agora.'); go.disabled = false; });
  });
  function mount() { document.body.appendChild(host); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  window.WMundiOmni = { open: function () { panel.classList.add('open'); }, close: function () { panel.classList.remove('open'); }, product: product, channels: CHANNELS.map(function (c) { return c.name; }) };
})();
