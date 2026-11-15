import { Router } from 'express'
import { z } from 'zod'
import { empresaDoTenant, mesesDaEmpresa } from '../empresas/service'
import { auditar } from '../nucleo/auditoria'
import { prisma } from '../nucleo/db'
import { asyncHandler, httpError, parseBody, qs } from '../nucleo/http'
import { ctxDe, exigir } from '../nucleo/rbac'
import { COMPETENCIA_RE, competenciaDe, ultimas12 } from '../nucleo/util'
import { ATIVIDADES, classificarCnae } from './cnae'
import { NOME_REGIME, Regime, simularRegimes } from './calculo'
import { TABELAS_VERSOES, tabelasVigentes } from './tabelas'

const router = Router()

router.get('/parametros-fiscais', asyncHandler(async (_req, res) => {
  const t = tabelasVigentes()
  res.json({ vigente: t, versoes: TABELAS_VERSOES.map((v) => ({ versao: v.versao, vigenteDesde: v.vigenteDesde, situacao: v.situacao })), atividades: ATIVIDADES, aviso: t.situacao })
}))

router.get('/empresas/:id/historico', asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const e = await empresaDoTenant(c.tenantId, String(req.params.id))
  const ate = qs(req.query.ate) ?? competenciaDe(new Date())
  if (!COMPETENCIA_RE.test(ate)) throw httpError(400, 'Competência inválida (use AAAA-MM).')
  const meses = await mesesDaEmpresa(c.tenantId, e.id, ultimas12(ate))
  res.json({ empresaId: e.id, ate, meses: meses.map((m) => ({ competencia: m.competencia, receitaBruta: m.receita, despesas: m.despesas, folha: m.folha, comprasInsumos: m.compras, irrfRetido: m.irrf, fonte: m.fonte })) })
}))

const mesSchema = z.object({ receitaBruta: z.number().min(0).max(1e10), despesas: z.number().min(0).max(1e10), folha: z.number().min(0).max(1e10).default(0), comprasInsumos: z.number().min(0).max(1e10).default(0), irrfRetido: z.number().min(0).max(1e10).default(0) })

router.put('/empresas/:id/historico/:comp', exigir('empresa.escrever'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const e = await empresaDoTenant(c.tenantId, String(req.params.id))
  const comp = String(req.params.comp)
  if (!COMPETENCIA_RE.test(comp)) throw httpError(400, 'Competência inválida (use AAAA-MM).')
  const b = parseBody(mesSchema, req.body)
  const r = await prisma.ctbHistoricoMensal.upsert({
    where: { empresaId_competencia: { empresaId: e.id, competencia: comp } },
    create: { tenantId: c.tenantId, empresaId: e.id, competencia: comp, ...b, fonte: 'MANUAL' }, update: { ...b, fonte: 'MANUAL' },
  })
  await auditar(c, 'historico.salvar', { entidade: 'CtbHistoricoMensal', entidadeId: r.id, empresaId: e.id, detalhes: { competencia: comp, ...b } })
  res.json(r)
}))

router.delete('/empresas/:id/historico/:comp', exigir('empresa.escrever'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const e = await empresaDoTenant(c.tenantId, String(req.params.id))
  await prisma.ctbHistoricoMensal.deleteMany({ where: { tenantId: c.tenantId, empresaId: e.id, competencia: String(req.params.comp) } })
  await auditar(c, 'historico.remover', { empresaId: e.id, detalhes: { competencia: req.params.comp } })
  res.json({ ok: true })
}))

const simSchema = z.object({
  ate: z.string().regex(COMPETENCIA_RE).optional(),
  issAliquota: z.number().min(0).max(5).optional(),
  icmsAliquota: z.number().min(0).max(30).optional(),
  salvar: z.boolean().default(true),
  /** "E se": substitui o histórico por estes meses (não altera os dados da empresa). */
  meses: z.array(z.object({ competencia: z.string().regex(COMPETENCIA_RE), receita: z.number().min(0), despesas: z.number().min(0), folha: z.number().min(0).default(0), compras: z.number().min(0).default(0) })).max(24).optional(),
})

