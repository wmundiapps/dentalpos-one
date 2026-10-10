// Carga da base empresarial a partir dos dados abertos de CNPJ da Receita Federal.
//
// Uso (na pasta revah/api, com DATABASE_URL apontando para o banco do REVAH):
//   npm run receita:import -- --ufs=PR,SP
//   npm run receita:import -- --ufs=PR --cnaes=8630,4781        (prefixos de CNAE)
//   npm run receita:import -- --all                              (Brasil inteiro: dezenas de GB no banco)
//   npm run receita:import -- --dir=C:\receita --ufs=PR          (zips já baixados manualmente)
// Roda em qualquer PC com Node 20+ (o site da Receita só aceita conexões do Brasil):
//   pacote pronto em revah/tools/receita-import (npm run receita:bundle gera o importar.cjs).
// Opções: --month=AAAA-MM (padrão: o mais recente), --url=<link do compartilhamento>,
//         --files=0,1 (só alguns Estabelecimentos), --dry-run (só conta), --keep-without-contact,
//         --sem-cache (apaga cada zip depois de ler; por padrão ficam em %LOCALAPPDATA%\RevahReceita\<mês>).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import zlib from 'node:zlib'
import { config } from '../config'
import crypto from 'node:crypto'
import { Client } from 'pg'
import { digits, normalizeEmail, normalizePhone, searchText } from '../lib/normalize'

type Args = Record<string, string | boolean>

function parseArgs(argv: string[]): Args {
  const out: Args = {}
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/)
    if (m) out[m[1]] = m[2] ?? true
  }
  return out
}

// Conexão direta com o Postgres (sem Prisma, para o script rodar sozinho fora do projeto).
let db: Client

export function pgConfig(url: string) {
  const u = new URL(url)
  for (const k of ['sslmode', 'connection_limit', 'pgbouncer', 'schema']) u.searchParams.delete(k)
  const local = ['localhost', '127.0.0.1'].includes(u.hostname)
  // O pooler do Supabase usa certificado próprio: conexão criptografada, sem validar a cadeia (mesmo padrão do Prisma).
  return { connectionString: u.toString(), ssl: local ? false : { rejectUnauthorized: false } }
}

async function sql(text: string, params: unknown[] = []) {
  const r = await db.query(text, params)
  return r.rowCount ?? 0
}

const list = (v: unknown) => (typeof v === 'string' ? v.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : [])

// ---------------------------------------------------------------------------
// Compartilhamento público do Nextcloud (arquivos.receitafederal.gov.br/index.php/s/<token>)
// ---------------------------------------------------------------------------
export function shareInfo(shareUrl: string) {
  const u = new URL(shareUrl)
  const token = u.pathname.split('/').filter(Boolean).pop() || ''
  return { origin: u.origin, token, shareUrl: `${u.origin}${u.pathname.replace(/\/$/, '')}`, auth: 'Basic ' + Buffer.from(`${token}:`).toString('base64') }
}

async function listDir(share: ReturnType<typeof shareInfo>, dir = ''): Promise<string[]> {
  const res = await fetch(`${share.origin}/public.php/webdav/${dir}`, { method: 'PROPFIND', headers: { Authorization: share.auth, Depth: '1' } })
  if (!res.ok) throw new Error(`Não foi possível listar o compartilhamento (${res.status}). Confira o link ou use --dir com os arquivos baixados.`)
  const xml = await res.text()
  return [...xml.matchAll(/<d:href>([^<]+)<\/d:href>/gi)]
    .map((m) => decodeURIComponent(m[1]).replace(/^.*\/public\.php\/webdav\/?/, '').replace(/\/$/, ''))
    .filter((p) => p && p !== dir.replace(/\/$/, ''))
    .map((p) => p.split('/').pop() as string)
}

export function latestMonth(names: string[]) {
  return names.filter((n) => /^\d{4}-\d{2}$/.test(n)).sort().pop() || null
}

async function download(share: ReturnType<typeof shareInfo>, month: string, file: string, dest: string) {
  const urls: [string, Record<string, string>][] = [
    [`${share.origin}/public.php/webdav/${month}/${encodeURIComponent(file)}`, { Authorization: share.auth }],
    [`${share.shareUrl}/download?path=${encodeURIComponent('/' + month)}&files=${encodeURIComponent(file)}`, {}],
  ]
  let last = ''
  for (const [url, headers] of urls) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, { headers })
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
        await pipeline(Readable.fromWeb(res.body as any), fs.createWriteStream(dest))
        return
      } catch (e: any) {
        last = e?.message || String(e)
        await new Promise((r) => setTimeout(r, attempt * 3000))
      }
    }
  }
  throw new Error(`Falha ao baixar ${file}: ${last}`)
}

