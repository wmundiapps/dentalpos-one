/* Medição do site (Google Analytics 4 e Google Ads). DESLIGADA até você preencher os IDs abaixo.
   Só carrega depois que a pessoa aceitar os cookies (LGPD). Para ligar: preencha ga4 e/ou ads e republique. */
(function () {
  var CFG = { ga4: "", ads: "", adsConversao: "" } // ex.: ga4: "G-XXXXXXXXXX", ads: "AW-0000000000", adsConversao: "AW-0000000000/AbCdEfGh"
  var IDS = [CFG.ga4, CFG.ads].filter(Boolean)
  if (!IDS.length) return
  var KEY = "wm_cookies"
  function lido() { try { return localStorage.getItem(KEY) } catch (e) { return null } }
  function grava(v) { try { localStorage.setItem(KEY, v) } catch (e) { /* sem armazenamento */ } }
  function carrega() {
    var s = document.createElement("script"); s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + IDS[0]; document.head.appendChild(s)
    window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments) }
    window.gtag("js", new Date()); IDS.forEach(function (id) { window.gtag("config", id) })
    if (CFG.adsConversao && /^\/obrigado\/?$/.test(location.pathname)) window.gtag("event", "conversion", { send_to: CFG.adsConversao })
  }
  var v = lido()
  if (v === "sim") return carrega()
  if (v === "nao") return
  var b = document.createElement("div")
  b.setAttribute("role", "dialog"); b.setAttribute("aria-label", "Aviso de cookies")
  b.style.cssText = "position:fixed;left:16px;right:16px;bottom:16px;z-index:2147482000;background:#0b1b3f;color:#fff;border-radius:14px;padding:14px 16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;font:14px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35)"
  b.textContent = "Usamos cookies para medir o desempenho do site e melhorar a sua experiência. Você aceita?"
  function btn(t, val, fundo) {
    var x = document.createElement("button"); x.type = "button"; x.textContent = t
    x.style.cssText = "border:0;border-radius:10px;padding:9px 16px;font-weight:700;cursor:pointer;background:" + fundo + ";color:#0b1b3f"
    x.onclick = function () { grava(val); b.remove(); if (val === "sim") carrega() }; return x
  }
  var w = document.createElement("div"); w.style.cssText = "display:flex;gap:8px"; w.appendChild(btn("Recusar", "nao", "#fff")); w.appendChild(btn("Aceitar", "sim", "#ffc94d")); b.appendChild(w)
  document.body.appendChild(b)
})()
