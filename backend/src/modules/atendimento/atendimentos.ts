import { randomBytes } from 'crypto'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { acharOuCriarContato, registrarPreferencia } from '../comunicacao/store'
import { detectarOptOut } from '../comunicacao/pure'
import { ALUNO, ATENDE, AuthenticatedRequest, GESTAO, MOD, Response, asyncHandler, assertTenant, audit, exigirAluno, fail, isGestor, nomesUsuarios, numeroAnual, pageParams, parseBody, qs, requireRole, tid, uid } from './common'
import { entregar } from './canais'
import { classificar, getIaConfig, registrarUso, resumir, responder } from './ia'
import { ATD_ABERTOS, CANAIS, CANAL_COM, PRIORIDADES, STATUS_ATD, escolherMembro, slaPorPrioridade, statusSla } from './logic'

const REF = 'AtdAtendimento'
const db = prisma as any

// ------------------------------------------------------------ núcleo (reutilizado por portal, simulador e rotas)
export async function slaDoSetor(tenantId: string, setorId: string | null | undefined, prioridade: string) {
  const s = setorId ? await prisma.atdSetor.findFirst({ where: { id: setorId, tenantId } }) : null
  return slaPorPrioridade({ primeiraMin: s?.slaPrimeiraRespostaMin ?? 60, resolucaoMin: s?.slaResolucaoMin ?? 1440 }, prioridade)
}

export async function distribuir(tenantId: string, atendimentoId: string, userId?: string): Promise<string | null> {
  const a = await prisma.atdAtendimento.findFirst({ where: { id: atendimentoId, tenantId } })
  if (!a || !a.setorId || a.atribuidoAId) return a?.atribuidoAId ?? null
  const setor = await prisma.atdSetor.findFirst({ where: { id: a.setorId, tenantId }, include: { membros: { where: { ativo: true } } } })
  if (!setor || !setor.membros.length) return null
  const cargas = await prisma.atdAtendimento.groupBy({ by: ['atribuidoAId'], where: { tenantId, status: { in: ATD_ABERTOS }, atribuidoAId: { in: setor.membros.map((m) => m.userId) } }, _count: true })
  const mapa = new Map(cargas.map((c) => [c.atribuidoAId, c._count]))
  const escolhido = escolherMembro(setor.membros.map((m) => ({ userId: m.userId, capacidade: m.capacidade, ultimaAtribuicaoEm: m.ultimaAtribuicaoEm, abertos: mapa.get(m.userId) ?? 0 })), setor.distribuicao)
  if (!escolhido) return null
  await prisma.atdAtendimento.update({ where: { id: a.id }, data: { atribuidoAId: escolhido, status: a.status === 'NOVO' || a.status === 'EM_FILA' ? 'EM_ATENDIMENTO' : a.status } })
  await prisma.atdSetorMembro.updateMany({ where: { setorId: setor.id, userId: escolhido }, data: { ultimaAtribuicaoEm: new Date() } })
  await audit({ tenantId, userId, modulo: MOD, acao: 'ATENDIMENTO_DISTRIBUIDO', refType: REF, refId: a.id, detalhes: { para: escolhido, modo: setor.distribuicao } })
  return escolhido
}

async function contatoCom(tenantId: string, p: { canal: string; nome: string; contato?: string | null; studentId?: string | null }) {
  const tipo = CANAL_COM[p.canal]
  if (p.studentId) {
    const ex = await prisma.comContato.findFirst({ where: { tenantId, studentId: p.studentId } })
    if (ex) return ex
    const st = await prisma.student.findFirst({ where: { id: p.studentId, tenantId }, select: { nomeCompleto: true, userId: true } })
    if (st) return prisma.comContato.create({ data: { tenantId, tipo: 'ALUNO', nome: st.nomeCompleto, studentId: p.studentId, userId: st.userId } })
  }
  if (!tipo || !p.contato) return null
  const extra = p.canal === 'EMAIL' ? { email: p.contato } : ['WHATSAPP'].includes(p.canal) ? { telefone: p.contato } : {}
  return acharOuCriarContato(tenantId, tipo, p.contato, p.nome, extra)
}

export interface NovoAtd { tenantId: string; canal: string; assunto: string; solicitanteNome: string; solicitanteContato?: string | null; studentId?: string | null; prioridade?: string; setorId?: string | null; categoria?: string | null; origem?: string; criadoPorId?: string; textoInicial?: string; classificarIa?: boolean; tags?: string[] }