// ---------------------------------------------------------------------------
// Leitura de zip com um único arquivo (formato dos dados abertos), sem dependências.
// ---------------------------------------------------------------------------
export async function zipLines(file: string): Promise<readline.Interface> {
  const fd = await fs.promises.open(file, 'r')
  const head = Buffer.alloc(30)
  await fd.read(head, 0, 30, 0)
  await fd.close()
  if (head.readUInt32LE(0) !== 0x04034b50) throw new Error(`${path.basename(file)} não é um zip válido.`)
  const method = head.readUInt16LE(8)
  const start = 30 + head.readUInt16LE(26) + head.readUInt16LE(28)
  const raw = fs.createReadStream(file, { start })
  let stream: NodeJS.ReadableStream = raw
  if (method === 8) {
    const inflate = zlib.createInflateRaw()
    raw.pipe(inflate)
    // Os bytes do diretório central depois do fim do deflate são ignorados.
    inflate.on('end', () => raw.destroy())
    stream = inflate
  } else if (method !== 0) throw new Error(`Compressão ${method} não suportada em ${path.basename(file)}.`)
  ;(stream as any).setEncoding('latin1')
  return readline.createInterface({ input: stream, crlfDelay: Infinity })
}

// Linhas no formato "a";"b";"c" (latin1).
export function splitRow(line: string) {
  let s = line.trim()
  if (s.startsWith('"')) s = s.slice(1)
  if (s.endsWith('"')) s = s.slice(0, -1)
  return s.split('";"').map((v) => v.trim())
}

// A Receita guarda muito celular antigo sem o 9 (DDD + 8 dígitos começando em 6–9): corrige antes de gravar.
export function fixOldMobile(national: string) {
  return national.length === 10 && '6789'.includes(national[2]) ? `${national.slice(0, 2)}9${national.slice(2)}` : national
}

function phoneOf(ddd: string, num: string) {
  const d = digits(ddd)
  const n = digits(num)
  return d && n ? normalizePhone(fixOldMobile(d + n)) : null
}

// Natureza jurídica 2135 = empresário individual (MEI).
export const isMeiNature = (code: string) => digits(code) === '2135'

// Converte uma linha de ESTABELECIMENTOS em registro (ou null se não passar nos filtros).
export function establishmentRecord(f: string[], o: { ufs: string[]; cnaes: string[]; requireContact: boolean; cities: Map<string, string>; month: string }) {
  if (f.length < 28 || f[5] !== '02') return null // 02 = ATIVA
  const uf = f[19]
  if (o.ufs.length && !o.ufs.includes(uf)) return null
  const cnae = digits(f[11]).padStart(7, '0')
  const secondary = f[12] ? f[12].split(',').map((c) => digits(c)).filter(Boolean) : []
  if (o.cnaes.length && !o.cnaes.some((p) => cnae.startsWith(p) || secondary.some((s) => s.startsWith(p)))) return null
  const phone = phoneOf(f[21], f[22])
  const phone2 = phoneOf(f[23], f[24])
  const email = normalizeEmail(f[27])
  if (o.requireContact && !phone && !phone2 && !email) return null
  const city = o.cities.get(f[20]) || null
  return {
    cnpj: `${f[0]}${f[1]}${f[2]}`,
    basico: f[0],
    tradeName: f[4] || null,
    cnae,
    cnaeSecondary: secondary.length ? secondary.join(',') : null,
    uf,
    cityCode: f[20],
    city,
    cityNorm: city ? searchText(city) : null,
    district: f[17] || null,
    zip: f[18] || null,
    address: [[f[13], f[14]].filter(Boolean).join(' '), f[15], f[16]].filter(Boolean).join(', ') || null,
    phone: phone || phone2,
    phone2: phone && phone2 && phone2 !== phone ? phone2 : null,
    email,
    openedAt: f[10] || null,
    refMonth: o.month,
  }
}

type Rec = NonNullable<ReturnType<typeof establishmentRecord>>
const COLS = ['cnpj', 'basico', 'tradeName', 'cnae', 'cnaeSecondary', 'uf', 'cityCode', 'city', 'cityNorm', 'district', 'zip', 'address', 'phone', 'phone2', 'email', 'openedAt', 'refMonth'] as const

