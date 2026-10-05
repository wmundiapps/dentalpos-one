#!/usr/bin/env node
// DentalPos One — gera a lista de prospecção a partir dos Dados Abertos do CNPJ (Receita Federal).
//
// Uso (PowerShell, na raiz do repositório):
//   node scripts/receita-prospects.mjs --pasta "C:\dados-cnpj" --uf PR
// Opções:
//   --uf PR                 UF (ou várias: PR,SC,SP). Padrão: PR
//   --cnaes 8630504         CNAEs (principal OU secundário). Laboratórios: 8630504,3250706
//   --incluir-individuais   inclui MEI / empresário individual (desligado por padrão: o e-mail tende a ser dado pessoal — LGPD)
//   --saida arquivo.json    padrão: prospects-<UF>.json na pasta atual
//
// A pasta deve conter os arquivos JÁ DESCOMPACTADOS de: Estabelecimentos*.zip, Empresas*.zip, Simples.zip e Municipios.zip.
// Nada é enviado para lugar nenhum: o script só gera o JSON (para importar no painel /prospeccao) e um relatório.

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const flag = (name) => args.includes(`--${name}`)

const PASTA = opt('pasta', '')
const UFS = opt('uf', 'PR').toUpperCase().split(',').map((s) => s.trim()).filter(Boolean)
const CNAES = opt('cnaes', '8630504').split(',').map((s) => s.replace(/\D/g, '')).filter(Boolean)
const INCLUIR_INDIVIDUAIS = flag('incluir-individuais')
const SAIDA = opt('saida', `prospects-${UFS.join('-')}.json`)
const LAB_CNAE = '3250706'

if (!PASTA || !fs.existsSync(PASTA)) {
  console.error('Informe --pasta com os arquivos descompactados da Receita Federal.')
  process.exit(1)
}

// Naturezas jurídicas de pessoa física / empresário individual (e-mail costuma ser pessoal).
const NATUREZAS_INDIVIDUAIS = new Set(['2135', '4014', '4080', '4090', '4120', '4995'])

// Sinais de e-mail de escritório de contabilidade / despachante.
const CONTADOR_RE = /(contab|contador|contadores|cont[aá]bil|escritorio|escrit[oó]rio|assessoria|tributar|fiscal|auditoria|legaliza|abertura|despachante|\bcrc\b|consultoria|dp\.|rh\.|departamento ?pessoal)/i
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/
const EMAIL_INVALIDO_RE = /(^(teste|test|naotem|nao.?tem|sem.?email|nenhum|xxx|null|email)@)|(@(email|teste|exemplo|example|xxx)\.)/i

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

const arquivos = walk(PASTA)
const pick = (re) => arquivos.filter((f) => re.test(path.basename(f).toUpperCase()) && !/\.ZIP$/i.test(f))
const ESTAB = pick(/ESTABELE/)
const EMPRE = pick(/EMPRECSV/)
const SIMPLES = pick(/SIMPLES/)
const MUNIC = pick(/MUNICCSV/)

if (!ESTAB.length || !EMPRE.length) {
  console.error('Não encontrei os arquivos de Estabelecimentos (*ESTABELE*) e Empresas (*EMPRECSV*) na pasta. Descompacte os .zip primeiro.')
  process.exit(1)
}

// Linhas no formato "campo";"campo";... em latin1.
function parseLine(line) {
  let s = line.trim()
  if (s.startsWith('"')) s = s.slice(1)
  if (s.endsWith('"')) s = s.slice(0, -1)
  return s.split('";"')
}

async function eachLine(file, onRow) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'latin1' }), crlfDelay: Infinity })
  for await (const line of rl) if (line) onRow(parseLine(line))
}

