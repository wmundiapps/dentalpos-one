import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { notify } from '../core/notify'
import { checarConsentimento } from '../comunicacao/store'
import { mascararEmail, mascararTelefone } from '../lgpd/mascara'
import { documentoVencido } from '../secretaria/logic'
import { ALUNO, ATENDE, AuthenticatedRequest, GESTAO, MOD, Response, asyncHandler, assertTenant, audit, exigirAluno, fail, isGestor, nomeUsuario, nomesUsuarios, numeroAnual, pageParams, parseBody, proximoSeq, qs, requireRole, tid, uid, urlRastreio } from './common'
import { entregar } from './canais'
import { emitirDocumentoAtd } from './emissao'
import { ETAPAS_PADRAO, EtapaModelo, addBusinessDays, calcularPrazosEtapas, etapasVisiveis, formatProtocolo, gerarCodigoRastreio, progressoJornada } from './logic'

const REF = 'AtdProtocolo'
const MAX_DATAURL = 2_800_000
export const ST_ABERTOS = ['ABERTO', 'EM_ANDAMENTO', 'PENDENTE_SOLICITANTE']

// ------------------------------------------------------------ eventos e notificações
export async function evento(p: { tenantId: string; protocoloId: string; tipo: string; titulo: string; descricao?: string; etapaCodigo?: string; userId?: string; visivel?: boolean; usuarioNome?: string }) {
  const nome = p.usuarioNome ?? (p.userId ? await nomeUsuario(p.tenantId, p.userId) : undefined)
  return prisma.atdEvento.create({ data: { tenantId: p.tenantId, protocoloId: p.protocoloId, tipo: p.tipo, titulo: p.titulo, descricao: p.descricao, etapaCodigo: p.etapaCodigo, usuarioId: p.userId, usuarioNome: nome, visivelSolicitante: p.visivel ?? false } })
}

async function destinos(p: { tenantId: string; studentId: string | null; solicitanteEmail: string | null; solicitanteTelefone: string | null }) {
  let email = p.solicitanteEmail, telefone = p.solicitanteTelefone, contatoId: string | undefined, userId: string | undefined
  if (p.studentId) {
    const st = await prisma.student.findFirst({ where: { id: p.studentId, tenantId: p.tenantId }, select: { userId: true } })
    userId = st?.userId
    if (st && (!email || !telefone)) { const u = await prisma.user.findFirst({ where: { id: st.userId, tenantId: p.tenantId }, select: { email: true, phone: true } }); email = email ?? u?.email ?? null; telefone = telefone ?? u?.phone ?? null }
    contatoId = (await prisma.comContato.findFirst({ where: { tenantId: p.tenantId, studentId: p.studentId }, select: { id: true } }))?.id
  }
  if (!contatoId && (email || telefone)) {
    const c = await prisma.comContato.findFirst({ where: { tenantId: p.tenantId, OR: [...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []), ...(telefone ? [{ telefone: { contains: telefone.replace(/\D/g, '').slice(-9) } }] : [])] }, select: { id: true } })
    contatoId = c?.id
  }
  return { email, telefone, contatoId, userId }
}

/** Notifica o solicitante da mudança de etapa: só etapas VISÍVEIS, respeitando opt-out (ComPreferencia) e o flag do protocolo. Canal simulado sem provedor. */
export async function notificarEtapa(protocoloId: string, etapaCodigo: string, assuntoExtra?: string) {
  const p = await prisma.atdProtocolo.findUnique({ where: { id: protocoloId } })
  if (!p) return []
  const cfg = await prisma.atdEtapaConfig.findFirst({ where: { tenantId: p.tenantId, codigo: etapaCodigo } })
  const etapa = await prisma.atdEtapa.findFirst({ where: { protocoloId, codigo: etapaCodigo } })
  if (cfg && (!cfg.visivelSolicitante || !cfg.notificar)) return []
  const nomeEtapa = cfg?.nome || etapa?.nome || etapaCodigo
  const assunto = assuntoExtra ?? `Atualização do seu protocolo ${p.numero}`
  const mensagem = `${cfg?.mensagemPublica ? cfg.mensagemPublica + ' ' : ''}Seu pedido "${p.servicoNome}" avançou: ${nomeEtapa}. Acompanhe pelo código ${p.codigoRastreio}: ${urlRastreio(p.codigoRastreio)}`
  const d = await destinos({ tenantId: p.tenantId, studentId: p.studentId, solicitanteEmail: p.solicitanteEmail, solicitanteTelefone: p.solicitanteTelefone })
  const out: any[] = []
  const registra = (canal: string, destino: string | null, status: string, motivo?: string) => prisma.atdNotificacao.create({ data: { tenantId: p.tenantId, protocoloId, canal, destino: destino ?? undefined, assunto, mensagem, etapaCodigo, status, motivo } })
  if (p.studentId) {
    await notify({ tenantId: p.tenantId, studentId: p.studentId, canal: 'IN_APP', assunto, mensagem, refType: REF, refId: p.id, templateKey: 'atendimento.protocolo.etapa' })
    out.push(await registra('IN_APP', null, 'ENFILEIRADA'))
  }
  const canal = d.telefone ? 'WHATSAPP' : d.email ? 'EMAIL' : null
  if (!canal) { if (!p.studentId) out.push(await registra('EMAIL', null, 'SEM_DESTINO', 'Solicitante sem e-mail/telefone informado.')); return out }
  const destino = canal === 'WHATSAPP' ? d.telefone! : d.email!
  const mask = canal === 'WHATSAPP' ? mascararTelefone(destino) : mascararEmail(destino)
  if (!p.notificar) { out.push(await registra(canal, mask, 'BLOQUEADA_OPTOUT', 'Solicitante optou por não receber notificações deste protocolo.')); return out }
  const cons = await checarConsentimento(p.tenantId, d.contatoId, canal, 'ACADEMICO')
  if (!cons.ok) { out.push(await registra(canal, mask, 'BLOQUEADA_OPTOUT', cons.motivo)); return out }
  const r = await entregar({ tenantId: p.tenantId, canal, destino, assunto, texto: mensagem, studentId: p.studentId, refId: p.id })
  out.push(await registra(canal, mask, r.ok ? (r.status === 'ENFILEIRADA' ? 'ENFILEIRADA' : 'ENVIADA_SIMULADA') : 'SEM_DESTINO', r.erro))
  return out
}

// ------------------------------------------------------------ abertura
export interface AbrirProtocolo {
  tenantId: string; servicoId?: string | null; assunto?: string; descricao?: string; studentId?: string | null
  solicitanteNome?: string; solicitanteEmail?: string | null; solicitanteTelefone?: string | null
  canal?: string; prioridade?: string; abertoPorId?: string; atendimentoId?: string | null; setorId?: string | null; dados?: unknown; origem?: 'PORTAL' | 'ATENDENTE'
}