export async function criarAtendimento(n: NovoAtd) {
  const { tenantId } = n
  let prioridade = n.prioridade ?? 'NORMAL', setorId = n.setorId ?? null, categoria = n.categoria ?? null
  let confianca: number | undefined
  const alvoTexto = `${n.assunto}\n${n.textoInicial ?? ''}`
  if (n.classificarIa !== false && (!setorId || !categoria)) {
    const c = await classificar({ tenantId, texto: alvoTexto, userId: n.criadoPorId })
    setorId = setorId ?? c.setorId
    categoria = categoria ?? (c.categoria !== 'GERAL' ? c.categoria : null)
    if (!n.prioridade && c.prioridade !== 'NORMAL') prioridade = c.prioridade
    confianca = c.confianca
  }
  if (!setorId) { const g = await prisma.atdSetor.findFirst({ where: { tenantId, ativo: true }, orderBy: { createdAt: 'asc' } }); setorId = g?.id ?? null }
  const sla = await slaDoSetor(tenantId, setorId, prioridade)
  const agora = new Date()
  const { numero } = await numeroAnual(tenantId, 'ATD')
  const contato = await contatoCom(tenantId, { canal: n.canal, nome: n.solicitanteNome, contato: n.solicitanteContato, studentId: n.studentId })
  let conversaId: string | undefined
  const tipoCom = CANAL_COM[n.canal]
  if (contato && tipoCom) {
    const conv = await prisma.comConversa.create({ data: { tenantId, contatoId: contato.id, canalTipo: tipoCom as any, chaveExterna: n.solicitanteContato ?? contato.telefone ?? contato.email ?? undefined, assunto: n.assunto, status: 'ABERTA', botAtivo: false, ultimaMensagemEm: agora } })
    conversaId = conv.id
  }
  const a = await prisma.atdAtendimento.create({
    data: {
      tenantId, numero, canal: n.canal, assunto: n.assunto.slice(0, 200), categoria, status: setorId ? 'EM_FILA' : 'NOVO', prioridade, setorId, solicitanteNome: n.solicitanteNome, solicitanteContato: n.solicitanteContato ?? undefined,
      studentId: n.studentId ?? undefined, contatoId: contato?.id, conversaId, origem: n.origem ?? 'ATENDENTE', iaConfianca: confianca, tags: n.tags ?? [],
      slaPrimeiraRespostaEm: new Date(agora.getTime() + sla.primeiraMin * 60_000), slaResolucaoEm: new Date(agora.getTime() + sla.resolucaoMin * 60_000), criadoPorId: n.criadoPorId,
    },
  })
  if (n.textoInicial) await addMensagem({ tenantId, atendimentoId: a.id, direcao: 'ENTRADA', autorTipo: 'SOLICITANTE', conteudo: n.textoInicial })
  if (setorId) await distribuir(tenantId, a.id, n.criadoPorId)
  await audit({ tenantId, userId: n.criadoPorId, modulo: MOD, acao: 'ATENDIMENTO_ABERTO', refType: REF, refId: a.id, detalhes: { canal: n.canal, setorId, origem: n.origem } })
  return prisma.atdAtendimento.findUniqueOrThrow({ where: { id: a.id } })
}

export async function addMensagem(p: { tenantId: string; atendimentoId: string; direcao: 'ENTRADA' | 'SAIDA' | 'NOTA_INTERNA'; autorTipo: 'SOLICITANTE' | 'ATENDENTE' | 'IA' | 'SISTEMA'; autorId?: string; conteudo: string; status?: string; sugeridaPorIa?: boolean; confianca?: number }) {
  const m = await prisma.atdMensagem.create({ data: { tenantId: p.tenantId, atendimentoId: p.atendimentoId, direcao: p.direcao, autorTipo: p.autorTipo, autorId: p.autorId, conteudo: p.conteudo, status: p.status ?? 'REGISTRADA', sugeridaPorIa: p.sugeridaPorIa ?? false, confianca: p.confianca } })
  const a = await prisma.atdAtendimento.findUnique({ where: { id: p.atendimentoId }, select: { conversaId: true } })
  if (a?.conversaId) {
    await prisma.comMensagem.create({ data: { tenantId: p.tenantId, conversaId: a.conversaId, direcao: p.direcao, autorTipo: p.autorTipo === 'SOLICITANTE' ? 'CONTATO' : p.autorTipo === 'IA' ? 'BOT_IA' : p.autorTipo, autorId: p.autorId, conteudo: p.conteudo, status: p.status === 'FALHA' ? 'FALHA' : 'REGISTRADA' } }).catch(() => undefined)
    await prisma.comConversa.update({ where: { id: a.conversaId }, data: { ultimaMensagemEm: new Date(), ultimaDirecao: p.direcao === 'ENTRADA' ? 'ENTRADA' : 'SAIDA', ...(p.direcao === 'ENTRADA' ? { naoLidas: { increment: 1 } } : {}) } }).catch(() => undefined)
  }
  return m
}

/** Responde ao solicitante pelo canal do atendimento (simulado quando não há provedor) e registra a mensagem. */
export async function responderSolicitante(p: { tenantId: string; atendimento: { id: string; canal: string; solicitanteContato: string | null; studentId: string | null; assunto: string; primeiraRespostaEm: Date | null }; texto: string; autorTipo: 'ATENDENTE' | 'IA'; autorId?: string; confianca?: number }) {
  const r = p.atendimento.canal === 'CHAT_PORTAL' ? { ok: true, status: 'REGISTRADA' as const } : await entregar({ tenantId: p.tenantId, canal: p.atendimento.canal, destino: p.atendimento.solicitanteContato, assunto: `Re: ${p.atendimento.assunto}`, texto: p.texto, studentId: p.atendimento.studentId, refId: p.atendimento.id })
  const msg = await addMensagem({ tenantId: p.tenantId, atendimentoId: p.atendimento.id, direcao: 'SAIDA', autorTipo: p.autorTipo, autorId: p.autorId, conteudo: p.texto, status: r.status, confianca: p.confianca })
  const patch: any = { ultimaInteracaoEm: new Date(), naoLidas: 0 }
  if (p.autorTipo === 'ATENDENTE' && !p.atendimento.primeiraRespostaEm) patch.primeiraRespostaEm = new Date()
  await prisma.atdAtendimento.update({ where: { id: p.atendimento.id }, data: patch })
  return { msg, entrega: r }
}

