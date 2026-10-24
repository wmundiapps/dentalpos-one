import { Request, Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { exigirGestorLgpd, hashesDe, httpError, limitePublico, tenantPublico, tid, trilha, uid, cpfValido, soDigitos } from './base'
import { Pessoa } from './catalogo'
import { gerarCodigo, hashDocumento, hmacCurto, mascararCpf, mascararEmail, mascararNome } from './mascara'
import { FINALIDADES, VERSAO_MODELO, finalidadePorCodigo, textoModelo, COOKIES_NECESSARIOS } from './textos'
import { maiorDeIdade } from './prazos'
import { sha256 } from './mascara'
import { registrarAcessoSensivel } from './sensiveis'

// ============================================================
// 1) Consentimentos versionados (art. 7º, I; art. 8º; art. 11, I; art. 14, §1º)
// ============================================================

export interface TextoVigente { finalidade: string; versao: string; titulo: string; texto: string; baseLegal: string; textoHash: string; origem: 'MODELO' | 'INSTITUICAO' }

export async function textoVigente(tenantId: string, finalidade: string): Promise<TextoVigente | null> {
  const db = await prisma.lgpTextoConsentimento.findFirst({ where: { tenantId, finalidade, ativo: true }, orderBy: { vigenteDesde: 'desc' } })
  if (db) return { finalidade, versao: db.versao, titulo: db.titulo, texto: db.texto, baseLegal: db.baseLegal, textoHash: db.textoHash, origem: 'INSTITUICAO' }
  const f = finalidadePorCodigo(finalidade)
  return f ? textoModelo(f) : null
}

export async function textosVigentes(tenantId: string) {
  const out: TextoVigente[] = []
  const dbs = await prisma.lgpTextoConsentimento.findMany({ where: { tenantId, ativo: true }, orderBy: { vigenteDesde: 'desc' } })
  const vistos = new Set<string>()
  for (const d of dbs) if (!vistos.has(d.finalidade)) { vistos.add(d.finalidade); out.push({ finalidade: d.finalidade, versao: d.versao, titulo: d.titulo, texto: d.texto, baseLegal: d.baseLegal, textoHash: d.textoHash, origem: 'INSTITUICAO' }) }
  for (const f of FINALIDADES) if (!vistos.has(f.codigo)) out.push(textoModelo(f))
  return out
}

const responsavelSchema = z.object({
  nome: z.string().min(3).max(150), parentesco: z.string().min(2).max(40),
  email: z.string().email().max(150).optional(), telefone: z.string().max(30).optional(), documento: z.string().max(20).optional(),
  declaracao: z.literal(true, { message: 'O responsável deve declarar que é o responsável legal.' }),
})

export const consentirSchema = z.object({
  finalidade: z.string().min(2).max(60),
  versao: z.string().min(1).max(40),
  titularTipo: z.enum(['ALUNO', 'CANDIDATO', 'EGRESSO', 'RESPONSAVEL', 'VISITANTE', 'OUTRO']).default('OUTRO'),
  titularId: z.string().max(80).optional(),
  titularRef: z.string().min(16).max(80).optional(),     // id anônimo do navegador (cookies)
  nome: z.string().min(2).max(150).optional(),
  email: z.string().email().max(150).optional(),
  documento: z.string().max(20).optional(),
  dataNascimento: z.string().max(10).optional(),
  menor: z.boolean().optional(),
  responsavel: responsavelSchema.optional(),
})
export type ConsentirInput = z.infer<typeof consentirSchema>

interface CtxConsent { canal: string; ipHash?: string | null; uaHash?: string | null; registradoPorId?: string }

export async function registrarConsentimento(tenantId: string, d: ConsentirInput, ctx: CtxConsent) {
  const texto = await textoVigente(tenantId, d.finalidade)
  if (!texto) throw httpError(400, 'Finalidade de consentimento desconhecida.')
  if (texto.versao !== d.versao) throw Object.assign(httpError(409, 'O texto de consentimento foi atualizado. Leia a versão vigente antes de consentir.'), { texto })
  const def = finalidadePorCodigo(d.finalidade)
  const cookie = !!def?.cookie

  // identificação mínima do titular
  const docDigits = soDigitos(d.documento)
  if (d.documento && !cpfValido(docDigits)) throw httpError(400, 'CPF inválido.')
  const identificado = !!(d.email || docDigits)
  if (!cookie && !identificado && !d.titularId) throw httpError(422, 'Informe e-mail ou CPF para registrar o consentimento.')
  if (cookie && !d.titularRef && !identificado) throw httpError(422, 'Cookies: informe o identificador anônimo do navegador (titularRef).')

  // menores (art. 14): menor de 18 anos exige consentimento do responsável legal quando a finalidade se baseia em consentimento
  const adulto = maiorDeIdade(d.dataNascimento)
  const menor = d.menor === true || adulto === false
  if (menor && def?.exigeResponsavelMenor && !d.responsavel) {
    throw Object.assign(httpError(422, 'Titular menor de 18 anos: o consentimento deve ser dado pelo pai, mãe ou responsável legal (LGPD, art. 14, §1º).'), { exigeResponsavel: true })
  }
  if (menor && d.responsavel && !(d.responsavel.email || d.responsavel.telefone)) throw httpError(422, 'Informe e-mail ou telefone do responsável legal.')
  if (d.responsavel?.documento && !cpfValido(d.responsavel.documento)) throw httpError(400, 'CPF do responsável inválido.')

  const docHash = docDigits ? hashDocumento(docDigits, tenantId) : null
  const email = d.email?.toLowerCase() ?? null

  // idempotência: consentimento ativo da mesma pessoa e finalidade
  const chavePessoa: any[] = []
  if (d.titularRef) chavePessoa.push({ titularRef: d.titularRef })
  if (docHash) chavePessoa.push({ titularDocHash: docHash })
  if (email) chavePessoa.push({ titularEmail: email })
  if (d.titularId) chavePessoa.push({ titularId: d.titularId })
  const ativo = chavePessoa.length ? await prisma.lgpConsentimento.findFirst({ where: { tenantId, finalidade: d.finalidade, status: 'ATIVO', OR: chavePessoa } }) : null
  if (ativo && ativo.versaoTexto === texto.versao && ativo.textoHash === texto.textoHash) return { consentimento: ativo, recibo: null, jaExistia: true, texto }
  if (ativo) {
    await prisma.lgpConsentimento.update({ where: { id: ativo.id }, data: { status: 'REVOGADO', revogadoEm: new Date(), motivoRevogacao: 'SUBSTITUIDO_POR_NOVA_VERSAO' } })
    await trilha({ tenantId, refType: 'Consentimento', refId: ativo.id, acao: 'SUBSTITUIDO', ator: 'TITULAR', detalhe: { versaoAnterior: ativo.versaoTexto, versaoNova: texto.versao } })
  }

  let responsavelId: string | null = null
  if (menor && d.responsavel) {
    const r = await prisma.lgpResponsavel.create({
      data: {
        tenantId, titularTipo: d.titularTipo, titularId: d.titularId, titularNome: d.nome,
        nome: d.responsavel.nome, parentesco: d.responsavel.parentesco, email: d.responsavel.email?.toLowerCase(), telefone: d.responsavel.telefone,
        docHash: d.responsavel.documento ? hashDocumento(d.responsavel.documento, tenantId) : null,
        docMascarado: d.responsavel.documento ? mascararCpf(d.responsavel.documento) : null,
      },
    })
    responsavelId = r.id
  }

  const recibo = gerarCodigo(5)
  const c = await prisma.lgpConsentimento.create({
    data: {
      tenantId, titularTipo: d.titularTipo, titularId: d.titularId, titularRef: d.titularRef, titularNome: d.nome, titularEmail: email,
      titularDocHash: docHash, titularDocMascarado: docDigits ? mascararCpf(docDigits) : null,
      finalidade: d.finalidade, baseLegal: texto.baseLegal, versaoTexto: texto.versao, textoHash: texto.textoHash, concedido: true, status: 'ATIVO',
      canal: ctx.canal, sensivel: !!def?.sensivel, menor, responsavelId, ipHash: ctx.ipHash, uaHash: ctx.uaHash,
      reciboHash: hmacCurto(`recibo:${recibo.replace(/-/g, '')}`, tenantId), registradoPorId: ctx.registradoPorId,
    },
  })
  await trilha({ tenantId, refType: 'Consentimento', refId: c.id, acao: 'CONCEDIDO', userId: ctx.registradoPorId, ator: ctx.registradoPorId ? 'EQUIPE' : 'TITULAR', detalhe: { finalidade: d.finalidade, versao: texto.versao, textoHash: texto.textoHash, canal: ctx.canal, menor } })
  if (d.finalidade === 'COMUNICACAO_MARKETING') await sincronizarMarketing(tenantId, { email, telefones: [], docDigits: docDigits ? [docDigits] : [] }, true)
  return { consentimento: c, recibo, jaExistia: false, texto }
}

/** Reflete o consentimento de marketing no opt-in/opt-out do módulo de comunicação (opt-out sempre vence). */
export async function sincronizarMarketing(tenantId: string, alvo: { email?: string | null; telefones: string[]; docDigits: string[]; contatoIds?: string[] }, consentimento: boolean) {
  const or: any[] = []
  if (alvo.email) or.push({ email: { equals: alvo.email, mode: 'insensitive' } })
  for (const t of alvo.telefones) or.push({ telefone: t })
  for (const dg of alvo.docDigits) or.push({ documento: dg })
  if (alvo.contatoIds?.length) or.push({ id: { in: alvo.contatoIds } })
  if (!or.length) return 0
  const contatos = await prisma.comContato.findMany({ where: { tenantId, OR: or }, select: { id: true } })
  for (const c of contatos) {
    await prisma.comPreferencia.upsert({
      where: { tenantId_contatoId_canal_finalidade: { tenantId, contatoId: c.id, canal: '*', finalidade: 'MARKETING' } },
      create: { tenantId, contatoId: c.id, canal: '*', finalidade: 'MARKETING', consentimento, origem: 'LGPD_PORTAL', motivo: consentimento ? 'Consentimento registrado na Central LGPD' : 'Revogação do consentimento (LGPD)' },
      update: { consentimento, origem: 'LGPD_PORTAL', motivo: consentimento ? 'Consentimento registrado na Central LGPD' : 'Revogação do consentimento (LGPD)', registradoEm: new Date() },
    })
  }
  return contatos.length
}

export async function revogar(tenantId: string, id: string, motivo: string, ator: { userId?: string; titular?: boolean }) {
  const c = await prisma.lgpConsentimento.findFirst({ where: { id, tenantId } })
  if (!c) throw httpError(404, 'Consentimento não encontrado.')
  if (c.status === 'REVOGADO') return c
  const r = await prisma.lgpConsentimento.update({ where: { id }, data: { status: 'REVOGADO', revogadoEm: new Date(), motivoRevogacao: motivo.slice(0, 300) } })
  await trilha({ tenantId, refType: 'Consentimento', refId: id, acao: 'REVOGADO', userId: ator.userId, ator: ator.titular ? 'TITULAR' : 'EQUIPE', detalhe: { finalidade: c.finalidade, motivo } })
  if (c.finalidade === 'COMUNICACAO_MARKETING') {
    await sincronizarMarketing(tenantId, { email: c.titularEmail, telefones: [], docDigits: [] }, false)
  }
  return r
}

/** Revoga todos os consentimentos ativos de uma pessoa (usado em pedidos de revogação/eliminação). */
export async function revogarConsentimentosPessoa(p: Pessoa, motivo: string, userId?: string): Promise<number> {
  const or: any[] = [{ titularId: { in: p.todosIds } }]
  if (p.emails.length) or.push({ titularEmail: { in: p.emails } })
  const docHashes = p.docs.map((d) => hashDocumento(d, p.tenantId)).filter(Boolean) as string[]
  if (docHashes.length) or.push({ titularDocHash: { in: docHashes } })
  const ativos = await prisma.lgpConsentimento.findMany({ where: { tenantId: p.tenantId, status: 'ATIVO', OR: or }, select: { id: true } })
  for (const a of ativos) await revogar(p.tenantId, a.id, motivo, { userId })
  // marketing: o opt-out vale mesmo sem registro prévio no módulo LGPD
  await sincronizarMarketing(p.tenantId, { email: null, telefones: [], docDigits: [], contatoIds: p.contatoIds }, false)
  if (p.candidatoIds.length) await prisma.admCandidato.updateMany({ where: { tenantId: p.tenantId, id: { in: p.candidatoIds }, consentimentoMarketing: true }, data: { consentimentoMarketing: false } })
  return ativos.length
}

const visao = (c: any) => ({
  id: c.id, titularTipo: c.titularTipo, titularId: c.titularId, titularNome: c.titularNome ? mascararNome(c.titularNome) : null, titularEmail: c.titularEmail ? mascararEmail(c.titularEmail) : null,
  titularDoc: c.titularDocMascarado, finalidade: c.finalidade, baseLegal: c.baseLegal, versaoTexto: c.versaoTexto, textoHash: c.textoHash, status: c.status,
  concedidoEm: c.concedidoEm, revogadoEm: c.revogadoEm, motivoRevogacao: c.motivoRevogacao, canal: c.canal, sensivel: c.sensivel, menor: c.menor, responsavelId: c.responsavelId, createdAt: c.createdAt,
})

// ------------------------------------------------------------------ rotas
export function mountConsentimentos(router: Router) {
  router.get('/consentimentos', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['finalidade', 'status', 'titularTipo', 'canal']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    if (qs(req.query.menor)) where.menor = qs(req.query.menor) === 'true'
    const q = qs(req.query.q)
    if (q) where.OR = [{ titularNome: { contains: q, mode: 'insensitive' } }, { titularEmail: { contains: q, mode: 'insensitive' } }]
    const [items, total] = await Promise.all([prisma.lgpConsentimento.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.lgpConsentimento.count({ where })])
    res.json({ items: items.map(visao), total, page, pageSize })
  }))

  router.get('/consentimentos/resumo', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const g = await prisma.lgpConsentimento.groupBy({ by: ['finalidade', 'status'], where: { tenantId }, _count: { _all: true } })
    const porFinalidade: Record<string, { ativos: number; revogados: number }> = {}
    for (const r of g) { const x = (porFinalidade[r.finalidade] ??= { ativos: 0, revogados: 0 }); if (r.status === 'ATIVO') x.ativos += r._count._all; else x.revogados += r._count._all }
    const menores = await prisma.lgpConsentimento.count({ where: { tenantId, menor: true, status: 'ATIVO' } })
    res.json({ porFinalidade, menoresAtivos: menores })
  }))

  router.get('/consentimentos/:id', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const c = await prisma.lgpConsentimento.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) throw httpError(404, 'Consentimento não encontrado.')
    const resp = c.responsavelId ? await prisma.lgpResponsavel.findFirst({ where: { id: c.responsavelId, tenantId } }) : null
    const hist = await prisma.lgpTrilha.findMany({ where: { tenantId, refType: 'Consentimento', refId: c.id }, orderBy: { createdAt: 'asc' } })
    await registrarAcessoSensivel(req, { recurso: 'lgpd/consentimentos', recursoId: c.id, categoria: c.sensivel ? 'SAUDE' : 'IDENTIFICACAO', titularTipo: c.titularTipo, titularId: c.titularId ?? undefined })
    res.json({ ...visao(c), titularNome: c.titularNome, titularEmail: c.titularEmail, ipHash: c.ipHash, uaHash: c.uaHash, responsavel: resp ? { nome: resp.nome, parentesco: resp.parentesco, email: resp.email, documento: resp.docMascarado } : null, trilha: hist })
  }))

  // Registro presencial/balcão em nome do titular (evidência: quem registrou)
  router.post('/consentimentos', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(consentirSchema.extend({ canal: z.enum(['PRESENCIAL', 'FORMULARIO', 'API']).default('PRESENCIAL') }), req.body)
    const r = await registrarConsentimento(tenantId, b, { canal: b.canal, ...hashesDe(req, tenantId), registradoPorId: uid(req) })
    res.status(r.jaExistia ? 200 : 201).json({ consentimento: visao(r.consentimento), recibo: r.recibo, jaExistia: r.jaExistia })
  }))

  router.post('/consentimentos/:id/revogar', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ motivo: z.string().min(3).max(300) }), req.body)
    res.json(visao(await revogar(tid(req), String(req.params.id), b.motivo, { userId: uid(req) })))
  }))

  // Textos versionados
  router.get('/textos-consentimento', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const historico = await prisma.lgpTextoConsentimento.findMany({ where: { tenantId }, orderBy: [{ finalidade: 'asc' }, { vigenteDesde: 'desc' }] })
    res.json({ vigentes: await textosVigentes(tenantId), historico, cookiesNecessarios: COOKIES_NECESSARIOS, aviso: 'Textos-modelo: devem ser revisados por advogado antes do uso.' })
  }))

  router.post('/textos-consentimento', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ finalidade: z.string().min(2).max(60), versao: z.string().min(1).max(40), titulo: z.string().min(3).max(150), texto: z.string().min(30).max(8000), baseLegal: z.string().max(40).default('CONSENTIMENTO') }), req.body)
    if (b.versao === VERSAO_MODELO) throw httpError(400, 'Versão reservada ao texto-modelo.')
    const dup = await prisma.lgpTextoConsentimento.findUnique({ where: { tenantId_finalidade_versao: { tenantId, finalidade: b.finalidade, versao: b.versao } } })
    if (dup) throw httpError(409, 'Essa versão já existe: publique uma nova versão (textos publicados são imutáveis).')
    await prisma.lgpTextoConsentimento.updateMany({ where: { tenantId, finalidade: b.finalidade, ativo: true }, data: { ativo: false } })
    const t = await prisma.lgpTextoConsentimento.create({ data: { ...b, tenantId, textoHash: sha256(b.texto), criadoPorId: uid(req) } })
    await trilha({ tenantId, refType: 'TextoConsentimento', refId: t.id, acao: 'PUBLICADO', userId: uid(req), ator: 'EQUIPE', detalhe: { finalidade: b.finalidade, versao: b.versao } })
    res.status(201).json(t)
  }))
}

