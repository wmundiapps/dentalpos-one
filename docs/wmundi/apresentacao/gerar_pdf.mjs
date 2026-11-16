// Gera o PDF da apresentação a partir de apresentacao.html e confere cada slide.
// Uso: node gerar_pdf.mjs [pasta_de_previas]
import { createRequire } from 'node:module'
import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  ;({ chromium } = require('/opt/node-tools/node_modules/playwright'))
}
const aqui = dirname(fileURLToPath(import.meta.url))
const previas = process.argv[2]
const nav = await chromium.launch(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {})
const pg = await nav.newPage({ viewport: { width: 1920, height: 1080 } })
await pg.goto(pathToFileURL(join(aqui, 'apresentacao.html')).href, { waitUntil: 'load' })
await pg.evaluate(() => document.fonts.ready)
await pg.waitForTimeout(600)

// Conferência: nada pode sair do slide, estourar cartões e telas, nem encostar no rodapé.
const problemas = await pg.evaluate(() => {
  const out = []
  document.querySelectorAll('.slide').forEach((s, i) => {
    const r0 = s.getBoundingClientRect()
    s.querySelectorAll('.pad *, .foot *').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      if (el.closest('.ring')) return
      if (r.right > r0.right + 1 || r.bottom > r0.bottom + 1 || r.left < r0.left - 1) out.push(`slide ${i + 1}: ${el.tagName}.${el.className} sai da página`)
    })
    s.querySelectorAll('.card, .dev .body, .pg div').forEach((el) => {
      if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) out.push(`slide ${i + 1}: conteúdo estoura ${el.tagName}.${el.className}`)
    })
    const foot = s.querySelector('.foot')
    const pad = s.querySelector('.pad')
    if (foot && pad) {
      const f = foot.getBoundingClientRect().top
      pad.querySelectorAll('h1,h2,h3,p,li,.card,.chips,.dev,.steps,.ct,.pg,.nums').forEach((el) => {
        if (el.closest('.nota')) return
        const b = el.getBoundingClientRect().bottom
        if (b > f - 6) out.push(`slide ${i + 1}: ${el.tagName}.${el.className} encosta no rodapé (${Math.round(b)} > ${Math.round(f)})`)
      })
    }
  })
  return out
})

const texto = await pg.evaluate(() => document.body.innerText)
const proibidos = [/R\$/, /\d\s?%/, /gr[aá]tis/i, /gratuit/i, /comiss/i, /taxa de/i, /desconto/i, /Receita Federal/i, /Meta Lead/i, /Google Maps/i, /scrap/i]
const achados = proibidos.filter((re) => re.test(texto)).map(String)
console.log('slides:', await pg.evaluate(() => document.querySelectorAll('.slide').length))
console.log('problemas de layout:', problemas.length)
problemas.slice(0, 40).forEach((x) => console.log(' -', x))
console.log('termos proibidos encontrados:', achados.length ? achados.join(', ') : 'nenhum')

if (previas) {
  mkdirSync(previas, { recursive: true })
  const lista = await pg.$$('.slide')
  for (const n of [1, 4, 6, 11, 14, 21, 26, 36, 42, 46]) {
    if (lista[n - 1]) await lista[n - 1].screenshot({ path: join(previas, `slide-${String(n).padStart(2, '0')}.png`) })
  }
}
await pg.pdf({ path: join(aqui, 'WMundi-Portfolio-e-Programa-de-Gestores.pdf'), width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true })
await nav.close()
console.log('PDF gerado')