export async function abrirProtocolo(i: AbrirProtocolo) {
  const { tenantId } = i
  const serv = i.servicoId ? await prisma.atdServico.findFirst({ where: { id: i.servicoId, tenantId, ativo: true }, include: { documentos: { orderBy: { ordem: 'asc' } } } }) : null
  if (i.servicoId && !serv) fail(404, 'Serviço não encontrado ou inativo.')
  let nome = i.solicitanteNome
  if (i.studentId) {
    const st = await prisma.student.findFirst({ where: { id: i.studentId, tenantId }, select: { nomeCompleto: true } })
    if (!st) fail(404, 'Aluno não encontrado.')
    nome = nome ?? st.nomeCompleto
  }
  if (!nome) fail(400, 'Informe o nome do solicitante ou o aluno.')
  const etapasModelo: EtapaModelo[] = Array.isArray(serv?.etapas) && (serv!.etapas as any[]).length ? (serv!.etapas as any) : ETAPAS_PADRAO
  const slaDias = serv?.prazoDias ?? 5
  const agora = new Date()
  const prazoEm = addBusinessDays(agora, slaDias)
  const prazos = calcularPrazosEtapas(etapasModelo, agora, slaDias, (d, n) => addBusinessDays(d, n))
  const setoresPorCod = new Map((await prisma.atdSetor.findMany({ where: { tenantId }, select: { id: true, codigo: true } })).map((s) => [s.codigo, s.id]))
  const setorId = i.setorId ?? serv?.setorId ?? null
  let criado: Awaited<ReturnType<typeof prisma.atdProtocolo.create>> | null = null
  for (let t = 0; t < 4 && !criado; t++) {
    const ano = agora.getFullYear()
    const seq = await proximoSeq(tenantId, `PROTOCOLO:${ano}`)
    try {
      criado = await prisma.atdProtocolo.create({
        data: {
          tenantId, numero: formatProtocolo(ano, seq), ano, seq, codigoRastreio: gerarCodigoRastreio(), servicoId: serv?.id, servicoNome: serv?.nome ?? i.assunto ?? 'Solicitação geral', assunto: i.assunto ?? serv?.nome ?? 'Solicitação',
          descricao: i.descricao, prioridade: i.prioridade ?? 'NORMAL', canal: i.canal ?? (i.origem === 'PORTAL' ? 'CHAT_PORTAL' : 'BALCAO'), studentId: i.studentId ?? undefined, solicitanteNome: nome, solicitanteEmail: i.solicitanteEmail ?? undefined, solicitanteTelefone: i.solicitanteTelefone ?? undefined,
          atendimentoId: i.atendimentoId ?? undefined, setorId, etapaAtualCodigo: etapasModelo[0].codigo, prazoEm, slaDias, taxaValor: serv?.taxa ?? 0, taxaStatus: (serv?.taxa ?? 0) > 0 ? 'PENDENTE' : 'ISENTA', abertoPorId: i.abertoPorId, resultado: (i.dados as any) ?? undefined,
          etapas: { create: etapasModelo.map((e, k) => ({ tenantId, ordem: k + 1, codigo: e.codigo, nome: e.nome, setorId: (e.setorCodigo && setoresPorCod.get(e.setorCodigo)) || setorId || undefined, prazoEm: prazos[k], status: k === 0 ? 'EM_ANDAMENTO' : 'PENDENTE', iniciadaEm: k === 0 ? agora : undefined })) },
          documentos: serv?.documentos.length ? { create: serv.documentos.map((d) => ({ tenantId, itemId: d.id, titulo: d.titulo, obrigatorio: d.obrigatorio, validadeDias: d.validadeDias })) } : undefined,
        },
      })
    } catch (e: any) { if (e?.code !== 'P2002') throw e }
  }
  if (!criado) fail(503, 'Não foi possível gerar o número do protocolo.')
  const p = criado
  await evento({ tenantId, protocoloId: p.id, tipo: 'ABERTURA', titulo: 'Protocolo aberto', descricao: `${p.servicoNome} (${p.numero})`, userId: i.abertoPorId, visivel: true, usuarioNome: i.abertoPorId ? undefined : 'Sistema' })
  if (p.taxaValor > 0 && p.studentId) {
    const ar = await prisma.accountReceivable.create({ data: { tenantId, studentId: p.studentId, descricao: `Taxa de serviço — ${p.servicoNome} (protocolo ${p.numero})`, valor: p.taxaValor, dataVencimento: addBusinessDays(agora, 5) } })
    await prisma.atdProtocolo.update({ where: { id: p.id }, data: { receivableId: ar.id } })
    await evento({ tenantId, protocoloId: p.id, tipo: 'TAXA', titulo: 'Taxa gerada', descricao: `Cobrança de R$ ${p.taxaValor.toFixed(2).replace('.', ',')} lançada no financeiro.`, visivel: true, usuarioNome: 'Sistema' })
  }
  if (i.atendimentoId) await prisma.atdAtendimento.updateMany({ where: { id: i.atendimentoId, tenantId }, data: { protocoloId: p.id } })
  // etapa RECEBIDO se conclui sozinha: protocolo aberto => recebido
  await concluirEtapaAtual(p.id, tenantId, undefined, 'Recebido', false)
  await audit({ tenantId, userId: i.abertoPorId, modulo: MOD, acao: 'PROTOCOLO_ABERTO', refType: REF, refId: p.id, detalhes: { numero: p.numero, servico: p.servicoNome } })
  return prisma.atdProtocolo.findUniqueOrThrow({ where: { id: p.id } })
}

// ------------------------------------------------------------ jornada
/** Conclui a etapa em andamento e inicia a próxima; ao acabar as etapas, conclui o protocolo. */
export async function concluirEtapaAtual(protocoloId: string, tenantId: string, userId?: string, observacao?: string, notificar = true) {
  const p = await prisma.atdProtocolo.findFirst({ where: { id: protocoloId, tenantId }, include: { etapas: { orderBy: { ordem: 'asc' } } } })
  if (!p) fail(404, 'Protocolo não encontrado.')
  const atual = p.etapas.find((e) => e.status === 'EM_ANDAMENTO')
  if (!atual) return { protocolo: p, concluido: p.status === 'CONCLUIDO' }
  const agora = new Date()
  const prox = p.etapas.find((e) => e.ordem > atual.ordem && e.status === 'PENDENTE')
  if (!prox) {
    if (observacao) await prisma.atdEtapa.update({ where: { id: atual.id }, data: { observacao } })
    return { protocolo: await concluirProtocolo(tenantId, p.id, 'DEFERIDO', undefined, userId, notificar), concluido: true }
  }
  await prisma.atdEtapa.update({ where: { id: atual.id }, data: { status: 'CONCLUIDA', concluidaEm: agora, observacao: observacao ?? atual.observacao } })
  const cfg = await prisma.atdEtapaConfig.findMany({ where: { tenantId } })
  const nomeCfg = (c: string, n: string) => cfg.find((x) => x.codigo === c)?.nome || n
  const visivel = (c: string) => cfg.find((x) => x.codigo === c)?.visivelSolicitante ?? true
  await prisma.atdEtapa.update({ where: { id: prox.id }, data: { status: 'EM_ANDAMENTO', iniciadaEm: agora } })
  await prisma.atdProtocolo.update({ where: { id: p.id }, data: { etapaAtualCodigo: prox.codigo, status: p.status === 'ABERTO' ? 'EM_ANDAMENTO' : p.status } })
  await evento({ tenantId, protocoloId: p.id, tipo: 'ETAPA', titulo: `${nomeCfg(prox.codigo, prox.nome)}`, descricao: observacao, etapaCodigo: prox.codigo, userId, visivel: visivel(prox.codigo), usuarioNome: userId ? undefined : 'Sistema' })
  if (notificar) await notificarEtapa(p.id, prox.codigo)
  return { protocolo: await prisma.atdProtocolo.findUniqueOrThrow({ where: { id: p.id } }), concluido: false }
}

