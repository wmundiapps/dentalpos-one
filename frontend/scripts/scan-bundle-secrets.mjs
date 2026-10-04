#!/usr/bin/env node
// Varre dist/ procurando segredos que NÃO podem ir para o navegador. Falha o build (exit 1) se achar.
// Uso: node scripts/scan-bundle-secrets.mjs [pasta]   (padrão: dist)
// Para ignorar um falso positivo conhecido: scripts/scan-bundle-allowlist.json  -> ["trecho exato", ...]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'

const raiz = resolve(process.argv[2] || 'dist')
const EXTENSOES = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.txt', '.map', '.svg', '.webmanifest', '.xml'])
const LIMITE_BYTES = 20 * 1024 * 1024

const REGRAS = [
  ['Chave estilo OpenAI/Stripe (sk-/sk_live_)', /\bsk[-_](?:live_|test_|proj-|ant-)?[A-Za-z0-9_-]{20,}/g],
  ['Chave restrita Stripe (rk_live_)', /\brk_live_[A-Za-z0-9]{16,}/g],
  ['Webhook secret Stripe (whsec_)', /\bwhsec_[A-Za-z0-9]{16,}/g],
  ['AWS access key (AKIA/ASIA)', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['JWT completo (eyJ...eyJ...assinatura)', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ['Chave privada PEM', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----/g],
  ['URL de banco com credenciais', /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqp):\/\/[^\s"'`/@]+:[^\s"'`/@]+@[^\s"'`]+/gi],
  ['Supabase service_role', /service_role/gi],
  ['Token GitHub', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/g],
  ['Token Slack', /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
  ['Chave Google API (AIza)', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['Chave SendGrid', /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g],
  ['Chave Asaas ($aact_)', /\$aact_[A-Za-z0-9_]{20,}/g],
  ['Atribuição literal de segredo (password/secret/apiKey/token/privateKey = "valor")',
    /\b(?:password|passwd|pwd|secret|client_?secret|api_?key|apikey|access_?token|auth_?token|private_?key)["'`]?\s*[:=]\s*["'`]([A-Za-z0-9+/_\-=.!@#$%^&*]{12,})["'`]/gi],
  ['Cabeçalho Authorization com token fixo', /Authorization["'`]?\s*[:=]\s*["'`](?:Bearer|Basic)\s+[A-Za-z0-9+/_\-=.]{20,}["'`]/gi],
]

// Nomes de variáveis VITE_* que jamais devem existir (seriam publicadas no bundle).
const NOME_SENSIVEL = /(SECRET|PRIVATE|PASSWORD|PASSWD|TOKEN|SERVICE_ROLE|SERVICE_KEY|DATABASE|DB_URL|API_KEY|APIKEY|ACCESS_KEY|CREDENTIAL)/i

function listar(dir) {
  const saida = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    const st = statSync(caminho)
    if (st.isDirectory()) saida.push(...listar(caminho))
    else if (EXTENSOES.has(extname(nome).toLowerCase()) && st.size <= LIMITE_BYTES) saida.push(caminho)
  }
  return saida
}

function mascarar(trecho) {
  const t = trecho.replace(/\s+/g, ' ')
  return t.length <= 14 ? `${t.slice(0, 3)}***` : `${t.slice(0, 8)}…${t.slice(-3)} (${t.length} caracteres)`
}

if (!existsSync(raiz)) {
  console.error(`[scan-secrets] Pasta não encontrada: ${raiz}. Rode o build antes.`)
  process.exit(1)
}

let permitidos = []
const arquivoPermitidos = new URL('./scan-bundle-allowlist.json', import.meta.url)
if (existsSync(arquivoPermitidos)) {
  try { permitidos = JSON.parse(readFileSync(arquivoPermitidos, 'utf8')) } catch { /* ignora */ }
}

const achados = []
const origens = new Map()
const arquivos = listar(raiz)

for (const arquivo of arquivos) {
  const conteudo = readFileSync(arquivo, 'utf8')
  const rel = arquivo.slice(raiz.length + 1)
  if (rel.endsWith('.map')) achados.push({ regra: 'Sourcemap publicado (expõe o código-fonte original)', rel, trecho: rel })
  for (const [regra, regex] of REGRAS) {
    regex.lastIndex = 0
    let m
    while ((m = regex.exec(conteudo))) {
      const bruto = m[0]
      if (permitidos.some((p) => bruto.includes(p))) continue
      achados.push({ regra, rel, trecho: mascarar(bruto) })
      if (m[0].length === 0) regex.lastIndex++
    }
  }
  for (const u of conteudo.match(/https?:\/\/[a-zA-Z0-9.-]+(?::\d+)?/g) || []) origens.set(u, (origens.get(u) || 0) + 1)
}

// Variáveis VITE_* do ambiente de build (são embutidas no bundle quando usadas).
const ambiente = { ...process.env }
for (const f of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  if (!existsSync(f)) continue
  for (const linha of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha)
    if (m && !(m[1] in ambiente)) ambiente[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const varsVite = Object.keys(ambiente).filter((k) => k.startsWith('VITE_')).sort()
const sensiveis = varsVite.filter((k) => NOME_SENSIVEL.test(k))
for (const k of sensiveis) achados.push({ regra: 'Variável VITE_* com nome sensível (seria pública)', rel: 'ambiente', trecho: k })
for (const k of varsVite) {
  const v = ambiente[k] || ''
  if (v.length >= 16 && !/^https?:\/\//.test(v) && arquivos.some((a) => readFileSync(a, 'utf8').includes(v))) {
    if (!sensiveis.includes(k)) achados.push({ regra: 'Valor de VITE_* longo e não-URL encontrado no bundle (confira se é público)', rel: 'ambiente', trecho: k })
  }
}

const externas = [...origens.entries()].filter(([u]) => !/w3\.org|reactjs\.org|react\.dev|mui\.com|github\.com|mozilla\.org|localhost|127\.0\.0\.1/.test(u)).sort((a, b) => b[1] - a[1])

console.log(`[scan-secrets] ${arquivos.length} arquivo(s) verificado(s) em ${raiz}`)
console.log(`[scan-secrets] Variáveis VITE_* no ambiente de build (públicas por definição): ${varsVite.length ? varsVite.join(', ') : '(nenhuma)'}`)
console.log(`[scan-secrets] Origens externas referenciadas no bundle: ${externas.length ? externas.slice(0, 15).map(([u]) => u).join(', ') : '(nenhuma)'}`)

if (achados.length) {
  console.error(`\n[scan-secrets] FALHA: ${achados.length} possível(is) segredo(s) no bundle:`)
  for (const a of achados.slice(0, 50)) console.error(`  - ${a.regra}\n      ${a.rel}: ${a.trecho}`)
  console.error('\nRemova o segredo do frontend (mantenha no servidor). Falso positivo? Adicione o trecho em scripts/scan-bundle-allowlist.json.')
  process.exit(1)
}
console.log('[scan-secrets] OK: nenhum segredo encontrado.')
