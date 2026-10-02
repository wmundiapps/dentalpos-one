import { prisma } from '../../lib/prisma'
import { aiConfigured, AiUnavailableError, callAIForText } from '../../services-ai/client'
import { completeReminders, scheduleReminder } from '../core/reminders'
import { despacharPorId } from './dispatcher'
import { InboundMsg } from './adapters'
import { acharOuCriarContato, getConfig, registrarPreferencia } from './store'
import {
  BotDef, BotEstado, calcularSla, detectarOptOut, dentroDaJanela, formatBRL, formatDateBR, normalizeText, passoBot, pontuarGatilhos, rankFaq, renderNo, validarBotDef, verificarCpfPrefixo,
} from './pure'

const db = prisma as any
const MIN_FAQ_SCORE = 1.5

// ---------------------------------------------------------------- envio na conversa
export async function enviarNaConversa(p: {
  tenantId: string
  conversa: { id: string; canalTipo: string; chaveExterna: string | null; assunto?: string | null }
  contato: { id: string; studentId?: string | null; userId?: string | null } | null
  texto: string
  autorTipo: 'ATENDENTE' | 'BOT' | 'BOT_IA' | 'SISTEMA'
  autorId?: string
}) {
  const { tenantId, conversa, texto } = p
  const msg = await prisma.comMensagem.create({ data: { tenantId, conversaId: conversa.id, direcao: 'SAIDA', autorTipo: p.autorTipo, autorId: p.autorId, conteudo: texto, status: 'PENDENTE' } })
  if (conversa.canalTipo === 'SITE_CHAT') {
    return prisma.comMensagem.update({ where: { id: msg.id }, data: { status: 'ENTREGUE' } })
  }
  const n = await prisma.eduNotification.create({
    data: {
      tenantId,
      canal: conversa.canalTipo,
      destino: conversa.chaveExterna,
      studentId: p.contato?.studentId ?? undefined,
      userId: p.contato?.userId ?? undefined,
      assunto: conversa.canalTipo === 'EMAIL' ? (conversa.assunto ? 'Re: ' + conversa.assunto : 'Resposta da instituição') : undefined,
      mensagem: texto,
      refType: 'ComConversa',
      refId: conversa.id,
    },
  })
  await prisma.comMensagem.update({ where: { id: msg.id }, data: { notificationId: n.id } })
  await despacharPorId(tenantId, n.id)
  return prisma.comMensagem.findUnique({ where: { id: msg.id } })
}

export async function registrarPrimeiraResposta(tenantId: string, conversaId: string) {
  const c = await prisma.comConversa.findFirst({ where: { id: conversaId, tenantId } })
  if (c && !c.primeiraRespostaEm) {
    await prisma.comConversa.update({ where: { id: conversaId }, data: { primeiraRespostaEm: new Date() } })
    await completeReminders({ tenantId, refType: 'ComConversa', refId: conversaId })
  }
}

// ---------------------------------------------------------------- inbound
export interface ResultadoInbound {
  conversaId?: string
  duplicada?: boolean
  respostaBot?: string
}

