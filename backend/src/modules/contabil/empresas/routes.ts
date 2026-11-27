import { Router } from 'express'
import { z } from 'zod'
import { adapter } from '../adapter'
import { garantirPlano } from '../contabilidade/plano'
import { auditar } from '../nucleo/auditoria'
import { prisma } from '../nucleo/db'
import { asyncHandler, httpError, pageParams, parseBody, qs } from '../nucleo/http'
import { MATRIZ, PAPEIS, ctxDe, exigir } from '../nucleo/rbac'
import { AVISO_LEGAL, documentoValido, soDigitos } from '../nucleo/util'
import { ATIVIDADES, classificarCnae } from '../regime/cnae'
import { empresaDoTenant } from './service'

const router = Router()
const ATIVS = ATIVIDADES.map((a) => a.valor) as [string, ...string[]]
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const

const empresaSchema = z.object({
  tipoPessoa: z.enum(['PJ', 'PF']).default('PJ'),
  documento: z.string().min(11).max(20),
  razaoSocial: z.string().trim().min(2).max(160),
  nomeFantasia: z.string().trim().max(160).nullish(),
  regimeAtual: z.enum(['MEI', 'SIMPLES', 'PRESUMIDO', 'REAL']).default('SIMPLES'),
  anexoSimples: z.enum(['I', 'II', 'III', 'IV', 'V']).nullish(),
  cnae: z.string().regex(/^\d{4}-?\d?\/?\d{0,2}$/, 'CNAE inválido (ex.: 6201-5/01)').nullish(),
  cnaeDescricao: z.string().trim().max(200).nullish(),
  atividade: z.enum(ATIVS).nullish(),
  uf: z.enum(UFS).nullish(),
  municipio: z.string().trim().max(100).nullish(),
  issAliquota: z.number().min(0).max(5).nullish(),
  inicioAtividade: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  email: z.string().email().max(160).nullish(),
  telefone: z.string().max(30).nullish(),
  observacoes: z.string().max(1000).nullish(),
  ativo: z.boolean().optional(),
  origemExterna: z.string().max(100).nullish(),
})

const out = (e: any) => ({ ...e, atividadeSugerida: classificarCnae(e.cnae) })

function normalizar(d: z.infer<typeof empresaSchema>) {
  const doc = soDigitos(d.documento)
  if (d.tipoPessoa === 'PJ' && doc.length !== 14) throw httpError(400, 'Para pessoa jurídica informe um CNPJ com 14 dígitos.')
  if (d.tipoPessoa === 'PF' && doc.length !== 11) throw httpError(400, 'Para pessoa física informe um CPF com 11 dígitos.')
  if (!documentoValido(doc)) throw httpError(400, d.tipoPessoa === 'PJ' ? 'CNPJ inválido (dígitos verificadores não conferem).' : 'CPF inválido (dígitos verificadores não conferem).')
  const cnae = d.cnae ? soDigitos(d.cnae) : null
  const atividade = d.atividade ?? (cnae ? classificarCnae(cnae).atividade : null)
  return { ...d, documento: doc, cnae, atividade, inicioAtividade: d.inicioAtividade ? new Date(d.inicioAtividade + 'T12:00:00Z') : null }
}

// ---------------- identidade, membros e auditoria ----------------
router.get('/eu', asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  res.json({ papel: c.papel, permissoes: MATRIZ[c.papel], instituicao: await adapter().nomeInstituicao(c.tenantId), sistema: adapter().nome, aviso: AVISO_LEGAL, simulacao: true })
}))

router.get('/membros', exigir('membros.gerir'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const rows = await prisma.ctbMembro.findMany({ where: { tenantId: c.tenantId }, orderBy: { createdAt: 'asc' } })
  const nomes = await adapter().nomesUsuarios(c.tenantId, rows.map((r) => r.userId))
  res.json({ items: rows.map((r) => ({ ...r, nome: nomes[r.userId] ?? r.userId })), papeis: PAPEIS })
}))

router.put('/membros/:userId', exigir('membros.gerir'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const b = parseBody(z.object({ papel: z.enum(['GESTOR', 'CONTADOR', 'FINANCEIRO', 'LEITOR']), ativo: z.boolean().default(true) }), req.body)
  const userId = String(req.params.userId)
  // O usuário precisa existir NESTE tenant (o adapter conhece a tabela de usuários do hospedeiro).
  const nomes = await adapter().nomesUsuarios(c.tenantId, [userId])
  if (!nomes[userId]) throw httpError(404, 'Usuário não encontrado neste ambiente.')
  const m = await prisma.ctbMembro.upsert({
    where: { tenantId_userId: { tenantId: c.tenantId, userId } },
    create: { tenantId: c.tenantId, userId, papel: b.papel, ativo: b.ativo, criadoPorId: c.userId }, update: { papel: b.papel, ativo: b.ativo },
  })
  await auditar(c, 'membro.definir', { entidade: 'CtbMembro', entidadeId: m.id, detalhes: { userId, papel: b.papel, ativo: b.ativo } })
  res.json(m)
}))

router.get('/auditoria', exigir('auditoria.ler'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const { page, pageSize, skip, take } = pageParams(req.query)
  const where: any = { tenantId: c.tenantId }
  if (qs(req.query.acao)) where.acao = { startsWith: qs(req.query.acao) }
  if (qs(req.query.empresaId)) where.empresaId = qs(req.query.empresaId)
  const [total, items] = await Promise.all([prisma.ctbAuditoria.count({ where }), prisma.ctbAuditoria.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take })])
  const nomes = await adapter().nomesUsuarios(c.tenantId, [...new Set(items.map((i) => i.userId).filter(Boolean) as string[])])
  res.json({ total, page, pageSize, items: items.map((i) => ({ ...i, usuario: i.userId ? nomes[i.userId] ?? null : null })) })
}))

