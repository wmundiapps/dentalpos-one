import test from 'node:test'
import assert from 'node:assert/strict'
import { executar } from '../motor.ts'
import { AGENTES } from '../catalogo.ts'
import { creditosEmMemoria, llmSimulado } from '../adaptadores/simulado.ts'
import type { EventoAuditoria, PerfilNegocio } from '../types.ts'

const perfil: PerfilNegocio = {
  nome: 'Clínica Sorriso',
  vertical: 'odonto',
  horario: 'seg a sex, 8h às 18h',
  precosPermitidos: { avaliacao: 'R$ 150,00' },
}
const meioDia = new Date('2026-11-09T15:00:00Z') // 12h em Brasília

function ambiente() {
  const auditoria: EventoAuditoria[] = []
  return { auditoria, aud: { registrar: async (e: EventoAuditoria) => void auditoria.push(e) }, cred: creditosEmMemoria(5) }
}

test('opt-out: não chama a IA, não cobra crédito e confirma', async () => {
  const { aud, cred, auditoria } = ambiente()
  const llm = llmSimulado(() => 'não deveria ser chamado')
  const r = await executar({ agente: AGENTES.atendente, perfil, historico: [], entrada: 'PARAR', canal: 'whatsapp', llm, creditos: cred, auditoria: aud, agora: meioDia })
  assert.equal(r.optOut, true)
  assert.equal(llm.chamadas, 0)
  assert.equal(cred.atual(), 5)
  assert.equal(auditoria[0].motivo, 'opt-out')
})

test('urgência de saúde: transfere para a equipe sem usar a IA', async () => {
  const llm = llmSimulado(() => 'x')
  const r = await executar({ agente: AGENTES.atendente, perfil, historico: [], entrada: 'estou com muita dor e sangrando', canal: 'whatsapp', llm, agora: meioDia })
  assert.equal(r.transferirParaHumano, true)
  assert.equal(r.motivo, 'urgencia-saude')
  assert.equal(llm.chamadas, 0)
})

test('resposta normal: usa a IA, debita crédito e registra auditoria sem dados pessoais', async () => {
  const { aud, cred, auditoria } = ambiente()
  const llm = llmSimulado(() => 'Atendemos de segunda a sexta, das 8h às 18h.')
  const r = await executar({ agente: AGENTES.atendente, perfil, historico: [], entrada: 'qual o horário? meu cpf é 123.456.789-09', canal: 'whatsapp', llm, creditos: cred, auditoria: aud, agora: meioDia })
  assert.equal(r.resposta, 'Atendemos de segunda a sexta, das 8h às 18h.')
  assert.equal(r.creditosUsados, 1)
  assert.equal(cred.atual(), 4)
  assert.ok(!auditoria[0].entrada.includes('123.456'))
})

test('preço inventado pela IA é bloqueado e vai para a equipe', async () => {
  const llm = llmSimulado(() => 'A consulta custa R$ 80,00.')
  const r = await executar({ agente: AGENTES.atendente, perfil, historico: [], entrada: 'quanto custa?', canal: 'whatsapp', llm, agora: meioDia })
  assert.equal(r.transferirParaHumano, true)
  assert.match(r.motivo ?? '', /valor-inventado/)
  assert.ok(!(r.resposta ?? '').includes('80'))
})

test('ferramenta fora da lista do agente é bloqueada; ferramenta permitida roda', async () => {
  let rodou = false
  const llm = llmSimulado((req) =>
    req.mensagens.some((m) => m.conteudo.startsWith('[resultado'))
      ? 'Tenho amanhã às 10h. Quer reservar?'
      : { texto: '', chamadas: [{ ferramenta: 'apagarTudo', args: {} }, { ferramenta: 'listarHorariosLivres', args: { servico: 'avaliacao' } }] },
  )
  const r = await executar({
    agente: AGENTES.agenda, perfil, historico: [], entrada: 'quero marcar', canal: 'whatsapp', llm, agora: meioDia,
    ferramentas: { listarHorariosLivres: async () => { rodou = true; return ['amanhã 10h'] } },
  })
  assert.equal(rodou, true)
  assert.ok(r.acoes.includes('bloqueada:apagarTudo'))
  assert.ok(r.acoes.includes('ok:listarHorariosLivres'))
  assert.equal(r.resposta, 'Tenho amanhã às 10h. Quer reservar?')
})

