// Fuzz de query-string em todas as rotas GET dos módulos do QA4: nenhuma pode responder 5xx.
import { prisma } from '../../src/lib/prisma'
import { setup } from './qa4-lib'
function splitPath(thing: any): string {
  if (typeof thing === 'string') return thing
  if (thing.fast_slash) return ''
  const m = thing.toString().replace('\\/?', '').replace('(?=\\/|$)', '$').match(/^\/\^((?:\\[.*+?^${}()|[\]\\\/]|[^.*+?^${}()|[\]\\\/])*)\$\//)
  return m ? m[1].replace(/\\(.)/g, '$1') : '<?>'
}
function walk(stack: any[], prefix: string, out: any[]) {
  for (const l of stack) {
    if (l.route) { for (const m of Object.keys(l.route.methods)) out.push({ method: m.toUpperCase(), path: prefix + l.route.path }) }
    else if (l.name === 'router' && l.handle?.stack) walk(l.handle.stack, prefix + splitPath(l.regexp), out)
  }
}
const PARAMS = ['status', 'tipo', 'de', 'ate', 'ano', 'anoDe', 'dias', 'page', 'pageSize', 'limite', 'categoria', 'situacao', 'prioridade', 'nivel', 'origem', 'canal', 'por', 'mes', 'periodo', 'base', 'diasConsumo', 'vencendoEmDias', 'venceEmDias', 'minBasicos', 'estado', 'criticidade', 'ativo', 'exameId', 'spaceId', 'dataInicio', 'dataFim', 'inicio', 'fim', 'data', 'escopo', 'perfil', 'numeroAlunos', 'aulas', 'total', 'pendentes', 'meses', 'limit', 'q']
async function main() {
  const c = await setup()
  const { default: app } = await import('../../src/app')
  const routes: any[] = []
  walk((app as any)._router.stack, '', routes)
  const gets = routes.filter((r) => r.method === 'GET' && /^\/api\/(edu\/(infraestrutura|suprimentos|biblioteca|desempenho)|public\/edu\/biblioteca)/.test(r.path))
  console.log('rotas GET', gets.length)
  const bad: string[] = []
  const bads = ['ZZZ', 'abc', '-5', "'", '9999999999999999999', '%00', '[]']
  const tasks: Array<() => Promise<void>> = []
  const tok = c.users.ADMIN.token
  for (const g of gets) {
    const path = g.path.replace(/^\/api/, '').replace(':tenantId', c.tenantId).replace(/:[A-Za-z]+/g, '00000000-0000-0000-0000-000000000000')
    for (const p of PARAMS) for (const v of bads) tasks.push(async () => {
      const r = await fetch(c.base + path + `?${p}=${encodeURIComponent(v)}`, { headers: { Authorization: `Bearer ${tok}` } })
      if (r.status >= 500) bad.push(`${r.status} GET ${path}?${p}=${v}`)
    })
  }
  let i = 0
  const worker = async () => { while (i < tasks.length) { const t = tasks[i++]; await t() } }
  await Promise.all(Array.from({ length: 12 }, worker))
  const uniq = [...new Set(bad.map((b) => b.replace(/=[^=]*$/, '=*')))]
  require('fs').writeFileSync('/tmp/claude-0/fuzz.out', `rotas ${gets.length} tarefas ${tasks.length}\n5xx únicos: ${uniq.length}\n` + uniq.join('\n') + '\n')
  await c.close(); process.exit(0)
}
main()
