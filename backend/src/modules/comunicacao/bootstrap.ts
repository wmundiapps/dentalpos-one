import { prisma } from '../../lib/prisma'
import { getConfig } from './store'
import { extractVars } from './pure'
import { URA_PADRAO } from './rotas-voz'

const TEMPLATES: Array<{ chave: string; nome: string; categoria: string; assunto?: string; corpo: string }> = [
  { chave: 'cobranca_d_menos_3', nome: 'Cobrança: lembrete 3 dias antes', categoria: 'COBRANCA', assunto: 'Sua mensalidade vence em 3 dias', corpo: 'Olá, {{nome}}! Lembrando que a {{descricao}} no valor de {{valor}} vence em {{vencimento}}. Se já pagou, desconsidere. Dúvidas? Responda esta mensagem.' },
  { chave: 'cobranca_d0', nome: 'Cobrança: vence hoje', categoria: 'COBRANCA', assunto: 'Sua mensalidade vence hoje', corpo: 'Olá, {{nome}}! Hoje vence a {{descricao}} ({{valor}}). Pague hoje e evite encargos. Responda BOLETO para receber a segunda via.' },
  { chave: 'cobranca_d_mais_3', nome: 'Cobrança: 3 dias de atraso', categoria: 'COBRANCA', assunto: 'Mensalidade em atraso', corpo: 'Olá, {{nome}}. Identificamos que a {{descricao}} ({{valor}}) venceu em {{vencimento}} e consta em aberto há {{dias_atraso}} dias. Podemos ajudar a regularizar? Responda esta mensagem.' },
  { chave: 'cobranca_d_mais_10', nome: 'Cobrança: 10 dias de atraso', categoria: 'COBRANCA', assunto: 'Regularize sua situação financeira', corpo: 'Olá, {{nome}}. Sua {{descricao}} ({{valor}}) está em atraso desde {{vencimento}}. Procure o financeiro para negociar condições e manter sua matrícula regular.' },
  { chave: 'boas_vindas_aluno', nome: 'Boas-vindas ao aluno', categoria: 'ACADEMICO', assunto: 'Bem-vindo(a)!', corpo: 'Olá, {{nome}}! Seja bem-vindo(a) ao curso de {{curso}}. Estamos à disposição para o que precisar.' },
  { chave: 'rematricula_pendente', nome: 'Rematrícula pendente', categoria: 'ACADEMICO', assunto: 'Sua rematrícula está pendente', corpo: 'Olá, {{nome}}! Sua rematrícula no curso de {{curso}} ainda está pendente. Garanta sua vaga acessando o portal do aluno ou falando com a secretaria.' },
  { chave: 'candidato_lead', nome: 'Candidato: continuar inscrição', categoria: 'ADMISSOES', assunto: 'Conclua sua inscrição', corpo: 'Olá, {{nome}}! Notamos que sua inscrição ainda não foi concluída. Posso ajudar? Responda esta mensagem. Para não receber mais divulgações, responda SAIR.' },
  { chave: 'egresso_novidades', nome: 'Egresso: pós-graduação e eventos', categoria: 'MARKETING', assunto: 'Novidades para nossos egressos', corpo: 'Olá, {{nome}}! Temos novidades em pós-graduação e eventos para egressos. Quer saber mais? Responda esta mensagem. Para não receber divulgações, responda SAIR.' },
]

const FAQS = [
  { categoria: 'FINANCEIRO', pergunta: 'Como emitir a segunda via do boleto?', resposta: 'Acesse o portal do aluno > Financeiro, ou digite *menu* e escolha "Boletos e pagamentos" para receber os dados da sua cobrança.', palavrasChave: ['boleto', 'segunda via', 'mensalidade', 'pagamento'] },
  { categoria: 'SECRETARIA', pergunta: 'Como solicitar declaração de matrícula ou histórico escolar?', resposta: 'Declarações e histórico podem ser solicitados no portal do aluno ou diretamente na secretaria acadêmica.', palavrasChave: ['declaracao', 'historico', 'matricula', 'documento'] },
  { categoria: 'SECRETARIA', pergunta: 'Qual o horário de atendimento?', resposta: 'Nosso atendimento presencial funciona em horário comercial, de segunda a sábado. Pelos canais digitais respondemos assim que possível.', palavrasChave: ['horario', 'atendimento', 'funcionamento'] },
  { categoria: 'ACADEMICO', pergunta: 'Como consultar o calendário acadêmico?', resposta: 'Digite *menu* e escolha "Calendário acadêmico" para ver os próximos eventos e datas importantes.', palavrasChave: ['calendario', 'prova', 'feriado', 'recesso'] },
]

