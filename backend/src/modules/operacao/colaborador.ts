import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { HR, Req, asyncHandler, audit, data, erro, getTenantId, getUserId, num, pick, requireRole, txt } from './util'

// Portal do colaborador: o próprio colaborador vê sua hierarquia, declarações, POPs, instruções, manuais, treinamentos, EPIs e regras do setor.
// RH/administração mantêm a biblioteca e o catálogo de EPIs. Montado em /api/edu/colaborador.
const router = Router()
const gestaoRh = requireRole(HR)
const TIPOS = ['DECLARACAO', 'POP', 'INSTRUCAO', 'MANUAL', 'TREINAMENTO', 'REGRA']
const DOC = { tipo: 'str', titulo: 'str', descricao: 'str', conteudo: 'str', url: 'str', departamentoId: 'str', cargoId: 'str', obrigatorio: 'bool', duracaoHoras: 'num', prazoDias: 'num', ativo: 'bool' } as const
const fmt = (d?: Date | null) => (d ? d.toLocaleDateString('pt-BR') : '—')

async function meuColaborador(req: Req) {
  const tenantId = getTenantId(req), userId = getUserId(req)
  let c = await prisma.rheColaborador.findFirst({ where: { tenantId, userId } })
  if (!c && req.user?.email) c = await prisma.rheColaborador.findFirst({ where: { tenantId, email: { equals: req.user.email, mode: 'insensitive' } } })
  return c
}

/** Cadeia de reporte: quem é o gestor direto e acima, até 5 níveis. */
async function cadeia(tenantId: string, gestorId?: string | null) {
  const out: any[] = []
  let atual = gestorId
  for (let i = 0; i < 5 && atual; i++) {
    const g = await prisma.rheColaborador.findFirst({ where: { tenantId, id: atual }, select: { id: true, nome: true, email: true, telefone: true, cargoId: true, gestorId: true } })
    if (!g) break
    const cargo = g.cargoId ? await prisma.rheCargo.findFirst({ where: { tenantId, id: g.cargoId }, select: { nome: true } }) : null
    out.push({ id: g.id, nome: g.nome, email: g.email, telefone: g.telefone, cargo: cargo?.nome ?? null, nivel: i + 1 })
    atual = g.gestorId
  }
  return out
}

function renderizar(texto: string, c: any, cargo?: string | null, depto?: string | null) {
  const mapa: Record<string, string> = { nome: c.nome, cargo: cargo ?? '—', matricula: c.matricula, admissao: fmt(c.dataAdmissao), departamento: depto ?? '—', data: fmt(new Date()) }
  return texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => mapa[k] ?? '')
}

router.get('/meu', asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req)
  const c = await meuColaborador(req)
  if (!c) return res.json({ colaborador: null, mensagem: 'Seu usuário ainda não está vinculado a um cadastro de colaborador. Procure o RH.' })
  const [cargo, depto] = await Promise.all([
    c.cargoId ? prisma.rheCargo.findFirst({ where: { tenantId, id: c.cargoId }, select: { nome: true } }) : null,
    c.departamentoId ? prisma.rheDepartamento.findFirst({ where: { tenantId, id: c.departamentoId }, select: { nome: true } }) : null,
  ])
  const [docs, cienc, solic, entregas, escal, hierarquia] = await Promise.all([
    prisma.colDocumento.findMany({ where: { tenantId, ativo: true, AND: [{ OR: [{ departamentoId: null }, ...(c.departamentoId ? [{ departamentoId: c.departamentoId }] : [])] }, { OR: [{ cargoId: null }, ...(c.cargoId ? [{ cargoId: c.cargoId }] : [])] }] }, orderBy: [{ tipo: 'asc' }, { titulo: 'asc' }] }),
    prisma.colCiencia.findMany({ where: { tenantId, colaboradorId: c.id } }),
    prisma.colSolicitacao.findMany({ where: { tenantId, colaboradorId: c.id }, orderBy: { solicitadoEm: 'desc' }, take: 20 }),
    prisma.colEpiEntrega.findMany({ where: { tenantId, colaboradorId: c.id }, orderBy: { createdAt: 'desc' } }),
    prisma.colEscalonamento.findMany({ where: { tenantId, OR: [{ departamentoId: null }, ...(c.departamentoId ? [{ departamentoId: c.departamentoId }] : [])] }, orderBy: [{ demanda: 'asc' }, { nivel: 'asc' }] }),
    cadeia(tenantId, c.gestorId),
  ])
  const epis = await prisma.colEpi.findMany({ where: { tenantId, id: { in: entregas.map((e) => e.epiId) } } })
  const nomeEpi = new Map(epis.map((e) => [e.id, e]))
  const ciente = new Map(cienc.map((x) => [x.documentoId, x.cienteEm]))
  const documentos = docs.map((d) => ({ ...d, conteudo: d.tipo === 'DECLARACAO' ? undefined : d.conteudo, cienteEm: ciente.get(d.id) ?? null, vencido: Boolean(d.obrigatorio && !ciente.has(d.id) && d.prazoDias && Date.now() > d.createdAt.getTime() + d.prazoDias * 86_400_000) }))
  const equipe = await prisma.rheColaborador.count({ where: { tenantId, gestorId: c.id, status: { not: 'DESLIGADO' } } })
  res.json({
    colaborador: { id: c.id, nome: c.nome, matricula: c.matricula, cargo: cargo?.nome ?? null, departamento: depto?.nome ?? null, admissao: c.dataAdmissao, vinculo: c.vinculo, equipeDireta: equipe },
    hierarquia,
    documentos,
    pendentes: documentos.filter((d) => d.obrigatorio && !d.cienteEm && d.tipo !== 'DECLARACAO').length,
    epis: entregas.map((e) => ({ ...e, epi: nomeEpi.get(e.epiId)?.nome ?? 'EPI', ca: nomeEpi.get(e.epiId)?.ca ?? null })),
    epiPendentes: entregas.filter((e) => e.status === 'PENDENTE').length,
    solicitacoes: solic,
    escalonamento: escal,
  })
}))

