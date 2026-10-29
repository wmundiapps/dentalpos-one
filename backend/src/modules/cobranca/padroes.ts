import { prisma } from '../../lib/prisma'

export const ACOES = ['MENSAGEM', 'NOTIFICACAO_EXTRAJUDICIAL', 'NEGATIVACAO', 'PROTESTO', 'JURIDICO'] as const

// Mensagens-modelo: neutras, sem expor o aluno, sem ameaça (CDC art. 42), com saída por "SAIR".
const SAIR = ' Para não receber estes avisos, responda SAIR.'

export const POLITICAS_PADRAO = [
  { nome: 'Graduação presencial', segmento: 'GRADUACAO', multaPct: 2, jurosTipo: 'MENSAL', jurosPct: 1, toleranciaDias: 2, descontoQuitacaoEncargosPct: 50, descontoQuitacaoPrincipalPct: 0, descontoMaxPct: 20, entradaMinPct: 20, parcelasMax: 6, parcelaMinima: 150, jurosParcelamentoPct: 0 },
  { nome: 'Pós-graduação', segmento: 'POS', multaPct: 2, jurosTipo: 'MENSAL', jurosPct: 1, toleranciaDias: 3, descontoQuitacaoEncargosPct: 30, descontoQuitacaoPrincipalPct: 0, descontoMaxPct: 15, entradaMinPct: 30, parcelasMax: 4, parcelaMinima: 250, jurosParcelamentoPct: 0 },
  { nome: 'EAD', segmento: 'EAD', multaPct: 2, jurosTipo: 'MENSAL', jurosPct: 1, toleranciaDias: 5, descontoQuitacaoEncargosPct: 60, descontoQuitacaoPrincipalPct: 5, descontoMaxPct: 25, entradaMinPct: 10, parcelasMax: 12, parcelaMinima: 80, jurosParcelamentoPct: 0 },
]

export const REGUA_PADRAO = {
  nome: 'Régua padrão de cobrança',
  segmento: 'TODOS',
  toleranciaDias: 3,
  descricao: 'Lembrete gentil, e-mail, SMS, voz IA e proposta de acordo recorrente; escalonamento formal ao final.',
  etapas: [
    { ordem: 1, nome: 'Lembrete amigável', diaAtraso: 1, acao: 'MENSAGEM', canal: 'WHATSAPP', canalFallback: 'SMS', mensagem: 'Olá, {{nome}}! Identificamos que a mensalidade com vencimento em {{vencimento}} ainda consta em aberto (saldo de {{saldo}}). Se já pagou, desconsidere. Podemos ajudar com a segunda via.' + SAIR },
    { ordem: 2, nome: 'E-mail com segunda via', diaAtraso: 5, acao: 'MENSAGEM', canal: 'EMAIL', canalFallback: 'WHATSAPP', assunto: 'Mensalidade em aberto - segunda via', mensagem: 'Olá, {{nome}}. Constam {{titulos}} título(s) em aberto, com {{dias_atraso}} dias de atraso e saldo atualizado de {{saldo}}. A segunda via está disponível no portal ou com a secretaria financeira. Estamos à disposição para ajudar.', repetirACadaDias: 7 },
    { ordem: 3, nome: 'SMS de lembrete', diaAtraso: 10, acao: 'MENSAGEM', canal: 'SMS', canalFallback: 'WHATSAPP', mensagem: '{{nome}}, sua mensalidade segue em aberto ({{saldo}}). Procure o financeiro para regularizar ou negociar.' + SAIR, repetirACadaDias: 7 },
    { ordem: 4, nome: 'Contato por voz IA', diaAtraso: 20, acao: 'MENSAGEM', canal: 'VOZ_IA', canalFallback: 'WHATSAPP', mensagem: 'Estamos entrando em contato sobre uma pendência financeira de {{saldo}}, com {{dias_atraso}} dias. Há condições especiais de regularização na secretaria financeira.', repetirACadaDias: 10 },
    { ordem: 5, nome: 'Proposta de acordo (recorrente)', diaAtraso: 35, acao: 'MENSAGEM', canal: 'WHATSAPP', canalFallback: 'EMAIL', mensagem: '{{nome}}, temos uma condição para regularizar seu saldo de {{saldo}}, com parcelamento e desconto de encargos. Responda esta mensagem ou procure o financeiro.' + SAIR, repetirACadaDias: 7, continuaAposProxima: true },
    { ordem: 6, nome: 'Notificação extrajudicial', diaAtraso: 45, acao: 'NOTIFICACAO_EXTRAJUDICIAL', canal: 'EMAIL' },
    { ordem: 7, nome: 'Negativação (simulada)', diaAtraso: 75, acao: 'NEGATIVACAO', canal: 'EMAIL', exigeAprovacao: true },
    { ordem: 8, nome: 'Protesto (simulado)', diaAtraso: 90, acao: 'PROTESTO', canal: 'EMAIL', exigeAprovacao: true },
    { ordem: 9, nome: 'Solicitação de execução ao Jurídico', diaAtraso: 120, acao: 'JURIDICO', canal: 'EMAIL', exigeAprovacao: true },
  ],
}

/** Cria política por segmento e a régua padrão quando o tenant ainda não tem. Idempotente. */
export async function bootstrapCobranca(tenantId: string) {
  let politicas = 0
  for (const p of POLITICAS_PADRAO) {
    if (await prisma.cobPolitica.count({ where: { tenantId, segmento: p.segmento } })) continue
    await prisma.cobPolitica.create({ data: { ...p, tenantId } as any })
    politicas++
  }
  let reguas = 0
  if (!(await prisma.cobRegua.count({ where: { tenantId } }))) {
    const { etapas, ...cab } = REGUA_PADRAO
    await prisma.cobRegua.create({ data: { ...cab, tenantId, etapas: { create: etapas.map((e) => ({ ...e, tenantId })) } } })
    reguas++
  }
  return { politicasCriadas: politicas, reguasCriadas: reguas }
}
