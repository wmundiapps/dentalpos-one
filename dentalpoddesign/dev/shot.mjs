import { chromium } from 'playwright-core'
const [,, url, out] = process.argv
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'] })
const p = await b.newPage({ viewport: { width: 1500, height: 900 } })
p.on('console', m => console.log('console:', m.text()))
p.on('pageerror', e => console.log('pageerror:', e.message))
await p.goto(url)
await p.waitForFunction('window.__ready === true', null, { timeout: 60000 })
await p.screenshot({ path: out })
await b.close()
