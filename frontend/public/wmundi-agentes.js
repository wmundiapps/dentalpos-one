/*
 * WMundi Agentes — ícone flutuante "Peça o seu agente".
 * Um único arquivo, sem dependências. Funciona em qualquer página ou aplicativo (React, HTML puro, etc.).
 *
 * Uso:
 *   <script src="/wmundi-agentes.js" defer></script>
 *   <wmundi-agentes app="completodonto"></wmundi-agentes>
 *
 * Atributos (todos opcionais):
 *   app        nome do aplicativo/sistema de onde o pedido vem (vai junto no pedido)
 *   endpoint   endereço de um formulário (ex.: Netlify Forms). Sem ele, o pedido sai por WhatsApp ou e-mail.
 *   whatsapp   número com DDI e DDD, só dígitos (padrão: WhatsApp da WMundi)
 *   email      e-mail que recebe o pedido (padrão: info@wmundi.com)
 *   posicao    "direita" (padrão) ou "esquerda"
 *   cor        cor do ícone (padrão: #2f5bff)
 *   rotulo     texto ao lado do ícone (padrão: "Peça o seu agente")
 *
 * Privacidade: o ícone não lê nada da página e não envia dados sozinho. O cliente digita e confirma o envio.
 */
(function () {
  'use strict'
  if (typeof window === 'undefined' || !window.customElements || window.customElements.get('wmundi-agentes')) return

  var AGENTES = [
    { id: 'atendente', nome: 'Atendente de WhatsApp', resumo: 'Responde clientes 24 horas por dia e passa para uma pessoa quando precisa.' },
    { id: 'agenda', nome: 'Agenda inteligente', resumo: 'Confirma consultas, remarca faltas e preenche a lista de espera.' },
    { id: 'cobranca-atraso', nome: 'Cobrança de atraso', resumo: 'Lembra com educação quem está em atraso e envia a segunda via.' },
    { id: 'pos-atendimento', nome: 'Pós-atendimento e avaliação', resumo: 'Mede a satisfação e convida os satisfeitos a avaliar no Google.' },
    { id: 'resumo-diario', nome: 'Resumo diário do dono', resumo: 'Todo dia, um resumo curto com agenda, pendências e prioridades.' },
  ]

  var CANAIS = ['WhatsApp', 'E-mail', 'Ligação por voz', 'Site ou aplicativo', 'Ainda não sei']

  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
    '.wrap{position:fixed;z-index:2147483000;bottom:max(16px,env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;align-items:flex-end;gap:10px}',
    '.wrap.esq{left:max(16px,env(safe-area-inset-left,0px));align-items:flex-start}',
    '.wrap.dir{right:max(16px,env(safe-area-inset-right,0px))}',
    '.fab{display:flex;align-items:center;gap:10px;border:0;cursor:pointer;color:#fff;background:var(--c);border-radius:999px;padding:0 18px 0 6px;height:56px;box-shadow:0 10px 28px rgba(11,27,63,.35);font-size:15px;font-weight:700}',
    '.fab:hover{filter:brightness(1.08)}',
    '.fab .ic{width:44px;height:44px;border-radius:50%;background:#fff;display:grid;place-items:center}',
    '.fab .ic svg{width:28px;height:28px}',
    '.fab.so-icone{padding:6px}',
    '.fab.so-icone .tx{display:none}',
    ':focus-visible{outline:3px solid #ffc94d;outline-offset:2px}',
    '@media (max-width:520px){.fab{padding:6px}.fab .tx{display:none}}',
    '@media (prefers-reduced-motion:no-preference){.fab .ic{animation:pulso 3.2s ease-in-out infinite}@keyframes pulso{0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,.55)}50%{box-shadow:0 0 0 7px rgba(255,255,255,0)}}}',
    '.painel{width:min(380px,calc(100vw - 32px));max-height:min(620px,calc(100vh - 110px));overflow:auto;background:#fff;color:#0e1a38;border-radius:20px;box-shadow:0 20px 60px rgba(11,27,63,.4);border:1px solid #d8e0f3}',
    '.painel[hidden]{display:none}',
    '.topo{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 16px;background:#0b1b3f;color:#fff;border-radius:20px 20px 0 0;position:sticky;top:0}',
    '.topo b{font-size:16px}.topo small{display:block;color:#c3cdee;font-size:12px;font-weight:400}',
    '.x{background:transparent;border:0;color:#fff;font-size:26px;line-height:1;cursor:pointer;padding:2px 8px;border-radius:8px}',
    '.abas{display:flex;gap:6px;padding:10px 12px 0}',
    '.aba{flex:1;border:1.5px solid #d8e0f3;background:#fff;color:#0e1a38;border-radius:10px;padding:9px 6px;font-size:13px;font-weight:700;cursor:pointer}',
    '.aba[aria-selected=true]{background:#e4eaff;border-color:var(--c);color:var(--c)}',
    '.corpo{padding:12px 16px 16px}',
    '.ag{border:1px solid #d8e0f3;border-radius:14px;padding:12px;margin-bottom:10px}',
    '.ag h4{margin:0 0 4px;font-size:15px}.ag p{margin:0 0 8px;color:#55638a;font-size:13px;line-height:1.4}',
    '.btn{display:inline-block;border:0;border-radius:10px;background:var(--c);color:#fff;font-weight:700;font-size:14px;padding:10px 16px;cursor:pointer;text-decoration:none}',
    '.btn.sec{background:#fff;color:var(--c);border:1.5px solid var(--c)}',
    '.btn.peq{padding:7px 12px;font-size:13px}',
    'label{display:block;font-size:12px;font-weight:700;color:#55638a;margin:10px 0 4px}',
    'input,select,textarea{width:100%;font:inherit;font-size:14px;color:#0e1a38;background:#fff;border:1.5px solid #d8e0f3;border-radius:10px;padding:9px 10px}',
    'textarea{min-height:92px;resize:vertical}',
    '.cons{display:flex;gap:8px;align-items:flex-start;font-size:12px;color:#55638a;margin:10px 0}',
    '.cons input{width:auto;margin-top:2px}',
    '.aviso{font-size:12px;color:#8a5a00;background:#fff3d6;border-radius:10px;padding:8px 10px;margin-top:10px}',
    '.ok{background:#dcf6ee;color:#0b7d62;border-radius:12px;padding:14px;font-weight:700;margin-top:6px}',
    '.erro{background:#ffe3e0;color:#a3261c;border-radius:10px;padding:8px 10px;font-size:13px;margin-top:8px}',
    '.hp{position:absolute;left:-9999px}',
    '.acoes{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}',
  ].join('')

  var ICONE =
    '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">' +
    '<rect x="6" y="9" width="20" height="16" rx="6" fill="#0b1b3f"/>' +
    '<circle cx="12.5" cy="17" r="2.4" fill="#ffc94d"/><circle cx="19.5" cy="17" r="2.4" fill="#ffc94d"/>' +
    '<rect x="14.5" y="4" width="3" height="5" rx="1.5" fill="#0b1b3f"/><circle cx="16" cy="3.8" r="2" fill="#ff5a4e"/>' +
    '<path d="M12 22.2c1.2.9 2.5 1.3 4 1.3s2.8-.4 4-1.3" stroke="#ffc94d" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>'

  function el(tag, attrs, texto) {
    var e = document.createElement(tag)
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k])
    if (texto != null) e.textContent = texto
    return e
  }

  function guardar(chave, valor) { try { window.localStorage.setItem(chave, valor) } catch (e) { /* sem armazenamento */ } }
  function ler(chave) { try { return window.localStorage.getItem(chave) || '' } catch (e) { return '' } }

  function montarMensagem(d, app) {
    return [
      'Olá, WMundi! Quero pedir um agente de IA.',
      '',
      'Nome: ' + d.nome,
      d.whatsapp ? 'WhatsApp: ' + d.whatsapp : '',
      d.email ? 'E-mail: ' + d.email : '',
      'Aplicativo: ' + (app || 'site'),
      'Canal desejado: ' + d.canal,
      '',
      'O que o agente deve fazer:',
      d.pedido,
    ].filter(function (l) { return l !== '' || true }).join('\n')
  }

  class WMundiAgentes extends HTMLElement {
    connectedCallback() {
      if (this._pronto) return
      this._pronto = true
      var self = this
      var cor = this.getAttribute('cor') || '#2f5bff'
      var esq = this.getAttribute('posicao') === 'esquerda'
      var rotulo = this.getAttribute('rotulo') || 'Peça o seu agente'
      this._app = this.getAttribute('app') || 'site'
      this._endpoint = this.getAttribute('endpoint') || ''
      this._wa = (this.getAttribute('whatsapp') || '5544984535069').replace(/\D/g, '')
      this._mail = this.getAttribute('email') || 'info@wmundi.com'

      var root = this.attachShadow({ mode: 'open' })
      var style = el('style'); style.textContent = CSS; root.appendChild(style)
      var wrap = el('div', { class: 'wrap ' + (esq ? 'esq' : 'dir'), style: '--c:' + cor }); root.appendChild(wrap)

      var painel = el('div', { class: 'painel', role: 'dialog', 'aria-label': 'Peça o seu agente de IA', hidden: '' })
      wrap.appendChild(painel)

      var fab = el('button', { class: 'fab', type: 'button', 'aria-expanded': 'false', 'aria-label': rotulo })
      var ic = el('span', { class: 'ic' }); ic.innerHTML = ICONE
      fab.appendChild(ic); fab.appendChild(el('span', { class: 'tx' }, rotulo))
      wrap.appendChild(fab)

      // topo
      var topo = el('div', { class: 'topo' })
      var t = el('div'); t.appendChild(el('b', null, 'Agentes de IA WMundi')); t.appendChild(el('small', null, 'Peça um pronto ou conte o que você precisa'))
      var x = el('button', { class: 'x', type: 'button', 'aria-label': 'Fechar' }, '×')
      topo.appendChild(t); topo.appendChild(x); painel.appendChild(topo)

      // abas
      var abas = el('div', { class: 'abas', role: 'tablist' })
      var abaProntos = el('button', { class: 'aba', type: 'button', role: 'tab', 'aria-selected': 'true' }, 'Agentes prontos')
      var abaMedida = el('button', { class: 'aba', type: 'button', role: 'tab', 'aria-selected': 'false' }, 'Agente sob medida')
      abas.appendChild(abaProntos); abas.appendChild(abaMedida); painel.appendChild(abas)

      var corpoProntos = el('div', { class: 'corpo' })
      AGENTES.forEach(function (a) {
        var box = el('div', { class: 'ag', 'data-agente': a.id })
        box.appendChild(el('h4', null, a.nome)); box.appendChild(el('p', null, a.resumo))
        var b = el('button', { class: 'btn peq', type: 'button' }, 'Quero este agente')
        b.addEventListener('click', function () { self._mostrarMedida('Quero o agente "' + a.nome + '" no meu negócio. ') })
        box.appendChild(b); corpoProntos.appendChild(box)
      })
      var outro = el('button', { class: 'btn sec peq', type: 'button' }, 'Quero um agente diferente')
      outro.addEventListener('click', function () { self._mostrarMedida('') })
      corpoProntos.appendChild(outro)
      painel.appendChild(corpoProntos)

      var corpoMedida = el('div', { class: 'corpo', hidden: '' })
      painel.appendChild(corpoMedida)
      this._montarForm(corpoMedida)

      // eventos
      function abrir() { painel.hidden = false; fab.setAttribute('aria-expanded', 'true'); self._focoInicial() }
      function fechar() { painel.hidden = true; fab.setAttribute('aria-expanded', 'false'); fab.focus() }
      fab.addEventListener('click', function () { painel.hidden ? abrir() : fechar() })
      x.addEventListener('click', fechar)
      root.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !painel.hidden) fechar() })
      abaProntos.addEventListener('click', function () { self._aba('prontos') })
      abaMedida.addEventListener('click', function () { self._aba('medida') })

      this._r = { painel: painel, corpoProntos: corpoProntos, corpoMedida: corpoMedida, abaProntos: abaProntos, abaMedida: abaMedida, abrir: abrir }
    }

    _aba(qual) {
      var r = this._r
      var medida = qual === 'medida'
      r.corpoProntos.hidden = medida; r.corpoMedida.hidden = !medida
      r.abaProntos.setAttribute('aria-selected', String(!medida)); r.abaMedida.setAttribute('aria-selected', String(medida))
      if (medida) this._focoInicial()
    }

    _mostrarMedida(texto) {
      this._r.abrir()
      this._aba('medida')
      var ta = this._r.corpoMedida.querySelector('textarea')
      if (ta && texto) { ta.value = texto; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length) }
    }

    _focoInicial() {
      var r = this._r
      if (!r) return
      var alvo = !r.corpoMedida.hidden ? r.corpoMedida.querySelector('input') : r.corpoProntos.querySelector('button')
      if (alvo) alvo.focus()
    }

    _montarForm(box) {
      var self = this
      var form = el('form', { novalidate: '' })
      function campo(rotulo, id, tipo, extra) {
        form.appendChild(el('label', { for: id }, rotulo))
        var i = el('input', Object.assign({ id: id, name: id, type: tipo, maxlength: '120' }, extra || {}))
        form.appendChild(i); return i
      }
      var nome = campo('Seu nome', 'nome', 'text', { autocomplete: 'name', required: '' })
      var wpp = campo('WhatsApp (com DDD)', 'whatsapp', 'tel', { autocomplete: 'tel' })
      var mail = campo('E-mail', 'email', 'email', { autocomplete: 'email' })
      form.appendChild(el('label', { for: 'canal' }, 'Onde o agente vai atuar?'))
      var canal = el('select', { id: 'canal', name: 'canal' })
      CANAIS.forEach(function (c) { canal.appendChild(el('option', { value: c }, c)) })
      form.appendChild(canal)
      form.appendChild(el('label', { for: 'pedido' }, 'O que você quer que o agente faça?'))
      var pedido = el('textarea', { id: 'pedido', name: 'pedido', maxlength: '800', required: '', placeholder: 'Ex.: responder clientes fora do horário, confirmar consultas e avisar a equipe quando precisar.' })
      form.appendChild(pedido)
      form.appendChild(el('div', { class: 'aviso' }, 'Não envie dados de pacientes, senhas nem documentos. Conversamos sobre isso na proposta.'))
      var lab = el('label', { class: 'cons' }); var cb = el('input', { type: 'checkbox', name: 'consentimento', value: 'sim' })
      lab.appendChild(cb); lab.appendChild(el('span', null, 'Concordo em ser contatado pela WMundi sobre este pedido. Os dados são usados só para responder a você.'))
      form.appendChild(lab)
      var hp = el('p', { class: 'hp' }); var hpi = el('input', { name: 'bot-field', tabindex: '-1', autocomplete: 'off' }); hp.appendChild(hpi); form.appendChild(hp)
      var acoes = el('div', { class: 'acoes' }); form.appendChild(acoes)
      var msgErro = el('div', { class: 'erro', hidden: '' }); form.appendChild(msgErro)
      var msgOk = el('div', { class: 'ok', hidden: '' }); box.appendChild(form); box.appendChild(msgOk)

      nome.value = ler('wm-ag-nome'); wpp.value = ler('wm-ag-wpp'); mail.value = ler('wm-ag-mail')

      function coletar() {
        var d = { nome: nome.value.trim(), whatsapp: wpp.value.trim(), email: mail.value.trim(), canal: canal.value, pedido: pedido.value.trim() }
        msgErro.hidden = true
        if (!d.nome || !d.pedido) { msgErro.textContent = 'Preencha o seu nome e o que você precisa.'; msgErro.hidden = false; return null }
        if (!d.whatsapp && !d.email) { msgErro.textContent = 'Informe um WhatsApp ou um e-mail para retornarmos.'; msgErro.hidden = false; return null }
        if (!cb.checked) { msgErro.textContent = 'Marque a autorização de contato para continuar.'; msgErro.hidden = false; return null }
        if (hpi.value) return null
        guardar('wm-ag-nome', d.nome); guardar('wm-ag-wpp', d.whatsapp); guardar('wm-ag-mail', d.email)
        return d
      }
      function sucesso(txt) { form.hidden = true; msgOk.textContent = txt; msgOk.hidden = false }

      if (this._endpoint) {
        var enviar = el('button', { class: 'btn', type: 'submit' }, 'Enviar pedido'); acoes.appendChild(enviar)
        form.addEventListener('submit', function (e) {
          e.preventDefault()
          var d = coletar(); if (!d) return
          enviar.disabled = true
          var corpo = new URLSearchParams({
            'form-name': 'pedido-agente', nome: d.nome, whatsapp: d.whatsapp, email: d.email, canal: d.canal,
            app: self._app, agente: '', pedido: d.pedido, consentimento: 'sim', 'bot-field': '',
          }).toString()
          var mesma = false
          try { mesma = new URL(self._endpoint, location.href).origin === location.origin } catch (err) { mesma = false }
          fetch(self._endpoint, { method: 'POST', mode: mesma ? 'same-origin' : 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: corpo })
            .then(function (r) { if (mesma && !r.ok) throw new Error('falhou'); sucesso('Pedido recebido! A equipe da WMundi retorna em breve.') })
            .catch(function () { enviar.disabled = false; msgErro.textContent = 'Não foi possível enviar agora. Escreva para ' + self._mail + '.'; msgErro.hidden = false })
        })
      } else {
        var bw = el('button', { class: 'btn', type: 'submit' }, 'Enviar pelo WhatsApp')
        var bm = el('button', { class: 'btn sec', type: 'button' }, 'Enviar por e-mail')
        acoes.appendChild(bw); acoes.appendChild(bm)
        form.addEventListener('submit', function (e) {
          e.preventDefault()
          var d = coletar(); if (!d) return
          var url = 'https://wa.me/' + self._wa + '?text=' + encodeURIComponent(montarMensagem(d, self._app))
          window.open(url, '_blank', 'noopener,noreferrer')
          sucesso('Abrimos o WhatsApp com o seu pedido. É só tocar em enviar.')
        })
        bm.addEventListener('click', function () {
          var d = coletar(); if (!d) return
          window.location.href = 'mailto:' + self._mail + '?subject=' + encodeURIComponent('Pedido de agente de IA') + '&body=' + encodeURIComponent(montarMensagem(d, self._app))
          sucesso('Abrimos o seu e-mail com o pedido. Se não abrir, escreva para ' + self._mail + '.')
        })
      }
    }
  }

  window.customElements.define('wmundi-agentes', WMundiAgentes)
})()
