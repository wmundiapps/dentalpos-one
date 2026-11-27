import { prisma } from '../../lib/prisma'
import { melhorResposta, contemSensivel } from '../atendimento/logic'
import { scheduleReminder, completeReminders } from '../core/reminders'
import { audit } from '../core/notify'
import { MOD, getConfig } from './common'
import { notificarUsuarios, usuariosDoSetor } from './base'
import { HorarioAuto, ausenciaPadrao, dentroDoHorario, pedePessoa, proximaAbertura, soAgradecimento } from './logic'

// ============================================================
// Resposta automática por departamento (motor local, sem provedor externo, sem credencial):
//   1. fora do horário -> mensagem de ausência + aviso/lembrete para a abertura;
//   2. texto sensível (saúde, menores, biometria...) -> NÃO é analisado: vai direto a uma pessoa;
//   3. pediu uma pessoa -> abre o pedido e alerta o departamento (notificação + lembrete + alerta sonoro/visual na tela);
//   4. FAQ do departamento (AtdConhecimento do mesmo setor + ComFaq) com confiança mínima configurável;
//   5. sem resposta confiável -> pedido de pessoa, com aviso ao solicitante.
// Só reage a quem NÃO é do departamento (quem é de casa conversa normalmente).
// ============================================================

export const LIMITE_LEMBRETES = 5

export async function inserirMensagemAuto(tenantId: string, canalId: string, p: { tipo: string; conteudo: string; respostaAId?: string | null; metadados?: unknown }) {
  const m = await prisma.msgMensagem.create({ data: { tenantId, canalId, autorId: null, autorTipo: 'AUTO', tipo: p.tipo, conteudo: p.conteudo.slice(0, 4000), respostaAId: p.respostaAId ?? undefined, metadados: (p.metadados ?? undefined) as any } })
  await prisma.msgCanal.update({ where: { id: canalId }, data: { ultimaMensagemEm: m.createdAt } })
  return m
}

const horarioDe = (a: { diasSemana: number[]; horarioInicio: string; horarioFim: string }): HorarioAuto => ({ diasSemana: a.diasSemana, horarioInicio: a.horarioInicio, horarioFim: a.horarioFim })

/** Quem é avisado quando alguém precisa de uma pessoa: integrantes do setor + membros do canal; sem ninguém, a gestão da instituição. */
export async function destinatariosDoDepartamento(tenantId: string, canal: { id: string; setorId: string | null }, excluir: string[] = []): Promise<string[]> {
  const [doSetor, doCanal] = await Promise.all([usuariosDoSetor(tenantId, canal.setorId), prisma.msgMembro.findMany({ where: { tenantId, canalId: canal.id, OR: [{ origem: 'SETOR' }, { papel: 'ADMIN' }] }, select: { userId: true } })])
  let ids = [...new Set([...doSetor, ...doCanal.map((m) => m.userId)])].filter((x) => !excluir.includes(x))
  if (!ids.length) ids = (await prisma.user.findMany({ where: { tenantId, isActive: true, role: { in: ['ADMIN', 'OWNER', 'SUPPORT', 'SECRETARY'] as any } }, select: { id: true }, take: 20 })).map((u) => u.id).filter((x) => !excluir.includes(x))
  return ids
}

