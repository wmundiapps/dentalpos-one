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
  const gets = routes.filter((r) => ['POST','PUT','PATCH'].includes(r.method) && /^\/api\/edu\/(infraestrutura|suprimentos|biblioteca|desempenho)\//.test(r.path))
  console.log('rotas GET', gets.length)
  const bad: string[] = []
  const bodies: any[] = [{}, [], 'str', null, { itens: 'x', ids: 5, nome: {}, status: 'ZZ', quantidade: -1, valor: 'abc', fim: 'abc', inicio: 123 }, { itens: [], respostas: 5, tombos: 'x', questoes: [1] }]
  const tasks: Array<() => Promise<void>> = []
  const tok = c.users.ADMIN.token
  for (const g of gets) {
    if (/bootstrap|jobs\/executar|disparar/.test(g.path)) continue
    const path = g.path.replace(/^\/api/, '').replace(/:[A-Za-z]+/g, '00000000-0000-0000-0000-000000000000')
    for (const b of bodies) tasks.push(async () => {
      const r = await fetch(c.base + path, { method: g.method, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
      if (r.status >= 500) bad.push(`${r.status} ${g.method} ${path} body=${JSON.stringify(b).slice(0, 40)}`)
    })
  }
  let i = 0
  const worker = async () => { while (i < tasks.length) { const t = tasks[i++]; await t() } }
  await Promise.all(Array.from({ length: 12 }, worker))
  const uniq = bad
  require('fs').writeFileSync('/tmp/claude-0/fuzz2.out', `rotas ${gets.length} tarefas ${tasks.length}\n5xx únicos: ${uniq.length}\n` + uniq.join('\n') + '\n')
  await c.close(); process.exit(0)
}
main()