export async function processarInbound(p: { tenantId: string; canalTipo: string; canalId: string; msg: InboundMsg; botPermitido?: boolean }): Promise<ResultadoInbound> {
  const { tenantId, canalTipo, canalId, msg } = p
  const cfg = await getConfig(tenantId)

  if (msg.externalId) {
    const dup = await prisma.comMensagem.findFirst({ where: { tenantId, externalId: msg.externalId, direcao: 'ENTRADA', conversa: { canalTipo: canalTipo as any } }, select: { conversaId: true } })
    if (dup) return { conversaId: dup.conversaId, duplicada: true }
  }

  const contato = await acharOuCriarContato(tenantId, canalTipo, msg.chaveExterna, msg.nome, { telefone: msg.telefone, email: msg.email })
  let conversa = await prisma.comConversa.findFirst({ where: { tenantId, contatoId: contato.id, canalTipo: canalTipo as any, status: { notIn: ['RESOLVIDA', 'ARQUIVADA'] } }, orderBy: { ultimaMensagemEm: 'desc' } })
  const agora = new Date()
  if (!conversa) {
    const sla = calcularSla(agora, cfg)
    conversa = await prisma.comConversa.create({
      data: { tenantId, contatoId: contato.id, canalTipo: canalTipo as any, canalId, chaveExterna: msg.chaveExterna, assunto: msg.assunto, status: 'ABERTA', botAtivo: cfg.botAtivo && canalTipo !== 'EMAIL', slaPrimeiraRespostaEm: sla.primeiraRespostaEm, slaResolucaoEm: sla.resolucaoEm },
    })
    await scheduleReminder({ tenantId, modulo: 'comunicacao', titulo: `SLA de 1ª resposta: ${contato.nome} (${canalTipo})`, dueAt: sla.primeiraRespostaEm, remindAt: new Date(sla.primeiraRespostaEm.getTime() - 10 * 60_000), refType: 'ComConversa', refId: conversa.id, assigneeRole: 'SUPPORT', severity: 'ATENCAO', dedupeKey: `com-sla-${conversa.id}` })
  }
  const conv = conversa
  await prisma.comMensagem.create({ data: { tenantId, conversaId: conv.id, direcao: 'ENTRADA', autorTipo: 'CONTATO', conteudo: msg.texto, externalId: msg.externalId, midiaUrl: msg.midiaUrl } })
  await prisma.comConversa.update({
    where: { id: conv.id },
    data: { naoLidas: { increment: 1 }, ultimaMensagemEm: agora, ultimaDirecao: 'ENTRADA', ...(conv.status === 'AGUARDANDO_CONTATO' ? { status: conv.atribuidoAId ? 'EM_ATENDIMENTO' : 'ABERTA' } : {}) },
  })

  // opt-out / opt-in por palavra-chave
  const op = detectarOptOut(msg.texto)
  if (op) {
    await registrarPreferencia({ tenantId, contatoId: contato.id, canal: '*', finalidade: 'MARKETING', consentimento: op === 'OPT_IN', origem: 'MENSAGEM_SAIR', motivo: msg.texto })
    const texto = op === 'OPT_OUT' ? 'Pronto! Você não receberá mais comunicações de divulgação. Avisos acadêmicos e financeiros obrigatórios continuam. Para voltar a receber, responda VOLTAR.' : 'Combinado! Você voltará a receber nossas comunicações.'
    if (canalTipo !== 'EMAIL') await enviarNaConversa({ tenantId, conversa: conv, contato, texto, autorTipo: 'SISTEMA' })
    return { conversaId: conv.id, respostaBot: texto }
  }

  if (p.botPermitido !== false && conv.botAtivo && cfg.botAtivo && canalTipo !== 'EMAIL') {
    const texto = await responderBot({ tenantId, conversaId: conv.id, texto: msg.texto })
    if (texto) return { conversaId: conv.id, respostaBot: texto }
  }
  return { conversaId: conv.id }
}

// ---------------------------------------------------------------- bot
async function transferirParaHumano(tenantId: string, conv: any, contato: any, motivo: string): Promise<string> {
  const cfg = await getConfig(tenantId)
  await prisma.comConversa.update({ where: { id: conv.id }, data: { botAtivo: false, botEstado: undefined, status: conv.atribuidoAId ? 'EM_ATENDIMENTO' : 'PENDENTE', etiquetas: Array.from(new Set([...(conv.etiquetas ?? []), 'handoff'])), prioridade: Math.max(conv.prioridade, 1) } })
  await prisma.comMensagem.create({ data: { tenantId, conversaId: conv.id, direcao: 'NOTA_INTERNA', autorTipo: 'SISTEMA', conteudo: `Handoff do chatbot: ${motivo}` } })
  let texto = cfg.mensagemHandoff
  if (!dentroDaJanela(new Date(), cfg)) texto += '\n\n' + cfg.mensagemForaHorario
  await scheduleReminder({ tenantId, modulo: 'comunicacao', titulo: `Atendimento solicitado: ${contato?.nome ?? 'contato'}`, dueAt: new Date(Date.now() + cfg.slaPrimeiraRespostaMin * 60_000), refType: 'ComConversa', refId: conv.id, assigneeRole: 'SUPPORT', severity: 'ATENCAO', dedupeKey: `com-handoff-${conv.id}` })
  return texto
}