export async function abrirPedidoPessoa(p: { tenantId: string; canal: { id: string; tipo: string; nome: string; setorId: string | null }; mensagemId?: string; solicitanteId: string; motivo: 'PEDIDO_EXPLICITO' | 'SEM_RESPOSTA' | 'SENSIVEL'; confianca?: number }) {
  const { tenantId, canal } = p
  const aberto = await prisma.msgPedidoHumano.findFirst({ where: { tenantId, canalId: canal.id, solicitanteId: p.solicitanteId, status: 'PENDENTE' } })
  if (aberto) return { pedido: aberto, novo: false }
  const pedido = await prisma.msgPedidoHumano.create({ data: { tenantId, canalId: canal.id, mensagemId: p.mensagemId, solicitanteId: p.solicitanteId, motivo: p.motivo, confianca: p.confianca } })
  const dest = await destinatariosDoDepartamento(tenantId, canal, [p.solicitanteId])
  await notificarUsuarios(tenantId, dest, 'PEDIDO_PESSOA', canal, { refType: 'MsgPedidoHumano', refId: pedido.id })
  const cfg = await getConfig(tenantId)
  const quando = new Date(Date.now() + cfg.lembretePedidoMin * 4 * 60_000)
  for (const userId of dest.slice(0, 10)) {
    await scheduleReminder({ tenantId, modulo: MOD, titulo: `Pedido para falar com uma pessoa pendente (${canal.nome})`, descricao: 'Abra o Mensageiro e assuma o atendimento.', dueAt: quando, remindAt: quando, severity: 'ATENCAO', assigneeUserId: userId, refType: 'MsgPedidoHumano', refId: pedido.id, dedupeKey: `msg-pedido:${pedido.id}:${userId}` }).catch(() => undefined)
  }
  await audit({ tenantId, userId: p.solicitanteId, modulo: MOD, acao: 'PEDIDO_PESSOA_ABERTO', refType: 'MsgPedidoHumano', refId: pedido.id, detalhes: { canalId: canal.id, motivo: p.motivo, confianca: p.confianca } })
  return { pedido, novo: true }
}

export async function encerrarPedidos(tenantId: string, ids: string[], status: 'ASSUMIDO' | 'RESOLVIDO', userId: string) {
  if (!ids.length) return 0
  const agora = new Date()
  const r = await prisma.msgPedidoHumano.updateMany({
    where: { tenantId, id: { in: ids }, status: status === 'ASSUMIDO' ? 'PENDENTE' : { in: ['PENDENTE', 'ASSUMIDO'] } },
    data: status === 'ASSUMIDO' ? { status, assumidoPorId: userId, assumidoEm: agora } : { status, resolvidoEm: agora, assumidoPorId: userId },
  })
  for (const id of ids) await completeReminders({ tenantId, refType: 'MsgPedidoHumano', refId: id, userId }).catch(() => undefined)
  if (r.count) await audit({ tenantId, userId, modulo: MOD, acao: status === 'ASSUMIDO' ? 'PEDIDO_PESSOA_ASSUMIDO' : 'PEDIDO_PESSOA_RESOLVIDO', refType: 'MsgPedidoHumano', refId: ids[0], detalhes: { quantidade: r.count } })
  return r.count
}

/** Reaviso dos pedidos que continuam sem atendimento (a cada `lembretePedidoMin`, até LIMITE_LEMBRETES). Roda sob demanda na consulta do alerta e pode ser chamado por um job. */
const ultimaRodada = new Map<string, number>()
export async function processarLembretesPedidos(tenantId: string, forcar = false) {
  const agora = Date.now()
  if (!forcar && agora - (ultimaRodada.get(tenantId) ?? 0) < 30_000) return 0
  ultimaRodada.set(tenantId, agora)
  const cfg = await getConfig(tenantId)
  const limite = new Date(agora - cfg.lembretePedidoMin * 60_000)
  const pend = await prisma.msgPedidoHumano.findMany({ where: { tenantId, status: 'PENDENTE', lembretes: { lt: LIMITE_LEMBRETES }, createdAt: { lte: limite }, OR: [{ ultimoLembreteEm: null }, { ultimoLembreteEm: { lte: limite } }] }, take: 50 })
  let n = 0
  for (const p of pend) {
    const canal = await prisma.msgCanal.findFirst({ where: { id: p.canalId, tenantId } })
    if (!canal) continue
    const dest = await destinatariosDoDepartamento(tenantId, canal, [p.solicitanteId])
    await notificarUsuarios(tenantId, dest, 'LEMBRETE_PEDIDO', canal, { refType: 'MsgPedidoHumano', refId: p.id })
    await prisma.msgPedidoHumano.update({ where: { id: p.id }, data: { lembretes: { increment: 1 }, ultimoLembreteEm: new Date() } })
    n++
  }
  return n
}