const FLUXO_MENU = {
  inicio: 'raiz',
  nos: {
    raiz: {
      texto: 'Olá! Sou o assistente virtual. Como posso ajudar?',
      opcoes: [
        { rotulo: 'Boletos e pagamentos', gatilhos: ['boleto', 'mensalidade', 'pagar'], acao: 'BOLETO' },
        { rotulo: 'Minhas notas e frequência', gatilhos: ['nota', 'notas', 'frequencia', 'boletim'], acao: 'NOTAS' },
        { rotulo: 'Calendário acadêmico', gatilhos: ['calendario', 'datas', 'prova'], acao: 'CALENDARIO' },
        { rotulo: 'Dúvidas frequentes', gatilhos: ['duvida', 'faq', 'perguntas'], acao: 'FAQ' },
        { rotulo: 'Falar com atendente', gatilhos: ['atendente', 'humano'], acao: 'HANDOFF' },
      ],
    },
  },
}

export async function bootstrapComunicacao(tenantId: string) {
  const r = { config: false, templates: 0, faqs: 0, fluxos: 0, reguas: 0 }
  const cfg = await getConfig(tenantId)
  if (!cfg.uraMenu) {
    await prisma.comConfig.update({ where: { tenantId }, data: { uraMenu: URA_PADRAO as any } })
    r.config = true
  }
  const tpls = new Map<string, string>()
  for (const t of TEMPLATES) {
    const ex = await prisma.comTemplate.findFirst({ where: { tenantId, chave: t.chave } })
    if (ex) {
      tpls.set(t.chave, ex.id)
      continue
    }
    const c = await prisma.comTemplate.create({ data: { tenantId, ...t, variaveis: extractVars(`${t.assunto ?? ''} ${t.corpo}`) } })
    tpls.set(t.chave, c.id)
    r.templates++
  }
  for (const f of FAQS) {
    if (await prisma.comFaq.findFirst({ where: { tenantId, pergunta: f.pergunta } })) continue
    await prisma.comFaq.create({ data: { tenantId, ...f } })
    r.faqs++
  }
  if (!(await prisma.comBotFluxo.findFirst({ where: { tenantId, intencao: 'MENU_PRINCIPAL' } }))) {
    await prisma.comBotFluxo.create({ data: { tenantId, nome: 'Menu principal', intencao: 'MENU_PRINCIPAL', gatilhos: ['menu', 'oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'ajuda'], definicao: FLUXO_MENU as any, prioridade: 10 } })
    r.fluxos++
  }
  // Régua padrão criada INATIVA: só liga depois de configurar o canal de envio.
  if (!(await prisma.comRegua.findFirst({ where: { tenantId, nome: 'Régua padrão de cobrança' } }))) {
    await prisma.comRegua.create({
      data: {
        tenantId,
        nome: 'Régua padrão de cobrança',
        ativa: false,
        descricao: 'D-3, D0, D+3 e D+10 (WhatsApp com e-mail de reserva). Ative após configurar os canais.',
        etapas: {
          create: [
            { tenantId, nome: 'D-3 lembrete', offsetDias: -3, canal: 'WHATSAPP', canalFallback: 'EMAIL', templateId: tpls.get('cobranca_d_menos_3')! },
            { tenantId, nome: 'D0 vencimento', offsetDias: 0, canal: 'WHATSAPP', canalFallback: 'EMAIL', templateId: tpls.get('cobranca_d0')! },
            { tenantId, nome: 'D+3 atraso', offsetDias: 3, canal: 'WHATSAPP', canalFallback: 'EMAIL', templateId: tpls.get('cobranca_d_mais_3')! },
            { tenantId, nome: 'D+10 atraso', offsetDias: 10, canal: 'EMAIL', canalFallback: 'WHATSAPP', templateId: tpls.get('cobranca_d_mais_10')! },
          ],
        },
      },
    })
    r.reguas++
  }
  return r
}