router.post('/meu/ciencia/:id', asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req), c = (await meuColaborador(req)) ?? erro(404, 'Cadastro de colaborador não encontrado.')
  const d = await prisma.colDocumento.findFirst({ where: { id: String(req.params.id), tenantId, ativo: true } }) ?? erro(404, 'Documento não encontrado.')
  const r = await prisma.colCiencia.upsert({ where: { documentoId_colaboradorId: { documentoId: d.id, colaboradorId: c.id } }, update: {}, create: { tenantId, documentoId: d.id, colaboradorId: c.id } })
  res.status(201).json(r)
}))

router.post('/meu/declaracoes', asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req), c = (await meuColaborador(req)) ?? erro(404, 'Cadastro de colaborador não encontrado.')
  const modelo = await prisma.colDocumento.findFirst({ where: { id: txt(req.body?.documentoId, 60), tenantId, tipo: 'DECLARACAO', ativo: true } }) ?? erro(404, 'Modelo de declaração não encontrado.')
  const [cargo, depto] = await Promise.all([
    c.cargoId ? prisma.rheCargo.findFirst({ where: { tenantId, id: c.cargoId }, select: { nome: true } }) : null,
    c.departamentoId ? prisma.rheDepartamento.findFirst({ where: { tenantId, id: c.departamentoId }, select: { nome: true } }) : null,
  ])
  const s = await prisma.colSolicitacao.create({ data: { tenantId, colaboradorId: c.id, documentoId: modelo.id, titulo: modelo.titulo, status: 'EMITIDA', emitidoEm: new Date(), emitidoPor: 'Emissão automática', textoEmitido: renderizar(modelo.conteudo ?? modelo.descricao ?? modelo.titulo, c, cargo?.nome, depto?.nome) } })
  res.status(201).json(s)
}))

router.post('/meu/epis/:id/ciencia', asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req), c = (await meuColaborador(req)) ?? erro(404, 'Cadastro de colaborador não encontrado.')
  const r = await prisma.colEpiEntrega.updateMany({ where: { id: String(req.params.id), tenantId, colaboradorId: c.id, status: 'ENTREGUE', cienteEm: null }, data: { cienteEm: new Date() } })
  res.json({ ok: r.count > 0 })
}))