export interface FaqAchada { id: string; pergunta: string; resposta: string; origem: 'CONHECIMENTO' | 'FAQ_GERAL' }
/** Melhor resposta da base do departamento (AtdConhecimento do mesmo setor) e da FAQ geral (ComFaq), com confiança de 0 a 1. */
export async function buscarFaq(tenantId: string, canal: { setorId: string | null }, auto: { usarConhecimento: boolean; usarFaqGeral: boolean }, texto: string): Promise<{ faq: FaqAchada | null; confianca: number }> {
  const base: Array<FaqAchada & { palavrasChave: string[] }> = []
  if (auto.usarConhecimento && canal.setorId) {
    const kb = await prisma.atdConhecimento.findMany({ where: { tenantId, ativo: true, setorId: canal.setorId }, take: 300 })
    for (const k of kb) base.push({ id: k.id, pergunta: k.pergunta, resposta: k.resposta, palavrasChave: k.palavrasChave, origem: 'CONHECIMENTO' })
  }
  if (auto.usarFaqGeral) {
    const faq = await prisma.comFaq.findMany({ where: { tenantId, ativo: true }, take: 300 })
    for (const k of faq) base.push({ id: k.id, pergunta: k.pergunta, resposta: k.resposta, palavrasChave: k.palavrasChave, origem: 'FAQ_GERAL' })
  }
  const m = base.length ? melhorResposta(base, texto) : null
  if (!m) return { faq: null, confianca: 0 }
  const f = base.find((b) => b.id === m.faq.id)!
  return { faq: { id: f.id, pergunta: f.pergunta, resposta: f.resposta, origem: f.origem }, confianca: m.confianca }
}

export interface ResultadoAuto { respondeu: boolean; acao: 'NENHUMA' | 'AUSENCIA' | 'FAQ' | 'PEDIDO_PESSOA'; confianca?: number; mensagens: string[]; pedidoId?: string }