async function consultar(tenantId: string, acao: string, contato: any): Promise<string> {
  const studentId = contato?.studentId
  if (!studentId) return 'Não localizei seu cadastro de aluno neste número.'
  try {
    if (acao === 'BOLETO') {
      const t = await db.accountReceivable.findMany({ where: { tenantId, studentId, status: { in: ['PENDENTE', 'ATRASADO'] }, dataPagamento: null }, orderBy: { dataVencimento: 'asc' }, take: 3 })
      if (!t.length) return 'Você não possui cobranças em aberto. 🎉'
      const portal = String(process.env.PUBLIC_APP_URL || '').replace(/\/$/, '')
      const linhas = t.map((x: any) => `• ${x.descricao} — ${formatBRL(x.valor)} — vence em ${formatDateBR(x.dataVencimento)}${x.dataVencimento < new Date() ? ' (em atraso)' : ''}${x.gatewayId ? `\n  Código da cobrança: ${x.gatewayId}` : ''}`)
      return `Suas cobranças em aberto:\n${linhas.join('\n')}${portal ? `\n\nA segunda via completa está no portal: ${portal}` : '\n\nPara receber a segunda via do boleto, fale com o financeiro (digite 0).'}`
    }
    if (acao === 'NOTAS') {
      const r = await db.ntResultado.findMany({ where: { tenantId, studentId }, orderBy: { calculadoEm: 'desc' }, take: 8 })
      if (!r.length) return 'Ainda não há notas lançadas para você.'
      const discs = await prisma.discipline.findMany({ where: { id: { in: r.map((x: any) => x.disciplineId).filter(Boolean) } }, select: { id: true, nome: true } })
      const nome = new Map(discs.map((d) => [d.id, d.nome]))
      return 'Seu desempenho recente:\n' + r.map((x: any) => `• ${nome.get(x.disciplineId) ?? 'Disciplina'}: média ${x.mediaFinal ?? x.mediaParcial ?? '—'} | frequência ${x.frequenciaPct != null ? Math.round(x.frequenciaPct) + '%' : '—'} | ${String(x.situacao).replace(/_/g, ' ').toLowerCase()}`).join('\n')
    }
    if (acao === 'CALENDARIO') {
      const ev = await db.calEvento.findMany({ where: { tenantId, ativo: true, fim: { gte: new Date() }, publico: { in: ['TODOS', 'ALUNOS'] } }, orderBy: { inicio: 'asc' }, take: 5 })
      if (!ev.length) return 'Não há eventos futuros no calendário acadêmico.'
      return 'Próximos eventos:\n' + ev.map((e: any) => `• ${formatDateBR(e.inicio)} — ${e.titulo}${e.local ? ` (${e.local})` : ''}`).join('\n')
    }
  } catch (e) {
    console.error('[com-bot-consulta]', e)
    return 'Não consegui consultar essa informação agora. Digite 0 para falar com um atendente.'
  }
  return 'Consulta não disponível.'
}

async function respostaIA(tenantId: string, texto: string, conv: any, cfg: any): Promise<{ texto?: string; handoff?: boolean } | null> {
  if (!cfg.iaFallback || !aiConfigured()) return null
  const desde = new Date(Date.now() - 86_400_000)
  const usos = await prisma.comMensagem.count({ where: { tenantId, conversaId: conv.id, autorTipo: 'BOT_IA', createdAt: { gte: desde } } })
  if (usos >= cfg.iaLimiteDiarioConversa) return { handoff: true }
  const faqs = await prisma.comFaq.findMany({ where: { tenantId, ativo: true }, take: 60 })
  let base = faqs.map((f) => `P: ${f.pergunta}\nR: ${f.resposta}`).join('\n\n')
  if (base.length > 8000) base = base.slice(0, 8000)
  try {
    const out = await callAIForText({
      system: `Você é o assistente virtual de uma instituição de ensino superior brasileira. Responda SEMPRE em português do Brasil, em no máximo 5 linhas, de forma cordial. Use EXCLUSIVAMENTE a base de conhecimento abaixo; não invente prazos, valores, políticas ou links. Nunca peça nem revele dados sensíveis. Se a base não permitir responder com segurança, responda apenas: [HANDOFF]\n\nBASE DE CONHECIMENTO:\n${base || '(vazia)'}`,
      user: texto.slice(0, 800),
      maxTokens: 400,
      ctx: { tenantId, referenceType: 'ComConversa', referenceId: conv.id },
    })
    const t = out.trim()
    if (!t || t.includes('[HANDOFF]')) return { handoff: true }
    return { texto: t.slice(0, 1200) }
  } catch (e) {
    if (!(e instanceof AiUnavailableError)) console.error('[com-bot-ia]', e)
    return null
  }
}