test('ação sensível vai para a fila de aprovação e não executa', async () => {
  let executou = false
  const pedidos: string[] = []
  const llm = llmSimulado(() => ({ texto: 'Vou encaminhar o seu pedido para a equipe.', chamadas: [{ ferramenta: 'cancelarHorario', args: { id: 7 } }] }))
  const r = await executar({
    agente: AGENTES.agenda, perfil, historico: [], entrada: 'cancela tudo', canal: 'whatsapp', llm, agora: meioDia,
    ferramentas: { cancelarHorario: async () => { executou = true } },
    aprovacao: { pedir: async (p) => { pedidos.push(p.ferramenta); return 'ap-1' } },
  })
  assert.equal(executou, false)
  assert.deepEqual(pedidos, ['cancelarHorario'])
  assert.deepEqual(r.aprovacoesPendentes, ['ap-1'])
})

test('cobrança usa o valor real vindo do sistema, mas bloqueia desconto', async () => {
  const llmOk = llmSimulado((req) =>
    req.mensagens.some((m) => m.conteudo.startsWith('[resultado'))
      ? 'Olá! A mensalidade de R$ 197,00 está em aberto. Quer a segunda via?'
      : { texto: '', chamadas: [{ ferramenta: 'listarPendencias', args: {} }] },
  )
  const ok = await executar({
    agente: AGENTES['cobranca-atraso'], perfil, historico: [], entrada: 'oi', canal: 'whatsapp', llm: llmOk, agora: meioDia,
    ferramentas: { listarPendencias: async () => [{ valor: 'R$ 197,00', vencimento: '2026-11-05' }] },
  })
  assert.equal(ok.transferirParaHumano, false)
  assert.match(ok.resposta ?? '', /197,00/)

  const llmDesconto = llmSimulado(() => 'Posso fazer um desconto de 30% para você.')
  const bloq = await executar({ agente: AGENTES['cobranca-atraso'], perfil, historico: [], entrada: 'não consigo pagar', canal: 'whatsapp', llm: llmDesconto, agora: meioDia })
  assert.equal(bloq.transferirParaHumano, true)
})

test('agente proativo não envia fora do horário (21h às 8h)', async () => {
  const llm = llmSimulado(() => 'oi')
  const noite = new Date('2026-11-09T03:00:00Z') // 0h em Brasília
  const r = await executar({ agente: AGENTES['pos-atendimento'], perfil, historico: [], entrada: 'iniciar', canal: 'whatsapp', llm, agora: noite })
  assert.equal(r.resposta, null)
  assert.equal(r.motivo, 'fora-da-janela')
  assert.equal(llm.chamadas, 0)
})

test('sem créditos: não chama a IA', async () => {
  const llm = llmSimulado(() => 'oi')
  const r = await executar({ agente: AGENTES.atendente, perfil, historico: [], entrada: 'oi', canal: 'whatsapp', llm, creditos: creditosEmMemoria(0), agora: meioDia })
  assert.equal(r.motivo, 'sem-creditos')
  assert.equal(llm.chamadas, 0)
})

test('resumo diário (interno) não é bloqueado por opt-out e usa 2 créditos', async () => {
  const cred = creditosEmMemoria(5)
  const llm = llmSimulado(() => 'Bom dia! Ontem: 14 atendimentos. Hoje: 11 consultas.')
  const r = await executar({ agente: AGENTES['resumo-diario'], perfil, historico: [], entrada: 'parar', canal: 'email', llm, creditos: cred, agora: new Date('2026-11-09T09:00:00Z') })
  assert.equal(r.optOut, false)
  assert.equal(cred.atual(), 3)
})
