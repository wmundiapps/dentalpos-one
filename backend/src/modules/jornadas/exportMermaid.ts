// Gera /home/user/dentalpos-one/docs/EDUMASTER-JORNADAS.md com os fluxogramas Mermaid dos templates padrão.
// Uso: npx tsx src/modules/jornadas/exportMermaid.ts
import fs from 'node:fs'
import path from 'node:path'
import { validarGrafo } from './engine'
import { gerarMermaid, rotuloPapel } from './layout'
import { templatesPadrao } from './templates'

const saida = path.resolve(__dirname, '../../../../docs/EDUMASTER-JORNADAS.md')
const L: string[] = []
L.push('# EduMaster Pro — Fluxogramas de Jornadas', '')
L.push('Gerado por `npx tsx src/modules/jornadas/exportMermaid.ts` a partir dos templates padrão (`backend/src/modules/jornadas/templates.ts`).')
L.push('Legenda: retângulo = tarefa; hexágono = aprovação; paralelogramo = espera por evento; losango = gateway; círculo = marco; estádio = início/fim; linha tracejada = transição condicional. As raias agrupam as etapas por responsável.', '')
const tpls = templatesPadrao()
L.push('## Índice', '')
for (const t of tpls) L.push(`- [${t.nome}](#${t.chave})`)
L.push('')
for (const t of tpls) {
  const v = validarGrafo(t.grafo)
  const trabalho = t.grafo.nos.filter((n) => ['TAREFA', 'APROVACAO', 'ESPERA_EVENTO'].includes(n.tipo))
  const papeis = [...new Set(trabalho.map((n) => n.papel).filter(Boolean) as string[])]
  L.push(`<a id="${t.chave}"></a>`, `## ${t.nome}`, '', t.descricao, '')
  L.push(`- Persona: **${t.persona}** · Chave: \`${t.chave}\` · ${t.grafo.nos.length} nós · ${t.grafo.transicoes.length} transições${v.erros.length ? ' · **ERROS: ' + v.erros.join('; ') + '**' : ''}`)
  L.push(`- Responsáveis: ${papeis.map(rotuloPapel).join(', ')}`, '')
  L.push('```mermaid', gerarMermaid(t.grafo), '```', '')
  L.push('| Etapa | Responsável | SLA | Destino |', '|---|---|---|---|')
  for (const n of trabalho) L.push(`| ${n.titulo} | ${n.papel ? rotuloPapel(n.papel) : '-'} | ${n.slaDias != null ? n.slaDias + ' d' : '-'} | ${n.modulo ? n.modulo + (n.rota ? ' ' + n.rota : '') : '-'} |`)
  L.push('')
}
fs.mkdirSync(path.dirname(saida), { recursive: true })
fs.writeFileSync(saida, L.join('\n'))
console.log('Gerado:', saida, `(${tpls.length} templates)`)
