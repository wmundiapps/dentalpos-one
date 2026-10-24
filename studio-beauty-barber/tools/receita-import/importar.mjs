// Carga da base de empresas (dados abertos de CNPJ da Receita Federal) para a captação do Studio Beauty Barber.
// Portado do REVAH Leads. Roda em qualquer PC com Node 22 (o site da Receita só aceita conexões do Brasil).
//
// Uso (na pasta studio-beauty-barber, com DATABASE_URL apontando para o banco do app):
//   node tools/receita-import/importar.mjs --ufs=PR,SP                       (salões e barbearias dos estados)
//   node tools/receita-import/importar.mjs --ufs=PR --cnaes=9602501,4772500
//   node tools/receita-import/importar.mjs --dir=C:\receita --ufs=PR          (zips já baixados)
//   node tools/receita-import/importar.mjs --ufs=PR --dry-run                 (só conta, não grava)
// Opções: --month=AAAA-MM  --url=<link do compartilhamento>  --files=0,1  --keep-without-contact
// Os zips ficam em ~/.cache/studio-beauty-barber-receita/<mês> (use --sem-cache para apagar depois de ler).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : []);
const digits = (v) => String(v ?? '').replace(/\D/g, '');
const searchText = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const normEmail = (v) => { const s = String(v ?? '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : null; };
const SHARE = (process.env.RECEITA_CNPJ_URL || 'https://arquivos.receitafederal.gov.br/index.php/s/YggdBLfdninEJX9').replace(/\/$/, '');

function normPhone(raw) {
  let d = digits(raw); if (!d) return null;
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (!d.startsWith('55') || (d.length !== 12 && d.length !== 13)) return null;
  return Number(d.slice(2, 4)) >= 11 ? d : null;
}
// A Receita guarda muito celular antigo sem o 9 (DDD + 8 dígitos começando em 6–9).
const fixOldMobile = (n) => (n.length === 10 && '6789'.includes(n[2]) ? `${n.slice(0, 2)}9${n.slice(2)}` : n);
const phoneOf = (ddd, num) => { const d = digits(ddd), n = digits(num); return d && n ? normPhone(fixOldMobile(d + n)) : null; };
const splitRow = (line) => { let s = line.trim(); if (s.startsWith('"')) s = s.slice(1); if (s.endsWith('"')) s = s.slice(0, -1); return s.split('";"').map((v) => v.trim()); };

async function zipLines(file) {
  const fd = await fs.promises.open(file, 'r'); const head = Buffer.alloc(30); await fd.read(head, 0, 30, 0); await fd.close();
  if (head.readUInt32LE(0) !== 0x04034b50) throw new Error(`${path.basename(file)} não é um zip válido.`);
  const method = head.readUInt16LE(8), start = 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
  const raw = fs.createReadStream(file, { start }); let stream = raw;
  if (method === 8) { const inflate = zlib.createInflateRaw(); raw.pipe(inflate); inflate.on('end', () => raw.destroy()); stream = inflate; }
  else if (method !== 0) throw new Error(`Compressão ${method} não suportada.`);
  stream.setEncoding('latin1');
  return readline.createInterface({ input: stream, crlfDelay: Infinity });
}

const shareAuth = 'Basic ' + Buffer.from(`${SHARE.split('/').pop()}:`).toString('base64');
const origin = new URL(SHARE).origin;
async function listDir(dir = '') {
  const res = await fetch(`${origin}/public.php/webdav/${dir}`, { method: 'PROPFIND', headers: { Authorization: shareAuth, Depth: '1' } });
  if (!res.ok) throw new Error(`Não foi possível listar o compartilhamento da Receita (${res.status}). Use --dir com os arquivos baixados.`);
  const xml = await res.text();
  return [...xml.matchAll(/<d:href>([^<]+)<\/d:href>/gi)].map((m) => decodeURIComponent(m[1]).replace(/\/$/, '').split('/').pop()).filter(Boolean);
}
async function download(month, file, dest) {
  let last = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${origin}/public.php/webdav/${month}/${encodeURIComponent(file)}`, { headers: { Authorization: shareAuth } });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest)); return;
    } catch (e) { last = e.message; await new Promise((r) => setTimeout(r, attempt * 3000)); }
  }
  throw new Error(`Falha ao baixar ${file}: ${last}`);
}

const ufs = list(args.ufs);
const cnaes = (list(args.cnaes).length ? list(args.cnaes) : ['9602501', '9602502', '4772500']).map(digits);
const dryRun = Boolean(args['dry-run']);
const requireContact = !args['keep-without-contact'];
const localDir = typeof args.dir === 'string' ? args.dir : null;

const { default: pg } = await import('pg');
const url = process.env.DATABASE_URL;
if (!url && !dryRun) { console.error('Defina DATABASE_URL com o endereço do banco do app.'); process.exit(1); }
const db = url ? new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } }) : null;
if (db && !dryRun) await db.connect();

let month = typeof args.month === 'string' ? args.month : null;
if (!month && !localDir) month = (await listDir()).filter((n) => /^\d{4}-\d{2}$/.test(n)).sort().pop();
month ||= new Date().toISOString().slice(0, 7);
console.log(`Base de ${month} — UF=${ufs.join(',') || 'todas'} CNAE=${cnaes.join(',')}${dryRun ? ' (simulação)' : ''}`);

const cache = path.join(os.homedir(), '.cache', 'studio-beauty-barber-receita', month);
const work = localDir || cache; fs.mkdirSync(work, { recursive: true });
const fileFor = async (name) => {
  const local = path.join(work, name);
  if (fs.existsSync(local)) return local;
  if (localDir) throw new Error(`Arquivo ${name} não encontrado em ${localDir}.`);
  console.log(`Baixando ${name}...`);
  await download(month, name, `${local}.part`); await fs.promises.rename(`${local}.part`, local); return local;
};
const done = async (f) => { if (!localDir && args['sem-cache']) await fs.promises.rm(f, { force: true }); };

const jobId = crypto.randomUUID();
if (db && !dryRun) await db.query("INSERT INTO company_imports (id, ref_month, status, total_rows) VALUES ($1,$2,'RUNNING',0)", [jobId, month]);
try {
  const cities = new Map();
  const muni = await fileFor('Municipios.zip');
  for await (const line of await zipLines(muni)) { const f = splitRow(line); if (f[0]) cities.set(f[0], f[1]); }
  await done(muni);

  const COLS = ['cnpj', 'trade_name', 'cnae', 'uf', 'city', 'city_norm', 'district', 'address', 'phone', 'email', 'opened_at'];
  const upsert = async (rows) => {
    rows = [...new Map(rows.map((r) => [r.cnpj, r])).values()]; if (!rows.length) return;
    const params = []; const values = rows.map((r) => `(${COLS.map((c) => { params.push(r[c]); return `$${params.length}`; }).join(',')})`);
    await db.query(`INSERT INTO company_base (${COLS.join(',')}) VALUES ${values.join(',')} ON CONFLICT (cnpj) DO UPDATE SET ${COLS.slice(1).map((c) => `${c}=EXCLUDED.${c}`).join(',')}`, params);
  };

  const indexes = typeof args.files === 'string' ? args.files.split(',').map(Number) : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const basicos = new Set(); let kept = 0;
  for (const i of indexes) {
    const file = await fileFor(`Estabelecimentos${i}.zip`);
    let batch = [], read = 0;
    for await (const line of await zipLines(file)) {
      read++;
      const f = splitRow(line);
      if (f.length < 28 || f[5] !== '02') continue;                         // 02 = ativa
      if (ufs.length && !ufs.includes(f[19])) continue;
      const cnae = digits(f[11]).padStart(7, '0');
      if (!cnaes.some((p) => cnae.startsWith(p))) continue;
      const phone = phoneOf(f[21], f[22]) || phoneOf(f[23], f[24]); const email = normEmail(f[27]);
      if (requireContact && !phone && !email) continue;
      const city = cities.get(f[20]) || null;
      kept++; basicos.add(f[0]);
      if (dryRun) continue;
      batch.push({ cnpj: `${f[0]}${f[1]}${f[2]}`, trade_name: f[4] || null, cnae, uf: f[19], city, city_norm: city ? searchText(city) : null, district: f[17] || null,
        address: [[f[13], f[14]].filter(Boolean).join(' '), f[15], f[16]].filter(Boolean).join(', ') || null, phone, email, opened_at: f[10] || null });
      if (batch.length >= 500) { await upsert(batch); batch = []; }
    }
    if (!dryRun) await upsert(batch);
    await done(file);
    console.log(`Estabelecimentos${i}: ${read.toLocaleString('pt-BR')} lidos, ${kept.toLocaleString('pt-BR')} empresas até agora.`);
  }

  if (!dryRun && basicos.size) {                                              // razão social e MEI (natureza jurídica 2135) só das empresas carregadas
    for (let i = 0; i <= 9; i++) {
      const file = await fileFor(`Empresas${i}.zip`); let batch = [];
      const flush = async () => { if (!batch.length) return; const p = []; const v = batch.map(([b, l, m]) => { p.push(b, l, m); return `($${p.length - 2},$${p.length - 1},$${p.length}::boolean)`; });
        await db.query(`UPDATE company_base c SET legal_name = v.l, is_mei = (CASE WHEN v.m THEN 1 ELSE 0 END) FROM (VALUES ${v.join(',')}) AS v(b,l,m) WHERE substr(c.cnpj,1,8) = v.b`, p); batch = []; };
      for await (const line of await zipLines(file)) { const f = splitRow(line); if (!basicos.has(f[0])) continue; batch.push([f[0], f[1], digits(f[2]) === '2135']); if (batch.length >= 1000) await flush(); }
      await flush(); await done(file); console.log(`Empresas${i}: razão social atualizada.`);
    }
  }
  if (db && !dryRun) await db.query("UPDATE company_imports SET status = 'DONE', total_rows = $2, finished_at = $3 WHERE id = $1", [jobId, kept, new Date().toISOString()]);
  console.log(`Concluído: ${kept.toLocaleString('pt-BR')} empresas ativas ${dryRun ? 'encontradas' : 'na base'}.`);
} catch (e) {
  if (db && !dryRun) await db.query("UPDATE company_imports SET status = 'FAILED', finished_at = $2 WHERE id = $1", [jobId, new Date().toISOString()]).catch(() => 0);
  console.error(e.message + (e.cause ? ` — causa: ${e.cause.code || ''} ${e.cause.message || ''}` : '')); process.exitCode = 1;
} finally { if (db && !dryRun) await db.end().catch(() => {}); }