// ------------------------------------------------------------------ rotas públicas (titular)
export function mountConsentimentosPublic(pub: Router) {
  pub.get('/:tenant/textos', asyncHandler(async (req: Request, res: Response) => {
    const tenantId = await tenantPublico(req)
    res.json({ textos: await textosVigentes(tenantId), cookiesNecessarios: COOKIES_NECESSARIOS, aviso: 'Texto-modelo sujeito a validação jurídica da instituição.' })
  }))

  pub.post('/:tenant/consentimentos', asyncHandler(async (req: Request, res: Response) => {
    limitePublico(req, 'consent', 60, 3_600_000)
    const tenantId = await tenantPublico(req)
    if ((req.body as any)?.website) return res.status(201).json({ ok: true })   // honeypot
    const b = parseBody(consentirSchema, req.body)
    const r = await registrarConsentimento(tenantId, b, { canal: finalidadePorCodigo(b.finalidade)?.cookie ? 'COOKIE_BANNER' : 'PORTAL', ...hashesDe(req, tenantId) })
    res.status(r.jaExistia ? 200 : 201).json({
      id: r.consentimento.id, finalidade: r.consentimento.finalidade, versao: r.consentimento.versaoTexto, status: r.consentimento.status, concedidoEm: r.consentimento.concedidoEm, jaExistia: r.jaExistia,
      recibo: r.recibo, avisoRecibo: r.recibo ? 'Guarde este código: ele permite revogar este consentimento a qualquer momento.' : undefined,
    })
  }))

  // Revoga com o recibo recebido ao consentir, ou (cookies) com o identificador anônimo do navegador.
  pub.post('/:tenant/consentimentos/revogar', asyncHandler(async (req: Request, res: Response) => {
    limitePublico(req, 'revogar', 60, 3_600_000)
    const tenantId = await tenantPublico(req)
    const b = parseBody(z.object({ id: z.string().max(80).optional(), recibo: z.string().max(40).optional(), titularRef: z.string().min(16).max(80).optional(), finalidade: z.string().max(60).optional(), motivo: z.string().max(300).optional() }), req.body)
    let alvo: any[] = []
    if (b.id && b.recibo) {
      const c = await prisma.lgpConsentimento.findFirst({ where: { id: b.id, tenantId } })
      const ok = c?.reciboHash && c.reciboHash === hmacCurto(`recibo:${b.recibo.toUpperCase().replace(/[^A-Z0-9]/g, '')}`, tenantId)
      if (!c || !ok) throw httpError(404, 'Consentimento não encontrado ou recibo inválido.')
      alvo = [c]
    } else if (b.titularRef) {
      alvo = await prisma.lgpConsentimento.findMany({ where: { tenantId, titularRef: b.titularRef, status: 'ATIVO', ...(b.finalidade ? { finalidade: b.finalidade } : {}) } })
    } else throw httpError(400, 'Informe id e recibo, ou o identificador do navegador (titularRef).')
    for (const c of alvo) await revogar(tenantId, c.id, b.motivo || 'Revogado pelo titular no Portal do Titular', { titular: true })
    res.json({ revogados: alvo.length, mensagem: alvo.length ? 'Consentimento revogado. O tratamento baseado nele cessa daqui em diante.' : 'Nenhum consentimento ativo encontrado.' })
  }))
}

/** Alunos/candidatos menores de 18 anos sem responsável legal registrado (apoio à conformidade do art. 14). */
export async function menoresSemResponsavel(tenantId: string, limite = 200) {
  const corte = new Date(); corte.setFullYear(corte.getFullYear() - 18)
  const alunos = await prisma.student.findMany({ where: { tenantId, dataNascimento: { gt: corte }, status: { in: ['ATIVO', 'TRANCADO'] } }, select: { id: true, nomeCompleto: true, ra: true, dataNascimento: true }, take: limite })
  const resp = await prisma.lgpResponsavel.findMany({ where: { tenantId, titularId: { in: alunos.map((a) => a.id) } }, select: { titularId: true } })
  const com = new Set(resp.map((r) => r.titularId))
  return alunos.filter((a) => !com.has(a.id)).map((a) => ({ tipo: 'ALUNO', id: a.id, nome: mascararNome(a.nomeCompleto), ra: a.ra, dataNascimento: a.dataNascimento }))
}
