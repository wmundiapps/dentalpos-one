import { spawn, spawnSync } from 'child_process'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import fs from 'fs'
import path from 'path'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { prisma } from '../lib/prisma'

/**
 * Backup real do PostgreSQL: pg_dump (formato custom) -> criptografia AES-256 -> armazenamento privado (S3 compatível ou pasta local).
 * O teste de restauração baixa a cópia mais recente, confere o SHA-256, restaura num banco temporário e compara as contagens de linhas.
 * Os requisitos "backup habilitado" e "restauração testada" do preflight passam a depender destas execuções reais.
 */

const DAY = 86_400_000
const PREFIX = 'backups/'
const KEEP = Number(process.env.BACKUP_RETENTION_COUNT || 30)
const LIB_PQ_IGNORED = ['schema', 'connection_limit', 'pool_timeout', 'pgbouncer', 'statement_cache_size', 'sslaccept']

// ---------- estado usado pelo preflight (config/runtime.ts) ----------
export const backupState: { lastBackupOkAt: Date | null; lastRestoreOkAt: Date | null } = { lastBackupOkAt: null, lastRestoreOkAt: null }

export async function loadBackupState() {
  try {
    const [b, r] = await Promise.all([
      prisma.platformBackupRun.findFirst({ where: { kind: 'BACKUP', status: 'OK' }, orderBy: { startedAt: 'desc' } }),
      prisma.platformBackupRun.findFirst({ where: { kind: 'RESTORE_TEST', status: 'OK' }, orderBy: { startedAt: 'desc' } }),
    ])
    backupState.lastBackupOkAt = b?.finishedAt ?? null
    backupState.lastRestoreOkAt = r?.finishedAt ?? null
  } catch {
    /* tabela ainda não existe (primeira inicialização): o estado fica vazio */
  }
}

// ---------- configuração ----------
function encryptionKey(): Buffer {
  const raw = String(process.env.BACKUP_ENCRYPTION_KEY || '')
  if (raw.length < 32) throw new Error('BACKUP_ENCRYPTION_KEY ausente ou curta (mínimo 32 caracteres).')
  return createHash('sha256').update(raw).digest()
}

export function backupConfigured() {
  const hasStore = Boolean(process.env.BACKUP_S3_BUCKET || process.env.BACKUP_LOCAL_DIR)
  return hasStore && String(process.env.BACKUP_ENCRYPTION_KEY || '').length >= 32 && Boolean(process.env.DATABASE_URL)
}

function libpqUrl(dbName?: string) {
  const u = new URL(String(process.env.DATABASE_URL))
  for (const k of LIB_PQ_IGNORED) u.searchParams.delete(k)
  if (dbName) u.pathname = `/${dbName}`
  return u.toString()
}

function pgBin(name: string) {
  // usa o cliente mais novo instalado (pg_dump precisa ter versão >= a do servidor)
  for (const v of [19, 18, 17]) {
    const p = `/usr/lib/postgresql/${v}/bin/${name}`
    if (fs.existsSync(p)) return p
  }
  return name
}