export async function pendenciasDoProtocolo(tenantId: string, protocoloId: string) {
  const [docs, pend] = await Promise.all([
    prisma.atdDocumento.findMany({ where: { tenantId, protocoloId, obrigatorio: true, status: { not: 'APROVADO' } }, select: { titulo: true, status: true } }),
    prisma.atdPendencia.count({ where: { tenantId, protocoloId, status: { in: ['ABERTA', 'VENCIDA'] } } }),
  ])
  return { documentos: docs, pendenciasAbertas: pend }
}

export async function varrerPendencias(tenantId: string) {
  const vencidas = await prisma.atdPendencia.findMany({ where: { tenantId, status: 'ABERTA', prazoEm: { lt: new Date() } } })
  for (const v of vencidas) {
    await prisma.atdPendencia.update({ where: { id: v.id }, data: { status: 'VENCIDA' } })
    await evento({ tenantId, protocoloId: v.protocoloId, tipo: 'PENDENCIA', titulo: 'Prazo da pendência vencido', descricao: v.descricao, visivel: true, usuarioNome: 'Sistema' })
  }
  return vencidas.length
}

export async function carregarProtocolo(tenantId: string, id: string) {
  const p = await prisma.atdProtocolo.findFirst({ where: { id, tenantId } })
  if (!p) fail(404, 'Protocolo não encontrado.')
  return p
}

