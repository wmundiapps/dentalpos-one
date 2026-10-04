// Pós-build: ofusca SÓ o código próprio do app (chunks App/index/faceLandmarks). Bibliotecas ficam intactas.
// Camadas: nomes/strings ofuscados, domain-lock embutido, anti-depuração, anti-reformatação (self-defending),
// console desativado. Honestidade: isso DIFICULTA a engenharia reversa, não a impede — segredos nunca ficam no cliente.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JavaScriptObfuscator from 'javascript-obfuscator'

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const assets = path.join(dist, 'assets')
const domains = (process.env.DPD_DOMAINS || 'localhost,127.0.0.1,dentalpos.com.br,.dentalpos.com.br,dentalpos-one.vercel.app,dentalpos-landing.vercel.app,.robsonraveloliveira-7222.vercel.app').split(',').map((s) => s.trim()).filter(Boolean)
const noLock = process.env.DPD_NO_DOMAINLOCK === '1'

let n = 0
for (const f of fs.readdirSync(assets)) {
  if (!/^(App|index|faceLandmarks)-.*\.js$/.test(f)) continue
  const file = path.join(assets, f)
  const src = fs.readFileSync(file, 'utf8')
  const out = JavaScriptObfuscator.obfuscate(src, {
    compact: true,
    target: 'browser',
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    stringArray: true,
    stringArrayThreshold: 0.8,
    stringArrayEncoding: ['base64'],
    stringArrayRotate: true,
    stringArrayShuffle: true,
    splitStrings: false,
    controlFlowFlattening: false, // mantém a performance das rotinas geométricas
    deadCodeInjection: false,
    numbersToExpressions: false,
    selfDefending: true,
    disableConsoleOutput: true,
    debugProtection: true,
    debugProtectionInterval: 4000,
    domainLock: noLock ? [] : domains,
    domainLockRedirectUrl: 'about:blank',
    sourceMap: false,
  }).getObfuscatedCode()
  fs.writeFileSync(file, out)
  n++
  console.log(`protegido ${f}: ${(src.length / 1024).toFixed(0)} kB → ${(out.length / 1024).toFixed(0)} kB`)
}
for (const f of fs.readdirSync(assets)) if (f.endsWith('.map')) fs.unlinkSync(path.join(assets, f))
if (!n) throw new Error('nenhum chunk protegido — verifique o build')