const titleCase = (v) =>
  String(v || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|\s|-|\/)([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\b(De|Da|Do|Das|Dos|E|Em)\b/g, (w) => w.toLowerCase())

const limparRazao = (v) =>
  String(v || '')
    .replace(/\b\d{11}\b/g, '')
    .replace(/\b(LTDA|LTDA\.|ME|EPP|EIRELI|S\/S|SS|S\.S\.|SOCIEDADE SIMPLES|SOCIEDADE UNIPESSOAL|SLU|LIMITADA)\b\.?/gi, '')
    .replace(/[-–]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()

const fone = (ddd, tel) => {
  const d = String(ddd || '').replace(/\D/g, '')
  const t = String(tel || '').replace(/\D/g, '')
  if (d.length < 2 || t.length < 8) return null
  return t.length === 9 ? `(${d.slice(-2)}) ${t.slice(0, 5)}-${t.slice(5)}` : `(${d.slice(-2)}) ${t.slice(0, 4)}-${t.slice(4)}`
}

const relatorio = {
  estabelecimentosLidos: 0,
  dentroDoFiltro: 0,
  excluidos: { individualMEI: 0, semEmail: 0, emailInvalido: 0, emailDeContador: 0, emailCompartilhado: 0, emailDuplicado: 0 },
  exportados: 0,
  exportadosLaboratorio: 0,
  exportadosWebmail: 0,
}

console.log(`UF: ${UFS.join(', ')} · CNAEs: ${CNAES.join(', ')} · individuais: ${INCLUIR_INDIVIDUAIS ? 'incluídos' : 'excluídos'}`)

// 1) Estabelecimentos ativos, na UF e com o CNAE
const estabs = []
for (const file of ESTAB) {
  console.log(`Lendo ${path.basename(file)}...`)
  await eachLine(file, (c) => {
    relatorio.estabelecimentosLidos += 1
    const uf = c[19]
    if (!UFS.includes(uf)) return
    if (c[5] !== '02' && c[5] !== '2') return // 02 = ATIVA
    const principal = c[11]
    const secundarias = String(c[12] || '').split(',')
    const cnaeOk = CNAES.includes(principal) || secundarias.some((s) => CNAES.includes(s))
    if (!cnaeOk) return
    estabs.push({
      basico: c[0],
      cnpj: `${c[0]}${c[1]}${c[2]}`,
      isMatriz: c[3] === '1',
      nomeFantasia: c[4],
      openedAt: c[10],
      cnaePrincipal: principal,
      segment: principal === LAB_CNAE || (!CNAES.includes(principal) && secundarias.includes(LAB_CNAE)) ? 'LABORATORIO' : 'CLINICA',
      address: [c[13], c[14], c[15], c[16]].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
      bairro: c[17],
      cep: c[18],
      uf,
      municipio: c[20],
      phone1: fone(c[21], c[22]),
      phone2: fone(c[23], c[24]),
      email: String(c[27] || '').trim().toLowerCase(),
    })
  })
}
relatorio.dentroDoFiltro = estabs.length
console.log(`${estabs.length} estabelecimentos dentro do filtro.`)

const basicos = new Set(estabs.map((e) => e.basico))

// 2) Empresas (razão social, natureza jurídica, porte)
const empresas = new Map()
for (const file of EMPRE) {
  console.log(`Lendo ${path.basename(file)}...`)
  await eachLine(file, (c) => {
    if (basicos.has(c[0])) empresas.set(c[0], { razaoSocial: c[1], natureza: c[2], porte: c[5] })
  })
}

// 3) Simples / MEI
const mei = new Set()
for (const file of SIMPLES) {
  console.log(`Lendo ${path.basename(file)}...`)
  await eachLine(file, (c) => {
    if (basicos.has(c[0]) && c[4] === 'S') mei.add(c[0])
  })
}

// 4) Municípios (código → nome)
const municipios = new Map()
for (const file of MUNIC) await eachLine(file, (c) => municipios.set(c[0], titleCase(c[1])))

// 5) E-mails usados por 3+ empresas diferentes = quase sempre contador
const usoEmail = new Map()
for (const e of estabs) {
  if (!e.email) continue
  if (!usoEmail.has(e.email)) usoEmail.set(e.email, new Set())
  usoEmail.get(e.email).add(e.basico)
}

const vistos = new Set()
const leads = []
const excluidosCsv = ['cnpj;motivo;email']

// Matriz primeiro, para o e-mail ficar com a matriz quando houver filial com o mesmo e-mail.
estabs.sort((a, b) => Number(b.isMatriz) - Number(a.isMatriz))

for (const e of estabs) {
  const emp = empresas.get(e.basico) || { razaoSocial: '', natureza: '', porte: '' }
  const individual = NATUREZAS_INDIVIDUAIS.has(emp.natureza) || mei.has(e.basico)
  const excluir = (motivo) => {
    relatorio.excluidos[motivo] += 1
    excluidosCsv.push(`${e.cnpj};${motivo};${e.email || ''}`)
  }
  if (individual && !INCLUIR_INDIVIDUAIS) { excluir('individualMEI'); continue }
  if (!e.email) { excluir('semEmail'); continue }
  if (!EMAIL_RE.test(e.email) || EMAIL_INVALIDO_RE.test(e.email)) { excluir('emailInvalido'); continue }
  if (CONTADOR_RE.test(e.email)) { excluir('emailDeContador'); continue }
  if ((usoEmail.get(e.email)?.size || 0) >= 3) { excluir('emailCompartilhado'); continue }
  if (vistos.has(e.email)) { excluir('emailDuplicado'); continue }
  vistos.add(e.email)

  const razao = titleCase(limparRazao(emp.razaoSocial)) || titleCase(e.nomeFantasia) || 'Clínica'
  const fantasia = titleCase(e.nomeFantasia)
  const webmail = /@(gmail|hotmail|outlook|live|yahoo|bol|uol|terra|ig|icloud|msn|globo|globomail)\./.test(e.email)
  leads.push({
    cnpj: e.cnpj,
    razaoSocial: emp.razaoSocial ? titleCase(emp.razaoSocial) : razao,
    nomeFantasia: fantasia || null,
    displayName: fantasia || razao,
    email: e.email,
    phone1: e.phone1,
    phone2: e.phone2,
    uf: e.uf,
    city: municipios.get(e.municipio) || null,
    bairro: titleCase(e.bairro) || null,
    cep: e.cep,
    address: titleCase(e.address) || null,
    cnaePrincipal: e.cnaePrincipal,
    segment: e.segment,
    naturezaJuridica: emp.natureza || null,
    porte: emp.porte || null,
    openedAt: e.openedAt || null,
    isMatriz: e.isMatriz,
  })
  relatorio.exportados += 1
  if (e.segment === 'LABORATORIO') relatorio.exportadosLaboratorio += 1
  if (webmail) relatorio.exportadosWebmail += 1
}

fs.writeFileSync(SAIDA, JSON.stringify({ source: `RECEITA_FEDERAL ${UFS.join('-')} ${new Date().toISOString().slice(0, 10)}`, leads }, null, 0), 'utf8')
fs.writeFileSync(SAIDA.replace(/\.json$/i, '') + '-excluidos.csv', excluidosCsv.join('\n'), 'utf8')

console.log('\nRelatório')
console.log(JSON.stringify(relatorio, null, 2))
console.log(`\nArquivo para importar no painel: ${path.resolve(SAIDA)}`)