const semArquivo = { dataUrl: false } as const
export async function visaoCompleta(tenantId: string, p: { id: string; setorId: string | null; responsavelId: string | null; studentId: string | null; prazoEm: Date; status: string }) {
  const [etapas, eventos, documentos, pendencias, notificacoes, setores] = await Promise.all([
    prisma.atdEtapa.findMany({ where: { tenantId, protocoloId: p.id }, orderBy: { ordem: 'asc' } }),
    prisma.atdEvento.findMany({ where: { tenantId, protocoloId: p.id }, orderBy: { createdAt: 'asc' } }),
    prisma.atdDocumento.findMany({ where: { tenantId, protocoloId: p.id }, orderBy: { createdAt: 'asc' }, select: { id: true, itemId: true, titulo: true, obrigatorio: true, status: true, arquivoNome: true, mime: true, tamanho: true, origem: true, motivo: true, recebidoEm: true, conferidoEm: true, conferidoPorId: true, validadeDias: true, dataDocumento: true } }),
    prisma.atdPendencia.findMany({ where: { tenantId, protocoloId: p.id }, orderBy: { createdAt: 'asc' } }),
    prisma.atdNotificacao.findMany({ where: { tenantId, protocoloId: p.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.atdSetor.findMany({ where: { tenantId }, select: { id: true, nome: true } }),
  ])
  const us = await nomesUsuarios(tenantId, [p.responsavelId, ...etapas.map((e) => e.responsavelId)])
  const sn = new Map(setores.map((s) => [s.id, s.nome]))
  return {
    etapas: etapas.map((e) => ({ ...e, setor: e.setorId ? sn.get(e.setorId) : null, responsavel: e.responsavelId ? us[e.responsavelId] : null, atrasada: !!e.prazoEm && e.status !== 'CONCLUIDA' && e.status !== 'PULADA' && e.prazoEm < new Date() })),
    eventos, documentos, pendencias, notificacoes, setor: p.setorId ? sn.get(p.setorId) : null, responsavel: p.responsavelId ? us[p.responsavelId] : null, progresso: progressoJornada(etapas),
  }
}

export function mountProtocolos(router: Router) {
  // ------------------------------------------------------------ configuração da jornada por instituição
  router.get('/etapas-config', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await prisma.atdEtapaConfig.findMany({ where: { tenantId: tid(req) }, orderBy: [{ ordem: 'asc' }, { codigo: 'asc' }] }))
  }))
  router.put('/etapas-config', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ etapas: z.array(z.object({ codigo: z.string().regex(/^[A-Z0-9_]{2,30}$/), nome: z.string().min(2).max(80), visivelSolicitante: z.boolean(), mensagemPublica: z.string().max(300).nullish(), notificar: z.boolean().default(true), ordem: z.number().int().min(0).max(100).default(0) })).min(1).max(30) }), req.body)
    for (const e of b.etapas) await prisma.atdEtapaConfig.upsert({ where: { tenantId_codigo: { tenantId, codigo: e.codigo } }, create: { tenantId, ...e, mensagemPublica: e.mensagemPublica ?? undefined }, update: { nome: e.nome, visivelSolicitante: e.visivelSolicitante, mensagemPublica: e.mensagemPublica ?? null, notificar: e.notificar, ordem: e.ordem } })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'JORNADA_CONFIG_ATUALIZADA', detalhes: { ocultas: b.etapas.filter((e) => !e.visivelSolicitante).map((e) => e.codigo) } })
    res.json(await prisma.atdEtapaConfig.findMany({ where: { tenantId }, orderBy: [{ ordem: 'asc' }, { codigo: 'asc' }] }))
  }))

  // ------------------------------------------------------------ protocolos
  router.get('/protocolos', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    await varrerPendencias(tenantId)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'setorId', 'studentId', 'servicoId', 'prioridade', 'etapaAtualCodigo']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    if (where.status === 'ABERTOS') where.status = { in: ST_ABERTOS }
    if (qs(req.query.minha) === '1') where.responsavelId = uid(req)
    if (qs(req.query.atrasados) === '1') { where.prazoEm = { lt: new Date() }; where.status = { in: ST_ABERTOS } }
    const q = qs(req.query.q)
    if (q) where.OR = [{ numero: { contains: q, mode: 'insensitive' } }, { codigoRastreio: { contains: q.toUpperCase() } }, { solicitanteNome: { contains: q, mode: 'insensitive' } }, { servicoNome: { contains: q, mode: 'insensitive' } }]
    const [items, total] = await Promise.all([prisma.atdProtocolo.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.atdProtocolo.count({ where })])
    const agora = new Date()
    const pend = await prisma.atdPendencia.groupBy({ by: ['protocoloId'], where: { tenantId, protocoloId: { in: items.map((i) => i.id) }, status: { in: ['ABERTA', 'VENCIDA'] } }, _count: true })
    const pm = new Map(pend.map((x) => [x.protocoloId, x._count]))
    res.json({ items: items.map((p) => ({ ...p, atrasado: ST_ABERTOS.includes(p.status) && p.prazoEm < agora, pendenciasAbertas: pm.get(p.id) ?? 0 })), total, page, pageSize })
  }))

  router.post('/protocolos', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({
      servicoId: z.string().optional(), assunto: z.string().min(3).max(200).optional(), descricao: z.string().max(4000).optional(), studentId: z.string().optional(), solicitanteNome: z.string().min(2).max(160).optional(),
      solicitanteEmail: z.string().email().max(160).optional(), solicitanteTelefone: z.string().max(30).optional(), canal: z.string().max(20).optional(), prioridade: z.enum(['BAIXA', 'NORMAL', 'ALTA', 'URGENTE']).optional(), atendimentoId: z.string().optional(), setorId: z.string().optional(),
    }), req.body)
    if (!b.servicoId && !b.assunto) fail(400, 'Informe o serviço ou o assunto.')
    await assertTenant(tenantId, 'atdAtendimento', b.atendimentoId, 'Atendimento'); await assertTenant(tenantId, 'atdSetor', b.setorId, 'Setor')
    const p = await abrirProtocolo({ tenantId, ...b, abertoPorId: uid(req), origem: 'ATENDENTE' })
    const automacao = await executarAutomacao(tenantId, p.id, uid(req))
    res.status(201).json({ ...(await prisma.atdProtocolo.findUniqueOrThrow({ where: { id: p.id } })), automacao })
  }))

  router.get('/protocolos/:id', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    await varrerPendencias(tenantId)
    const p = await carregarProtocolo(tenantId, String(req.params.id))
    const [v, aluno, servico] = await Promise.all([
      visaoCompleta(tenantId, p),
      p.studentId ? prisma.student.findFirst({ where: { id: p.studentId, tenantId }, select: { id: true, nomeCompleto: true, ra: true } }) : null,
      p.servicoId ? prisma.atdServico.findFirst({ where: { id: p.servicoId, tenantId }, select: { id: true, nome: true, automacao: true } }) : null,
    ])
    res.json({ ...p, ...v, aluno, servico, atrasado: ST_ABERTOS.includes(p.status) && p.prazoEm < new Date(), linkRastreio: urlRastreio(p.codigoRastreio) })
  }))

  router.post('/protocolos/:id/avancar', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await carregarProtocolo(tenantId, String(req.params.id))
    if (!ST_ABERTOS.includes(p.status)) fail(409, `Protocolo ${p.status}: não é possível avançar.`)
    const b = parseBody(z.object({ observacao: z.string().max(1000).optional(), forcar: z.boolean().optional() }), req.body ?? {})
    if (p.status === 'PENDENTE_SOLICITANTE' && !b.forcar) fail(409, 'Há pendências com o solicitante. Resolva-as ou use "forçar" (gestão).')
    if (p.taxaStatus === 'PENDENTE' && !(b.forcar && isGestor(req))) fail(409, 'Taxa pendente de pagamento: o pedido só avança após a quitação.')
    const atual = await prisma.atdEtapa.findFirst({ where: { protocoloId: p.id, status: 'EM_ANDAMENTO' } })
    if (atual?.codigo === 'CONFERENCIA') {
      const pend = await pendenciasDoProtocolo(tenantId, p.id)
      if (pend.documentos.length && !(b.forcar && isGestor(req))) return void res.status(422).json({ error: 'Conferência incompleta: documentos obrigatórios sem aprovação.', pendencias: pend.documentos.map((d) => `${d.titulo} (${d.status})`) })
    }
    const r = await concluirEtapaAtual(p.id, tenantId, uid(req), b.observacao)
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'PROTOCOLO_ETAPA_AVANCADA', refType: REF, refId: p.id, detalhes: { de: atual?.codigo, concluido: r.concluido } })
    res.json(r.protocolo)
  }))

  router.patch('/protocolos/:id/etapas/:codigo', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await carregarProtocolo(tenantId, String(req.params.id))
    const e = await prisma.atdEtapa.findFirst({ where: { protocoloId: p.id, codigo: String(req.params.codigo) } })
    if (!e) fail(404, 'Etapa não encontrada.')
    const b = parseBody(z.object({ responsavelId: z.string().nullish(), setorId: z.string().nullish(), prazoEm: z.coerce.date().optional(), observacao: z.string().max(1000).optional() }), req.body)
    await assertTenant(tenantId, 'user', b.responsavelId, 'Responsável'); await assertTenant(tenantId, 'atdSetor', b.setorId, 'Setor')
    const n = await prisma.atdEtapa.update({ where: { id: e.id }, data: { ...(b.responsavelId !== undefined ? { responsavelId: b.responsavelId } : {}), ...(b.setorId !== undefined ? { setorId: b.setorId } : {}), ...(b.prazoEm ? { prazoEm: b.prazoEm } : {}), ...(b.observacao !== undefined ? { observacao: b.observacao } : {}) } })
    if (b.responsavelId && e.status === 'EM_ANDAMENTO') await prisma.atdProtocolo.update({ where: { id: p.id }, data: { responsavelId: b.responsavelId } })
    await evento({ tenantId, protocoloId: p.id, tipo: 'ATRIBUICAO', titulo: `Etapa ${e.nome}: responsável/prazo atualizado`, etapaCodigo: e.codigo, userId: uid(req), visivel: false })
    res.json(n)
  }))

  router.post('/protocolos/:id/comentario', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await carregarProtocolo(tenantId, String(req.params.id))
    const b = parseBody(z.object({ texto: z.string().min(1).max(2000), visivelSolicitante: z.boolean().default(false) }), req.body)
    res.status(201).json(await evento({ tenantId, protocoloId: p.id, tipo: 'COMENTARIO', titulo: b.visivelSolicitante ? 'Mensagem da instituição' : 'Nota interna', descricao: b.texto, userId: uid(req), visivel: b.visivelSolicitante }))
  }))

  router.post('/protocolos/:id/concluir', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await carregarProtocolo(tenantId, String(req.params.id))
    if (!ST_ABERTOS.includes(p.status)) fail(409, `Protocolo já ${p.status}.`)
    const b = parseBody(z.object({ decisao: z.enum(['DEFERIDO', 'INDEFERIDO']), motivo: z.string().max(1000).optional() }), req.body)
    if (b.decisao === 'INDEFERIDO' && !b.motivo) fail(400, 'Informe o motivo do indeferimento.')
    if (b.decisao === 'DEFERIDO' && p.taxaStatus === 'PENDENTE') fail(409, 'Taxa pendente de pagamento.')
    const out = await concluirProtocolo(tenantId, p.id, b.decisao, b.motivo, uid(req))
    res.json(out)
  }))

  router.post('/protocolos/:id/cancelar', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await carregarProtocolo(tenantId, String(req.params.id))
    if (!ST_ABERTOS.includes(p.status)) fail(409, `Protocolo já ${p.status}.`)
    const b = parseBody(z.object({ motivo: z.string().min(3).max(500) }), req.body)
    if (p.receivableId && p.taxaStatus === 'PENDENTE') await prisma.accountReceivable.updateMany({ where: { id: p.receivableId, tenantId, status: 'PENDENTE' }, data: { status: 'CANCELADO' } })
    await prisma.atdPendencia.updateMany({ where: { protocoloId: p.id, status: { in: ['ABERTA', 'VENCIDA'] } }, data: { status: 'CANCELADA' } })
    const n = await prisma.atdProtocolo.update({ where: { id: p.id }, data: { status: 'CANCELADO', decisao: 'CANCELADO', decisaoMotivo: b.motivo, concluidoEm: new Date(), ...(p.taxaStatus === 'PENDENTE' ? { taxaStatus: 'CANCELADA' } : {}) } })
    await evento({ tenantId, protocoloId: p.id, tipo: 'DECISAO', titulo: 'Protocolo cancelado', descricao: b.motivo, userId: uid(req), visivel: true })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'PROTOCOLO_CANCELADO', refType: REF, refId: p.id })
    res.json(n)
  }))

  router.post('/protocolos/:id/sincronizar-taxa', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await sincronizarTaxa(tid(req), String(req.params.id), uid(req)))
  }))
  router.post('/protocolos/:id/isentar-taxa', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await carregarProtocolo(tenantId, String(req.params.id))
    if (p.taxaStatus !== 'PENDENTE') fail(409, 'Não há taxa pendente.')
    const b = parseBody(z.object({ motivo: z.string().min(5).max(300) }), req.body)
    if (p.receivableId) await prisma.accountReceivable.updateMany({ where: { id: p.receivableId, tenantId, status: 'PENDENTE' }, data: { status: 'CANCELADO' } })
    await prisma.atdProtocolo.update({ where: { id: p.id }, data: { taxaStatus: 'ISENTA' } })
    await evento({ tenantId, protocoloId: p.id, tipo: 'TAXA', titulo: 'Taxa isentada', descricao: b.motivo, userId: uid(req), visivel: true })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'TAXA_ISENTADA', refType: REF, refId: p.id, detalhes: { motivo: b.motivo } })
    res.json({ ok: true, automacao: await executarAutomacao(tenantId, p.id, uid(req)) })
  }))

  // ------------------------------------------------------------ documentos recebidos e conferência
  router.get('/documentos-recebidos', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    const st = qs(req.query.status); if (st) where.status = st
    const prot = qs(req.query.protocoloId); if (prot) where.protocoloId = prot
    const q = qs(req.query.q); if (q) where.titulo = { contains: q, mode: 'insensitive' }
    const [items, total] = await Promise.all([prisma.atdDocumento.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take, select: { id: true, protocoloId: true, titulo: true, obrigatorio: true, status: true, arquivoNome: true, mime: true, tamanho: true, origem: true, motivo: true, recebidoEm: true, conferidoEm: true, validadeDias: true, dataDocumento: true } }), prisma.atdDocumento.count({ where })])
    const ps = await prisma.atdProtocolo.findMany({ where: { tenantId, id: { in: items.map((i) => i.protocoloId) } }, select: { id: true, numero: true, solicitanteNome: true, servicoNome: true } })
    const pm = new Map(ps.map((p) => [p.id, p]))
    res.json({ items: items.map((d) => ({ ...d, protocolo: pm.get(d.protocoloId) })), total, page, pageSize })
  }))

  router.post('/protocolos/:id/documentos', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await carregarProtocolo(tenantId, String(req.params.id))
    res.status(201).json(await receberDocumento(tenantId, p, req.body, uid(req), 'BALCAO', false))
  }))

  router.get('/documentos/:docId/download', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const d = await prisma.atdDocumento.findFirst({ where: { id: String(req.params.docId), tenantId } })
    if (!d || (!d.dataUrl && !d.url)) fail(404, 'Arquivo não encontrado.')
    await audit({ tenantId, userId: uid(req), modulo: `${MOD}.documentos`, acao: 'DOCUMENTO_BAIXADO', refType: 'AtdDocumento', refId: d.id })
    if (!d.dataUrl) return void res.json({ url: d.url, nome: d.arquivoNome })
    const buf = Buffer.from(d.dataUrl.slice(d.dataUrl.indexOf(',') + 1), 'base64')
    res.setHeader('Content-Type', 'application/octet-stream'); res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Disposition', `attachment; filename="${(d.arquivoNome ?? 'documento').replace(/[^\w.\- ]+/g, '_').slice(0, 120)}"`)
    res.send(buf)
  }))

  router.post('/documentos/:docId/conferir', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const d = await prisma.atdDocumento.findFirst({ where: { id: String(req.params.docId), tenantId } })
    if (!d) fail(404, 'Documento não encontrado.')
    if (d.status === 'PENDENTE') fail(409, 'Documento ainda não foi recebido.')
    const b = parseBody(z.object({ decisao: z.enum(['APROVAR', 'REJEITAR']), motivo: z.string().max(500).optional(), prazoDias: z.number().int().min(1).max(60).default(5) }), req.body)
    const p = await carregarProtocolo(tenantId, d.protocoloId)
    if (!ST_ABERTOS.includes(p.status)) fail(409, 'Protocolo encerrado.')
    let decisao = b.decisao, motivo = b.motivo
    if (decisao === 'APROVAR' && documentoVencido(d.dataDocumento, d.validadeDias)) { decisao = 'REJEITAR'; motivo = `Documento fora da validade de ${d.validadeDias} dias.` }
    if (decisao === 'REJEITAR' && !motivo) fail(400, 'Informe o motivo da rejeição.')
    await prisma.atdDocumento.update({ where: { id: d.id }, data: { status: decisao === 'APROVAR' ? 'APROVADO' : 'REJEITADO', motivo: decisao === 'APROVAR' ? null : motivo, conferidoPorId: uid(req), conferidoEm: new Date() } })
    if (decisao === 'REJEITAR') {
      const prazoEm = addBusinessDays(new Date(), b.prazoDias)
      await prisma.atdPendencia.create({ data: { tenantId, protocoloId: p.id, tipo: 'DOCUMENTO', descricao: `Reenviar "${d.titulo}": ${motivo}`, documentoId: d.id, prazoEm, criadoPorId: uid(req) } })
      await prisma.atdProtocolo.update({ where: { id: p.id }, data: { status: 'PENDENTE_SOLICITANTE' } })
      await evento({ tenantId, protocoloId: p.id, tipo: 'PENDENCIA', titulo: 'Pendência de documento', descricao: `${d.titulo}: ${motivo}. Prazo até ${prazoEm.toLocaleDateString('pt-BR')}.`, userId: uid(req), visivel: true })
      await notificarEtapa(p.id, 'CONFERENCIA', `Pendência no protocolo ${p.numero}`)
    } else await evento({ tenantId, protocoloId: p.id, tipo: 'DOCUMENTO', titulo: 'Documento aprovado', descricao: d.titulo, userId: uid(req), visivel: false })
    const pend = await pendenciasDoProtocolo(tenantId, p.id)
    await audit({ tenantId, userId: uid(req), modulo: `${MOD}.documentos`, acao: decisao === 'APROVAR' ? 'DOCUMENTO_APROVADO' : 'DOCUMENTO_REJEITADO', refType: 'AtdDocumento', refId: d.id })
    res.json({ ok: true, decisao, conferenciaCompleta: pend.documentos.length === 0 && pend.pendenciasAbertas === 0 })
  }))

  // ------------------------------------------------------------ pendências com prazo
  router.get('/pendencias', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    await varrerPendencias(tenantId)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    const st = qs(req.query.status); if (st === 'ABERTAS') where.status = { in: ['ABERTA', 'VENCIDA'] }; else if (st) where.status = st
    const [items, total] = await Promise.all([prisma.atdPendencia.findMany({ where, orderBy: { prazoEm: 'asc' }, skip, take }), prisma.atdPendencia.count({ where })])
    const ps = await prisma.atdProtocolo.findMany({ where: { tenantId, id: { in: items.map((i) => i.protocoloId) } }, select: { id: true, numero: true, solicitanteNome: true, servicoNome: true } })
    const pm = new Map(ps.map((p) => [p.id, p]))
    res.json({ items: items.map((x) => ({ ...x, protocolo: pm.get(x.protocoloId) })), total, page, pageSize })
  }))
  router.post('/protocolos/:id/pendencias', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await carregarProtocolo(tenantId, String(req.params.id))
    if (!ST_ABERTOS.includes(p.status)) fail(409, 'Protocolo encerrado.')
    const b = parseBody(z.object({ tipo: z.enum(['DOCUMENTO', 'INFORMACAO', 'PAGAMENTO']).default('INFORMACAO'), descricao: z.string().min(3).max(500), prazoDias: z.number().int().min(1).max(60).default(5), documentoId: z.string().optional() }), req.body)
    await assertTenant(tenantId, 'atdDocumento', b.documentoId, 'Documento')
    const prazoEm = addBusinessDays(new Date(), b.prazoDias)
    const x = await prisma.atdPendencia.create({ data: { tenantId, protocoloId: p.id, tipo: b.tipo, descricao: b.descricao, documentoId: b.documentoId, prazoEm, criadoPorId: uid(req) } })
    await prisma.atdProtocolo.update({ where: { id: p.id }, data: { status: 'PENDENTE_SOLICITANTE' } })
    await evento({ tenantId, protocoloId: p.id, tipo: 'PENDENCIA', titulo: 'Pendência com o solicitante', descricao: `${b.descricao} Prazo até ${prazoEm.toLocaleDateString('pt-BR')}.`, userId: uid(req), visivel: true })
    await notificarEtapa(p.id, p.etapaAtualCodigo ?? 'CONFERENCIA', `Pendência no protocolo ${p.numero}`)
    res.status(201).json(x)
  }))
  router.post('/pendencias/:pid/resolver', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const x = await prisma.atdPendencia.findFirst({ where: { id: String(req.params.pid), tenantId } })
    if (!x) fail(404, 'Pendência não encontrada.')
    if (['ATENDIDA', 'CANCELADA'].includes(x.status)) fail(409, `Pendência já ${x.status}.`)
    await prisma.atdPendencia.update({ where: { id: x.id }, data: { status: 'ATENDIDA', resolvidaEm: new Date() } })
    await liberarSePendenciasResolvidas(tenantId, x.protocoloId)
    await evento({ tenantId, protocoloId: x.protocoloId, tipo: 'PENDENCIA', titulo: 'Pendência atendida', descricao: x.descricao, userId: uid(req), visivel: true })
    res.json({ ok: true })
  }))

  // ------------------------------------------------------------ portal do aluno
  router.get('/portal/protocolos', requireRole(...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const items = await prisma.atdProtocolo.findMany({ where: { tenantId: tid(req), studentId: exigirAluno(req) }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, numero: true, codigoRastreio: true, servicoNome: true, status: true, prazoEm: true, createdAt: true, concluidoEm: true, taxaStatus: true, taxaValor: true, documentoEmitidoId: true } })
    res.json(items)
  }))
  router.get('/portal/protocolos/:id', requireRole(...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.atdProtocolo.findFirst({ where: { id: String(req.params.id), tenantId, studentId: exigirAluno(req) } })
    if (!p) fail(404, 'Protocolo não encontrado.')
    await varrerPendencias(tenantId)
    const [etapas, cfg, eventos, docs, pend] = await Promise.all([
      prisma.atdEtapa.findMany({ where: { protocoloId: p.id }, orderBy: { ordem: 'asc' } }),
      prisma.atdEtapaConfig.findMany({ where: { tenantId } }),
      prisma.atdEvento.findMany({ where: { protocoloId: p.id, visivelSolicitante: true }, orderBy: { createdAt: 'asc' }, select: { id: true, titulo: true, descricao: true, createdAt: true, etapaCodigo: true } }),
      prisma.atdDocumento.findMany({ where: { protocoloId: p.id }, select: { id: true, titulo: true, obrigatorio: true, status: true, motivo: true, arquivoNome: true } }),
      prisma.atdPendencia.findMany({ where: { protocoloId: p.id, status: { in: ['ABERTA', 'VENCIDA'] } }, select: { id: true, descricao: true, prazoEm: true, status: true, tipo: true } }),
    ])
    res.json({ id: p.id, numero: p.numero, codigoRastreio: p.codigoRastreio, servicoNome: p.servicoNome, status: p.status, prazoEm: p.prazoEm, taxaValor: p.taxaValor, taxaStatus: p.taxaStatus, documentoEmitidoId: p.documentoEmitidoId, resultado: p.resultado, etapas: etapasVisiveis(etapas, cfg), eventos, documentos: docs, pendencias: pend, notificar: p.notificar })
  }))
  router.post('/portal/protocolos/:id/documentos', requireRole(...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.atdProtocolo.findFirst({ where: { id: String(req.params.id), tenantId, studentId: exigirAluno(req) } })
    if (!p) fail(404, 'Protocolo não encontrado.')
    const d = await receberDocumento(tenantId, p, req.body, undefined, 'PORTAL', true)
    res.status(201).json({ id: d.id, status: d.status, titulo: d.titulo })
  }))
  router.post('/portal/protocolos/:id/sincronizar-taxa', requireRole(...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.atdProtocolo.findFirst({ where: { id: String(req.params.id), tenantId, studentId: exigirAluno(req) } })
    if (!p) fail(404, 'Protocolo não encontrado.')
    const r = await sincronizarTaxa(tenantId, p.id)
    res.json({ status: r.protocolo.status, taxaStatus: r.protocolo.taxaStatus, automacao: r.automacao })
  }))
  router.post('/portal/protocolos/:id/notificacoes', requireRole(...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.atdProtocolo.findFirst({ where: { id: String(req.params.id), tenantId, studentId: exigirAluno(req) } })
    if (!p) fail(404, 'Protocolo não encontrado.')
    const b = parseBody(z.object({ receber: z.boolean() }), req.body)
    await prisma.atdProtocolo.update({ where: { id: p.id }, data: { notificar: b.receber } })
    res.json({ notificar: b.receber })
  }))
}

