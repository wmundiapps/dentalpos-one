/*!
 * REVAH — conector do site estático (revah.com.br) com a API real.
 * Inclua no index.html, antes do script do site:
 *   <script src="/revah-site-connector.js" data-api="https://api.revah.com.br" data-app="https://app.revah.com.br"></script>
 *
 * Substitui as chamadas que antes não tinham backend:
 *   /auth/register, /auth/login, /payments/create-subscription e o teste grátis em localStorage.
 * Teste grátis de 14 dias: começa quando a empresa cadastra a forma de pagamento (validado no servidor).
 * Pagamentos: Asaas (Brasil — Pix, boleto ou cartão; exige CPF/CNPJ) ou Stripe (cartão internacional).
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
    /** { name, email, password, company, phone } -> cria a empresa (status PENDING_PAYMENT até cadastrar o pagamento) */
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
    /** Status do teste: { isTrial, days, endsAt, daysLeft, maxRecipientsPerCampaign, paymentMethodRequired, trialAvailable, exhausted } */
    trialStatus: function () {
      return request('/trial/status')
    },
    /** Planos, preços, recursos e provedores disponíveis: { plans, trial, providers: { ASAAS, STRIPE }, note, leadsPriceBRL } */
    plans: function () {
      return request('/plans')
    },
    /**
     * plan: 'START' | 'PRO'; opts: { provider: 'ASAAS' | 'STRIPE', cpfCnpj }.
     * Asaas com teste: os 14 dias começam na hora (sem redirecionar) e abre o painel em /assinatura?status=sucesso.
     * Stripe (ou Asaas sem teste): redireciona para a página de pagamento.
     */
    subscribe: function (plan, opts) {
      opts = opts || {}
      var body = { plan: plan }
      if (opts.provider) body.provider = opts.provider
      if (opts.cpfCnpj) body.cpfCnpj = String(opts.cpfCnpj).replace(/\D/g, '')
      return request('/payments/create-subscription', body).then(function (r) {
        if (r.url && !r.trialEndsAt) window.location.href = r.url
        else RevahSite.openApp('/assinatura?status=sucesso')
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
