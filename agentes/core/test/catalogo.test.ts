import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LISTA_DE_AGENTES, AGENTES } from '../catalogo.ts'
import { APLICATIVOS, agentesDoAplicativo } from '../apps.ts'

test('existem exatamente os 5 agentes iniciais', () => {
  assert.deepEqual(
    LISTA_DE_AGENTES.map((a) => a.id).sort(),
    ['agenda', 'atendente', 'cobranca-atraso', 'pos-atendimento', 'resumo-diario'],
  )
})

test('todo agente tem exemplo, ferramenta de saída segura e custo positivo', () => {
  for (const a of LISTA_DE_AGENTES) {
    assert.ok(a.exemplo.length > 0, a.id)
    assert.ok(a.custoCreditos > 0, a.id)
    assert.ok(a.instrucoes.includes('Nunca invente'), a.id)
    if (a.publico === 'cliente-final') assert.ok(a.ferramentas.some((f) => f.nome === 'passarParaHumano'), a.id)
  }
})

test('ações sensíveis exigem aprovação humana', () => {
  assert.equal(AGENTES.agenda.ferramentas.find((f) => f.nome === 'cancelarHorario')?.exigeAprovacao, true)
  assert.equal(AGENTES['cobranca-atraso'].ferramentas.find((f) => f.nome === 'propostaDeNegociacao')?.exigeAprovacao, true)
})

test('os 23 aplicativos da WMundi têm cobertura de agentes', () => {
  assert.equal(APLICATIVOS.length, 23)
  for (const app of APLICATIVOS) assert.ok(app.agentes.length >= 1, app.nome)
  assert.deepEqual(agentesDoAplicativo('completodonto').length, 5)
  assert.deepEqual(agentesDoAplicativo('inexistente'), [])
})

test('o ícone (widget) usa os mesmos 5 agentes do catálogo', () => {
  const js = readFileSync(new URL('../../widget/wmundi-agentes.js', import.meta.url), 'utf8')
  for (const a of LISTA_DE_AGENTES) assert.ok(js.includes(`'${a.id}'`), `widget sem ${a.id}`)
})
