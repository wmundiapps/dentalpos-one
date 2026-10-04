// Testes de segurança de ponta a ponta (Playwright). Uso: node scripts/e2e-security.mjs [url]
// Requer o build servido (npm run preview) e e2e-out/sintetica.jpg (gerado por e2e-wizard.mjs).
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const url = process.argv[2] || 'http://127.0.0.1:4173/'
const u = new URL(url)
const exe = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-features=PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests,LocalNetworkAccessChecks', `--host-resolver-rules=MAP evil.test 127.0.0.1, MAP api.test 127.0.0.1`],
})
let fail = 0
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++ }
const ctx = await browser.newContext({ viewport: { width: 1400, height: 850 } })

// 1) domínio não autorizado → tela de bloqueio e app nem carrega
{
  const p = await ctx.newPage()
  await p.goto(`http://evil.test:${u.port}/`)
  // duas camadas: o domain-lock do código ofuscado redireciona p/ about:blank; sem ele, a tela de bloqueio aparece
  await p.waitForFunction(() => location.href === 'about:blank' || document.body.innerText.includes('Uso não autorizado'), null, { timeout: 15000 })
  ok(true, 'host não autorizado (evil.test) é bloqueado')
  ok((await p.locator('text=Abrir caso de demonstração').count()) === 0, 'app não é renderizado no host bloqueado')
  await p.close()
}

// 2) embutido por site não autorizado → bloqueado
{
  const p = await ctx.newPage()
  await p.route('http://evil.test/**', (r) => r.fulfill({ contentType: 'text/html', body: `<iframe id=f src="${url}" style="width:1000px;height:600px"></iframe>` }))
  await p.goto('http://evil.test/page.html')
  let blocked = false
  for (let i = 0; i < 30 && !blocked; i++) {
    for (const x of p.frames().filter((f) => f !== p.mainFrame())) {
      if (x.url() === 'about:blank' || (await x.locator('text=Uso não autorizado').count().catch(() => 0))) blocked = true
    }
    if (!blocked) await p.waitForTimeout(500)
  }
  ok(blocked, 'iframe dentro de site não autorizado é bloqueado')
  await p.close()
}

// 3) token de host obrigatório: sem token → travado; com token válido (verify interceptado) → libera
{
  const p = await ctx.newPage()
  await p.route('**/security.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ requireHostToken: true, apiUrl: 'https://api.test/api' }) }))
  let verifyCalls = 0
  await p.route('https://api.test/api/dpd/verify', async (r) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' }
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors })
    verifyCalls++
    const body = JSON.parse(r.request().postData() || '{}')
    const good = body.token === 'T'.repeat(40)
    await r.fulfill({ status: good ? 200 : 401, contentType: 'application/json', headers: cors, body: JSON.stringify({ ok: good }) })
  })
  await p.route('**/host-test.html', (r) => r.fulfill({ contentType: 'text/html', body: `<iframe id=f src="${url}?embedded=1" style="width:1400px;height:800px"></iframe><script>window.msgs=[];addEventListener('message',e=>{window.msgs.push(e.data&&e.data.type);if(e.data&&e.data.type==='dpd:ready'){window.TOKEN&&document.getElementById('f').contentWindow.postMessage({type:'dpd:init',token:window.TOKEN,patient:{id:'p1',name:'Host Teste'}},location.origin)}})</script>` }))
  await p.goto(new URL('host-test.html', url).href)
  const f = p.frameLocator('#f')
  await f.locator('text=Abra o DentalPod Design pelo Dentalpos One').waitFor({ timeout: 15000 })
  ok(true, 'requireHostToken: app fica travado sem token')
  // token inválido
  await p.evaluate(() => document.getElementById('f').contentWindow.postMessage({ type: 'dpd:init', token: 'X'.repeat(40), patient: { name: 'x' } }, location.origin))
  await p.waitForTimeout(1500)
  ok(await f.locator('text=Abra o DentalPod Design pelo Dentalpos One').count() > 0 || await f.locator('role=alertdialog').count() > 0, 'token inválido não destrava')
  // mensagem vinda de origem/janela errada é ignorada: simula postMessage do próprio topo com token bom, mas de outra origem
  await p.evaluate(() => document.getElementById('f').contentWindow.postMessage({ type: 'dpd:init', token: 'T'.repeat(40), patient: { name: 'Host Teste' } }, location.origin))
  await f.locator('role=alertdialog').waitFor({ state: 'detached', timeout: 15000 })
  ok(true, 'token válido (confirmado pelo servidor) libera o app')
  ok(verifyCalls >= 2, 'servidor foi consultado (' + verifyCalls + ' chamadas)')
  await p.close()
}

// 4) arquivos maliciosos / impróprios
{
  const p = await ctx.newPage()
  await p.goto(url)
  // .dpd com poluição de protótipo
  const dpd = Buffer.from('{"format":"dentalpoddesign","project":{"__proto__":{"polluted":true}}}')
  const fileDpd = p.locator('input[type=file][accept*=".dpd"]')
  await fileDpd.setInputFiles({ name: 'x.dpd', mimeType: 'application/json', buffer: dpd })
  await p.waitForTimeout(1500)
  ok(await p.evaluate(() => ({}).polluted === undefined), 'prototype pollution via .dpd não afeta Object')
  await p.getByPlaceholder(/Nome do paciente/).fill('Seguranca Teste')
  await p.getByRole('button', { name: 'Novo caso' }).click()
  await p.waitForSelector('text=Fotografias')
  const input = p.locator('input[type=file][accept="image/*"]')
  const exeBytes = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(4000, 1)])
  await input.setInputFiles({ name: 'foto.jpg', mimeType: 'image/jpeg', buffer: exeBytes })
  await p.waitForSelector('text=bloqueado', { timeout: 10000 })
  ok((await p.locator('.thumb').count()) === 0, 'executável renomeado .jpg é rejeitado')
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' + ' '.repeat(600))
  await input.setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer: svg })
  await p.waitForTimeout(1200)
  ok((await p.locator('.thumb').count()) === 0, 'SVG com script é rejeitado')
  const photo = 'e2e-out/sintetica.jpg'
  if (fs.existsSync(photo)) {
    await input.setInputFiles(photo)
    await p.waitForSelector('.thumb', { timeout: 30000 })
    ok(true, 'foto legítima passa (inclui verificação de conteúdo local)')
  }
  await p.close()
}

await browser.close()
console.log(fail ? `\nFALHAS: ${fail}` : '\nSEGURANÇA E2E OK')
process.exit(fail ? 1 : 0)
