import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
const r = createRequire(import.meta.url)
let ch
try { ({ chromium: ch } = r('playwright')) } catch { ({ chromium: ch } = r('/opt/node-tools/node_modules/playwright')) }
const nav = await ch.launch({ executablePath: '/opt/pw-browsers/chromium' })
for (const n of ['ponto', 'precificador', 'urbanflow']) {
  const p = await nav.newPage({ viewport: { width: 1280, height: 900 } })
  const er = []
  p.on('pageerror', (e) => er.push(e.message))
  p.on('console', (m) => m.type() === 'error' && er.push(m.text()))
  await p.goto(pathToFileURL(resolve('dist', n, 'index.html')).href)
  for (const t of await p.$$('nav button')) { await t.click(); await p.waitForTimeout(80) }
  if (n === 'ponto') {
    await p.click('nav button:nth-child(1)'); await p.click('#go'); await p.waitForTimeout(3500)
    console.log('ponto:', await p.textContent('#fmsg'))
    await p.selectOption('#sit', 'foto'); await p.click('#go'); await p.waitForTimeout(3000)
    console.log(await p.textContent('#fmsg'))
    await p.click('nav button:nth-child(5)'); console.log((await p.textContent('#alertas')).slice(0, 400))
    await p.click('nav button:nth-child(7)'); console.log(await p.textContent('#pr'))
  }
  if (n === 'urbanflow') {
    await p.click('nav button:nth-child(2)'); await p.click('#play'); await p.waitForTimeout(4000)
    console.log('erro contador:', await p.textContent('#er'))
    await p.click('nav button:nth-child(6)'); console.log(await p.textContent('#i_res'))
  }
  if (n === 'precificador') { await p.click('nav button:nth-child(1)'); console.log((await p.textContent('#h_res')).slice(0, 300)) }
  await p.screenshot({ path: `/tmp/shot-${n}.png` })
  console.log(n, 'erros:', er)
}
await nav.close()