router.post('/empresas/:id/regime/simular', exigir('regime.simular'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const e = await empresaDoTenant(c.tenantId, String(req.params.id))
  const b = parseBody(simSchema, req.body ?? {})
  const ate = b.ate ?? competenciaDe(new Date())
  const t = tabelasVigentes(new Date())
  const meses = b.meses ?? (await mesesDaEmpresa(c.tenantId, e.id, ultimas12(ate))).map((m) => ({ competencia: m.competencia, receita: m.receita, despesas: m.despesas, folha: m.folha, compras: m.compras }))
  const atividade = (e.atividade as any) ?? classificarCnae(e.cnae).atividade
  const r = simularRegimes({ atividade, anexoForcado: e.anexoSimples as any, regimeAtual: e.regimeAtual as Regime, issAliquotaPct: b.issAliquota ?? e.issAliquota, icmsAliquotaPct: b.icmsAliquota, meses }, t)
  let id: string | null = null
  if (b.salvar) {
    const s = await prisma.ctbSimulacaoRegime.create({ data: { tenantId: c.tenantId, empresaId: e.id, criadoPorId: c.userId, versaoTabelas: t.versao, regimeRecomendado: r.recomendado, resultado: r as any } })
    id = s.id
  }
  await auditar(c, 'regime.simular', { entidade: 'CtbSimulacaoRegime', entidadeId: id ?? undefined, empresaId: e.id, detalhes: { recomendado: r.recomendado, versaoTabelas: t.versao } })
  res.json({ id, empresa: { id: e.id, razaoSocial: e.razaoSocial, regimeAtual: e.regimeAtual, atividade, anexoSimples: e.anexoSimples }, ...r, simulacao: true })
}))

/** Simulador livre (sem empresa): útil para propostas comerciais e testes. Não grava nada. */
router.post('/regime/simular-avulso', exigir('regime.simular'), asyncHandler(async (req, res) => {
  const b = parseBody(z.object({
    atividade: z.enum(ATIVIDADES.map((a) => a.valor) as [string, ...string[]]), regimeAtual: z.enum(['MEI', 'SIMPLES', 'PRESUMIDO', 'REAL']).default('SIMPLES'),
    anexoSimples: z.enum(['I', 'II', 'III', 'IV', 'V']).nullish(), issAliquota: z.number().min(0).max(5).optional(), icmsAliquota: z.number().min(0).max(30).optional(),
    meses: z.array(z.object({ competencia: z.string().min(1).max(20), receita: z.number().min(0), despesas: z.number().min(0), folha: z.number().min(0).default(0), compras: z.number().min(0).default(0) })).min(1).max(12),
  }), req.body)
  const r = simularRegimes({ atividade: b.atividade as any, anexoForcado: b.anexoSimples as any, regimeAtual: b.regimeAtual, issAliquotaPct: b.issAliquota, icmsAliquotaPct: b.icmsAliquota, meses: b.meses }, tabelasVigentes())
  res.json({ ...r, simulacao: true })
}))

router.get('/empresas/:id/regime/simulacoes', asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const e = await empresaDoTenant(c.tenantId, String(req.params.id))
  const items = await prisma.ctbSimulacaoRegime.findMany({ where: { tenantId: c.tenantId, empresaId: e.id }, orderBy: { createdAt: 'desc' }, take: 20 })
  res.json({ items })
}))

router.post('/empresas/:id/regime/aplicar', exigir('empresa.escrever'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const e = await empresaDoTenant(c.tenantId, String(req.params.id))
  const b = parseBody(z.object({ regime: z.enum(['MEI', 'SIMPLES', 'PRESUMIDO', 'REAL']), motivo: z.string().trim().min(10).max(500) }), req.body)
  const r = await prisma.ctbEmpresa.update({ where: { id: e.id }, data: { regimeAtual: b.regime } })
  await auditar(c, 'regime.alterar', { entidade: 'CtbEmpresa', entidadeId: e.id, empresaId: e.id, detalhes: { de: e.regimeAtual, para: b.regime, motivo: b.motivo } })
  res.json({ ...r, aviso: `Regime registrado como ${NOME_REGIME[b.regime]} apenas neste sistema. A opção/alteração junto à Receita, prefeitura e estado precisa ser feita pelo contador, nos prazos legais.` })
}))

export default router
