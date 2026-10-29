// Atendimento com IA em cada canal (site, WhatsApp, Instagram, ...) com escalonamento ao consultor.
import { db, getConfig } from './common'
import { escolherConsultor, registrarEvento } from './leads'
import { responder } from './ia'
import { tratarEntrada } from './envio'

export async function processarMensagem(p: { tenantId: string; canal: string; sessao: string; texto: string; nome?: string; leadId?: string; clinicId?: string }) {
  const { tenantId, canal, sessao } = p
  const texto = p.texto.trim().slice(0, 2000)
  const t0 = Date.now()
  let at = await db.mktAtendimento.findUnique({ where: { tenantId_canal_sessao: { tenantId, canal, sessao } } })
  if (!at) at = await db.mktAtendimento.create({ data: { tenantId, canal, sessao, nome: p.nome, leadId: p.leadId } })
  else if (at.status === 'ENCERRADO') at = await db.mktAtendimento.update({ where: { id: at.id }, data: { status: 'IA', consultorId: null, consultorNome: null, motivoEscalonamento: null } })
  await db.mktAtendimentoMsg.create({ data: { tenantId, atendimentoId: at.id, autor: 'VISITANTE', texto } })
  // Pedido de saída (SAIR/PARAR...) em qualquer canal => supressão global.
  const saida = canal === 'SITE' ? { optOut: false } : await tratarEntrada(tenantId, canal, sessao, texto)
  if (saida.optOut) {
    const msg = 'Pronto! Você não receberá mais mensagens de divulgação, em nenhum canal.'
    await db.mktAtendimentoMsg.create({ data: { tenantId, atendimentoId: at.id, autor: 'IA', texto: msg, intencao: 'SAIR', confianca: 1, simulado: true } })
    await db.mktAtendimento.update({ where: { id: at.id }, data: { status: 'ENCERRADO', ultimaMensagemEm: new Date() } })
    return { atendimentoId: at.id, resposta: msg, status: 'ENCERRADO', escalonado: false, intencao: 'SAIR', optOut: true }
  }
  if (at.status === 'ESCALONADO') {
    await db.mktAtendimento.update({ where: { id: at.id }, data: { ultimaMensagemEm: new Date() } })
    return { atendimentoId: at.id, resposta: null, status: 'ESCALONADO', escalonado: true, aviso: `Seu atendimento está com ${at.consultorNome ?? 'um consultor'}. Aguarde o retorno.` }
  }
  const hist = (await db.mktAtendimentoMsg.findMany({ where: { atendimentoId: at.id }, orderBy: { createdAt: 'desc' }, take: 8 })).reverse().map((m: any) => ({ autor: m.autor, texto: m.texto }))
  const r = await responder(tenantId, texto, hist, { clinicId: p.clinicId })
  await db.mktAtendimentoMsg.create({ data: { tenantId, atendimentoId: at.id, autor: 'IA', texto: r.texto, intencao: r.intencao, confianca: r.confianca, simulado: r.simulado } })
  const data: any = { ultimaMensagemEm: new Date() }
  if (at.primeiraRespostaMs == null) data.primeiraRespostaMs = Date.now() - t0
  let consultor: any = null
  if (r.escalonar) {
    consultor = await escolherConsultor(tenantId, null, null)
    Object.assign(data, { status: 'ESCALONADO', motivoEscalonamento: r.motivo, consultorId: consultor?.id, consultorNome: consultor?.nome })
    if (at.leadId) await registrarEvento(tenantId, at.leadId, 'SOLICITOU_CONTATO', { descricao: `Escalonado: ${r.motivo}`, dedupe: `esc:${at.id}` })
  }
  if (at.leadId) await registrarEvento(tenantId, at.leadId, 'RESPONDEU', { descricao: `Mensagem no canal ${canal}`, dedupe: `resp:${at.id}:${new Date().toISOString().slice(0, 13)}` })
  await db.mktAtendimento.update({ where: { id: at.id }, data })
  void getConfig
  return { atendimentoId: at.id, resposta: r.texto, status: r.escalonar ? 'ESCALONADO' : 'IA', escalonado: r.escalonar, motivo: r.motivo, intencao: r.intencao, confianca: r.confianca, simulado: r.simulado, consultor: consultor?.nome }
}