function run(cmd: string, args: string[], input?: string) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024 })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} falhou: ${String(r.stderr || '').trim().slice(-400)}`)
  return String(r.stdout || '')
}

// ---------- armazenamento ----------
interface Store {
  put(key: string, body: Readable): Promise<void>
  get(key: string): Promise<Readable>
  del(key: string): Promise<void>
  list(): Promise<string[]>
}

function s3Store(): Store {
  const bucket = String(process.env.BACKUP_S3_BUCKET)
  const client = new S3Client({
    region: process.env.BACKUP_S3_REGION || 'auto',
    endpoint: process.env.BACKUP_S3_ENDPOINT || undefined,
    forcePathStyle: process.env.BACKUP_S3_PATH_STYLE === 'true',
    credentials: { accessKeyId: String(process.env.BACKUP_S3_ACCESS_KEY_ID), secretAccessKey: String(process.env.BACKUP_S3_SECRET_ACCESS_KEY) },
  })
  return {
    async put(key, body) { await new Upload({ client, params: { Bucket: bucket, Key: key, Body: body }, queueSize: 3, partSize: 16 * 1024 * 1024 }).done() },
    async get(key) { const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key })); return r.Body as Readable },
    async del(key) { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })) },
    async list() {
      const keys: string[] = []
      let token: string | undefined
      do {
        const r = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX, ContinuationToken: token }))
        for (const o of r.Contents ?? []) if (o.Key) keys.push(o.Key)
        token = r.IsTruncated ? r.NextContinuationToken : undefined
      } while (token)
      return keys
    },
  }
}

function localStore(dir: string): Store {
  const file = (key: string) => path.join(dir, key)
  return {
    async put(key, body) { fs.mkdirSync(path.dirname(file(key)), { recursive: true }); await pipeline(body, fs.createWriteStream(file(key))) },
    async get(key) { return fs.createReadStream(file(key)) },
    async del(key) { fs.rmSync(file(key), { force: true }) },
    async list() {
      const out: string[] = []
      const walk = (d: string) => { for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : out.push(path.relative(dir, p)) } }
      walk(path.join(dir, PREFIX))
      return out
    },
  }
}

function store(): Store {
  return process.env.BACKUP_S3_BUCKET ? s3Store() : localStore(String(process.env.BACKUP_LOCAL_DIR))
}

// ---------- utilidades de stream ----------
class Meter extends Transform {
  bytes = 0
  hash = createHash('sha256')
  _transform(chunk: Buffer, _enc: BufferEncoding, cb: (e?: Error | null, d?: Buffer) => void) { this.bytes += chunk.length; this.hash.update(chunk); cb(null, chunk) }
}

/** Remove o IV (16 primeiros bytes) e decifra o restante. */
class Decrypt extends Transform {
  private head = Buffer.alloc(0)
  private decipher: ReturnType<typeof createDecipheriv> | null = null
  constructor(private key: Buffer) { super() }
  _transform(chunk: Buffer, _enc: BufferEncoding, cb: (e?: Error | null) => void) {
    try {
      if (!this.decipher) {
        this.head = Buffer.concat([this.head, chunk])
        if (this.head.length < 16) return cb()
        this.decipher = createDecipheriv('aes-256-cbc', this.key, this.head.subarray(0, 16))
        const rest = this.head.subarray(16); this.head = Buffer.alloc(0)
        if (rest.length) this.push(this.decipher.update(rest))
        return cb()
      }
      this.push(this.decipher.update(chunk)); cb()
    } catch (e: any) { cb(e) }
  }
  _flush(cb: (e?: Error | null) => void) { try { if (!this.decipher) throw new Error('arquivo de backup vazio'); this.push(this.decipher.final()); cb() } catch (e: any) { cb(e) } }
}

// ---------- contagens para conferir a restauração ----------
const q = (table: string) => `"${table.replace(/"/g, '""')}"`
function topTables(url: string): string[] {
  const out = run(pgBin('psql'), [url, '-At', '-c', `select relname from pg_stat_user_tables order by n_live_tup desc, relname limit 12`])
  return out.split('\n').map(s => s.trim()).filter(Boolean)
}
function countRows(url: string, tables: string[]): Record<string, number> {
  const res: Record<string, number> = {}
  for (const t of tables) res[t] = Number(run(pgBin('psql'), [url, '-At', '-c', `select count(*) from ${q(t)}`]).trim())
  return res
}
function tableCount(url: string): number {
  return Number(run(pgBin('psql'), [url, '-At', '-c', `select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`]).trim())
}

