/*!
 * REVAH — conector do site estático (revah.com.br) com a API real.
 * Inclua no index.html, antes do script do site:
 *   <script src="/revah-site-connector.js" data-api="https://api.revah.com.br" data-app="https://app.revah.com.br"></script>
 *
 * Substitui as chamadas que antes não tinham backend:
 *   /auth/register, /auth/login, /payments/create-subscription e o teste grátis em localStorage.
 * O teste grátis (2 campanhas × 20 contatos) agora é validado no servidor, por empresa.
 */
(function () {
  var script = document.currentScript
  var API = (script && script.getAttribute('data-api')) || 'https://api.revah.com.br'
  var APP = (script && script.getAttribute('data-app')) || 'https://app.revah.com.br'
  var KEY = 'revah.session'

  function session() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || 'null')
    } catch (e) {
      return null
    }
  }

  function save(s) {
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch (e) {}
    return s
  }

  function request(path, body, method) {
    var s = session()
    var headers = { 'Content-Type': 'application/json' }
    if (s && s.token) headers.Authorization = 'Bearer ' + s.token
    return fetch(API + path, { method: method || (body ? 'POST' : 'GET'), headers: headers, body: body ? JSON.stringify(body) : undefined }).then(function (res) {
      return res.json().catch(function () { return {} }).then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.error) || 'Não foi possível concluir. Tente novamente.')
          err.status = res.status
          err.code = data && data.code
          throw err
        }
        return data
      })
    })
  }

  var RevahSite = {
    apiUrl: API,
    appUrl: APP,
    session: session,
    /** { name, email, password, company, phone } -> cria a empresa em teste grátis */
    register: function (data) {
      return request('/auth/register', data).then(save)
    },
    login: function (email, password) {
      return request('/auth/login', { email: email, password: password }).then(save)
    },
    logout: function () {
      try {
        localStorage.removeItem(KEY)
      } catch (e) {}
    },
    /** Status real do teste grátis: { campaignsUsed, campaignsRemaining, exhausted, ... } */
    trialStatus: function () {
      return request('/trial/status')
    },
    /** plan: 'START' | 'PRO'. Redireciona para o checkout seguro do Stripe (cartão, boleto, Pix quando habilitado). */
    subscribe: function (plan) {
      return request('/payments/create-subscription', { plan: plan }).then(function (r) {
        if (r.url) window.location.href = r.url
        return r
      })
    },
    /** Plano ENTERPRISE: envia contato para o comercial. */
    contactSales: function (data) {
      return request('/sales/enterprise', data)
    },
    /** Abre o painel já autenticado (o token vai no fragmento, que não trafega para servidores). */
    openApp: function (path) {
      var s = session()
      window.location.href = APP + (path || '/') + (s && s.token ? '#token=' + encodeURIComponent(s.token) : '')
    },
  }

  window.RevahSite = RevahSite
})()