// ---------------- empresas ----------------
router.get('/empresas', asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const { page, pageSize, skip, take } = pageParams(req.query)
  const where: any = { tenantId: c.tenantId }
  const ativo = qs(req.query.ativo)
  if (ativo === 'true' || ativo === 'false') where.ativo = ativo === 'true'
  const q = qs(req.query.q)
  if (q) where.OR = [{ razaoSocial: { contains: q, mode: 'insensitive' } }, { nomeFantasia: { contains: q, mode: 'insensitive' } }, { documento: { contains: soDigitos(q) || '§§' } }]
  const [total, items] = await Promise.all([prisma.ctbEmpresa.count({ where }), prisma.ctbEmpresa.findMany({ where, orderBy: { razaoSocial: 'asc' }, skip, take })])
  res.json({ total, page, pageSize, items: items.map(out) })
}))

router.get('/empresas/:id', asyncHandler(async (req, res) => { res.json(out(await empresaDoTenant(ctxDe(req).tenantId, String(req.params.id)))) }))

router.post('/empresas', exigir('empresa.escrever'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const d = normalizar(parseBody(empresaSchema, req.body))
  const dup = await prisma.ctbEmpresa.findFirst({ where: { tenantId: c.tenantId, documento: d.documento } })
  if (dup) throw httpError(409, 'Já existe uma empresa com este documento.')
  const e = await prisma.ctbEmpresa.create({ data: { ...d, tenantId: c.tenantId, criadoPorId: c.userId } as any })
  await garantirPlano(c.tenantId, e.id)
  await auditar(c, 'empresa.criar', { entidade: 'CtbEmpresa', entidadeId: e.id, empresaId: e.id, detalhes: { documento: e.documento, regimeAtual: e.regimeAtual } })
  res.status(201).json(out(e))
}))

router.patch('/empresas/:id', exigir('empresa.escrever'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const atual = await empresaDoTenant(c.tenantId, String(req.params.id))
  const parcial = parseBody(empresaSchema.partial(), req.body)
  const base = {
    tipoPessoa: atual.tipoPessoa, documento: atual.documento, razaoSocial: atual.razaoSocial, nomeFantasia: atual.nomeFantasia, regimeAtual: atual.regimeAtual, anexoSimples: atual.anexoSimples,
    cnae: atual.cnae, cnaeDescricao: atual.cnaeDescricao, atividade: atual.atividade, uf: atual.uf, municipio: atual.municipio, issAliquota: atual.issAliquota,
    inicioAtividade: atual.inicioAtividade ? atual.inicioAtividade.toISOString().slice(0, 10) : null, email: atual.email, telefone: atual.telefone, observacoes: atual.observacoes, ativo: atual.ativo,
  }
  const d = normalizar(parseBody(empresaSchema, { ...base, ...parcial }))
  if (d.documento !== atual.documento) {
    const dup = await prisma.ctbEmpresa.findFirst({ where: { tenantId: c.tenantId, documento: d.documento, NOT: { id: atual.id } } })
    if (dup) throw httpError(409, 'Já existe uma empresa com este documento.')
  }
  const { origemExterna, ...resto } = d as any
  const e = await prisma.ctbEmpresa.update({ where: { id: atual.id }, data: resto })
  await auditar(c, 'empresa.alterar', { entidade: 'CtbEmpresa', entidadeId: e.id, empresaId: e.id, detalhes: { regimeAntes: atual.regimeAtual, regimeDepois: e.regimeAtual, ativo: e.ativo } })
  res.json(out(e))
}))

router.get('/entidades-externas', exigir('empresa.escrever'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const a = adapter()
  res.json({ sistema: a.nome, suportado: !!a.listarEntidades, items: a.listarEntidades ? await a.listarEntidades(c.tenantId, qs(req.query.q)) : [] })
}))

router.post('/empresas/importar-entidade', exigir('empresa.escrever'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const a = adapter()
  if (!a.obterEntidade) throw httpError(400, 'O sistema hospedeiro não expõe entidades para importação.')
  const b = parseBody(z.object({ entidadeId: z.string().min(1), regimeAtual: z.enum(['MEI', 'SIMPLES', 'PRESUMIDO', 'REAL']).default('SIMPLES'), cnae: z.string().nullish() }), req.body)
  const ent = await a.obterEntidade(c.tenantId, b.entidadeId)
  if (!ent) throw httpError(404, 'Entidade não encontrada no sistema.')
  const d = normalizar(parseBody(empresaSchema, { tipoPessoa: ent.tipoPessoa, documento: ent.documento, razaoSocial: ent.nome, nomeFantasia: ent.nomeFantasia ?? null, regimeAtual: b.regimeAtual, cnae: b.cnae ?? null, uf: ent.uf ?? null, municipio: ent.municipio ?? null, email: ent.email ?? null, telefone: ent.telefone ?? null, origemExterna: ent.id }))
  const dup = await prisma.ctbEmpresa.findFirst({ where: { tenantId: c.tenantId, documento: d.documento } })
  if (dup) throw httpError(409, 'Esta entidade já foi importada como empresa.')
  const e = await prisma.ctbEmpresa.create({ data: { ...d, tenantId: c.tenantId, criadoPorId: c.userId } as any })
  await garantirPlano(c.tenantId, e.id)
  await auditar(c, 'empresa.importar', { entidade: 'CtbEmpresa', entidadeId: e.id, empresaId: e.id, detalhes: { origem: a.nome, entidadeId: ent.id } })
  res.status(201).json(out(e))
}))

export default router