// ---------- backup ----------
export async function runBackup(): Promise<{ id: string; objectKey: string; bytes: number }> {
  if (!backupConfigured()) throw new Error('Backup não configurado (BACKUP_S3_* ou BACKUP_LOCAL_DIR, BACKUP_ENCRYPTION_KEY, DATABASE_URL).')
  const stale = new Date(Date.now() - 3 * 3_600_000)
  const busy = await prisma.platformBackupRun.findFirst({ where: { kind: 'BACKUP', status: 'RUNNING', startedAt: { gt: stale } } })
  if (busy) throw new Error('Já existe um backup em andamento.')
  const run0 = await prisma.platformBackupRun.create({ data: { kind: 'BACKUP', status: 'RUNNING' } })
  const t0 = Date.now()
  const key = `${PREFIX}${new Date().toISOString().slice(0, 10)}/edumaster-${new Date().toISOString().replace(/[:.]/g, '-')}.dump.enc`
  const st = store()
  try {
    const url = libpqUrl()
    const tables = topTables(url)
    const counts = countRows(url, tables)
    const tablesTotal = tableCount(url)
    const iv = randomBytes(16)
    const cipher = createCipheriv('aes-256-cbc', encryptionKey(), iv)
    const meter = new Meter()
    meter.hash.update(iv); meter.bytes += 16
    const dump = spawn(pgBin('pg_dump'), ['--format=custom', '--no-owner', '--no-privileges', `--dbname=${url}`], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    dump.stderr.on('data', d => { stderr = (stderr + d).slice(-600) })
    const exit = new Promise<number>(resolve => dump.on('close', c => resolve(c ?? -1)))
    const encrypted = dump.stdout.pipe(cipher).pipe(meter)
    const body = Readable.from((async function* () { yield iv; for await (const c of encrypted) yield c })())
    const [code] = await Promise.all([exit, st.put(key, body)])
    if (code !== 0) { await st.del(key).catch(() => undefined); throw new Error(`pg_dump terminou com código ${code}: ${stderr.trim()}`) }
    const sha = meter.hash.digest('hex')
    await prisma.platformBackupRun.update({ where: { id: run0.id }, data: { status: 'OK', objectKey: key, bytes: BigInt(meter.bytes), sha256: sha, durationMs: Date.now() - t0, finishedAt: new Date(), detail: { counts, tablesTotal, pgDump: run(pgBin('pg_dump'), ['--version']).trim() } } })
    backupState.lastBackupOkAt = new Date()
    // retenção: mantém as cópias mais recentes
    const all = (await st.list()).filter(k => k.endsWith('.dump.enc')).sort().reverse()
    for (const old of all.slice(KEEP)) await st.del(old).catch(() => undefined)
    console.log(`[backup] OK ${key} (${meter.bytes} bytes, ${Date.now() - t0} ms)`)
    return { id: run0.id, objectKey: key, bytes: meter.bytes }
  } catch (e: any) {
    await prisma.platformBackupRun.update({ where: { id: run0.id }, data: { status: 'FAILED', durationMs: Date.now() - t0, finishedAt: new Date(), detail: { error: String(e?.message || e).slice(0, 800) } } }).catch(() => undefined)
    console.error('[backup] FALHOU:', e?.message || e)
    throw e
  }
}

// ---------- teste de restauração ----------
export async function runRestoreTest(): Promise<{ id: string; ok: boolean; detail: unknown }> {
  const last = await prisma.platformBackupRun.findFirst({ where: { kind: 'BACKUP', status: 'OK' }, orderBy: { startedAt: 'desc' } })
  if (!last?.objectKey || !last.sha256) throw new Error('Não há backup concluído para testar.')
  const run0 = await prisma.platformBackupRun.create({ data: { kind: 'RESTORE_TEST', status: 'RUNNING', objectKey: last.objectKey } })
  const t0 = Date.now()
  const scratch = `restore_test_${Date.now()}`
  const adminUrl = libpqUrl('postgres')
  const scratchUrl = libpqUrl(scratch)
  let created = false
  try {
    run(pgBin('psql'), [adminUrl, '-v', 'ON_ERROR_STOP=1', '-c', `create database ${scratch}`]); created = true
    const src = await store().get(last.objectKey)
    const meter = new Meter()
    const restore = spawn(pgBin('pg_restore'), ['--no-owner', '--no-privileges', `--dbname=${scratchUrl}`], { stdio: ['pipe', 'ignore', 'pipe'] })
    let stderr = ''
    restore.stderr.on('data', d => { stderr = (stderr + d).slice(-600) })
    const exit = new Promise<number>(resolve => restore.on('close', c => resolve(c ?? -1)))
    await pipeline(src, meter, new Decrypt(encryptionKey()), restore.stdin)
    const code = await exit
    const sha = meter.hash.digest('hex')
    if (sha !== last.sha256) throw new Error('SHA-256 da cópia não confere com o registrado (arquivo alterado ou corrompido).')
    if (code !== 0) throw new Error(`pg_restore terminou com código ${code}: ${stderr.trim()}`)
    const rec = ((last.detail as any)?.counts ?? {}) as Record<string, number>
    const tables = Object.keys(rec)
    const got = countRows(scratchUrl, tables)
    const tablesTotalRec = Number((last.detail as any)?.tablesTotal ?? 0)
    const tablesTotalGot = tableCount(scratchUrl)
    const diffs = tables.filter(t => got[t] < Math.floor(rec[t] * 0.99))
    const ok = diffs.length === 0 && tablesTotalGot >= tablesTotalRec
    const detail = { tablesChecked: tables.length, tablesTotalRec, tablesTotalGot, diffs, restored: got, recorded: rec }
    await prisma.platformBackupRun.update({ where: { id: run0.id }, data: { status: ok ? 'OK' : 'FAILED', sha256: sha, durationMs: Date.now() - t0, finishedAt: new Date(), detail } })
    if (ok) backupState.lastRestoreOkAt = new Date()
    console.log(`[restore-test] ${ok ? 'OK' : 'FALHOU'} (${tables.length} tabelas conferidas, ${Date.now() - t0} ms)`)
    if (!ok) throw new Error(`Restauração divergente: ${JSON.stringify({ diffs, tablesTotalRec, tablesTotalGot })}`)
    return { id: run0.id, ok, detail }
  } catch (e: any) {
    await prisma.platformBackupRun.update({ where: { id: run0.id }, data: { status: 'FAILED', durationMs: Date.now() - t0, finishedAt: new Date(), detail: { error: String(e?.message || e).slice(0, 800) } } }).catch(() => undefined)
    console.error('[restore-test] FALHOU:', e?.message || e)
    throw e
  } finally {
    if (created) { try { run(pgBin('psql'), [adminUrl, '-c', `drop database if exists ${scratch}`]) } catch { /* limpeza best-effort */ } }
  }
}

// ---------- agendamento ----------
export function startBackupScheduler() {
  if (!backupConfigured() || process.env.BACKUP_SCHEDULER === 'off') return undefined
  let busy = false
  const tick = async () => {
    if (busy) return
    busy = true
    try {
      await loadBackupState()
      if (!backupState.lastBackupOkAt || Date.now() - backupState.lastBackupOkAt.getTime() > DAY) await runBackup()
      if (backupState.lastBackupOkAt && (!backupState.lastRestoreOkAt || Date.now() - backupState.lastRestoreOkAt.getTime() > 7 * DAY)) await runRestoreTest()
    } catch (e: any) {
      console.error('[backup] ciclo falhou:', e?.message || e)
    } finally { busy = false }
  }
  setTimeout(() => void tick(), 90_000).unref()
  const timer = setInterval(() => void tick(), 30 * 60_000)
  timer.unref()
  return timer
}
