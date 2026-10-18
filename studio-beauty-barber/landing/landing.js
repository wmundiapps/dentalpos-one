(() => {
  const C = window.SBB || {};
  const $ = (s) => document.querySelector(s);
  const API = (C.api || '').replace(/\/$/, '');
  document.querySelectorAll('[data-app]').forEach((a) => { a.href = (C.appUrl || '/') ; });

  // UTM / origem do anúncio (guardado só na sessão)
  const KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid'];
  const q = new URLSearchParams(location.search);
  let utm = {};
  try { utm = JSON.parse(sessionStorage.getItem('sbb_utm') || '{}'); } catch { /* ignora */ }
  KEYS.forEach((k) => { if (q.get(k)) utm[k] = q.get(k).slice(0, 120); });
  try { sessionStorage.setItem('sbb_utm', JSON.stringify(utm)); } catch { /* ignora */ }

  // Consentimento de cookies → só então carrega Pixel/Google tag
  const bar = $('#cookie');
  const loadTrackers = () => {
    if (C.metaPixelId) { !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js'); window.fbq('init', C.metaPixelId); window.fbq('track', 'PageView'); }
    if (C.gtagId) { const s = document.createElement('script'); s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(C.gtagId)}`; document.head.append(s); window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); }; window.gtag('js', new Date()); window.gtag('config', C.gtagId); }
  };
  let choice = null;
  try { choice = localStorage.getItem('sbb_cookies'); } catch { /* ignora */ }
  if (choice === 'yes') loadTrackers();
  else if (!choice && (C.metaPixelId || C.gtagId)) bar.classList.add('show');
  const decide = (v) => { try { localStorage.setItem('sbb_cookies', v); } catch { /* ignora */ } bar.classList.remove('show'); if (v === 'yes') loadTrackers(); };
  $('#ck-yes')?.addEventListener('click', () => decide('yes')); $('#ck-no')?.addEventListener('click', () => decide('no'));

  // Formulário de lead
  const form = $('#lead-form'), msg = $('#lead-msg'), btn = form.querySelector('button[type=submit]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); msg.className = 'msg'; msg.textContent = '';
    const f = new FormData(form);
    if (!f.get('consent')) { msg.className = 'msg err'; msg.textContent = 'Marque a autorização para podermos falar com você.'; return; }
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const res = await fetch(`${API}/api/public/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        name: f.get('name'), phone: f.get('phone'), email: f.get('email') || undefined, company: f.get('company') || undefined, city: f.get('city') || undefined,
        consent: true, website: f.get('website'), source: utm.utm_source ? `ads:${utm.utm_source}` : 'landing', utm }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível enviar agora. Tente novamente.');
      form.reset(); msg.className = 'msg ok'; msg.textContent = 'Recebemos seu contato! Vamos te chamar no WhatsApp em breve.';
      if (window.fbq) window.fbq('track', 'Lead'); if (window.gtag && C.gtagId) window.gtag('event', 'generate_lead');
    } catch (err) { msg.className = 'msg err'; msg.textContent = `${err.message} Se preferir, escreva para contato@studiobeautybarber.com.`; }
    finally { btn.disabled = false; btn.textContent = 'Quero testar grátis'; }
  });
  if (C.whatsapp) { const w = $('#wa'); if (w) { w.href = `https://wa.me/${C.whatsapp}?text=${encodeURIComponent('Olá! Quero conhecer o Studio Beauty Barber.')}`; w.hidden = false; } }
})();
