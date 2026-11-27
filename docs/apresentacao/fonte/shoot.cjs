const { chromium } = require('playwright')
const fs = require('fs')
const S = process.argv[2]
const rotas = JSON.parse(fs.readFileSync(S + '/rotas.json', 'utf8'))
const API = 'http://localhost:3000/api', WEB = 'http://127.0.0.1:4173'
const login = async (email, password) => { const r = await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clinicId: process.env.CLINIC, email, password }) }); const j = await r.json(); if (!j.token) throw new Error('login ' + email + JSON.stringify(j).slice(0, 100)); return j }
const slug = (r) => r.replace(/^\/edu\/?/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'painel'
;(async () => {
  const perfil = process.argv[3] || 'admin@suainstituicao.edu.br'
  const senha = process.argv[4] || 'Demo@2026'
  const lista = process.argv[5] ? JSON.parse(process.argv[5]) : rotas
  const cf = '/tmp/tok-' + perfil + '.json'; let dados; try { dados = JSON.parse(fs.readFileSync(cf, 'utf8')) } catch { dados = await login(perfil, senha); fs.writeFileSync(cf, JSON.stringify(dados)) }
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR' })
  await ctx.addInitScript(([d]) => { localStorage.setItem('dentalpos.token', d.token); localStorage.setItem('dentalpos.clinicId', d.user.clinicId); localStorage.setItem('dentalpos.user', JSON.stringify(d.user)); localStorage.setItem('dentalpos.cookies.v1', JSON.stringify({ versao: '1.0-modelo', necessarios: true, opcionais: { COOKIES_PREFERENCIAS: false, COOKIES_ANALITICOS: false, COOKIES_MARKETING: false }, decididoEm: new Date().toISOString() })) }, [dados])
  const page = await ctx.newPage()
  const idx = []
  for (const { titulo, rota } of lista) {
    const nome = (process.argv[6] || '') + slug(rota)
    try {
      await page.goto(WEB + rota, { waitUntil: 'networkidle', timeout: 40000 })
      await page.waitForTimeout(1800)
      await page.screenshot({ path: `${S}/shots/${nome}.jpg`, type: 'jpeg', quality: 72 })
      idx.push({ titulo, rota, arquivo: `shots/${nome}.jpg` })
      console.log('ok', rota)
    } catch (e) { console.log('ERRO', rota, String(e).slice(0, 80)) }
  }
  fs.writeFileSync(`${S}/shots-index-${process.argv[6] || 'admin'}.json`, JSON.stringify(idx, null, 1))
  await browser.close()
})()
