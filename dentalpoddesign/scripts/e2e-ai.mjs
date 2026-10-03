// Teste da IA de pontos faciais com UMA FOTO SUA: node scripts/e2e-ai.mjs <foto.jpg> [url] [pastaDeSaida]
// Abre o app, cria um caso, importa a foto, entra em Análise (a IA roda sozinha) e em Desenho (desenho automático).
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const photo = process.argv[2]
if (!photo || !fs.existsSync(photo)) {
  console.log('Uso: node scripts/e2e-ai.mjs <foto-de-sorriso.jpg> [url] [pasta]')
  process.exit(2)
}
const url = process.argv[3] || 'http://127.0.0.1:4173/'
const out = process.argv[4] || './e2e-out'
fs.mkdirSync(out, { recursive: true })
const exe = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] })
const page = await (await browser.newContext({ viewport: { width: 1500, height: 900 } })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(url)
await page.getByRole('button', { name: 'Novo caso' }).click()
await page.waitForSelector('text=Fotografias')
await page.locator('input[type=file][accept="image/*"]').setInputFiles(photo)
await page.waitForSelector('.thumb')
await page.locator('nav button', { hasText: 'Análise' }).click()
await page.waitForSelector('text=Detalhes', { timeout: 1 }).catch(() => {})
const ok = await page.waitForSelector('text=Sorriso detectado', { timeout: 90000 }).then(() => true).catch(() => false)
console.log(ok ? '  ✓ IA detectou o rosto' : '  ✗ IA não detectou o rosto')
await page.screenshot({ path: path.join(out, 'ai-1-analise.png') })
await page.locator('nav button', { hasText: 'Desenho' }).click()
await page.waitForTimeout(1500)
await page.getByRole('button', { name: 'Desenho automático' }).first().click()
await page.waitForTimeout(3000)
await page.screenshot({ path: path.join(out, 'ai-2-desenho.png') })
console.log(errors.length ? '  ✗ erros: ' + errors.join(' | ') : '  ✓ sem erros')
await browser.close()
process.exit(ok && !errors.length ? 0 : 1)