export async function responderBot(p: { tenantId: string; conversaId: string; texto: string }): Promise<string | null> {
  const { tenantId, texto } = p
  const conv = await prisma.comConversa.findFirst({ where: { id: p.conversaId, tenantId }, include: { contato: true } })
  if (!conv || !conv.botAtivo) return null
  const cfg = await getConfig(tenantId)
  const contato = conv.contato
  let estado: BotEstado = (conv.botEstado as BotEstado | null) ?? {}
  const norm = normalizeText(texto)

  const salvarEEnviar = async (resp: string, novoEstado: BotEstado, autor: 'BOT' | 'BOT_IA' = 'BOT') => {
    await prisma.comConversa.update({ where: { id: conv.id }, data: { botEstado: novoEstado as any } })
    await enviarNaConversa({ tenantId, conversa: conv, contato, texto: resp, autorTipo: autor })
    await registrarPrimeiraRespostaBot(tenantId, conv.id)
    return resp
  }
  const handoff = async (motivo: string) => {
    const t = await transferirParaHumano(tenantId, conv, contato, motivo)
    await enviarNaConversa({ tenantId, conversa: conv, contato, texto: t, autorTipo: 'BOT' })
    return t
  }

  if (/\b(atendente|humano|pessoa)\b/.test(norm) && norm.length < 40) return handoff('contato pediu atendimento humano')

  const fluxos = await prisma.comBotFluxo.findMany({ where: { tenantId, ativo: true }, orderBy: [{ prioridade: 'desc' }, { createdAt: 'asc' }] })
  const porId = new Map(fluxos.map((f) => [f.id, f]))
  const menuPrincipal = fluxos.find((f) => f.intencao === 'MENU_PRINCIPAL') ?? fluxos[0]

  // ação pendente de verificação de identidade (CPF)
  if (estado.aguardandoCpf) {
    const pend = estado.aguardandoCpf
    if (verificarCpfPrefixo(contato.documento ?? (await cpfDoAluno(tenantId, contato.studentId)), texto)) {
      estado = { ...estado, aguardandoCpf: undefined, verificadoEm: Date.now() }
      const resp = await consultar(tenantId, pend.acao, contato)
      return salvarEEnviar(`${resp}\n\nDigite *menu* para ver as opções.`, { fluxoId: estado.fluxoId, verificadoEm: estado.verificadoEm })
    }
    if (pend.tentativas + 1 >= 3) return handoff('falha na verificação de identidade')
    return salvarEEnviar('Não confere. Informe os 4 primeiros dígitos do seu CPF (somente números) ou digite 0 para falar com um atendente.', { ...estado, aguardandoCpf: { acao: pend.acao, tentativas: pend.tentativas + 1 } })
  }

  const iniciarFluxo = async (f: (typeof fluxos)[number], prefixo?: string) => {
    const def = f.definicao as unknown as BotDef
    if (validarBotDef(def).length) return null
    const passo = passoBot(def, { fluxoId: f.id, verificadoEm: estado.verificadoEm }, texto)
    if (passo.tipo === 'MENSAGEM') return salvarEEnviar((prefixo ? prefixo + '\n\n' : '') + passo.texto, passo.estado)
    return null
  }

  if (['menu', 'inicio', 'voltar'].includes(norm) && menuPrincipal) {
    estado = { verificadoEm: estado.verificadoEm }
    const def = menuPrincipal.definicao as unknown as BotDef
    if (!validarBotDef(def).length) return salvarEEnviar(renderNo(def.nos[def.inicio]), { fluxoId: menuPrincipal.id, no: def.inicio, invalidas: 0, verificadoEm: estado.verificadoEm })
  }

  // continuação de fluxo em andamento
  if (estado.fluxoId && estado.no && porId.has(estado.fluxoId)) {
    const f = porId.get(estado.fluxoId)!
    const def = f.definicao as unknown as BotDef
    const passo = passoBot(def, estado, texto)
    if (passo.tipo === 'HANDOFF') return handoff('fluxo do chatbot encaminhou para atendente')
    if (passo.tipo === 'FIM') return salvarEEnviar(passo.texto, passo.estado)
    if (passo.tipo === 'MENSAGEM') return salvarEEnviar(passo.texto, passo.estado)
    if (passo.tipo === 'ACAO') return executarAcao(passo.acao, passo.estado, passo.prefixo)
  }

  async function executarAcao(acao: string, st: BotEstado, prefixo?: string): Promise<string> {
    if (acao === 'FAQ') return salvarEEnviar((prefixo ? prefixo + '\n\n' : '') + 'Escreva sua dúvida que eu procuro na nossa base de perguntas frequentes.', { fluxoId: st.fluxoId, verificadoEm: st.verificadoEm })
    if (acao === 'HANDOFF') return handoff('ação de fluxo')
    // consultas autenticadas
    if (!contato.studentId) return handoff(`consulta ${acao} sem aluno vinculado ao contato`)
    const verificadoRecente = st.verificadoEm && Date.now() - st.verificadoEm < 15 * 60_000
    if (!verificadoRecente) {
      return salvarEEnviar('Por segurança, confirme sua identidade: informe os 4 primeiros dígitos do seu CPF (somente números).', { fluxoId: st.fluxoId, aguardandoCpf: { acao, tentativas: 0 } })
    }
    const resp = await consultar(tenantId, acao, contato)
    return salvarEEnviar(`${resp}\n\nDigite *menu* para ver as opções.`, { fluxoId: st.fluxoId, verificadoEm: st.verificadoEm })
  }

  // novo fluxo por gatilho
  let melhor: { f: (typeof fluxos)[number]; s: number } | null = null
  for (const f of fluxos) {
    const s = pontuarGatilhos(f.gatilhos, texto)
    if (s > 0 && (!melhor || s > melhor.s)) melhor = { f, s }
  }
  if (melhor) {
    const def = melhor.f.definicao as unknown as BotDef
    if (!validarBotDef(def).length) {
      const no = def.nos[def.inicio]
      if (no.acao && !no.opcoes?.length && no.acao !== 'FIM') return executarAcao(no.acao, { fluxoId: melhor.f.id }, no.texto)
      return salvarEEnviar(renderNo(no), { fluxoId: melhor.f.id, no: def.inicio, invalidas: 0 })
    }
  }

  // FAQ
  const faqs = await prisma.comFaq.findMany({ where: { tenantId, ativo: true }, take: 300 })
  const rank = rankFaq(faqs, texto, 1)
  if (rank[0] && rank[0].score >= MIN_FAQ_SCORE) {
    await prisma.comFaq.update({ where: { id: rank[0].faq.id }, data: { usos: { increment: 1 } } })
    return salvarEEnviar(`${rank[0].faq.resposta}\n\nPosso ajudar em algo mais? Digite *menu* para ver as opções.`, { fluxoId: estado.fluxoId })
  }

  // IA com base de conhecimento
  const ia = await respostaIA(tenantId, texto, conv, cfg)
  if (ia?.handoff) return handoff('IA sem base suficiente / limite diário de respostas')
  if (ia?.texto) return salvarEEnviar(ia.texto, { fluxoId: estado.fluxoId }, 'BOT_IA')

  // saudação / sem entendimento: menu principal, senão boas-vindas
  if (menuPrincipal) {
    const r = await iniciarFluxo(menuPrincipal, cfg.mensagemBoasVindas)
    if (r) return r
  }
  return handoff('chatbot sem fluxo, FAQ ou IA para responder')
}

async function cpfDoAluno(tenantId: string, studentId?: string | null) {
  if (!studentId) return null
  const s = await prisma.student.findFirst({ where: { id: studentId, tenantId }, select: { cpf: true } })
  return s?.cpf ?? null
}

// A resposta do bot conta como 1ª resposta para o SLA somente se não houver humano; mantém SLA humano intacto.
async function registrarPrimeiraRespostaBot(_tenantId: string, _id: string) {
  /* o SLA de primeira resposta mede resposta HUMANA; o bot não o encerra */
}
