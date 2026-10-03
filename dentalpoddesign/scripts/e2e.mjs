// Teste de ponta a ponta (Playwright + Chromium): abre o app, cria o caso demo, percorre todas as etapas,
// gera os modelos 3D e confere os downloads. Uso: node scripts/e2e.mjs [url] [pastaDeSaida]
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const url = process.argv[2] || 'http://127.0.0.1:4173/'
const out = process.argv[3] || './e2e-out'
fs.mkdirSync(out, { recursive: true })
const exe = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|TensorFlow|XNNPACK|inference_feedback/.test(m.text())) errors.push('console: ' + m.text()) })
let fail = 0
const ok = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) fail++ }
const shot = async (n) => page.screenshot({ path: path.join(out, n + '.png') })
const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(700) }

await page.goto(url)
await page.waitForSelector('text=DentalPod Design')
ok(true, 'app carregou')
await page.getByRole('button', { name: 'Abrir caso de demonstração' }).click()
await page.waitForSelector('.tooth .tbtn', { timeout: 60000 })
await page.waitForTimeout(2500)
await shot('01-design')
ok((await page.locator('.tooth .tbtn').count()) >= 10, 'barra de dentes populada')

// Análise
await nav('Análise')
await page.waitForTimeout(1200)
await shot('02-analise')
ok(await page.locator('text=Índice estético').count() > 0, 'análise estética exibida')

// Design: interações
await nav('Desenho')
await page.waitForTimeout(1500)
await page.locator('.preset', { hasText: 'Hollywood' }).click()
await page.waitForTimeout(1200)
await shot('03-hollywood')
await page.locator('.tbtn', { hasText: '21' }).first().click()
await page.waitForTimeout(500)
ok(await page.locator('text=Dente 21').count() > 0, 'seleção de dente e editor')
await page.locator('.preset', { hasText: 'Natural jovem' }).click()
await page.waitForTimeout(800)
await page.getByRole('button', { name: 'Desenho automático' }).first().click()
await page.waitForTimeout(1200)
await shot('04-auto')

// CAD
await nav('CAD 3D')
await page.waitForTimeout(2500)
await shot('05-cad')
// modo total para testar dentadura
await nav('Desenho')
await page.locator('.seg button', { hasText: 'Total' }).first().click()
await page.waitForTimeout(1500)
await shot('06-total-foto')
await nav('CAD 3D')
await page.waitForTimeout(3000)
await shot('07-cad-total')

await nav('Plano')
await shot('08-plano')
await nav('Apresentar')
await page.waitForTimeout(1500)
await shot('09-apresentar')

// Exportar
await nav('Exportar')
await page.getByRole('button', { name: /Gerar modelos 3D/ }).click()
await page.waitForSelector('text=Todas as peças são malhas fechadas', { timeout: 120000 })
await shot('10-exportar')
ok(true, 'modelos 3D gerados e verificados')
for (const name of ['ZIP (1 STL por peça)', '3MF (cores)', 'STL único', 'PLY', 'OBJ + MTL', 'Relatório JSON']) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByRole('button', { name }).click()])
  const f = path.join(out, dl.suggestedFilename())
  await dl.saveAs(f)
  ok(fs.statSync(f).size > 500, `download ${dl.suggestedFilename()} (${fs.statSync(f).size} bytes)`)
}
// PDF
await nav('Apresentar')
const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: /Relatório PDF/ }).click()])
const pf = path.join(out, pdf.suggestedFilename())
await pdf.saveAs(pf)
ok(fs.statSync(pf).size > 5000, `PDF ${fs.statSync(pf).size} bytes`)

ok(errors.length === 0, 'sem erros de console/página' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''))
await browser.close()
console.log(fail ? `\nFALHAS: ${fail}` : '\nE2E OK')
process.exit(fail ? 1 : 0)
