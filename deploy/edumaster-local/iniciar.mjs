// Sobe o EduMaster Pro inteiro na sua máquina: banco Postgres embutido (isolado), backend, seed e frontend.
// Nada aqui toca em Supabase nem em produção.
import EmbeddedPostgres from 'embedded-postgres'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '..', '..')
const backend = join(raiz, 'backend')
const frontend = join(raiz, 'frontend')
const dados = join(aqui, '.dados')
const PG_PORT = 54329
const API_PORT = 3100
const WEB_PORT = 5173
const win = process.platform === 'win32'
const npx = win ? 'npx.cmd' : 'npx'
const npm = win ? 'npm.cmd' : 'npm'

mkdirSync(dados, { recursive: true })
const segredosPath = join(dados, 'segredos.json')
const segredos = existsSync(segredosPath)
  ? JSON.parse(readFileSync(segredosPath, 'utf8'))
  : { jwt: randomBytes(32).toString('hex'), enc: randomBytes(32).toString('hex'), master: randomBytes(32).toString('hex') }
writeFileSync(segredosPath, JSON.stringify(segredos))

const URL_EXTERNA = process.env.EDU_DATABASE_URL || ''
const pg = URL_EXTERNA ? { stop: async () => {} } : new EmbeddedPostgres({
  databaseDir: join(dados, 'pg'),
  user: 'edumaster',
  password: 'edumaster-local',
  port: PG_PORT,
  persistent: true,
  onLog: () => {},
  onError: () => {},
})
const primeira = URL_EXTERNA ? !existsSync(join(dados, 'seed-ok')) : !existsSync(join(dados, 'pg', 'PG_VERSION'))
if (!URL_EXTERNA) {
  if (primeira) await pg.initialise()
  await pg.start()
  if (primeira) await pg.createDatabase('edumaster')
}
console.log('Banco local pronto.')

const env = {
  ...process.env,
  NODE_ENV: 'development',
  APP_ENV: 'development',
  PORT: String(API_PORT),
  DATABASE_URL: URL_EXTERNA || `postgresql://edumaster:edumaster-local@localhost:${PG_PORT}/edumaster?schema=public`,
  JWT_SECRET: segredos.jwt,
  SECURITY_ENC_KEY: segredos.enc,
  TENANT_SECRET_MASTER_KEY: segredos.master,
  CORS_ORIGIN: `http://localhost:${WEB_PORT}`,
  ALLOWED_ORIGINS: `http://localhost:${WEB_PORT}`,
  PUBLIC_APP_URL: `http://localhost:${WEB_PORT}`,
  SECURITY_TOTP_ISSUER: 'EduMaster Pro (teste)',
  API_URL: `http://localhost:${API_PORT}/api`,
}
const roda = (cmd, args, cwd, extra = {}) => spawnSync(cmd, args, { cwd, env: { ...env, ...extra }, stdio: 'inherit', shell: win })

if (!existsSync(join(backend, 'node_modules'))) { console.log('Instalando backend...'); roda(npm, ['install'], backend) }
if (!existsSync(join(frontend, 'node_modules'))) { console.log('Instalando frontend...'); roda(npm, ['install'], frontend) }

console.log('Criando tabelas...')
const push = roda(npx, ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'], backend)
if (push.status !== 0) { console.error('Falha ao criar tabelas.'); await pg.stop(); process.exit(1) }
roda(npx, ['prisma', 'generate'], backend)

const filhos = []
const sobe = (cmd, args, cwd, extra = {}) => {
  const p = spawn(cmd, args, { cwd, env: { ...env, ...extra }, stdio: 'inherit', shell: win })
  filhos.push(p)
  return p
}
sobe(npx, ['tsx', 'src/server.ts'], backend)

const espera = async () => {
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(`http://localhost:${API_PORT}/api/health`); if (r.status < 500) return true } catch {}
    try { const r = await fetch(`http://localhost:${API_PORT}/`); if (r.status < 500) return true } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}
if (!(await espera())) console.error('O backend demorou para subir; veja as mensagens acima.')

if (primeira) {
  console.log('Carregando dados de demonstração...')
  roda(npx, ['tsx', 'scripts/edu-demo-seed.ts'], backend)
  writeFileSync(join(dados, 'seed-ok'), '1')
}
sobe(npx, ['vite', '--port', String(WEB_PORT), '--strictPort'], frontend, { VITE_API_URL: `http://localhost:${API_PORT}/api` })

console.log(`\nPRONTO. Abra: http://localhost:${WEB_PORT}\nLogin: admin@ravel.edu.br  |  Senha: Ravel@2026  (aluno: aluno@ravel.edu.br / Aluno@2026)\nPara parar: Ctrl+C\n`)
const parar = async () => { for (const p of filhos) try { p.kill() } catch {} ; try { await pg.stop() } catch {} ; process.exit(0) }
process.on('SIGINT', parar); process.on('SIGTERM', parar)