export async function liberarSePendenciasResolvidas(tenantId: string, protocoloId: string) {
  const aberta = await prisma.atdPendencia.count({ where: { tenantId, protocoloId, status: { in: ['ABERTA', 'VENCIDA'] } } })
  if (!aberta) await prisma.atdProtocolo.updateMany({ where: { id: protocoloId, tenantId, status: 'PENDENTE_SOLICITANTE' }, data: { status: 'EM_ANDAMENTO' } })
}

/** Recebe um arquivo para o protocolo (checklist ou avulso). O corpo já passou pelo uploadGuard global. */
export async function receberDocumento(tenantId: string, p: { id: string; status: string }, body: any, userId: string | undefined, origem: string, aluno: boolean) {
  if (!ST_ABERTOS.includes(p.status)) fail(409, 'Protocolo encerrado: não recebe documentos.')
  const b = parseBody(z.object({
    itemId: z.string().optional(), docId: z.string().optional(), titulo: z.string().min(2).max(160).optional(), arquivoNome: z.string().min(1).max(200), mime: z.string().max(120).optional(),
    dataUrl: z.string().max(MAX_DATAURL).optional(), url: z.string().url().max(2000).optional(), dataDocumento: z.coerce.date().optional(), origem: z.enum(['BALCAO', 'PORTAL', 'EMAIL', 'WHATSAPP']).optional(),
  }), body)
  if (!b.dataUrl && !b.url) fail(400, 'Informe dataUrl (base64) ou url (https).')
  if (b.url && !/^https:\/\//i.test(b.url)) fail(400, 'url deve usar https.')
  if (b.dataUrl && !/^data:[\w.+/-]+;base64,/i.test(b.dataUrl)) fail(400, 'dataUrl inválido (esperado data:<tipo>;base64,...).')
  const tamanho = b.dataUrl ? Math.floor(((b.dataUrl.length - b.dataUrl.indexOf(',') - 1) * 3) / 4) : undefined
  const mime = b.mime || (b.dataUrl ? b.dataUrl.slice(5, b.dataUrl.indexOf(';')) : undefined)
  const dados = { arquivoNome: b.arquivoNome, mime, tamanho, dataUrl: b.dataUrl, url: b.url, dataDocumento: b.dataDocumento, origem: aluno ? 'PORTAL' : b.origem ?? origem, status: 'RECEBIDO', recebidoEm: new Date(), recebidoPorId: userId, motivo: null, conferidoEm: null, conferidoPorId: null }
  let alvo = b.docId || b.itemId ? await prisma.atdDocumento.findFirst({ where: { tenantId, protocoloId: p.id, ...(b.docId ? { id: b.docId } : { itemId: b.itemId }) } }) : null
  if ((b.docId || b.itemId) && !alvo) fail(404, 'Item do checklist não encontrado neste protocolo.')
  if (alvo?.status === 'APROVADO') fail(409, 'Este documento já foi aprovado.')
  const doc = alvo
    ? await prisma.atdDocumento.update({ where: { id: alvo.id }, data: dados as any })
    : await prisma.atdDocumento.create({ data: { tenantId, protocoloId: p.id, titulo: b.titulo ?? b.arquivoNome, obrigatorio: false, ...dados } as any })
  await evento({ tenantId, protocoloId: p.id, tipo: 'DOCUMENTO', titulo: 'Documento recebido', descricao: doc.titulo, userId, visivel: true, usuarioNome: aluno ? 'Solicitante' : undefined })
  if (alvo) {
    const pend = await prisma.atdPendencia.findMany({ where: { tenantId, protocoloId: p.id, documentoId: doc.id, status: { in: ['ABERTA', 'VENCIDA'] } } })
    for (const x of pend) await prisma.atdPendencia.update({ where: { id: x.id }, data: { status: 'ATENDIDA', resolvidaEm: new Date() } })
    await liberarSePendenciasResolvidas(tenantId, p.id)
  }
  await audit({ tenantId, userId, modulo: `${MOD}.documentos`, acao: 'DOCUMENTO_RECEBIDO', refType: 'AtdDocumento', refId: doc.id, detalhes: { origem: dados.origem, tamanho } })
  return doc
}

/** Encerra o protocolo (todas as etapas restantes são concluídas/puladas) com decisão e efeitos finais. */
export async function concluirProtocolo(tenantId: string, id: string, decisao: 'DEFERIDO' | 'INDEFERIDO', motivo: string | undefined, userId?: string, notificar = true) {
  const p = await prisma.atdProtocolo.findFirstOrThrow({ where: { id, tenantId }, include: { etapas: true } })
  const agora = new Date()
  const fim = decisao === 'DEFERIDO'
  let documentoId = p.documentoEmitidoId
  let sv: { automacao: string; modeloId: string | null } | null = null
  if (p.servicoId) sv = await prisma.atdServico.findFirst({ where: { id: p.servicoId, tenantId }, select: { automacao: true, modeloId: true } })
  if (fim && sv?.automacao === 'EMITIR_DOCUMENTO' && sv.modeloId && p.studentId && !documentoId) {
    const doc = await emitirDocumentoAtd({ tenantId, modeloId: sv.modeloId, studentId: p.studentId, userId, protocoloId: p.id, taxaValor: p.taxaValor, receivableId: p.receivableId, extras: (p.resultado as any)?.extras })
    documentoId = doc.id
    await evento({ tenantId, protocoloId: p.id, tipo: 'EMISSAO', titulo: 'Documento emitido', descricao: `${doc.titulo} nº ${doc.numero}`, userId, visivel: true, usuarioNome: userId ? undefined : 'Sistema' })
  }
  for (const e of p.etapas.filter((x) => x.status === 'PENDENTE' || x.status === 'EM_ANDAMENTO')) await prisma.atdEtapa.update({ where: { id: e.id }, data: { status: fim ? 'CONCLUIDA' : 'PULADA', concluidaEm: agora, iniciadaEm: e.iniciadaEm ?? agora } })
  await prisma.atdPendencia.updateMany({ where: { protocoloId: p.id, status: { in: ['ABERTA', 'VENCIDA'] } }, data: { status: 'CANCELADA' } })
  const n = await prisma.atdProtocolo.update({ where: { id: p.id }, data: { status: fim ? 'CONCLUIDO' : 'INDEFERIDO', decisao, decisaoMotivo: motivo, concluidoEm: agora, documentoEmitidoId: documentoId ?? undefined } })
  await evento({ tenantId, protocoloId: p.id, tipo: 'DECISAO', titulo: fim ? 'Pedido deferido e concluído' : 'Pedido indeferido', descricao: motivo, userId, visivel: true, usuarioNome: userId ? undefined : 'Sistema' })
  if (notificar) await notificarEtapa(p.id, p.etapas[p.etapas.length - 1]?.codigo ?? 'ENTREGUE', fim ? `Protocolo ${p.numero} concluído` : `Protocolo ${p.numero} indeferido`)
  // efeito final do serviço
  if (fim && p.servicoId && p.studentId) {
    if (sv?.automacao === 'TRANCAMENTO') {
      const mats = await prisma.enrollment.findMany({ where: { studentId: p.studentId, status: 'ATIVA' }, select: { id: true } })
      if (mats.length) {
        await prisma.enrollment.updateMany({ where: { id: { in: mats.map((m) => m.id) } }, data: { status: 'TRANCADA' } })
        await prisma.student.updateMany({ where: { id: p.studentId, tenantId }, data: { status: 'TRANCADO' } })
        await evento({ tenantId, protocoloId: p.id, tipo: 'DECISAO', titulo: 'Matrícula trancada', descricao: `${mats.length} matrícula(s) trancada(s) automaticamente.`, userId, visivel: true, usuarioNome: userId ? undefined : 'Sistema' })
        await audit({ tenantId, userId, modulo: MOD, acao: 'MATRICULA_TRANCADA', refType: REF, refId: p.id, detalhes: { studentId: p.studentId } })
      }
    }
  }
  await audit({ tenantId, userId, modulo: MOD, acao: fim ? 'PROTOCOLO_DEFERIDO' : 'PROTOCOLO_INDEFERIDO', refType: REF, refId: p.id })
  return n
}

// ------------------------------------------------------------ automações de autoatendimento
export async function sincronizarTaxa(tenantId: string, protocoloId: string, userId?: string) {
  const p = await carregarProtocolo(tenantId, protocoloId)
  if (p.taxaStatus === 'PENDENTE' && p.receivableId) {
    const ar = await prisma.accountReceivable.findFirst({ where: { id: p.receivableId, tenantId }, select: { status: true } })
    if (ar?.status === 'PAGO') { await prisma.atdProtocolo.update({ where: { id: p.id }, data: { taxaStatus: 'PAGA' } }); await evento({ tenantId, protocoloId: p.id, tipo: 'TAXA', titulo: 'Pagamento da taxa confirmado', visivel: true, usuarioNome: 'Sistema' }) }
    else if (ar?.status === 'CANCELADO') await prisma.atdProtocolo.update({ where: { id: p.id }, data: { taxaStatus: 'CANCELADA' } })
  }
  const r = await executarAutomacao(tenantId, protocoloId, userId)
  return { protocolo: await prisma.atdProtocolo.findUniqueOrThrow({ where: { id: protocoloId } }), automacao: r }
}

/** Executa a automação do serviço quando as condições estão satisfeitas (taxa paga, sem documentos exigidos). Idempotente. */
export async function executarAutomacao(tenantId: string, protocoloId: string, userId?: string): Promise<{ executada: boolean; motivo?: string; indeferido?: boolean }> {
  const p = await prisma.atdProtocolo.findFirst({ where: { id: protocoloId, tenantId } })
  if (!p || !ST_ABERTOS.includes(p.status) || !p.servicoId) return { executada: false, motivo: 'SEM_AUTOMACAO' }
  if (p.taxaStatus === 'PENDENTE') return { executada: false, motivo: 'AGUARDANDO_TAXA' }
  const sv = await prisma.atdServico.findFirst({ where: { id: p.servicoId, tenantId }, include: { documentos: true } })
  if (!sv || sv.automacao === 'NENHUMA') return { executada: false, motivo: 'SEM_AUTOMACAO' }
  const indeferir = async (motivo: string) => { await concluirProtocolo(tenantId, p.id, 'INDEFERIDO', motivo, userId); return { executada: true, indeferido: true, motivo } }
  const guardar = (r: unknown) => prisma.atdProtocolo.update({ where: { id: p.id }, data: { resultado: { ...((p.resultado as any) ?? {}), ...(r as any) } } })
  if (sv.automacao === 'EMITIR_DOCUMENTO') {
    if (sv.documentos.length) return { executada: false, motivo: 'DOCUMENTOS_PENDENTES' }
    try { await concluirProtocolo(tenantId, p.id, 'DEFERIDO', undefined, userId) } catch (e: any) { if (e?.status && e.status < 500) return indeferir(e.message); throw e }
    return { executada: true }
  }
  if (sv.automacao === 'SEGUNDA_VIA_BOLETO' || sv.automacao === 'CONSULTA_FINANCEIRA') {
    if (!p.studentId) return indeferir('Serviço disponível apenas para alunos.')
    const abertos = await prisma.accountReceivable.findMany({ where: { tenantId, studentId: p.studentId, status: { in: ['PENDENTE', 'ATRASADO'] } }, orderBy: { dataVencimento: 'asc' }, take: 12 })
    const hoje = new Date()
    await guardar({ cobrancas: abertos.map((c) => ({ id: c.id, descricao: c.descricao, valor: c.valor, vencimento: c.dataVencimento, emAtraso: c.dataVencimento < hoje, codigoCobranca: c.gatewayId ?? null })), totalAberto: abertos.reduce((s, c) => s + c.valor, 0), qtdEmAtraso: abertos.filter((c) => c.dataVencimento < hoje).length })
    await concluirProtocolo(tenantId, p.id, 'DEFERIDO', abertos.length ? undefined : 'Nenhuma cobrança em aberto.', userId)
    return { executada: true }
  }
  if (sv.automacao === 'TRANCAMENTO') {
    if (!p.studentId) return indeferir('Serviço disponível apenas para alunos.')
    const ativa = await prisma.enrollment.count({ where: { studentId: p.studentId, status: 'ATIVA' } })
    if (!ativa) return indeferir('Aluno não possui matrícula ativa para trancar.')
    return { executada: false, motivo: 'ANALISE_MANUAL' }
  }
  return { executada: false, motivo: 'SEM_AUTOMACAO' }
}