/** Avalia uma mensagem de quem não é do departamento e responde automaticamente conforme a configuração do canal. */
export async function processarAutoResposta(p: { tenantId: string; canal: { id: string; tipo: string; nome: string; setorId: string | null }; mensagemId: string; autorId: string; texto: string; agora?: Date }): Promise<ResultadoAuto> {
  const { tenantId, canal } = p
  const nada: ResultadoAuto = { respondeu: false, acao: 'NENHUMA', mensagens: [] }
  if (canal.tipo !== 'DEPARTAMENTO') return nada
  const auto = await prisma.msgAuto.findUnique({ where: { canalId: canal.id } })
  if (!auto?.ativa) return nada
  const texto = p.texto.trim()
  if (!texto || soAgradecimento(texto)) return nada
  // Uma pessoa já assumiu esta conversa há pouco: a automação sai da frente.
  const assumido = await prisma.msgPedidoHumano.findFirst({ where: { tenantId, canalId: canal.id, solicitanteId: p.autorId, status: 'ASSUMIDO', assumidoEm: { gte: new Date(Date.now() - 60 * 60_000) } } })
  if (assumido) return nada

  const out: ResultadoAuto = { respondeu: false, acao: 'NENHUMA', mensagens: [] }
  const emitir = async (tipo: string, conteudo: string, metadados?: unknown) => { await inserirMensagemAuto(tenantId, canal.id, { tipo, conteudo, respostaAId: p.mensagemId, metadados }); out.respondeu = true; out.mensagens.push(tipo) }
  const horario = horarioDe(auto)
  const agora = p.agora ?? new Date()

  // 1) fora do horário
  const jaAvisado = async () => {
    const recentes = await prisma.msgMensagem.findMany({ where: { tenantId, canalId: canal.id, tipo: 'AUSENCIA', createdAt: { gte: new Date(Date.now() - 30 * 60_000) } }, select: { respostaAId: true }, take: 30 })
    const ids = recentes.map((r) => r.respostaAId).filter((x): x is string => !!x)
    return ids.length ? (await prisma.msgMensagem.count({ where: { tenantId, id: { in: ids }, autorId: p.autorId } })) > 0 : false
  }
  if (auto.ausenciaAtiva && !dentroDoHorario(horario, agora) && !(await jaAvisado())) {
    await emitir('AUSENCIA', auto.mensagemAusencia?.trim() || ausenciaPadrao(canal.nome, horario), { fonte: 'AUSENCIA' })
    out.acao = 'AUSENCIA'
    const dest = await destinatariosDoDepartamento(tenantId, canal, [p.autorId])
    await notificarUsuarios(tenantId, dest, 'FORA_HORARIO', canal)
    const abre = proximaAbertura(horario, agora)
    const dia = abre.toISOString().slice(0, 10)
    for (const userId of dest.slice(0, 10)) {
      await scheduleReminder({ tenantId, modulo: MOD, titulo: `Mensagens recebidas fora do horário (${canal.nome})`, descricao: 'Abra o Mensageiro e responda às mensagens recebidas fora do horário.', dueAt: new Date(abre.getTime() + 2 * 3_600_000), remindAt: abre, severity: 'INFO', assigneeUserId: userId, refType: 'MsgCanal', refId: canal.id, dedupeKey: `msg-fora:${canal.id}:${userId}:${dia}` }).catch(() => undefined)
    }
  }

  // 2) assunto sensível: nunca passa pela análise automática
  if (contemSensivel(texto)) {
    const { pedido } = await abrirPedidoPessoa({ tenantId, canal, mensagemId: p.mensagemId, solicitanteId: p.autorId, motivo: 'SENSIVEL' })
    await emitir('AUTO_RESPOSTA', 'Este assunto pode envolver dados sensíveis e não é tratado por resposta automática. Avisei uma pessoa do departamento, que responderá assim que possível.', { fonte: 'SENSIVEL' })
    return { ...out, acao: 'PEDIDO_PESSOA', pedidoId: pedido.id }
  }

  // 3) pediu uma pessoa
  if (pedePessoa(texto)) {
    const { pedido } = await abrirPedidoPessoa({ tenantId, canal, mensagemId: p.mensagemId, solicitanteId: p.autorId, motivo: 'PEDIDO_EXPLICITO' })
    await emitir('AUTO_RESPOSTA', 'Certo! Já chamei uma pessoa do departamento. Enquanto isso, você pode complementar sua mensagem aqui.', { fonte: 'PEDIDO_PESSOA' })
    return { ...out, acao: 'PEDIDO_PESSOA', pedidoId: pedido.id }
  }

  // 4) FAQ do departamento
  if (auto.respostaAutomatica) {
    const m = await buscarFaq(tenantId, canal, auto, texto)
    if (m.faq && m.confianca >= auto.confiancaMinima) {
      await emitir('AUTO_RESPOSTA', `${m.faq.resposta}\n\n(Resposta automática. Se não resolver, escreva "quero falar com uma pessoa".)`, { fonte: m.faq.origem, faqId: m.faq.id, confianca: m.confianca })
      if (m.faq.origem === 'CONHECIMENTO') await prisma.atdConhecimento.update({ where: { id: m.faq.id }, data: { usos: { increment: 1 } } }).catch(() => undefined)
      else await prisma.comFaq.update({ where: { id: m.faq.id }, data: { usos: { increment: 1 } } }).catch(() => undefined)
      return { ...out, acao: 'FAQ', confianca: m.confianca }
    }
    // 5) não soube responder com segurança
    const { pedido } = await abrirPedidoPessoa({ tenantId, canal, mensagemId: p.mensagemId, solicitanteId: p.autorId, motivo: 'SEM_RESPOSTA', confianca: m.confianca })
    await emitir('AUTO_RESPOSTA', auto.mensagemSemResposta?.trim() || 'Não encontrei uma resposta automática segura para isso. Avisei a equipe do departamento: uma pessoa vai responder.', { fonte: 'SEM_RESPOSTA', confianca: m.confianca })
    return { ...out, acao: 'PEDIDO_PESSOA', confianca: m.confianca, pedidoId: pedido.id }
  }
  return out
}