/** Entrada de mensagem de um canal (simulado/real): reabre/continua o atendimento, aplica opt-out, responde pela IA ou escala. */
export async function processarEntrada(p: { tenantId: string; canal: string; nome: string; contato?: string | null; texto: string; studentId?: string | null; origem?: string }) {
  const { tenantId } = p
  const cfg = await getIaConfig(tenantId)
  let a = await prisma.atdAtendimento.findFirst({
    where: { tenantId, canal: p.canal, status: { in: ATD_ABERTOS }, ...(p.studentId ? { studentId: p.studentId } : { solicitanteContato: p.contato ?? '__nenhum__' }) },
    orderBy: { ultimaInteracaoEm: 'desc' },
  })
  const nova = !a
  if (!a) a = await criarAtendimento({ tenantId, canal: p.canal, assunto: p.texto.replace(/\s+/g, ' ').slice(0, 80), solicitanteNome: p.nome, solicitanteContato: p.contato, studentId: p.studentId, origem: p.origem ?? 'CANAL', textoInicial: p.texto })
  else {
    await addMensagem({ tenantId, atendimentoId: a.id, direcao: 'ENTRADA', autorTipo: 'SOLICITANTE', conteudo: p.texto })
    a = await prisma.atdAtendimento.update({ where: { id: a.id }, data: { naoLidas: { increment: 1 }, ultimaInteracaoEm: new Date(), ...(a.status === 'AGUARDANDO_SOLICITANTE' ? { status: a.atribuidoAId ? 'EM_ATENDIMENTO' : 'EM_FILA' } : {}) } })
  }
  const op = detectarOptOut(p.texto)
  if (op && a.contatoId) {
    await registrarPreferencia({ tenantId, contatoId: a.contatoId, canal: '*', finalidade: 'ACADEMICO', consentimento: op === 'OPT_IN', origem: 'MENSAGEM_SAIR', motivo: p.texto })
    const t = op === 'OPT_OUT' ? 'Pronto! Você não receberá mais notificações automáticas de andamento. Para voltar a receber, responda VOLTAR.' : 'Combinado! Você voltará a receber as notificações de andamento.'
    await responderSolicitante({ tenantId, atendimento: a, texto: t, autorTipo: 'IA' })
    return { atendimentoId: a.id, nova, resposta: t, tipo: 'OPT' as const, escalonado: false }
  }
  // resposta automática (somente se nenhum humano assumiu)
  const hoje = new Date(Date.now() - 86_400_000)
  const usosHoje = cfg.respostaAutomatica ? await prisma.atdIaUso.count({ where: { tenantId, tipo: 'RESPOSTA_AUTOMATICA', createdAt: { gte: hoje } } }) : 0
  const podeAuto = cfg.iaAtiva && cfg.respostaAutomatica && cfg.canaisAutomaticos.includes(p.canal) && !a.atribuidoAId && usosHoje < cfg.limiteDiarioAuto
  const r = await responder({ tenantId, texto: p.texto, tipo: podeAuto ? 'RESPOSTA_AUTOMATICA' : 'SUGERIR_RESPOSTA', atendimentoId: a.id, nomes: [p.nome], nomeSolicitante: p.nome })
  if (podeAuto && !r.escalonar && r.resposta) {
    await responderSolicitante({ tenantId, atendimento: a, texto: r.resposta, autorTipo: 'IA', confianca: r.confianca })
    await prisma.atdAtendimento.update({ where: { id: a.id }, data: { iaAtendeu: true, iaConfianca: r.confianca, status: 'AGUARDANDO_SOLICITANTE' } })
    return { atendimentoId: a.id, nova, resposta: r.resposta, confianca: r.confianca, tipo: 'IA' as const, escalonado: false }
  }
  // escalonamento humano: sugestão fica como nota interna para o atendente
  const motivo = r.bloqueadoSensivel ? 'Dado sensível detectado: IA não processou o conteúdo.' : r.motivo ?? 'Encaminhado ao atendimento humano.'
  await addMensagem({ tenantId, atendimentoId: a.id, direcao: 'NOTA_INTERNA', autorTipo: 'SISTEMA', conteudo: `Escalonamento: ${motivo}` })
  if (r.resposta && !r.bloqueadoSensivel) await addMensagem({ tenantId, atendimentoId: a.id, direcao: 'NOTA_INTERNA', autorTipo: 'IA', conteudo: r.resposta, sugeridaPorIa: true, confianca: r.confianca })
  if (a.status === 'NOVO') await prisma.atdAtendimento.update({ where: { id: a.id }, data: { status: 'EM_FILA' } })
  const aviso = 'Recebemos sua mensagem e um atendente vai responder em breve. Seu número de atendimento é ' + a.numero + '.'
  if (nova) await responderSolicitante({ tenantId, atendimento: a, texto: aviso, autorTipo: 'IA' })
  return { atendimentoId: a.id, nova, resposta: nova ? aviso : null, tipo: 'HUMANO' as const, escalonado: true, motivo }
}

const comSla = (a: any) => ({ ...a, sla: statusSla(a) })
const visivelParaAluno = (m: any) => m.direcao !== 'NOTA_INTERNA'

