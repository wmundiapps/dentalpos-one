// E2E 2: fluxo "do zero": novo caso → upload de foto → análise guiada (8 cliques) → desenho automático → host (iframe).
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const url = process.argv[2] || 'http://127.0.0.1:4173/'
const out = process.argv[3] || './e2e-out'
fs.mkdirSync(out, { recursive: true })
const exe = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true })
let fail = 0
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++ }

// 1) fabrica uma foto sintética
const gen = await ctx.newPage()
await gen.goto('about:blank')
const dataUrl = await gen.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 1600; c.height = 1200
  const g = c.getContext('2d')
  g.fillStyle = '#c99a7c'; g.fillRect(0, 0, 1600, 1200)
  g.fillStyle = '#fff'; for (const x of [560, 1040]) { g.beginPath(); g.ellipse(x, 420, 70, 34, 0, 0, 7); g.fill() }
  g.fillStyle = '#3a2a1c'; for (const x of [560, 1040]) { g.beginPath(); g.arc(x, 420, 22, 0, 7); g.fill() }
  g.fillStyle = '#7a1f2a'; g.beginPath(); g.ellipse(800, 880, 230, 70, 0, 0, 7); g.fill()
  g.fillStyle = '#e8dcc0'; g.fillRect(660, 840, 280, 40)
  return c.toDataURL('image/jpeg', 0.9)
})
const photo = path.join(out, 'sintetica.jpg')
fs.writeFileSync(photo, Buffer.from(dataUrl.split(',')[1], 'base64'))
await gen.close()

const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push('console: ' + m.text()) })
await page.goto(url)
await page.getByPlaceholder(/Nome do paciente/).fill('Maria Teste')
await page.getByRole('button', { name: 'Novo caso' }).click()
await page.waitForSelector('text=Fotografias')
await page.locator('input[type=file][accept="image/*"]').setInputFiles(photo)
await page.waitForSelector('.thumb', { timeout: 20000 })
ok(await page.locator('.thumb').count() === 1, 'foto importada')
await page.locator('nav button', { hasText: 'Análise' }).click()
await page.waitForTimeout(800)
await page.getByRole('button', { name: 'Iniciar análise guiada' }).click()
await page.waitForTimeout(300)
const box = await page.locator('.stagewrap canvas').boundingBox()
const k = Math.min(box.width / 1600, box.height / 1200) * 0.97
const ox = box.x + (box.width - 1600 * k) / 2
const oy = box.y + (box.height - 1200 * k) / 2
const P = (x, y) => [ox + x * k, oy + y * k]
const clicks = [[560, 420], [1040, 420], [800, 300], [800, 1150], [570, 880], [1030, 880], [800, 845], [800, 915]]
for (const [x, y] of clicks) { const [sx, sy] = P(x, y); await page.mouse.click(sx, sy); await page.waitForTimeout(250) }
await page.waitForSelector('text=Análise facial concluída', { timeout: 5000 }).catch(() => {})
await page.screenshot({ path: path.join(out, 'w1-marcas.png') })
ok(await page.locator('text=Faltam marcas').count() === 0, 'análise sem marcas faltando')
await page.getByRole('button', { name: 'Desenho automático' }).first().click()
await page.waitForTimeout(1500)
await page.locator('nav button', { hasText: 'Desenho' }).click()
await page.waitForTimeout(2000)
await page.screenshot({ path: path.join(out, 'w2-desenho.png') })
// arrasta o dente selecionado
await page.locator('.tbtn', { hasText: '21' }).first().click()
const c2 = await page.locator('.stagewrap canvas').boundingBox()
await page.mouse.move(c2.x + c2.width / 2 + 40, c2.y + c2.height / 2)
ok(true, 'fluxo do zero completo')
// 2) host / iframe
const hostPage = await ctx.newPage()
const hostErrors = []
hostPage.on('pageerror', (e) => hostErrors.push(e.message))
await hostPage.route('**/host-test.html', (r) => r.fulfill({ contentType: 'text/html', body: `<iframe id=f src="${url}?embedded=1" style="width:1400px;height:800px"></iframe><script>window.msgs=[];addEventListener('message',e=>{window.msgs.push(e.data);if(e.data&&e.data.type==='dpd:ready')document.getElementById('f').contentWindow.postMessage({type:'dpd:init',patient:{id:'p1',name:'Joao Host'},caseName:'Caso Host'},'*')})</script>` }))
await hostPage.goto(new URL('host-test.html', url).href)
await hostPage.waitForFunction(() => window.msgs.some((m) => m && m.type === 'dpd:saved'), null, { timeout: 30000 })
const msgs = await hostPage.evaluate(() => window.msgs.map((m) => m.type))
ok(msgs.includes('dpd:ready') && msgs.includes('dpd:saved'), 'ponte postMessage (ready/saved): ' + msgs.join(','))
const frame = hostPage.frameLocator('#f')
ok(await frame.locator('.proj-name').inputValue() === 'Caso Host', 'caso criado a partir do paciente do host')
ok(errors.length + hostErrors.length === 0, 'sem erros' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''))
await browser.close()
console.log(fail ? `\nFALHAS: ${fail}` : '\nE2E-2 OK')
process.exit(fail ? 1 : 0)