async function upsertBatch(batch: Rec[]) {
  // Um mesmo CNPJ não pode aparecer duas vezes no mesmo INSERT ... ON CONFLICT.
  const rows = [...new Map(batch.map((r) => [r.cnpj, r])).values()]
  if (!rows.length) return
  const params: unknown[] = []
  const values = rows.map((r) => {
    const ph = COLS.map((c) => {
      params.push((r as any)[c])
      return `$${params.length}`
    })
    return `(${ph.join(',')},NOW())`
  })
  const cols = COLS.map((c) => `"${c}"`).join(',')
  const updates = COLS.filter((c) => c !== 'cnpj').map((c) => `"${c}"=EXCLUDED."${c}"`).join(',')
  await sql(`INSERT INTO "CompanyRecord" (${cols},"updatedAt") VALUES ${values.join(',')} ON CONFLICT ("cnpj") DO UPDATE SET ${updates},"updatedAt"=NOW()`, params)
}

async function updateLegalNames(rows: [string, string, string | null, boolean][]) {
  if (!rows.length) return
  const params: unknown[] = []
  const values = rows.map(([b, l, s, m]) => {
    params.push(b, l, s, m)
    return `($${params.length - 3},$${params.length - 2},$${params.length - 1},$${params.length}::boolean)`
  })
  await sql(`UPDATE "CompanyRecord" c SET "legalName"=v.l,"size"=v.s,"isMei"=v.m FROM (VALUES ${values.join(',')}) AS v(b,l,s,m) WHERE c."basico"=v.b`, params)
}