export function mountAtendimentos(router: Router) {
  // ------------------------------------------------------------ setores e equipes
  router.get('/setores', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const setores = await prisma.atdSetor.findMany({ where: { tenantId }, include: { membros: true }, orderBy: { nome: 'asc' } })
    const nomes = await nomesUsuarios(tenantId, setores.flatMap((s) => s.membros.map((m) => m.userId)))
    const abertos = await prisma.atdAtendimento.groupBy({ by: ['setorId'], where: { tenantId, status: { in: ATD_ABERTOS } }, _count: true })
    const mp = new Map(abertos.map((x) => [x.setorId, x._count]))
    res.json(setores.map((s) => ({ ...s, abertos: mp.get(s.id) ?? 0, membros: s.membros.map((m) => ({ ...m, nome: nomes[m.userId] })) })))
  }))
  const setorSchema = z.object({ codigo: z.string().min(2).max(30).transform((s) => s.toUpperCase().replace(/\s+/g, '_')), nome: z.string().min(2).max(120), descricao: z.string().max(500).optional(), distribuicao: z.enum(['MANUAL', 'RODIZIO', 'MENOR_CARGA']).default('RODIZIO'), slaPrimeiraRespostaMin: z.number().int().min(5).max(10080).default(60), slaResolucaoMin: z.number().int().min(15).max(43200).default(1440), palavrasChave: z.array(z.string().max(40)).max(40).default([]), ativo: z.boolean().optional() })
  router.post('/setores', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(setorSchema, req.body)
    if (await prisma.atdSetor.findFirst({ where: { tenantId, codigo: b.codigo } })) fail(409, 'Já existe um setor com este código.')
    const s = await prisma.atdSetor.create({ data: { tenantId, ...b } })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'SETOR_CRIADO', refType: 'AtdSetor', refId: s.id })
    res.status(201).json(s)
  }))
  router.put('/setores/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const s = await prisma.atdSetor.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!s) fail(404, 'Setor não encontrado.')
    const { codigo: _c, ...b } = parseBody(setorSchema.partial(), req.body)
    res.json(await prisma.atdSetor.update({ where: { id: s.id }, data: b }))
  }))
  router.put('/setores/:id/membros', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const s = await prisma.atdSetor.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!s) fail(404, 'Setor não encontrado.')
    const b = parseBody(z.object({ membros: z.array(z.object({ userId: z.string().min(1), capacidade: z.number().int().min(1).max(100).default(8), ativo: z.boolean().default(true) })).max(100) }), req.body)
    const users = await prisma.user.findMany({ where: { tenantId, id: { in: b.membros.map((m) => m.userId) } }, select: { id: true } })
    if (users.length !== new Set(b.membros.map((m) => m.userId)).size) fail(400, 'Há usuários que não pertencem a esta instituição.')
    await prisma.$transaction([
      prisma.atdSetorMembro.deleteMany({ where: { setorId: s.id, userId: { notIn: b.membros.map((m) => m.userId) } } }),
      ...b.membros.map((m) => prisma.atdSetorMembro.upsert({ where: { setorId_userId: { setorId: s.id, userId: m.userId } }, create: { tenantId, setorId: s.id, userId: m.userId, capacidade: m.capacidade, ativo: m.ativo }, update: { capacidade: m.capacidade, ativo: m.ativo } })),
    ])
    res.json(await prisma.atdSetorMembro.findMany({ where: { setorId: s.id } }))
  }))
  router.get('/equipe', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const us = await prisma.user.findMany({ where: { tenantId: tid(req), isActive: true, role: { in: ['SUPPORT', 'SECRETARY', 'ADMISSIONS', 'FINANCE', 'COORDINATOR', 'STAFF', 'ADMIN'] as any } }, select: { id: true, firstName: true, lastName: true, role: true }, take: 200, orderBy: { firstName: 'asc' } })
    res.json(us.map((u) => ({ id: u.id, nome: `${u.firstName} ${u.lastName}`.trim(), role: u.role })))
  }))

  // ------------------------------------------------------------ caixa única
  router.get('/atendimentos', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'setorId', 'canal', 'prioridade', 'atribuidoAId', 'studentId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    if (where.status === 'ABERTOS') where.status = { in: ATD_ABERTOS }
    if (qs(req.query.minha) === '1') where.atribuidoAId = uid(req)
    if (qs(req.query.semAtribuicao) === '1') where.atribuidoAId = null
    const q = qs(req.query.q)
    if (q) where.OR = [{ assunto: { contains: q, mode: 'insensitive' } }, { solicitanteNome: { contains: q, mode: 'insensitive' } }, { numero: { contains: q, mode: 'insensitive' } }]
    const [items, total] = await Promise.all([
      prisma.atdAtendimento.findMany({ where, orderBy: [{ ultimaInteracaoEm: 'desc' }], skip, take }),
      prisma.atdAtendimento.count({ where }),
    ])
    let out = items.map(comSla)
    const sla = qs(req.query.sla)
    if (sla) out = out.filter((a) => a.sla === sla)
    const [us, setores] = await Promise.all([nomesUsuarios(tenantId, items.map((i) => i.atribuidoAId)), prisma.atdSetor.findMany({ where: { tenantId }, select: { id: true, nome: true } })])
    const sn = new Map(setores.map((s) => [s.id, s.nome]))
    res.json({ items: out.map((a) => ({ ...a, atendente: a.atribuidoAId ? us[a.atribuidoAId] : null, setor: a.setorId ? sn.get(a.setorId) : null })), total, page, pageSize })
  }))

  router.post('/atendimentos', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({
      canal: z.enum(CANAIS), assunto: z.string().min(3).max(200), solicitanteNome: z.string().min(2).max(160), solicitanteContato: z.string().max(160).optional(), studentId: z.string().optional(),
      prioridade: z.enum(PRIORIDADES).optional(), setorId: z.string().optional(), mensagem: z.string().max(4000).optional(), categoria: z.string().max(40).optional(), tags: z.array(z.string().max(30)).max(10).optional(),
    }), req.body)
    await assertTenant(tenantId, 'student', b.studentId, 'Aluno')
    await assertTenant(tenantId, 'atdSetor', b.setorId, 'Setor')
    let nome = b.solicitanteNome
    if (b.studentId && nome.length < 3) nome = (await prisma.student.findFirst({ where: { id: b.studentId, tenantId } }))?.nomeCompleto ?? nome
    const a = await criarAtendimento({ tenantId, canal: b.canal, assunto: b.assunto, solicitanteNome: nome, solicitanteContato: b.solicitanteContato, studentId: b.studentId, prioridade: b.prioridade, setorId: b.setorId, categoria: b.categoria, tags: b.tags, textoInicial: b.mensagem, criadoPorId: uid(req) })
    res.status(201).json(comSla(a))
  }))

  router.post('/canais/simular-entrada', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ canal: z.enum(CANAIS), nome: z.string().min(2).max(160), contato: z.string().max(160).optional(), texto: z.string().min(1).max(4000), studentId: z.string().optional() }), req.body)
    await assertTenant(tenantId, 'student', b.studentId, 'Aluno')
    res.status(201).json({ simulado: true, ...(await processarEntrada({ tenantId, ...b, origem: 'CANAL' })) })
  }))

  router.post('/atendimentos/importar-conversa', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { conversaId } = parseBody(z.object({ conversaId: z.string().min(1) }), req.body)
    const conv = await prisma.comConversa.findFirst({ where: { id: conversaId, tenantId }, include: { contato: true, mensagens: { orderBy: { createdAt: 'asc' }, take: 200 } } })
    if (!conv) fail(404, 'Conversa não encontrada.')
    const ja = await prisma.atdAtendimento.findFirst({ where: { tenantId, conversaId } })
    if (ja) return res.json({ ...comSla(ja), jaImportada: true })
    const canal = ({ SITE_CHAT: 'CHAT_PORTAL', TELEGRAM: 'CHAT_PORTAL', SMS: 'TELEFONE', VOZ: 'TELEFONE' } as Record<string, string>)[conv.canalTipo] ?? conv.canalTipo
    const primeira = conv.mensagens.find((m) => m.direcao === 'ENTRADA')
    const a = await criarAtendimento({ tenantId, canal: (CANAIS as readonly string[]).includes(canal) ? canal : 'CHAT_PORTAL', assunto: conv.assunto ?? primeira?.conteudo.slice(0, 80) ?? 'Conversa importada', solicitanteNome: conv.contato.nome, solicitanteContato: conv.chaveExterna ?? conv.contato.email ?? conv.contato.telefone, studentId: conv.contato.studentId, origem: 'CANAL', criadoPorId: uid(req), textoInicial: undefined })
    await prisma.atdAtendimento.update({ where: { id: a.id }, data: { conversaId } })
    for (const m of conv.mensagens) await prisma.atdMensagem.create({ data: { tenantId, atendimentoId: a.id, direcao: m.direcao, autorTipo: m.autorTipo === 'CONTATO' ? 'SOLICITANTE' : m.autorTipo === 'ATENDENTE' ? 'ATENDENTE' : m.autorTipo.startsWith('BOT') ? 'IA' : 'SISTEMA', conteudo: m.conteudo, createdAt: m.createdAt } })
    res.status(201).json(comSla(await prisma.atdAtendimento.findUniqueOrThrow({ where: { id: a.id } })))
  }))

  router.get('/atendimentos/:id', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await prisma.atdAtendimento.findFirst({ where: { id: String(req.params.id), tenantId }, include: { mensagens: { orderBy: { createdAt: 'asc' } }, transferencias: { orderBy: { createdAt: 'asc' } } } })
    if (!a) fail(404, 'Atendimento não encontrado.')
    const [us, protocolo, setor, aluno] = await Promise.all([
      nomesUsuarios(tenantId, [a.atribuidoAId, ...a.mensagens.map((m) => m.autorId), ...a.transferencias.flatMap((t) => [t.porUserId, t.paraUserId])]),
      a.protocoloId ? prisma.atdProtocolo.findFirst({ where: { id: a.protocoloId, tenantId }, select: { id: true, numero: true, status: true, codigoRastreio: true } }) : null,
      a.setorId ? prisma.atdSetor.findFirst({ where: { id: a.setorId, tenantId }, select: { id: true, nome: true } }) : null,
      a.studentId ? prisma.student.findFirst({ where: { id: a.studentId, tenantId }, select: { id: true, nomeCompleto: true, ra: true } }) : null,
    ])
    if (a.naoLidas) await prisma.atdAtendimento.update({ where: { id: a.id }, data: { naoLidas: 0 } })
    res.json({ ...comSla(a), atendente: a.atribuidoAId ? us[a.atribuidoAId] : null, setor, protocolo, aluno, mensagens: a.mensagens.map((m) => ({ ...m, autor: m.autorId ? us[m.autorId] : undefined })), transferencias: a.transferencias.map((t) => ({ ...t, porNome: t.porUserId ? us[t.porUserId] : undefined, paraNome: t.paraUserId ? us[t.paraUserId] : undefined })) })
  }))

  async function carregar(req: AuthenticatedRequest) {
    const a = await prisma.atdAtendimento.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!a) fail(404, 'Atendimento não encontrado.')
    return a
  }

  router.post('/atendimentos/:id/mensagens', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await carregar(req)
    if (['FECHADO'].includes(a.status)) fail(409, 'Atendimento fechado: reabra para responder.')
    const b = parseBody(z.object({ conteudo: z.string().min(1).max(4000), nota: z.boolean().default(false), usouSugestaoIa: z.boolean().optional() }), req.body)
    if (b.nota) { const m = await addMensagem({ tenantId, atendimentoId: a.id, direcao: 'NOTA_INTERNA', autorTipo: 'ATENDENTE', autorId: uid(req), conteudo: b.conteudo }); return void res.status(201).json(m) }
    if (a.status === 'RESOLVIDO') fail(409, 'Atendimento resolvido: reabra para responder.')
    const r = await responderSolicitante({ tenantId, atendimento: a, texto: b.conteudo, autorTipo: 'ATENDENTE', autorId: uid(req) })
    const novo = ['NOVO', 'EM_FILA'].includes(a.status) && !a.atribuidoAId ? { atribuidoAId: uid(req) } : {}
    await prisma.atdAtendimento.update({ where: { id: a.id }, data: { status: 'AGUARDANDO_SOLICITANTE', ...novo } })
    if (b.usouSugestaoIa) await prisma.atdConhecimento.updateMany({ where: { tenantId, resposta: { contains: b.conteudo.slice(0, 60) } }, data: { util: { increment: 1 } } })
    res.status(201).json({ ...r.msg, entrega: r.entrega })
  }))

  router.post('/atendimentos/:id/assumir', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const a = await carregar(req)
    if (['RESOLVIDO', 'FECHADO'].includes(a.status)) fail(409, 'Atendimento encerrado.')
    const n = await prisma.atdAtendimento.update({ where: { id: a.id }, data: { atribuidoAId: uid(req), status: 'EM_ATENDIMENTO' } })
    await audit({ tenantId: a.tenantId, userId: uid(req), modulo: MOD, acao: 'ATENDIMENTO_ASSUMIDO', refType: REF, refId: a.id })
    res.json(comSla(n))
  }))

  router.post('/atendimentos/:id/distribuir', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const a = await carregar(req)
    if (!a.setorId) fail(409, 'Atendimento sem setor: defina o setor ou transfira.')
    if (a.atribuidoAId) await prisma.atdAtendimento.update({ where: { id: a.id }, data: { atribuidoAId: null } })
    const para = await distribuir(a.tenantId, a.id, uid(req))
    if (!para) fail(409, 'Nenhum atendente disponível no setor (verifique membros e capacidade).')
    res.json(comSla(await prisma.atdAtendimento.findUniqueOrThrow({ where: { id: a.id } })))
  }))

  router.post('/atendimentos/:id/atribuir', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await carregar(req)
    const b = parseBody(z.object({ userId: z.string().min(1) }), req.body)
    await assertTenant(tenantId, 'user', b.userId, 'Usuário')
    const n = await prisma.atdAtendimento.update({ where: { id: a.id }, data: { atribuidoAId: b.userId, status: ['NOVO', 'EM_FILA'].includes(a.status) ? 'EM_ATENDIMENTO' : a.status } })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'ATENDIMENTO_ATRIBUIDO', refType: REF, refId: a.id, detalhes: { para: b.userId } })
    res.json(comSla(n))
  }))

  router.post('/atendimentos/:id/transferir', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await carregar(req)
    if (['RESOLVIDO', 'FECHADO'].includes(a.status)) fail(409, 'Atendimento encerrado.')
    const b = parseBody(z.object({ setorId: z.string().optional(), userId: z.string().optional(), motivo: z.string().min(3).max(500) }), req.body)
    if (!b.setorId && !b.userId) fail(400, 'Informe o setor e/ou o atendente de destino.')
    await assertTenant(tenantId, 'atdSetor', b.setorId, 'Setor'); await assertTenant(tenantId, 'user', b.userId, 'Usuário')
    const setorId = b.setorId ?? a.setorId
    const sla = b.setorId && b.setorId !== a.setorId ? await slaDoSetor(tenantId, setorId, a.prioridade) : null
    await prisma.atdTransferencia.create({ data: { tenantId, atendimentoId: a.id, deSetorId: a.setorId, paraSetorId: setorId, deUserId: a.atribuidoAId, paraUserId: b.userId, motivo: b.motivo, porUserId: uid(req) } })
    await prisma.atdAtendimento.update({ where: { id: a.id }, data: { setorId, atribuidoAId: b.userId ?? null, status: b.userId ? 'EM_ATENDIMENTO' : 'EM_FILA', ...(sla ? { slaResolucaoEm: new Date(Date.now() + sla.resolucaoMin * 60_000), ...(a.primeiraRespostaEm ? {} : { slaPrimeiraRespostaEm: new Date(Date.now() + sla.primeiraMin * 60_000) }) } : {}) } })
    await addMensagem({ tenantId, atendimentoId: a.id, direcao: 'NOTA_INTERNA', autorTipo: 'SISTEMA', conteudo: `Transferido: ${b.motivo}` })
    if (!b.userId && setorId) await distribuir(tenantId, a.id, uid(req))
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'ATENDIMENTO_TRANSFERIDO', refType: REF, refId: a.id, detalhes: { de: a.setorId, para: setorId } })
    res.json(comSla(await prisma.atdAtendimento.findUniqueOrThrow({ where: { id: a.id } })))
  }))

  router.patch('/atendimentos/:id', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await carregar(req)
    const b = parseBody(z.object({ prioridade: z.enum(PRIORIDADES).optional(), categoria: z.string().max(40).optional(), assunto: z.string().min(3).max(200).optional(), tags: z.array(z.string().max(30)).max(10).optional(), status: z.enum(STATUS_ATD).optional() }), req.body)
    const data: any = { ...b }
    if (b.status && ['RESOLVIDO', 'FECHADO'].includes(b.status)) fail(400, 'Use /resolver para encerrar o atendimento.')
    if (b.prioridade && b.prioridade !== a.prioridade) {
      const sla = await slaDoSetor(tenantId, a.setorId, b.prioridade)
      data.slaResolucaoEm = new Date(a.createdAt.getTime() + sla.resolucaoMin * 60_000)
      if (!a.primeiraRespostaEm) data.slaPrimeiraRespostaEm = new Date(a.createdAt.getTime() + sla.primeiraMin * 60_000)
    }
    res.json(comSla(await prisma.atdAtendimento.update({ where: { id: a.id }, data })))
  }))

  router.post('/atendimentos/:id/resolver', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await carregar(req)
    if (['RESOLVIDO', 'FECHADO'].includes(a.status)) fail(409, 'Atendimento já encerrado.')
    const b = parseBody(z.object({ observacao: z.string().max(1000).optional() }), req.body ?? {})
    const token = randomBytes(18).toString('base64url')
    const n = await prisma.atdAtendimento.update({ where: { id: a.id }, data: { status: 'RESOLVIDO', resolvidoEm: new Date(), csatToken: a.csatToken ?? token, atribuidoAId: a.atribuidoAId ?? uid(req), resumoIa: await resumir({ tenantId, atendimentoId: a.id, userId: uid(req) }) } })
    if (b.observacao) await addMensagem({ tenantId, atendimentoId: a.id, direcao: 'NOTA_INTERNA', autorTipo: 'ATENDENTE', autorId: uid(req), conteudo: `Resolução: ${b.observacao}` })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'ATENDIMENTO_RESOLVIDO', refType: REF, refId: a.id })
    res.json({ ...comSla(n), csatToken: n.csatToken })
  }))

  router.post('/atendimentos/:id/reabrir', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const a = await carregar(req)
    if (!['RESOLVIDO', 'FECHADO'].includes(a.status)) fail(409, 'Atendimento não está encerrado.')
    const sla = await slaDoSetor(a.tenantId, a.setorId, a.prioridade)
    res.json(comSla(await prisma.atdAtendimento.update({ where: { id: a.id }, data: { status: a.atribuidoAId ? 'EM_ATENDIMENTO' : 'EM_FILA', resolvidoEm: null, slaResolucaoEm: new Date(Date.now() + sla.resolucaoMin * 60_000) } })))
  }))

  // avaliação registrada pelo atendente (ex.: balcão/telefone)
  router.post('/atendimentos/:id/avaliacao', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const a = await carregar(req)
    if (a.status !== 'RESOLVIDO' && a.status !== 'FECHADO') fail(409, 'Só é possível avaliar atendimento resolvido.')
    if (a.csatNota) fail(409, 'Atendimento já avaliado.')
    const b = parseBody(z.object({ nota: z.number().int().min(1).max(5), comentario: z.string().max(1000).optional() }), req.body)
    res.json(comSla(await prisma.atdAtendimento.update({ where: { id: a.id }, data: { csatNota: b.nota, csatComentario: b.comentario, csatEm: new Date() } })))
  }))

  // ------------------------------------------------------------ IA no atendimento
  router.post('/atendimentos/:id/sugerir-resposta', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await carregar(req)
    const ult = await prisma.atdMensagem.findFirst({ where: { atendimentoId: a.id, direcao: 'ENTRADA' }, orderBy: { createdAt: 'desc' } })
    const r = await responder({ tenantId, texto: ult?.conteudo ?? a.assunto, tipo: 'SUGERIR_RESPOSTA', atendimentoId: a.id, nomes: [a.solicitanteNome], userId: uid(req), nomeSolicitante: a.solicitanteNome })
    res.json(r)
  }))
  router.post('/atendimentos/:id/resumir', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const a = await carregar(req)
    const resumo = await resumir({ tenantId: a.tenantId, atendimentoId: a.id, userId: uid(req) })
    await prisma.atdAtendimento.update({ where: { id: a.id }, data: { resumoIa: resumo } })
    res.json({ resumo })
  }))
  router.post('/atendimentos/:id/classificar', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const a = await carregar(req)
    const ult = await prisma.atdMensagem.findFirst({ where: { atendimentoId: a.id, direcao: 'ENTRADA' }, orderBy: { createdAt: 'asc' } })
    const c = await classificar({ tenantId: a.tenantId, texto: `${a.assunto}\n${ult?.conteudo ?? ''}`, atendimentoId: a.id, userId: uid(req) })
    const aplicar = qs(req.query.aplicar) === '1'
    if (aplicar) await prisma.atdAtendimento.update({ where: { id: a.id }, data: { categoria: c.categoria === 'GERAL' ? a.categoria : c.categoria, ...(c.setorId ? { setorId: c.setorId } : {}), ...(c.prioridade !== 'NORMAL' ? { prioridade: c.prioridade } : {}) } })
    res.json({ ...c, aplicado: aplicar })
  }))

  // ------------------------------------------------------------ painéis
  router.get('/painel/atendente', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), eu = uid(req)
    const membros = await prisma.atdSetorMembro.findMany({ where: { tenantId, userId: eu, ativo: true }, select: { setorId: true } })
    const minhas = await prisma.atdAtendimento.findMany({ where: { tenantId, atribuidoAId: eu, status: { in: ATD_ABERTOS } }, orderBy: { slaResolucaoEm: 'asc' }, take: 50 })
    const fila = await prisma.atdAtendimento.findMany({ where: { tenantId, atribuidoAId: null, status: { in: ['NOVO', 'EM_FILA'] }, ...(membros.length && !isGestor(req) ? { setorId: { in: membros.map((m) => m.setorId) } } : {}) }, orderBy: [{ slaPrimeiraRespostaEm: 'asc' }], take: 50 })
    const inicio = new Date(); inicio.setHours(0, 0, 0, 0)
    const [resolvidosHoje, csat] = await Promise.all([
      prisma.atdAtendimento.count({ where: { tenantId, atribuidoAId: eu, status: { in: ['RESOLVIDO', 'FECHADO'] }, resolvidoEm: { gte: inicio } } }),
      prisma.atdAtendimento.aggregate({ where: { tenantId, atribuidoAId: eu, csatNota: { not: null }, csatEm: { gte: new Date(Date.now() - 30 * 86_400_000) } }, _avg: { csatNota: true }, _count: true }),
    ])
    res.json({
      minhas: minhas.map(comSla), fila: fila.map(comSla), resolvidosHoje, csatMedio30d: csat._avg.csatNota, avaliacoes30d: csat._count,
      slaEstourado: [...minhas, ...fila].filter((a) => statusSla(a) === 'ESTOURADO').length,
    })
  }))

  router.get('/painel/gestor', requireRole(...GESTAO, 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const dias = Math.min(90, Math.max(1, Number(qs(req.query.dias)) || 30))
    const desde = new Date(Date.now() - dias * 86_400_000)
    const [abertosL, periodo, setores, ia, protocolos] = await Promise.all([
      prisma.atdAtendimento.findMany({ where: { tenantId, status: { in: ATD_ABERTOS } } }),
      prisma.atdAtendimento.findMany({ where: { tenantId, createdAt: { gte: desde } } }),
      prisma.atdSetor.findMany({ where: { tenantId }, select: { id: true, nome: true } }),
      prisma.atdIaUso.groupBy({ by: ['tipo', 'escalonado'], where: { tenantId, createdAt: { gte: desde } }, _count: true }),
      prisma.atdProtocolo.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
    ])
    const media = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)
    const resolvidos = periodo.filter((a) => a.resolvidoEm)
    const tmrMin = media(periodo.filter((a) => a.primeiraRespostaEm).map((a) => (a.primeiraRespostaEm!.getTime() - a.createdAt.getTime()) / 60000))
    const tmaMin = media(resolvidos.map((a) => (a.resolvidoEm!.getTime() - a.createdAt.getTime()) / 60000))
    const dentroPrazo = resolvidos.filter((a) => !a.slaResolucaoEm || a.resolvidoEm! <= a.slaResolucaoEm).length
    const avaliados = periodo.filter((a) => a.csatNota)
    const dist: Record<string, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    avaliados.forEach((a) => { dist[String(a.csatNota)]++ })
    const cont = <T>(xs: T[], f: (x: T) => string) => { const m: Record<string, number> = {}; xs.forEach((x) => { const k = f(x); m[k] = (m[k] ?? 0) + 1 }); return m }
    const porDia: Record<string, number> = {}
    for (let i = 13; i >= 0; i--) porDia[new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)] = 0
    periodo.forEach((a) => { const k = a.createdAt.toISOString().slice(0, 10); if (k in porDia) porDia[k]++ })
    const nomeSetor = new Map(setores.map((s) => [s.id, s.nome]))
    const porSetor = setores.map((s) => { const ab = abertosL.filter((a) => a.setorId === s.id); return { setorId: s.id, setor: s.nome, abertos: ab.length, estourados: ab.filter((a) => statusSla(a) === 'ESTOURADO').length, semAtendente: ab.filter((a) => !a.atribuidoAId).length } })
    const atendentesIds = [...new Set(periodo.map((a) => a.atribuidoAId).filter((x): x is string => !!x))]
    const nomes = await nomesUsuarios(tenantId, atendentesIds)
    const porAtendente = atendentesIds.map((id) => { const l = periodo.filter((a) => a.atribuidoAId === id); const av = l.filter((a) => a.csatNota); return { userId: id, nome: nomes[id], total: l.length, abertos: l.filter((a) => ATD_ABERTOS.includes(a.status)).length, resolvidos: l.filter((a) => a.resolvidoEm).length, csat: media(av.map((a) => a.csatNota!)) } })
    const iaTot = ia.reduce((s, x) => s + x._count, 0), iaEsc = ia.filter((x) => x.escalonado).reduce((s, x) => s + x._count, 0)
    res.json({
      periodoDias: dias, abertos: abertosL.length, estourados: abertosL.filter((a) => statusSla(a) === 'ESTOURADO').length, atencao: abertosL.filter((a) => statusSla(a) === 'ATENCAO').length, semAtendente: abertosL.filter((a) => !a.atribuidoAId).length,
      criadosPeriodo: periodo.length, resolvidosPeriodo: resolvidos.length, tempoMedioPrimeiraRespostaMin: tmrMin, tempoMedioResolucaoMin: tmaMin, slaResolucaoCumpridoPct: resolvidos.length ? Math.round((dentroPrazo / resolvidos.length) * 100) : null,
      csat: { media: media(avaliados.map((a) => a.csatNota!)), avaliacoes: avaliados.length, distribuicao: dist, respostaPct: resolvidos.length ? Math.round((avaliados.length / resolvidos.length) * 100) : null },
      porCanal: cont(periodo, (a) => a.canal), porStatus: cont(abertosL, (a) => a.status), porPrioridade: cont(abertosL, (a) => a.prioridade), porCategoria: cont(periodo, (a) => a.categoria ?? 'SEM_CATEGORIA'),
      porSetor: porSetor.map((s) => ({ ...s, setor: nomeSetor.get(s.setorId) })), porAtendente, volumePorDia: porDia,
      ia: { usos: iaTot, escalonados: iaEsc, atendidasPelaIa: periodo.filter((a) => a.iaAtendeu).length, resolvidasSemHumanoPct: periodo.length ? Math.round((periodo.filter((a) => a.iaAtendeu && !a.atribuidoAId).length / periodo.length) * 100) : 0, porTipo: cont(ia as any[], (x) => x.tipo) },
      protocolos: Object.fromEntries(protocolos.map((p) => [p.status, p._count])),
    })
  }))

  // ------------------------------------------------------------ portal do aluno: chat com assistente e avaliação
  router.post('/portal/chat', requireRole(...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), studentId = exigirAluno(req)
    const b = parseBody(z.object({ texto: z.string().min(1).max(2000) }), req.body)
    const st = await prisma.student.findFirst({ where: { id: studentId, tenantId }, select: { nomeCompleto: true } })
    const r = await processarEntrada({ tenantId, canal: 'CHAT_PORTAL', nome: st?.nomeCompleto ?? 'Aluno', studentId, texto: b.texto, origem: 'PORTAL' })
    res.status(201).json(r)
  }))
  router.get('/portal/atendimentos', requireRole(...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const items = await prisma.atdAtendimento.findMany({ where: { tenantId: tid(req), studentId: exigirAluno(req) }, orderBy: { ultimaInteracaoEm: 'desc' }, take: 50, select: { id: true, numero: true, assunto: true, status: true, canal: true, createdAt: true, resolvidoEm: true, csatNota: true, protocoloId: true } })
    res.json(items)
  }))
  router.get('/portal/atendimentos/:id', requireRole(...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const a = await prisma.atdAtendimento.findFirst({ where: { id: String(req.params.id), tenantId: tid(req), studentId: exigirAluno(req) }, include: { mensagens: { orderBy: { createdAt: 'asc' } } } })
    if (!a) fail(404, 'Atendimento não encontrado.')
    res.json({ id: a.id, numero: a.numero, assunto: a.assunto, status: a.status, csatNota: a.csatNota, mensagens: a.mensagens.filter(visivelParaAluno).map((m) => ({ id: m.id, direcao: m.direcao, autorTipo: m.autorTipo, conteudo: m.conteudo, createdAt: m.createdAt })) })
  }))
  router.post('/portal/atendimentos/:id/avaliacao', requireRole(...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const a = await prisma.atdAtendimento.findFirst({ where: { id: String(req.params.id), tenantId: tid(req), studentId: exigirAluno(req) } })
    if (!a) fail(404, 'Atendimento não encontrado.')
    if (!['RESOLVIDO', 'FECHADO'].includes(a.status)) fail(409, 'Você poderá avaliar quando o atendimento for resolvido.')
    if (a.csatNota) fail(409, 'Atendimento já avaliado.')
    const b = parseBody(z.object({ nota: z.number().int().min(1).max(5), comentario: z.string().max(1000).optional() }), req.body)
    await prisma.atdAtendimento.update({ where: { id: a.id }, data: { csatNota: b.nota, csatComentario: b.comentario, csatEm: new Date() } })
    res.json({ ok: true })
  }))
  void registrarUso; void db
}
