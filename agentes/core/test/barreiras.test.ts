import test from 'node:test'
import assert from 'node:assert/strict'
import {
  dentroDaJanela,
  detectarOptOut,
  mascarar,
  pediuHumano,
  perguntouSeERobo,
  reclamacaoGrave,
  urgenciaDeSaude,
  verificarSaida,
} from '../barreiras.ts'
import { AGENTES } from '../catalogo.ts'
import type { PerfilNegocio } from '../types.ts'

const perfil: PerfilNegocio = {
  nome: 'Clínica Sorriso',
  vertical: 'odonto',
  precosPermitidos: { avaliacao: 'R$ 150,00' },
}

test('opt-out reconhece pedidos de parar', () => {
  for (const t of ['PARAR', 'sair', 'não quero mais receber mensagens', 'pare de me mandar mensagem', 'me tira da lista']) {
    assert.equal(detectarOptOut(t), true, t)
  }
  assert.equal(detectarOptOut('quero agendar uma consulta'), false)
  assert.equal(detectarOptOut('x'.repeat(400)), false)
})

test('pede humano, pergunta se é robô, urgência e reclamação grave', () => {
  assert.equal(pediuHumano('quero falar com um atendente'), true)
  assert.equal(pediuHumano('qual o horário?'), false)
  assert.equal(perguntouSeERobo('você é um robô?'), true)
  assert.equal(urgenciaDeSaude('estou com muita dor e o rosto está inchado'), true)
  assert.equal(urgenciaDeSaude('quero limpar os dentes'), false)
  assert.equal(reclamacaoGrave('vou processar vocês'), true)
  assert.equal(reclamacaoGrave('obrigado pelo atendimento'), false)
})

test('saída: bloqueia valor inventado e libera valor cadastrado', () => {
  assert.deepEqual(verificarSaida('A avaliação custa R$ 99,00.', AGENTES.atendente, perfil), { ok: false, regra: 'valor-inventado' })
  assert.deepEqual(verificarSaida('A avaliação custa R$ 150,00.', AGENTES.atendente, perfil), { ok: true })
  assert.deepEqual(verificarSaida('Sua parcela é de R$ 197,00.', AGENTES['cobranca-atraso'], perfil, ['R$ 197,00']), { ok: true })
})

test('saída: bloqueia diagnóstico, promessa e documento pessoal', () => {
  assert.equal(verificarSaida('Você tem cárie profunda.', AGENTES.atendente, perfil).ok, false)
  assert.equal(verificarSaida('Garanto que o resultado será perfeito.', AGENTES.atendente, perfil).ok, false)
  assert.equal(verificarSaida('Seu CPF 123.456.789-09 está cadastrado.', AGENTES.atendente, perfil).ok, false)
})

test('cobrança: bloqueia ameaça e desconto sem aprovação, mas só nesse agente', () => {
  assert.equal(verificarSaida('Vamos negativar o seu nome no Serasa.', AGENTES['cobranca-atraso'], perfil).ok, false)
  assert.equal(verificarSaida('Posso dar um desconto de 20%.', AGENTES['cobranca-atraso'], perfil).ok, false)
  assert.equal(verificarSaida('Temos desconto para pagamento à vista na loja.', AGENTES.atendente, perfil).ok, true)
})

test('janela de envio: 8h às 21h no horário de Brasília', () => {
  assert.equal(dentroDaJanela(new Date('2026-11-09T15:00:00Z')), true) // 12h em Brasília
  assert.equal(dentroDaJanela(new Date('2026-11-09T02:00:00Z')), false) // 23h do dia anterior
  assert.equal(dentroDaJanela(new Date('2026-11-09T10:30:00Z')), false) // 7h30
})

test('auditoria mascara CPF, telefone e e-mail', () => {
  const m = mascarar('Meu CPF 123.456.789-09, fone (44) 98853-1223 e e-mail a@b.com')
  assert.ok(!m.includes('123.456'))
  assert.ok(!m.includes('98853'))
  assert.ok(!m.includes('a@b.com'))
})
