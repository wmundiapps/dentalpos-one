import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
const r = createRequire(import.meta.url)
let ch
try { ({ chromium: ch } = r('playwright')) } catch { ({ chromium: ch } = r('/opt/node-tools/node_modules/playwright')) }
const nav = await ch.launch({ executablePath: '/opt/pw-browsers/chromium' })
for (const n of ['proposta-ponto', 'proposta-precificador', 'proposta-urbanflow', 'comparativo-urbanflow', 'guia-vendedor-INTERNO', 'carta-proposta-prefeituras', 'carta-ponto', 'carta-precificador-hotelaria', 'carta-urbanflow-prefeituras', 'proposta-silvio-breda']) {
  const p = await nav.newPage()
  await p.goto(pathToFileURL(resolve('pdf', n + '.html')).href)
  await p.evaluate(() => document.fonts.ready)
  const sobra = await p.evaluate(() => [...document.querySelectorAll('.pg')].map((e, i) => {
    const f = e.querySelector('.ft'); if (!f) return null
    const fy = f.getBoundingClientRect().top - e.getBoundingClientRect().top
    const last = [...e.children].filter((c) => c !== f).pop()
    const b = last ? last.getBoundingClientRect().bottom - e.getBoundingClientRect().top : 0
    return b > fy - 4 || e.getBoundingClientRect().height > 1130 ? `página ${i} estoura (${Math.round(b)} > ${Math.round(fy)}; alt ${Math.round(e.getBoundingClientRect().height)})` : null
  }).filter(Boolean))
  await p.pdf({ path: resolve('pdf', n + '.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true })
  console.log(n, sobra.length ? sobra : 'layout ok')
}
await nav.close()
