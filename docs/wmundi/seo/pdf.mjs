import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
const r = createRequire(import.meta.url)
let ch
try { ({ chromium: ch } = r('playwright')) } catch { ({ chromium: ch } = r('/opt/node-tools/node_modules/playwright')) }
const nav = await ch.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await nav.newPage()
await p.goto(pathToFileURL(resolve('PLANO-SEO-WMUNDI.html')).href)
await p.pdf({ path: resolve('PLANO-SEO-WMUNDI.pdf'), format: 'A4', margin: { top: '14mm', bottom: '14mm', left: '10mm', right: '10mm' }, printBackground: true })
await nav.close()