// ---------------- gestão (RH)
router.get('/painel', gestaoRh, asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req)
  const [docs, cienc, colabs, epis, entregas, escal, solic] = await Promise.all([
    prisma.colDocumento.findMany({ where: { tenantId }, orderBy: [{ tipo: 'asc' }, { titulo: 'asc' }] }),
    prisma.colCiencia.groupBy({ by: ['documentoId'], where: { tenantId }, _count: true }),
    prisma.rheColaborador.count({ where: { tenantId, status: { not: 'DESLIGADO' } } }),
    prisma.colEpi.findMany({ where: { tenantId }, orderBy: { nome: 'asc' } }),
    prisma.colEpiEntrega.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.colEscalonamento.findMany({ where: { tenantId }, orderBy: [{ demanda: 'asc' }, { nivel: 'asc' }] }),
    prisma.colSolicitacao.count({ where: { tenantId } }),
  ])
  const n = new Map(cienc.map((c) => [c.documentoId, c._count]))
  const nomes = new Map((await prisma.rheColaborador.findMany({ where: { tenantId, id: { in: entregas.map((e) => e.colaboradorId) } }, select: { id: true, nome: true } })).map((c) => [c.id, c.nome]))
  const nomeEpi = new Map(epis.map((e) => [e.id, e.nome]))
  res.json({
    colaboradoresAtivos: colabs, declaracoesEmitidas: solic, tipos: TIPOS,
    documentos: docs.map((d) => ({ ...d, cientes: n.get(d.id) ?? 0 })),
    epis, escalonamento: escal,
    entregas: entregas.map((e) => ({ ...e, colaborador: nomes.get(e.colaboradorId) ?? '—', epi: nomeEpi.get(e.epiId) ?? 'EPI' })),
  })
}))
router.get('/colaboradores', gestaoRh, asyncHandler(async (req: Req, res: Response) => {
  res.json(await prisma.rheColaborador.findMany({ where: { tenantId: getTenantId(req), status: { not: 'DESLIGADO' } }, select: { id: true, nome: true, matricula: true, departamentoId: true }, orderBy: { nome: 'asc' }, take: 1000 }))
}))
router.post('/documentos', gestaoRh, asyncHandler(async (req: Req, res: Response) => {
  const d = pick(req.body, DOC)
  if (!TIPOS.includes(d.tipo) || !d.titulo) erro(400, 'Informe tipo e título.')
  res.status(201).json(await prisma.colDocumento.create({ data: { tenantId: getTenantId(req), ...d } }))
}))
router.patch('/documentos/:id', gestaoRh, asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req), id = String(req.params.id)
  await prisma.colDocumento.findFirst({ where: { id, tenantId } }) ?? erro(404, 'Documento não encontrado.')
  res.json(await prisma.colDocumento.update({ where: { id }, data: { ...pick(req.body, DOC), versao: { increment: 1 } } }))
}))
router.delete('/documentos/:id', gestaoRh, asyncHandler(async (req: Req, res: Response) => {
  const r = await prisma.colDocumento.updateMany({ where: { id: String(req.params.id), tenantId: getTenantId(req) }, data: { ativo: false } })
  res.json({ ok: r.count > 0 })
}))
router.post('/epis', gestaoRh, asyncHandler(async (req: Req, res: Response) => {
  const d = pick(req.body, { nome: 'str', ca: 'str', categoria: 'str', validadeDias: 'num', departamentoId: 'str' })
  if (!d.nome) erro(400, 'Informe o nome do EPI.')
  res.status(201).json(await prisma.colEpi.create({ data: { tenantId: getTenantId(req), ...d } }))
}))
router.post('/epis/entregas', gestaoRh, asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req)
  const epi = await prisma.colEpi.findFirst({ where: { id: txt(req.body?.epiId, 60), tenantId } }) ?? erro(404, 'EPI não encontrado.')
  const c = await prisma.rheColaborador.findFirst({ where: { id: txt(req.body?.colaboradorId, 60), tenantId } }) ?? erro(404, 'Colaborador não encontrado.')
  res.status(201).json(await prisma.colEpiEntrega.create({ data: { tenantId, colaboradorId: c.id, epiId: epi.id, tamanho: txt(req.body?.tamanho, 20) || null, status: 'PENDENTE' } }))
}))
router.post('/epis/entregas/:id/entregar', gestaoRh, asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req)
  const e = await prisma.colEpiEntrega.findFirst({ where: { id: String(req.params.id), tenantId } }) ?? erro(404, 'Entrega não encontrada.')
  const epi = await prisma.colEpi.findFirst({ where: { id: e.epiId, tenantId } })
  const agora = new Date()
  const r = await prisma.colEpiEntrega.update({ where: { id: e.id }, data: { status: 'ENTREGUE', entregueEm: agora, entreguePor: txt(req.body?.entreguePor, 120) || 'Almoxarifado/SST', validadeAte: epi?.validadeDias ? new Date(agora.getTime() + epi.validadeDias * 86_400_000) : null } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'colaborador', acao: 'EPI_ENTREGUE', refType: 'ColEpiEntrega', refId: e.id })
  res.json(r)
}))
router.post('/escalonamento', gestaoRh, asyncHandler(async (req: Req, res: Response) => {
  const d = pick(req.body, { departamentoId: 'str', demanda: 'str', nivel: 'num', responsavel: 'str', cargo: 'str', contato: 'str' })
  if (!d.demanda || !d.responsavel) erro(400, 'Informe a demanda e o responsável.')
  res.status(201).json(await prisma.colEscalonamento.create({ data: { tenantId: getTenantId(req), ...d, nivel: num(d.nivel, 1) || 1 } }))
}))
router.delete('/escalonamento/:id', gestaoRh, asyncHandler(async (req: Req, res: Response) => {
  const r = await prisma.colEscalonamento.deleteMany({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
  res.json({ ok: r.count > 0 })
}))
void data
export default router