// Os zips ficam guardados por mês (a segunda carga do mês, ou a retomada depois de uma queda, não baixa de novo).
export function cacheDir(month: string) {
  const base = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'RevahReceita') : path.join(os.homedir(), '.cache', 'revah-receita')
  fs.mkdirSync(path.join(base, month), { recursive: true })
  // Apaga meses velhos.
  for (const d of fs.readdirSync(base)) if (d !== month && /^\d{4}-\d{2}$/.test(d)) fs.rmSync(path.join(base, d), { recursive: true, force: true })
  return path.join(base, month)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const ufs = list(args.ufs)
  const cnaes = list(args.cnaes).map((c) => digits(c))
  if (!ufs.length && !cnaes.length && !args.all) {
    console.error('Informe filtros (--ufs=PR,SP e/ou --cnaes=8630) ou --all para o Brasil inteiro (base muito grande).')
    process.exit(1)
  }
  const dryRun = Boolean(args['dry-run'])
  const requireContact = !args['keep-without-contact']
  const share = shareInfo(String(args.url || config.leads.cnpjDataUrl))
  const localDir = typeof args.dir === 'string' ? args.dir : null

  let month = typeof args.month === 'string' ? args.month : null
  if (!month && !localDir) month = latestMonth(await listDir(share))
  if (!month) month = new Date().toISOString().slice(0, 7)
  console.log(`Base de ${month} — filtros: UF=${ufs.join(',') || 'todas'} CNAE=${cnaes.join(',') || 'todos'}${dryRun ? ' (simulação)' : ''}`)

  const keepCache = !args['sem-cache']
  const work = localDir || (keepCache ? cacheDir(month) : fs.mkdtempSync(path.join(os.tmpdir(), 'revah-cnpj-')))
  const remote = localDir ? [] : await listDir(share, month).catch(() => [])
  const fileFor = async (name: string) => {
    const local = path.join(work, name)
    if (fs.existsSync(local)) return local
    if (localDir) throw new Error(`Arquivo ${name} não encontrado em ${localDir}.`)
    if (remote.length && !remote.includes(name)) throw new Error(`Arquivo ${name} não existe em ${month}.`)
    console.log(`Baixando ${name}...`)
    // Baixa num arquivo .part e só renomeia quando termina: um download interrompido nunca é reaproveitado.
    await download(share, month!, name, `${local}.part`)
    await fs.promises.rename(`${local}.part`, local)
    return local
  }
  const done = async (file: string) => {
    if (!localDir && !keepCache) await fs.promises.rm(file, { force: true })
  }

  if (!process.env.DATABASE_URL && !dryRun) throw new Error('Defina DATABASE_URL com o endereço do banco do REVAH.')
  db = new Client(pgConfig(process.env.DATABASE_URL || 'postgresql://localhost/revah'))
  if (!dryRun) await db.connect()
  const jobId = dryRun ? null : 'imp_' + crypto.randomBytes(10).toString('hex')
  if (jobId) await sql(`INSERT INTO "CompanyImport" ("id","refMonth","filters","status","rows","startedAt") VALUES ($1,$2,$3,'RUNNING',0,NOW())`, [jobId, month, JSON.stringify({ ufs, cnaes, requireContact })])
  try {
    // Tabelas auxiliares
    const cities = new Map<string, string>()
    const muni = await fileFor('Municipios.zip')
    for await (const line of await zipLines(muni)) {
      const f = splitRow(line)
      if (f[0]) cities.set(f[0], f[1])
    }
    await done(muni)
    const cnaeFile = await fileFor('Cnaes.zip')
    const cnaeRows: { code: string; description: string; searchNorm: string }[] = []
    for await (const line of await zipLines(cnaeFile)) {
      const f = splitRow(line)
      if (f[0]) cnaeRows.push({ code: digits(f[0]).padStart(7, '0'), description: f[1], searchNorm: searchText(f[1]) })
    }
    await done(cnaeFile)
    if (!dryRun) {
      for (let i = 0; i < cnaeRows.length; i += 500) {
        const chunk = cnaeRows.slice(i, i + 500)
        const params = chunk.flatMap((c) => [c.code, c.description, c.searchNorm])
        const values = chunk.map((_, j) => `($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3})`).join(',')
        await sql(`INSERT INTO "CnaeCode" ("code","description","searchNorm") VALUES ${values} ON CONFLICT ("code") DO UPDATE SET "description"=EXCLUDED."description","searchNorm"=EXCLUDED."searchNorm"`, params)
      }
    }
    console.log(`${cities.size} municípios, ${cnaeRows.length} CNAEs.`)

    // Estabelecimentos
    const indexes = typeof args.files === 'string' ? args.files.split(',').map(Number) : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const basicos = new Set<string>()
    let kept = 0
    for (const i of indexes) {
      const file = await fileFor(`Estabelecimentos${i}.zip`)
      let batch: Rec[] = []
      let read = 0
      for await (const line of await zipLines(file)) {
        read++
        const rec = establishmentRecord(splitRow(line), { ufs, cnaes, requireContact, cities, month })
        if (!rec) continue
        kept++
        basicos.add(rec.basico)
        if (dryRun) continue
        batch.push(rec)
        if (batch.length >= 500) {
          await upsertBatch(batch)
          batch = []
        }
      }
      if (!dryRun) await upsertBatch(batch)
      await done(file)
      console.log(`Estabelecimentos${i}: ${read.toLocaleString('pt-BR')} lidos, ${kept.toLocaleString('pt-BR')} empresas na base até agora.`)
    }

    // Empresas: razão social e porte só das empresas carregadas
    if (!dryRun && basicos.size) {
      for (let i = 0; i <= 9; i++) {
        const file = await fileFor(`Empresas${i}.zip`)
        let batch: [string, string, string | null, boolean][] = []
        for await (const line of await zipLines(file)) {
          const f = splitRow(line)
          if (!basicos.has(f[0])) continue
          batch.push([f[0], f[1], f[5] || null, isMeiNature(f[2])])
          if (batch.length >= 1000) {
            await updateLegalNames(batch)
            batch = []
          }
        }
        await updateLegalNames(batch)
        await done(file)
        console.log(`Empresas${i}: razão social atualizada.`)
      }
    }

    // Remove do escopo empresas que deixaram de estar ativas (só quando a carga foi completa)
    if (!dryRun && indexes.length === 10) {
      const where: string[] = [`"refMonth" <> $1`]
      const params: unknown[] = [month]
      if (ufs.length) {
        params.push(ufs)
        where.push(`"uf" = ANY($${params.length})`)
      }
      if (!cnaes.length) {
        const removed = await sql(`DELETE FROM "CompanyRecord" WHERE ${where.join(' AND ')}`, params)
        console.log(`${removed} empresas inativas removidas.`)
      }
    }

    if (jobId) await sql(`UPDATE "CompanyImport" SET "status"='DONE',"rows"=$2,"finishedAt"=NOW() WHERE "id"=$1`, [jobId, kept])
    console.log(`Concluído: ${kept.toLocaleString('pt-BR')} empresas ativas ${dryRun ? 'encontradas' : 'na base'}.`)
  } catch (e: any) {
    if (jobId) await sql(`UPDATE "CompanyImport" SET "status"='FAILED',"error"=$2,"finishedAt"=NOW() WHERE "id"=$1`, [jobId, String(e?.message || e).slice(0, 1000)]).catch(() => 0)
    throw e
  } finally {
    if (!localDir && !keepCache) await fs.promises.rm(work, { recursive: true, force: true })
    if (!dryRun) await db.end().catch(() => undefined)
  }
}

if (require.main === module) {
  main().catch((e) => {
    // "fetch failed" esconde o motivo real (DNS, TLS, conexão recusada): mostra a causa.
    const cause = e?.cause ? ` — causa: ${e.cause.code || ''} ${e.cause.message || e.cause}`.trimEnd() : ''
    console.error(`${e?.message || e}${cause}`)
    process.exit(1)
  })
}
