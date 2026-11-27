// Varredura de RBAC/robustez: todas as rotas GET (com ids inexistentes) e POST/PUT/PATCH com corpo vazio/lixo,
// chamadas por cada papel nos módulos pesquisa/apoio/comunicacao/modalidades; qualquer 5xx é falha.
import { setup, check, summary, prisma, fails } from './qa5-lib'
function splitPath(thing: any): string {
  if (typeof thing === 'string') return thing
  if (thing.fast_slash) return ''
  const m = thing.toString().replace('\\/?', '').replace('(?=\\/|$)', '$').match(/^\/\^((?:\\[.*+?^${}()|[\]\\\/]|[^.*+?^${}()|[\]\\\/])*)\$\//)
  return m ? m[1].replace(/\\(.)/g, '$1') : '<?>'
}
function walk(stack: any[], prefix: string, out: Array<{ method: string; path: string }>) {
  for (const l of stack) {
    if (l.route) for (const m of Object.keys(l.route.methods)) out.push({ method: m.toUpperCase(), path: prefix + l.route.path })
    else if (l.name === 'router' && l.handle?.stack) walk(l.handle.stack, prefix + splitPath(l.regexp), out)
  }
}
async function main() {
  const { app, call, t1, close } = await setup()
  const roles = ['STUDENT', 'TEACHER', 'FINANCE', 'SECRETARY', 'SUPPORT', 'COORDINATOR', 'MARKETING', 'ADMIN']
  const actors = [] as any[]
  for (const r of roles) actors.push(await t1.mk(r, r === 'STUDENT'))
  const routes: Array<{ method: string; path: string }> = []
  walk((app as any)._router.stack, '', routes)
  const mine = routes.filter((r) => /^\/api\/(edu\/(pesquisa|apoio|comunicacao|modalidades)|public\/edu\/(pesquisa|apoio|comunicacao|modalidades))/.test(r.path))
  console.log('rotas:', mine.length)
  const Z = '00000000-0000-0000-0000-000000000000'
  let n = 0
  for (const rt of mine) {
    const path = rt.path.replace(/^\/api/, '').replace(/:tenantId|:tenant\b/g, t1.tenantId).replace(/:[A-Za-z]+/g, Z)
    const pub = path.startsWith('/public')
    for (const a of pub ? [null] : actors) {
      const bodies: any[] = rt.method === 'GET' || rt.method === 'DELETE' ? [undefined] : [{}, { a: 1, nome: 'x'.repeat(5000) }, '{bad json', { texto: null, studentId: 12, tipo: [] }]
      for (const b of bodies) {
        try { await call(a, rt.method, path, b, typeof b === 'string' ? { 'content-type': 'application/json' } : {}); n++ } catch (e: any) { fails.push(`EXC ${rt.method} ${path}: ${e.message}`) }
      }
    }
  }
  console.log('chamadas:', n)
  await close(); summary()
}
main().catch((e) => { console.error(e); process.exit(2) })
