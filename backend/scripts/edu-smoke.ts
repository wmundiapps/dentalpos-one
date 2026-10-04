// Teste de fumaça do EduMaster Pro contra um Postgres real (schema já aplicado).
// Uso: DATABASE_URL=... JWT_SECRET=x npx tsx scripts/edu-smoke.ts
// 1) cria instituição/usuário ADMIN de teste, 2) roda POST /bootstrap de cada módulo,
// 3) chama todas as rotas GET sem parâmetro e as com :param (id inexistente) e acusa respostas 5xx.
import jwt from 'jsonwebtoken'
import http from 'http'
import { prisma } from '../src/lib/prisma'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'smoke-secret'
process.env.NODE_ENV = 'test'

function splitPath(thing: any): string {
  if (typeof thing === 'string') return thing
  if (thing.fast_slash) return ''
  const m = thing.toString().replace('\\/?', '').replace('(?=\\/|$)', '$').match(/^\/\^((?:\\[.*+?^${}()|[\]\\\/]|[^.*+?^${}()|[\]\\\/])*)\$\//)
  return m ? m[1].replace(/\\(.)/g, '$1') : '<?>'
}
function walk(stack: any[], prefix: string, out: Array<{ method: string; path: string }>) {
  for (const l of stack) {
    if (l.route) {
      for (const m of Object.keys(l.route.methods)) out.push({ method: m.toUpperCase(), path: prefix + l.route.path })
    } else if (l.name === 'router' && l.handle?.stack) {
      walk(l.handle.stack, prefix + splitPath(l.regexp), out)
    }
  }
}

async function main() {
  const { default: app } = await import('../src/app')
  const tenantId = 'smoke-tenant'
  let clinic = await prisma.clinic.findFirst({ where: { tenantId } })
  if (!clinic) clinic = await prisma.clinic.create({ data: { tenantId, name: 'Instituto Smoke', email: 's@s.com', phone: '1', cnpj: '00.000.000/0001-00' } })
  let user = await prisma.user.findFirst({ where: { clinicId: clinic.id, email: 'admin@smoke.com' } })
  if (!user) user = await prisma.user.create({ data: { clinicId: clinic.id, tenantId, email: 'admin@smoke.com', password: 'x', firstName: 'Admin', lastName: 'Smoke', role: 'ADMIN' } })
  const token = jwt.sign({ id: user.id, email: user.email, clinicId: clinic.id, tenantId, role: 'ADMIN' }, process.env.JWT_SECRET!)

  const server = http.createServer(app).listen(0)
  const port = (server.address() as any).port
  const base = `http://127.0.0.1:${port}/api`
  const call = async (method: string, path: string, body?: any) => {
    const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const text = await r.text()
    return { status: r.status, text }
  }

  const mods = ['admissoes', 'secretaria', 'calendario', 'notas', 'infraestrutura', 'suprimentos', 'regulatorio', 'governanca', 'desempenho', 'pesquisa', 'apoio', 'comunicacao', 'biblioteca', 'jornadas', 'modalidades', 'reitoria']
  const fails: string[] = []
  for (const m of mods) {
    const r = await call('POST', `/edu/${m}/bootstrap`, {})
    console.log(`bootstrap ${m}: ${r.status}`)
    if (r.status >= 500) fails.push(`POST /edu/${m}/bootstrap -> ${r.status} ${r.text.slice(0, 200)}`)
  }
  const r2 = await call('POST', `/edu/jornadas/bootstrap`, {})
  console.log('bootstrap jornadas (2a vez, idempotência):', r2.status)

  const routes: Array<{ method: string; path: string }> = []
  walk((app as any)._router.stack, '', routes)
  const gets = routes.filter((r) => r.method === 'GET' && r.path.startsWith('/api/edu'))
  console.log(`rotas GET autenticadas EduMaster: ${gets.length}`)
  let ok = 0
  for (const g of gets) {
    const path = g.path.replace(/^\/api/, '').replace(/:[A-Za-z]+/g, '00000000-0000-0000-0000-000000000000')
    try {
      const r = await call('GET', path)
      if (r.status >= 500) fails.push(`GET ${path} -> ${r.status} ${r.text.slice(0, 220)}`)
      else ok++
    } catch (e: any) {
      fails.push(`GET ${path} -> EXC ${e.message}`)
    }
  }
  console.log(`GET ok (<500): ${ok}/${gets.length}`)
  const cron = await fetch(`http://127.0.0.1:${port}/api/cron/edu`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } })
  console.log('cron/edu:', cron.status, (await cron.text()).slice(0, 1500))
  console.log(fails.length ? `\nFALHAS (${fails.length}):\n` + fails.join('\n') : '\nSem respostas 5xx.')
  server.close()
  await prisma.$disconnect()
  process.exit(fails.length ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })
