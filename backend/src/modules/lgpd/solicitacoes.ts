import { Request, Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { notify } from '../core/notify'
import { scheduleReminder, completeReminders, cancelReminders } from '../core/reminders'
import { exigirGestorLgpd, formatarCpf, hashesDe, httpError, limitePublico, MODULO, resolverTenantPublico, proximoSeq, soDigitos, cpfValido, tenantPublico, tid, trilha, uid } from './base'
import { Pessoa, TitularTipo, resolverPessoa } from './catalogo'
import { executar, planejar } from './anonimizar'
import { gerarPacote } from './pacote'
import { revogarConsentimentosPessoa } from './consentimentos'
import { conferirSegredo, gerarCodigo, hashDocumento, hashSegredo, mascararCpf, mascararEmail, mascararNome, mascararTelefone } from './mascara'
import { PRAZO_SOLICITACAO_DIAS, PRORROGACAO_SOLICITACAO_DIAS, addDias, estadoPrazo, formatarProtocolo, protocoloValido } from './prazos'
import { registrarAcessoSensivel } from './sensiveis'

// ============================================================
// 2) Direitos do titular (art. 18) - protocolo, prazo de 15 dias, fila do DPO, resposta e trilha
// ============================================================

const TIPOS = ['CONFIRMACAO', 'ACESSO', 'CORRECAO', 'ANONIMIZACAO', 'ELIMINACAO', 'PORTABILIDADE', 'INFO_COMPARTILHAMENTO', 'REVOGACAO_CONSENTIMENTO', 'OPOSICAO', 'REVISAO_AUTOMATIZADA'] as const
const ABERTAS = ['ABERTA', 'EM_ANALISE', 'AGUARDANDO_TITULAR'] as const
export const ROTULO_TIPO: Record<string, string> = {
  CONFIRMACAO: 'Confirmação de tratamento', ACESSO: 'Acesso aos dados', CORRECAO: 'Correção de dados', ANONIMIZACAO: 'Anonimização/bloqueio', ELIMINACAO: 'Eliminação de dados',
  PORTABILIDADE: 'Portabilidade', INFO_COMPARTILHAMENTO: 'Informação sobre compartilhamento', REVOGACAO_CONSENTIMENTO: 'Revogação de consentimento', OPOSICAO: 'Oposição a tratamento', REVISAO_AUTOMATIZADA: 'Revisão de decisão automatizada',
}

const novaSchema = z.object({
  tipo: z.enum(TIPOS),
  nome: z.string().min(3).max(150),
  email: z.string().email().max(150),
  telefone: z.string().max(30).optional(),
  documento: z.string().max(20).optional(),
  descricao: z.string().max(5000).optional(),
  dados: z.record(z.string(), z.any()).optional(),
  menor: z.boolean().optional(),
  responsavelNome: z.string().max(150).optional(),
  responsavelParentesco: z.string().max(40).optional(),
})

async function criarSolicitacao(tenantId: string, d: z.infer<typeof novaSchema>, ctx: { canal: string; ipHash?: string | null; userId?: string }) {
  const doc = soDigitos(d.documento)
  if (d.documento && !cpfValido(doc)) throw httpError(400, 'CPF inválido.')
  if (d.tipo === 'CORRECAO' && !d.descricao && !d.dados) throw httpError(422, 'Descreva o que deve ser corrigido.')
  if (d.menor && !d.responsavelNome) throw httpError(422, 'Titular menor de 18 anos: informe o responsável legal que faz o pedido (art. 14).')
  const ano = new Date().getFullYear()
  const seq = await proximoSeq(tenantId, `LGPD-${ano}`)
  const protocolo = formatarProtocolo('LGPD', ano, seq)
  const senha = gerarCodigo(4)
  const { hash, salt } = hashSegredo(senha)
  const prazoEm = addDias(new Date(), PRAZO_SOLICITACAO_DIAS)
  const s = await prisma.lgpSolicitacao.create({
    data: {
      tenantId, protocolo, tipo: d.tipo, nome: d.nome, email: d.email.toLowerCase(), telefone: d.telefone, docHash: doc ? hashDocumento(doc, tenantId) : null,
      docMascarado: doc ? mascararCpf(doc) : null, descricao: d.descricao, dados: d.dados as any, canal: ctx.canal, menor: !!d.menor,
      responsavelNome: d.responsavelNome, responsavelParentesco: d.responsavelParentesco, prazoEm, senhaHash: hash, senhaSalt: salt, ipHash: ctx.ipHash,
    },
  })
  const dpo = await prisma.lgpDpo.findFirst({ where: { tenantId, ativo: true } })
  await trilha({ tenantId, refType: 'Solicitacao', refId: s.id, acao: 'ABERTA', userId: ctx.userId, ator: ctx.userId ? 'EQUIPE' : 'TITULAR', detalhe: { protocolo, tipo: d.tipo, canal: ctx.canal, prazoEm } })
  await andamento(tenantId, s.id, 'Solicitação recebida. O prazo legal de resposta é de 15 dias.')
  await scheduleReminder({ tenantId, modulo: MODULO, titulo: `LGPD: responder solicitação ${protocolo} (${ROTULO_TIPO[d.tipo]})`, dueAt: prazoEm, antecedenciaDias: 5, assigneeUserId: dpo?.userId ?? undefined, assigneeRole: dpo?.userId ? undefined : 'ADMIN', refType: 'LgpSolicitacao', refId: s.id, severity: 'ATENCAO', dedupeKey: `lgpd-sol-${s.id}` })
  return { s, senha }
}

/** Andamento visível ao titular (no Portal do Titular, por protocolo). */
async function andamento(tenantId: string, id: string, texto: string, userId?: string) {
  await trilha({ tenantId, refType: 'Solicitacao', refId: id, acao: 'ANDAMENTO', userId, ator: userId ? 'EQUIPE' : 'SISTEMA', detalhe: { publico: true, texto } })
}

const abertaStatus = (s: string) => (ABERTAS as readonly string[]).includes(s)

function visao(s: any, completo = false) {
  const prazo = estadoPrazo(s.createdAt, s.prorrogadoEm ?? s.prazoEm, abertaStatus(s.status))
  const base = {
    id: s.id, protocolo: s.protocolo, tipo: s.tipo, tipoRotulo: ROTULO_TIPO[s.tipo], status: s.status, canal: s.canal, menor: s.menor,
    nome: completo ? s.nome : mascararNome(s.nome), email: completo ? s.email : mascararEmail(s.email), telefone: completo ? s.telefone : s.telefone ? mascararTelefone(s.telefone) : null,
    documento: s.docMascarado, titularTipo: s.titularTipo, titularId: s.titularId, prazoEm: s.prazoEm, prorrogadoEm: s.prorrogadoEm, prazoEstado: prazo.estado, diasRestantes: prazo.diasRestantes,
    atribuidoAId: s.atribuidoAId, identidadeVerificadaEm: s.identidadeVerificadaEm, executadoEm: s.executadoEm, pacoteGeradoEm: s.pacoteGeradoEm, respondidaEm: s.respondidaEm, createdAt: s.createdAt, updatedAt: s.updatedAt,
  }
  return completo ? { ...base, descricao: s.descricao, dados: s.dados, responsavelNome: s.responsavelNome, responsavelParentesco: s.responsavelParentesco, identidadeMetodo: s.identidadeMetodo, resposta: s.resposta, justificativaNegativa: s.justificativaNegativa, resultadoExecucao: s.resultadoExecucao } : base
}

async function carregar(req: AuthenticatedRequest) {
  const s = await prisma.lgpSolicitacao.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
  if (!s) throw httpError(404, 'Solicitação não encontrada.')
  return s
}

async function pessoaDaSolicitacao(s: any): Promise<Pessoa> {
  if (!s.titularTipo || !s.titularId) throw httpError(409, 'Vincule a solicitação a um cadastro (aluno, candidato ou egresso) antes desta operação.')
  const p = await resolverPessoa(s.tenantId, s.titularTipo as TitularTipo, s.titularId)
  if (!p) throw httpError(404, 'Cadastro vinculado não encontrado (já foi eliminado?).')
  return p
}
function exigirIdentidade(s: any) {
  if (!s.identidadeVerificadaEm) throw httpError(409, 'Verifique a identidade do titular antes de entregar ou alterar dados (evita fornecer dados a terceiros).')
}

// ------------------------------------------------------------------ busca de titulares (sugestões e vínculo)
export async function buscarTitulares(tenantId: string, f: { q?: string; docDigits?: string; email?: string }) {
  const out: Array<{ tipo: TitularTipo; id: string; nome: string; detalhe: string }> = []
  const q = f.q?.trim()
  const doc = f.docDigits && f.docDigits.length === 11 ? [f.docDigits, formatarCpf(f.docDigits)] : []
  const email = f.email?.toLowerCase()
  const qd = soDigitos(q)
  const alunoOr: any[] = []
  if (doc.length) alunoOr.push({ cpf: { in: doc } })
  if (q) alunoOr.push({ nomeCompleto: { contains: q, mode: 'insensitive' } }, { ra: { equals: q, mode: 'insensitive' } })
  if (qd.length === 11) alunoOr.push({ cpf: { in: [qd, formatarCpf(qd)] } })
  if (alunoOr.length) {
    const al = await prisma.student.findMany({ where: { tenantId, OR: alunoOr }, take: 10, select: { id: true, nomeCompleto: true, ra: true, cpf: true } })
    for (const a of al) out.push({ tipo: 'ALUNO', id: a.id, nome: mascararNome(a.nomeCompleto), detalhe: `RA ${a.ra}${a.cpf ? ' · CPF ' + mascararCpf(a.cpf) : ''}` })
  }
  if (email) {
    const u = await prisma.user.findFirst({ where: { tenantId, email: { equals: email, mode: 'insensitive' } }, select: { id: true } })
    if (u) { const st = await prisma.student.findFirst({ where: { tenantId, userId: u.id }, select: { id: true, nomeCompleto: true, ra: true } }); if (st && !out.some((o) => o.id === st.id)) out.push({ tipo: 'ALUNO', id: st.id, nome: mascararNome(st.nomeCompleto), detalhe: `RA ${st.ra} · conta ${mascararEmail(email)}` }) }
  }
  const candOr: any[] = []
  if (doc.length) candOr.push({ cpf: { in: doc } })
  if (email) candOr.push({ email: { equals: email, mode: 'insensitive' } })
  if (q) candOr.push({ nome: { contains: q, mode: 'insensitive' } }, { protocolo: { equals: q, mode: 'insensitive' } })
  if (candOr.length) {
    const cs = await prisma.admCandidato.findMany({ where: { tenantId, OR: candOr }, take: 10, select: { id: true, nome: true, protocolo: true, email: true } })
    for (const c of cs) out.push({ tipo: 'CANDIDATO', id: c.id, nome: mascararNome(c.nome), detalhe: `Protocolo ${c.protocolo}${c.email ? ' · ' + mascararEmail(c.email) : ''}` })
  }
  const egOr: any[] = []
  if (doc.length) egOr.push({ cpf: { in: doc } })
  if (email) egOr.push({ email: { equals: email, mode: 'insensitive' } })
  if (q) egOr.push({ nome: { contains: q, mode: 'insensitive' } })
  if (egOr.length) {
    const es = await prisma.apoEgresso.findMany({ where: { tenantId, OR: egOr }, take: 10, select: { id: true, nome: true, anoConclusao: true } })
    for (const e of es) out.push({ tipo: 'EGRESSO', id: e.id, nome: mascararNome(e.nome), detalhe: `Egresso${e.anoConclusao ? ' ' + e.anoConclusao : ''}` })
  }
  return out
}

// ------------------------------------------------------------------ correções permitidas
const CORRIGIVEIS: Record<string, { campos: Record<string, 'texto' | 'data' | 'cpf'>; escopo: (p: Pessoa) => string[]; delegate: string; chaveTenant: boolean }> = {
  student: { campos: { nomeCompleto: 'texto', cpf: 'cpf', dataNascimento: 'data' }, escopo: (p) => (p.studentId ? [p.studentId] : []), delegate: 'student', chaveTenant: true },
  admCandidato: { campos: { nome: 'texto', cpf: 'cpf', email: 'texto', telefone: 'texto', dataNascimento: 'data' }, escopo: (p) => p.candidatoIds, delegate: 'admCandidato', chaveTenant: true },
  apoEgresso: { campos: { nome: 'texto', email: 'texto', telefone: 'texto', cidade: 'texto', uf: 'texto' }, escopo: (p) => p.egressoIds, delegate: 'apoEgresso', chaveTenant: true },
  comContato: { campos: { nome: 'texto', email: 'texto', telefone: 'texto' }, escopo: (p) => p.contatoIds, delegate: 'comContato', chaveTenant: true },
  user: { campos: { firstName: 'texto', lastName: 'texto', phone: 'texto' }, escopo: (p) => (p.userId ? [p.userId] : []), delegate: 'user', chaveTenant: true },
}
function mascararAlteracao(campo: string, v: unknown) {
  const s = v == null ? '' : String(v)
  if (/cpf/i.test(campo)) return mascararCpf(s)
  if (/email/i.test(campo)) return mascararEmail(s)
  if (/telefone|phone/i.test(campo)) return mascararTelefone(s)
  if (/nome|name/i.test(campo)) return mascararNome(s)
  return '[alterado]'
}

// ------------------------------------------------------------------ rotas internas
export function mountSolicitacoes(router: Router) {
  router.get('/solicitacoes', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'tipo', 'atribuidoAId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    if (qs(req.query.vencidas) === 'true') { where.prazoEm = { lt: new Date() }; where.status = { in: [...ABERTAS] } }
    const q = qs(req.query.q)
    if (q) where.OR = [{ protocolo: { contains: q, mode: 'insensitive' } }, { nome: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }]
    const [items, total] = await Promise.all([prisma.lgpSolicitacao.findMany({ where, orderBy: [{ prazoEm: 'asc' }], skip, take }), prisma.lgpSolicitacao.count({ where })])
    res.json({ items: items.map((s) => visao(s)), total, page, pageSize })
  }))

  // Fila do DPO: abertas, mais urgentes primeiro, com semáforo de prazo
  router.get('/fila', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const abertas = await prisma.lgpSolicitacao.findMany({ where: { tenantId, status: { in: [...ABERTAS] } }, orderBy: { prazoEm: 'asc' }, take: 200 })
    const items = abertas.map((s) => visao(s))
    const incAbertos = await prisma.lgpIncidente.count({ where: { tenantId, status: { not: 'ENCERRADO' } } })
    res.json({
      items,
      resumo: { abertas: items.length, vencidas: items.filter((i) => i.prazoEstado === 'VENCIDA').length, vencendo: items.filter((i) => i.prazoEstado === 'VENCENDO').length, semResponsavel: items.filter((i) => !i.atribuidoAId).length, semVerificacaoDeIdentidade: items.filter((i) => !i.identidadeVerificadaEm).length, incidentesAbertos: incAbertos },
    })
  }))

  router.get('/titulares/buscar', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const q = qs(req.query.q)
    if (!q || q.length < 3) throw httpError(400, 'Informe ao menos 3 caracteres.')
    res.json({ items: await buscarTitulares(tid(req), { q }) })
  }))

  router.get('/solicitacoes/:id', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const s = await carregar(req)
    const tenantId = s.tenantId
    const hist = await prisma.lgpTrilha.findMany({ where: { tenantId, refType: 'Solicitacao', refId: s.id }, orderBy: { createdAt: 'asc' } })
    const sugestoes = s.titularId ? [] : await buscarTitulares(tenantId, { email: s.email, q: s.nome.length >= 5 ? s.nome : undefined })
    await registrarAcessoSensivel(req, { recurso: 'lgpd/solicitacoes', recursoId: s.id, categoria: 'IDENTIFICACAO', titularTipo: s.titularTipo ?? undefined, titularId: s.titularId ?? undefined })
    res.json({ ...visao(s, true), trilha: hist, sugestoes })
  }))

  // Registro em nome do titular (balcão, telefone, e-mail recebido pelo DPO)
  router.post('/solicitacoes', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(novaSchema.extend({ canal: z.enum(['PRESENCIAL', 'TELEFONE', 'EMAIL', 'PORTAL']).default('PRESENCIAL') }), req.body)
    const { s, senha } = await criarSolicitacao(tenantId, b, { canal: b.canal, userId: uid(req), ...hashesDe(req, tenantId) })
    res.status(201).json({ ...visao(s, true), codigoAcompanhamento: senha, aviso: 'Entregue o protocolo e o código ao titular; o código não pode ser recuperado.' })
  }))

  router.post('/solicitacoes/:id/atribuir', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const s = await carregar(req)
    const b = parseBody(z.object({ userId: z.string().min(5).max(80).optional() }), req.body)
    const userId = b.userId ?? uid(req)
    const alvo = await prisma.user.findFirst({ where: { id: userId, tenantId: s.tenantId }, select: { id: true } })
    if (!alvo) throw httpError(404, 'Usuário não encontrado.')
    const r = await prisma.lgpSolicitacao.update({ where: { id: s.id }, data: { atribuidoAId: userId, status: s.status === 'ABERTA' ? 'EM_ANALISE' : s.status } })
    await trilha({ tenantId: s.tenantId, refType: 'Solicitacao', refId: s.id, acao: 'ATRIBUIDA', userId: uid(req), ator: 'EQUIPE', detalhe: { para: userId } })
    res.json(visao(r, true))
  }))

  router.post('/solicitacoes/:id/vincular', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const s = await carregar(req)
    if (!abertaStatus(s.status)) throw httpError(409, 'Solicitação já encerrada.')
    const b = parseBody(z.object({ titularTipo: z.enum(['ALUNO', 'CANDIDATO', 'EGRESSO']), titularId: z.string().min(5).max(80) }), req.body)
    const p = await resolverPessoa(s.tenantId, b.titularTipo, b.titularId)
    if (!p) throw httpError(404, 'Cadastro não encontrado nesta instituição.')
    const r = await prisma.lgpSolicitacao.update({ where: { id: s.id }, data: { titularTipo: b.titularTipo, titularId: b.titularId, identidadeVerificadaEm: null, identidadeMetodo: null } })
    await trilha({ tenantId: s.tenantId, refType: 'Solicitacao', refId: s.id, acao: 'VINCULADA', userId: uid(req), ator: 'EQUIPE', detalhe: { titularTipo: b.titularTipo, titularId: b.titularId } })
    res.json(visao(r, true))
  }))

  router.post('/solicitacoes/:id/verificar-identidade', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const s = await carregar(req)
    if (!abertaStatus(s.status)) throw httpError(409, 'Solicitação já encerrada.')
    if (!s.titularId) throw httpError(409, 'Vincule a solicitação ao cadastro antes de verificar a identidade.')
    const b = parseBody(z.object({ metodo: z.enum(['DOCUMENTO_COM_FOTO', 'CONFIRMACAO_POR_EMAIL_CADASTRADO', 'PRESENCIAL', 'PERGUNTAS_DE_CONFERENCIA', 'CERTIFICADO_DIGITAL']), observacao: z.string().max(500).optional() }), req.body)
    const r = await prisma.lgpSolicitacao.update({ where: { id: s.id }, data: { identidadeVerificadaEm: new Date(), identidadeMetodo: b.metodo, identidadeVerificadaPor: uid(req), status: s.status === 'ABERTA' ? 'EM_ANALISE' : s.status } })
    await trilha({ tenantId: s.tenantId, refType: 'Solicitacao', refId: s.id, acao: 'IDENTIDADE_VERIFICADA', userId: uid(req), ator: 'EQUIPE', detalhe: { metodo: b.metodo, observacao: b.observacao } })
    await andamento(s.tenantId, s.id, 'Identidade do titular confirmada.', uid(req))
    res.json(visao(r, true))
  }))

  router.post('/solicitacoes/:id/status', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const s = await carregar(req)
    if (!abertaStatus(s.status)) throw httpError(409, 'Solicitação já encerrada.')
    const b = parseBody(z.object({ status: z.enum(['EM_ANALISE', 'AGUARDANDO_TITULAR']), mensagem: z.string().max(1000).optional() }), req.body)
    if (b.status === 'AGUARDANDO_TITULAR' && !b.mensagem) throw httpError(422, 'Explique ao titular o que falta (mensagem).')
    const r = await prisma.lgpSolicitacao.update({ where: { id: s.id }, data: { status: b.status } })
    await trilha({ tenantId: s.tenantId, refType: 'Solicitacao', refId: s.id, acao: 'STATUS', userId: uid(req), ator: 'EQUIPE', detalhe: { de: s.status, para: b.status } })
    if (b.mensagem) await andamento(s.tenantId, s.id, b.mensagem, uid(req))
    res.json(visao(r, true))
  }))

  router.post('/solicitacoes/:id/prorrogar', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const s = await carregar(req)
    if (!abertaStatus(s.status)) throw httpError(409, 'Solicitação já encerrada.')
    if (s.prorrogadoEm) throw httpError(409, 'O prazo já foi prorrogado uma vez.')
    const b = parseBody(z.object({ motivo: z.string().min(15).max(500) }), req.body)
    const novo = addDias(s.prazoEm, PRORROGACAO_SOLICITACAO_DIAS)
    const r = await prisma.lgpSolicitacao.update({ where: { id: s.id }, data: { prorrogadoEm: novo, alertadoEm: null } })
    await trilha({ tenantId: s.tenantId, refType: 'Solicitacao', refId: s.id, acao: 'PRAZO_PRORROGADO', userId: uid(req), ator: 'EQUIPE', detalhe: { motivo: b.motivo, novoPrazo: novo } })
    await andamento(s.tenantId, s.id, `Prazo de resposta prorrogado até ${novo.toLocaleDateString('pt-BR')}. Motivo: ${b.motivo}`, uid(req))
    await scheduleReminder({ tenantId: s.tenantId, modulo: MODULO, titulo: `LGPD: prazo prorrogado da solicitação ${s.protocolo}`, dueAt: novo, antecedenciaDias: 5, assigneeRole: 'ADMIN', refType: 'LgpSolicitacao', refId: s.id, severity: 'ATENCAO', dedupeKey: `lgpd-sol-${s.id}`, reabrir: true })
    res.json(visao(r, true))
  }))

  // --- Acesso / portabilidade: pacote JSON do titular
  router.get('/solicitacoes/:id/pacote', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const s = await carregar(req)
    if (!abertaStatus(s.status) && s.status !== 'ATENDIDA' && s.status !== 'ATENDIDA_PARCIALMENTE') throw httpError(409, 'Solicitação não está ativa.')
    exigirIdentidade(s)
    const p = await pessoaDaSolicitacao(s)
    const pacote = await gerarPacote(p, { solicitacaoId: s.id, motivo: s.tipo })
    await prisma.lgpSolicitacao.update({ where: { id: s.id }, data: { pacoteGeradoEm: new Date(), pacoteHash: pacote.hashConteudo } })
    await trilha({ tenantId: s.tenantId, refType: 'Solicitacao', refId: s.id, acao: 'PACOTE_GERADO', userId: uid(req), ator: 'EQUIPE', detalhe: { hash: pacote.hashConteudo, resumo: pacote.resumo } })
    await registrarAcessoSensivel(req, { recurso: 'lgpd/pacote', recursoId: s.id, categoria: 'TODAS', acao: 'EXPORTACAO', titularTipo: p.tipo, titularId: p.id, motivo: s.tipo })
    res.setHeader('Content-Disposition', `attachment; filename="pacote-titular-${s.protocolo}.json"`)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.send(JSON.stringify(pacote, null, 2))
  }))

  // Exportação direta pelo DPO (fora de solicitação): exige motivo e fica registrada
  router.get('/titulares/:tipo/:id/pacote', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tipo = String(req.params.tipo).toUpperCase()
    if (!['ALUNO', 'CANDIDATO', 'EGRESSO'].includes(tipo)) throw httpError(400, 'Tipo de titular inválido.')
    const motivo = qs(req.query.motivo)
    if (!motivo || motivo.length < 10) throw httpError(400, 'Informe o motivo da exportação (mín. 10 caracteres): ele fica na trilha de auditoria.')
    const tenantId = tid(req)
    const p = await resolverPessoa(tenantId, tipo as TitularTipo, String(req.params.id))
    if (!p) throw httpError(404, 'Titular não encontrado.')
    const pacote = await gerarPacote(p, { motivo })
    await trilha({ tenantId, refType: 'Pacote', refId: p.id, acao: 'PACOTE_GERADO', userId: uid(req), ator: 'EQUIPE', detalhe: { tipo, motivo, hash: pacote.hashConteudo, resumo: pacote.resumo } })
    await registrarAcessoSensivel(req, { recurso: 'lgpd/pacote', recursoId: p.id, categoria: 'TODAS', acao: 'EXPORTACAO', titularTipo: p.tipo, titularId: p.id, motivo })
    res.setHeader('Content-Disposition', `attachment; filename="pacote-titular-${p.id}.json"`)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.send(JSON.stringify(pacote, null, 2))
  }))

  // --- Anonimização / eliminação / revogação: dry-run por padrão
  router.post('/solicitacoes/:id/executar', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const s = await carregar(req)
    if (!abertaStatus(s.status)) throw httpError(409, 'Solicitação já encerrada.')
    if (!['ANONIMIZACAO', 'ELIMINACAO', 'REVOGACAO_CONSENTIMENTO', 'OPOSICAO'].includes(s.tipo)) throw httpError(409, 'Este tipo de solicitação não tem rotina automática de execução.')
    const b = parseBody(z.object({ dryRun: z.boolean().default(true), confirmar: z.boolean().default(false) }), req.body ?? {})
    exigirIdentidade(s)
    const p = await pessoaDaSolicitacao(s)
    if (s.tipo === 'REVOGACAO_CONSENTIMENTO' || s.tipo === 'OPOSICAO') {
      const ativos = await prisma.lgpConsentimento.count({ where: { tenantId: s.tenantId, status: 'ATIVO', OR: [{ titularId: { in: p.todosIds } }, ...(p.emails.length ? [{ titularEmail: { in: p.emails } }] : [])] } })
      if (b.dryRun) return res.json({ dryRun: true, tipo: s.tipo, consentimentosAtivos: ativos, aviso: 'Nenhuma alteração feita. Reenvie com dryRun=false e confirmar=true.' })
      if (!b.confirmar) throw httpError(400, 'Confirme a execução (confirmar=true).')
      const n = await revogarConsentimentosPessoa(p, 'Revogação solicitada pelo titular (art. 18, IX)', uid(req))
      const r = { executadoEm: new Date().toISOString(), consentimentosRevogados: n }
      await prisma.lgpSolicitacao.update({ where: { id: s.id }, data: { executadoEm: new Date(), resultadoExecucao: r as any } })
      await trilha({ tenantId: s.tenantId, refType: 'Solicitacao', refId: s.id, acao: 'EXECUTADA', userId: uid(req), ator: 'EQUIPE', detalhe: r })
      return res.json({ dryRun: false, ...r })
    }
    const modo = s.tipo === 'ELIMINACAO' ? 'ELIMINACAO' : 'ANONIMIZACAO'
    const plano = await planejar(p, modo, { excluirSolicitacaoId: s.id })
    if (b.dryRun) {
      await trilha({ tenantId: s.tenantId, refType: 'Solicitacao', refId: s.id, acao: 'SIMULACAO', userId: uid(req), ator: 'EQUIPE', detalhe: { alteracoes: plano.totalAlteracoes, mantidos: plano.totalMantidos } })
      return res.json({ dryRun: true, plano, aviso: 'Simulação: nada foi alterado. Reenvie com dryRun=false e confirmar=true para executar.' })
    }
    if (!b.confirmar) throw httpError(400, 'Confirme a execução irreversível (confirmar=true).')
    const r = await executar(p, plano, { userId: uid(req), excluirSolicitacaoId: s.id })
    await prisma.lgpSolicitacao.update({ where: { id: s.id }, data: { executadoEm: new Date(), resultadoExecucao: r as any } })
    await trilha({ tenantId: s.tenantId, refType: 'Solicitacao', refId: s.id, acao: 'EXECUTADA', userId: uid(req), ator: 'EQUIPE', detalhe: r })
    res.json({ dryRun: false, resultado: r, excecaoArt16: plano.excecaoArt16 })
  }))

  // --- Correção (art. 18, III)
  router.post('/solicitacoes/:id/corrigir', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const s = await carregar(req)
    if (!abertaStatus(s.status)) throw httpError(409, 'Solicitação já encerrada.')
    if (s.tipo !== 'CORRECAO') throw httpError(409, 'Só para solicitações de correção.')
    exigirIdentidade(s)
    const p = await pessoaDaSolicitacao(s)
    const b = parseBody(z.object({ alteracoes: z.array(z.object({ entidade: z.enum(['student', 'admCandidato', 'apoEgresso', 'comContato', 'user']), registroId: z.string().min(5).max(80), campo: z.string().min(1).max(40), valor: z.string().max(300) })).min(1).max(20) }), req.body)
    const aplicadas: any[] = []
    for (const a of b.alteracoes) {
      const cfg = CORRIGIVEIS[a.entidade]
      const tipoCampo = cfg.campos[a.campo]
      if (!tipoCampo) throw httpError(400, `Campo não corrigível por esta rotina: ${a.entidade}.${a.campo}`)
      if (!cfg.escopo(p).includes(a.registroId)) throw httpError(403, 'O registro não pertence ao titular desta solicitação.')
      let valor: any = a.valor.trim()
      if (tipoCampo === 'cpf') { if (!cpfValido(valor)) throw httpError(400, 'CPF inválido.'); valor = formatarCpf(soDigitos(valor)) }
      if (tipoCampo === 'data') { const d = new Date(valor); if (isNaN(d.getTime())) throw httpError(400, 'Data inválida.'); valor = d }
      if (!valor) throw httpError(400, 'Valor vazio: para apagar o dado use a rotina de eliminação.')
      const d = (prisma as any)[cfg.delegate]
      const antes = await d.findFirst({ where: { id: a.registroId, tenantId: p.tenantId }, select: { [a.campo]: true } })
      if (!antes) throw httpError(404, 'Registro não encontrado.')
      await d.update({ where: { id: a.registroId }, data: { [a.campo]: valor } })
      aplicadas.push({ entidade: a.entidade, campo: a.campo, antes: mascararAlteracao(a.campo, antes[a.campo]), depois: mascararAlteracao(a.campo, valor) })
    }
    await prisma.lgpSolicitacao.update({ where: { id: s.id }, data: { executadoEm: new Date(), resultadoExecucao: { correcoes: aplicadas } as any } })
    await trilha({ tenantId: s.tenantId, refType: 'Solicitacao', refId: s.id, acao: 'CORRECAO_APLICADA', userId: uid(req), ator: 'EQUIPE', detalhe: { correcoes: aplicadas } })
    res.json({ aplicadas })
  }))

  // --- Resposta ao titular
  router.post('/solicitacoes/:id/responder', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const s = await carregar(req)
    if (!abertaStatus(s.status)) throw httpError(409, 'Solicitação já encerrada.')
    const b = parseBody(z.object({ resultado: z.enum(['ATENDIDA', 'ATENDIDA_PARCIALMENTE', 'NEGADA']), resposta: z.string().min(20).max(8000), justificativa: z.string().max(2000).optional() }), req.body)
    if ((b.resultado === 'NEGADA' || b.resultado === 'ATENDIDA_PARCIALMENTE') && (!b.justificativa || b.justificativa.length < 15)) throw httpError(422, 'Negativa ou atendimento parcial exige justificativa (indique o fundamento legal, ex.: art. 16 da LGPD).')
    if (b.resultado === 'ATENDIDA') {
      if (['ANONIMIZACAO', 'ELIMINACAO', 'CORRECAO', 'REVOGACAO_CONSENTIMENTO'].includes(s.tipo) && !s.executadoEm) throw httpError(409, 'Execute a rotina (anonimização/eliminação/correção/revogação) antes de marcar como atendida.')
      if (['ACESSO', 'PORTABILIDADE'].includes(s.tipo) && !s.pacoteGeradoEm) throw httpError(409, 'Gere o pacote de dados antes de marcar como atendida.')
    }
    const agora = new Date()
    const r = await prisma.lgpSolicitacao.update({ where: { id: s.id }, data: { status: b.resultado, resposta: b.resposta, justificativaNegativa: b.justificativa, respondidaEm: agora } })
    await trilha({ tenantId: s.tenantId, refType: 'Solicitacao', refId: s.id, acao: 'RESPONDIDA', userId: uid(req), ator: 'EQUIPE', detalhe: { resultado: b.resultado, noPrazo: agora <= (s.prorrogadoEm ?? s.prazoEm) } })
    await andamento(s.tenantId, s.id, b.resultado === 'NEGADA' ? 'Solicitação respondida (negativa fundamentada).' : 'Solicitação respondida.', uid(req))
    await completeReminders({ tenantId: s.tenantId, refType: 'LgpSolicitacao', refId: s.id }).catch(() => undefined)
    // aviso ao titular SEM dados pessoais no corpo: a resposta é consultada no Portal com protocolo + código
    await notify({ tenantId: s.tenantId, canal: 'EMAIL', destino: s.email, assunto: `Sua solicitação ${s.protocolo} foi respondida`, mensagem: `Sua solicitação de direitos de titular (protocolo ${s.protocolo}) foi respondida. Acesse o Portal do Titular com o protocolo e o código de acompanhamento para ler a resposta.`, refType: 'LgpSolicitacao', refId: s.id })
    res.json(visao(r, true))
  }))

  router.post('/solicitacoes/:id/cancelar', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const s = await carregar(req)
    if (!abertaStatus(s.status)) throw httpError(409, 'Solicitação já encerrada.')
    const b = parseBody(z.object({ motivo: z.string().min(10).max(500) }), req.body)
    const r = await prisma.lgpSolicitacao.update({ where: { id: s.id }, data: { status: 'CANCELADA', justificativaNegativa: b.motivo, respondidaEm: new Date() } })
    await trilha({ tenantId: s.tenantId, refType: 'Solicitacao', refId: s.id, acao: 'CANCELADA', userId: uid(req), ator: 'EQUIPE', detalhe: { motivo: b.motivo } })
    await cancelReminders({ tenantId: s.tenantId, refType: 'LgpSolicitacao', refId: s.id }).catch(() => undefined)
    res.json(visao(r, true))
  }))

  router.get('/trilha', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['refType', 'refId', 'acao', 'userId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const [items, total] = await Promise.all([prisma.lgpTrilha.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.lgpTrilha.count({ where })])
    res.json({ items, total, page, pageSize })
  }))
}

// ------------------------------------------------------------------ rotas públicas (Portal do Titular)
const ERRO_CONSULTA = 'Protocolo ou código inválido.'

export function mountSolicitacoesPublic(pub: Router) {
  pub.post('/:tenant/solicitacoes', asyncHandler(async (req: Request, res: Response) => {
    limitePublico(req, 'sol-nova', 6, 3_600_000)
    const tenantId = await tenantPublico(req)
    if ((req.body as any)?.website) return res.status(201).json({ ok: true })
    const b = parseBody(novaSchema, req.body)
    const { s, senha } = await criarSolicitacao(tenantId, b, { canal: 'PORTAL', ...hashesDe(req, tenantId) })
    res.status(201).json({ protocolo: s.protocolo, codigoAcompanhamento: senha, prazoEm: s.prazoEm, aviso: 'Guarde o protocolo e o código para acompanhar. O código não pode ser recuperado. Para sua segurança, poderemos pedir a confirmação da sua identidade antes de entregar ou alterar dados.' })
  }))

  async function autenticar(req: Request) {
    const tenantId = await resolverTenantPublico(String(req.params.tenant))
    if (!tenantId) throw httpError(404, ERRO_CONSULTA)
    limitePublico(req, 'sol-consulta', 40, 600_000)
    const protocolo = String(req.body?.protocolo ?? '').trim().toUpperCase()
    const codigo = String(req.body?.codigo ?? '')
    if (!protocoloValido(protocolo) || !codigo) throw httpError(404, ERRO_CONSULTA)
    const s = await prisma.lgpSolicitacao.findFirst({ where: { tenantId, protocolo } })
    if (!s) throw httpError(404, ERRO_CONSULTA)
    if (s.consultaBloqueadaAte && s.consultaBloqueadaAte > new Date()) throw httpError(429, 'Consulta temporariamente bloqueada por excesso de tentativas. Tente em alguns minutos.')
    if (!conferirSegredo(codigo, s.senhaHash, s.senhaSalt)) {
      const falhas = s.consultaFalhas + 1
      await prisma.lgpSolicitacao.update({ where: { id: s.id }, data: { consultaFalhas: falhas >= 5 ? 0 : falhas, ...(falhas >= 5 ? { consultaBloqueadaAte: new Date(Date.now() + 15 * 60_000) } : {}) } })
      throw httpError(404, ERRO_CONSULTA)
    }
    if (s.consultaFalhas > 0) await prisma.lgpSolicitacao.update({ where: { id: s.id }, data: { consultaFalhas: 0 } })
    return s
  }

  pub.post('/:tenant/solicitacoes/consulta', asyncHandler(async (req: Request, res: Response) => {
    const s = await autenticar(req)
    const prazo = estadoPrazo(s.createdAt, s.prorrogadoEm ?? s.prazoEm, abertaStatus(s.status))
    const ev = await prisma.lgpTrilha.findMany({ where: { tenantId: s.tenantId, refType: 'Solicitacao', refId: s.id, acao: 'ANDAMENTO' }, orderBy: { createdAt: 'asc' } })
    const andamentos = ev.map((e) => ({ em: e.createdAt, texto: (e.detalhe as any)?.texto })).filter((a) => a.texto)
    res.json({
      protocolo: s.protocolo, tipo: s.tipo, tipoRotulo: ROTULO_TIPO[s.tipo], status: s.status, abertaEm: s.createdAt, prazoEm: s.prorrogadoEm ?? s.prazoEm, prorrogada: !!s.prorrogadoEm, prazoEstado: prazo.estado,
      resposta: ['ATENDIDA', 'ATENDIDA_PARCIALMENTE', 'NEGADA'].includes(s.status) ? s.resposta : null,
      justificativa: ['ATENDIDA_PARCIALMENTE', 'NEGADA'].includes(s.status) ? s.justificativaNegativa : null, respondidaEm: s.respondidaEm,
      podeResponder: s.status === 'AGUARDANDO_TITULAR', andamentos,
    })
  }))

  // O titular responde a um pedido de esclarecimento (status AGUARDANDO_TITULAR)
  pub.post('/:tenant/solicitacoes/responder', asyncHandler(async (req: Request, res: Response) => {
    const s = await autenticar(req)
    const b = parseBody(z.object({ mensagem: z.string().min(3).max(3000) }), req.body)
    if (s.status !== 'AGUARDANDO_TITULAR') throw httpError(409, 'Esta solicitação não está aguardando informações do titular.')
    await prisma.lgpSolicitacao.update({ where: { id: s.id }, data: { status: 'EM_ANALISE', descricao: `${s.descricao ?? ''}\n\n[Complemento do titular em ${new Date().toLocaleDateString('pt-BR')}]: ${b.mensagem}`.trim() } })
    await trilha({ tenantId: s.tenantId, refType: 'Solicitacao', refId: s.id, acao: 'COMPLEMENTO_TITULAR', ator: 'TITULAR' })
    await andamento(s.tenantId, s.id, 'Recebemos as informações complementares do titular.')
    res.json({ ok: true })
  }))
}

