import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, qs } from '../core/crud'
import { audit } from '../core/notify'
import { getBranding, brandHeaderHtml, escapeHtml as esc } from '../core/branding'
import { avaliarRequisito, conceitoAdequacao, quantidadeExigida } from './calc'
import { GESTAO, LEITURA, MODULO, fail, money } from './util'

const SPACE_TIPOS = ['SALA_AULA', 'LABORATORIO', 'AUDITORIO', 'BIBLIOTECA', 'CLINICA_ESCOLA', 'QUADRA', 'PATIO', 'ESTACIONAMENTO', 'SALA_REUNIAO', 'SALA_PROFESSORES', 'ADMINISTRATIVO', 'POLO_EAD', 'OUTRO']

export interface LinhaAdequacao {
  requisitoId: string
  descricao: string
  tipo: string
  obrigatorio: boolean
  referenciaMec: string | null
  exigido: number
  existente: number
  emManutencao: number
  lacuna: number
  coberturaPct: number
  situacao: string
  custoEstimadoLacuna: number | null
}

// Calcula a adequação de infraestrutura de um curso. Exportado para outros módulos (regulatório/MEC).
export async function calcularAdequacao(tenantId: string, programId: string, vagasInformadas?: number) {
  const program = await prisma.academicProgram.findFirst({ where: { id: programId, tenantId } })
  if (!program) return null
  let vagas = vagasInformadas
  let origemVagas = 'informado'
  if (!vagas) {
    // tolerância: conta matrículas ativas do curso (pode ser 0 em bases novas)
    vagas = await prisma.enrollment.count({ where: { programId, status: 'ATIVA' } }).catch(() => 0)
    origemVagas = 'matriculas_ativas'
  }
  const reqs = await prisma.infRequisitoCurso.findMany({ where: { tenantId, programId, ativo: true }, orderBy: { descricao: 'asc' } })
  const [spaces, cats] = await Promise.all([prisma.eduSpace.findMany({ where: { tenantId, ativo: true } }), prisma.infCategoriaBem.findMany({ where: { tenantId } })])
  const catByCodigo = new Map(cats.map((c) => [c.codigo, c]))
  const linhas: LinhaAdequacao[] = []
  for (const r of reqs) {
    const exigido = quantidadeExigida(r.quantidadeMinima, r.porVagas, vagas)
    let existente = 0, emManutencao = 0, custo: number | null = null
    if (r.tipo === 'ESPACO') {
      existente = spaces.filter((s) => s.tipo === r.spaceTipo && (!r.capacidadeMinima || s.capacidade >= r.capacidadeMinima)).length
    } else {
      const cat = r.categoriaCodigo ? catByCodigo.get(r.categoriaCodigo) : undefined
      if (cat) {
        const spaceIds = r.spaceTipo ? spaces.filter((s) => s.tipo === r.spaceTipo).map((s) => s.id) : null
        const where: any = { tenantId, categoriaId: cat.id, estado: { not: 'INSERVIVEL' }, ...(spaceIds ? { spaceId: { in: spaceIds } } : {}) }
        const [ativo, manut, amostra] = await Promise.all([
          prisma.infBem.count({ where: { ...where, status: { in: ['ATIVO', 'EMPRESTADO'] } } }),
          prisma.infBem.count({ where: { ...where, status: 'EM_MANUTENCAO' } }),
          prisma.infBem.findMany({ where: { ...where, status: { not: 'BAIXADO' } }, select: { valorAquisicao: true }, take: 50 }),
        ])
        existente = ativo; emManutencao = manut
        if (amostra.length) custo = money((amostra.reduce((s, b) => s + b.valorAquisicao, 0) / amostra.length) * Math.max(0, exigido - existente))
      }
    }
    const a = avaliarRequisito(exigido, existente)
    linhas.push({ requisitoId: r.id, descricao: r.descricao, tipo: r.tipo, obrigatorio: r.obrigatorio, referenciaMec: r.referenciaMec, exigido, existente, emManutencao, lacuna: a.lacuna, coberturaPct: a.coberturaPct, situacao: a.situacao, custoEstimadoLacuna: a.lacuna > 0 ? custo : 0 })
  }
  const obrig = linhas.filter((l) => l.obrigatorio)
  const obrigAtendidos = obrig.filter((l) => l.situacao === 'ATENDE').length
  const pctObrig = obrig.length ? money((obrigAtendidos / obrig.length) * 100) : 100
  const lacunas = linhas.filter((l) => l.lacuna > 0).sort((a, b) => Number(b.obrigatorio) - Number(a.obrigatorio) || b.lacuna - a.lacuna)
  return {
    programa: { id: program.id, nome: program.nome, modalidade: program.modalidade },
    vagasConsideradas: vagas, origemVagas,
    totais: { requisitos: linhas.length, atendem: linhas.filter((l) => l.situacao === 'ATENDE').length, parciais: linhas.filter((l) => l.situacao === 'PARCIAL').length, naoAtendem: linhas.filter((l) => l.situacao === 'NAO_ATENDE').length, obrigatoriosAtendidosPct: pctObrig },
    conceitoSugerido: linhas.length ? conceitoAdequacao(pctObrig) : null,
    investimentoEstimadoLacunas: money(lacunas.reduce((s, l) => s + (l.custoEstimadoLacuna ?? 0), 0)),
    linhas, lacunas,
    aviso: linhas.length === 0 ? 'Nenhum requisito cadastrado para o curso. Cadastre em /requisitos-curso (ou use /requisitos-curso/modelo).' : undefined,
  }
}

export function mountAdequacao(router: Router) {
  mountCrud(router, {
    model: 'infRequisitoCurso', path: '/requisitos-curso', read: [...LEITURA], write: [...GESTAO, 'COORDINATOR'], modulo: MODULO, removeMode: 'soft',
    create: z.object({
      programId: z.string().min(1), descricao: z.string().min(3), tipo: z.enum(['EQUIPAMENTO', 'ESPACO']).default('EQUIPAMENTO'),
      categoriaCodigo: z.string().optional().nullable().transform((s) => (s ? s.toUpperCase() : s)), spaceTipo: z.enum(SPACE_TIPOS as [string, ...string[]]).optional().nullable(),
      quantidadeMinima: z.number().int().min(0).default(1), porVagas: z.number().int().min(1).optional().nullable(), capacidadeMinima: z.number().int().min(1).optional().nullable(),
      obrigatorio: z.boolean().default(true), referenciaMec: z.string().optional().nullable(), ativo: z.boolean().optional(),
    }),
    filters: ['programId', 'tipo', 'ativo', 'obrigatorio'], search: ['descricao'], orderBy: [{ programId: 'asc' }, { descricao: 'asc' }],
    beforeCreate: async (d: any, req) => {
      const tenantId = getTenantId(req)
      if (!(await prisma.academicProgram.findFirst({ where: { id: d.programId, tenantId }, select: { id: true } }))) fail(400, 'Curso (programId) não encontrado.')
      if (d.tipo === 'ESPACO' && !d.spaceTipo) fail(400, 'Requisito de ESPACO exige spaceTipo.')
      if (d.tipo === 'EQUIPAMENTO' && !d.categoriaCodigo) fail(400, 'Requisito de EQUIPAMENTO exige categoriaCodigo.')
    },
  })

  // Copia os requisitos de um curso para outro (acelera cadastro para cursos afins).
  router.post(
    '/requisitos-curso/copiar',
    requireRole(...GESTAO, 'COORDINATOR'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { origemProgramId, destinoProgramId } = z.object({ origemProgramId: z.string(), destinoProgramId: z.string() }).parse(req.body)
      const dest = await prisma.academicProgram.findFirst({ where: { id: destinoProgramId, tenantId } })
      if (!dest) fail(400, 'Curso de destino não encontrado.')
      const orig = await prisma.infRequisitoCurso.findMany({ where: { tenantId, programId: origemProgramId, ativo: true } })
      const ja = await prisma.infRequisitoCurso.findMany({ where: { tenantId, programId: destinoProgramId }, select: { descricao: true } })
      const set = new Set(ja.map((j) => j.descricao))
      const novos = orig.filter((o) => !set.has(o.descricao)).map(({ id, createdAt, updatedAt, ...r }) => ({ ...r, programId: destinoProgramId }))
      if (novos.length) await prisma.infRequisitoCurso.createMany({ data: novos })
      res.status(201).json({ copiados: novos.length, ignorados: orig.length - novos.length })
    }),
  )

  router.get(
    '/adequacao/:programId',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const vagas = qs(req.query.vagas) ? parseInt(qs(req.query.vagas)!, 10) : undefined
      const r = await calcularAdequacao(tenantId, String(req.params.programId), vagas && vagas > 0 ? vagas : undefined)
      if (!r) return res.status(404).json({ error: 'Curso não encontrado.' })
      if (qs(req.query.format) === 'html') {
        const b = await getBranding(tenantId)
        const cor = (s: string) => (s === 'ATENDE' ? '#15803d' : s === 'PARCIAL' ? '#b45309' : '#b91c1c')
        res.type('html').send(`<!doctype html><meta charset="utf-8"><body style="max-width:960px;margin:auto;font:13px sans-serif">${brandHeaderHtml(b, { titulo: 'Adequação de Infraestrutura', subtitulo: `${r.programa.nome} — ${r.vagasConsideradas} vagas/alunos considerados` })}
<div style="padding:16px 28px"><p><b>Requisitos obrigatórios atendidos:</b> ${r.totais.obrigatoriosAtendidosPct}% · <b>Conceito sugerido:</b> ${r.conceitoSugerido ?? '—'} · <b>Investimento estimado das lacunas:</b> ${r.investimentoEstimadoLacunas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
<table style="width:100%;border-collapse:collapse"><tr style="background:#f1f5f9"><th align=left>Requisito</th><th>Obrig.</th><th>Exigido</th><th>Existente</th><th>Lacuna</th><th>Situação</th><th align=left>Ref. MEC</th></tr>
${r.linhas.map((l) => `<tr style="border-bottom:1px solid #e2e8f0"><td>${esc(l.descricao)}</td><td align=center>${l.obrigatorio ? 'Sim' : 'Não'}</td><td align=center>${l.exigido}</td><td align=center>${l.existente}${l.emManutencao ? ` (+${l.emManutencao} em manut.)` : ''}</td><td align=center>${l.lacuna}</td><td align=center style="color:${cor(l.situacao)};font-weight:700">${l.situacao}</td><td>${esc(l.referenciaMec ?? '')}</td></tr>`).join('')}</table></div></body>`)
        return
      }
      res.json(r)
    }),
  )

  // Visão consolidada de todos os cursos com requisitos cadastrados.
  router.get(
    '/adequacao',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const ids = await prisma.infRequisitoCurso.groupBy({ by: ['programId'], where: { tenantId, ativo: true } })
      const out = []
      for (const i of ids.slice(0, 100)) {
        const r = await calcularAdequacao(tenantId, i.programId)
        if (r) out.push({ programa: r.programa, vagasConsideradas: r.vagasConsideradas, totais: r.totais, conceitoSugerido: r.conceitoSugerido, investimentoEstimadoLacunas: r.investimentoEstimadoLacunas })
      }
      res.json({ cursos: out })
    }),
  )

  // Transforma lacunas em projetos de melhoria PROPOSTOS (5W2H pré-preenchido), sem duplicar.
  router.post(
    '/adequacao/:programId/gerar-projetos',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const r = await calcularAdequacao(tenantId, String(req.params.programId), qs(req.query.vagas) ? parseInt(qs(req.query.vagas)!, 10) : undefined)
      if (!r) return res.status(404).json({ error: 'Curso não encontrado.' })
      let criados = 0
      for (const l of r.lacunas) {
        const titulo = `Adequação ${r.programa.nome}: ${l.descricao}`.slice(0, 180)
        if (await prisma.infProjeto.findFirst({ where: { tenantId, titulo, status: { notIn: ['CANCELADO', 'CONCLUIDO'] } } })) continue
        await prisma.infProjeto.create({ data: { tenantId, titulo, oQue: `Suprir ${l.lacuna} unidade(s) de "${l.descricao}"`, porQue: `Requisito ${l.obrigatorio ? 'obrigatório' : 'desejável'} do curso ${r.programa.nome}; hoje há ${l.existente} de ${l.exigido} exigidas (${l.coberturaPct}%).`, como: 'Cotação, aquisição/adequação e instalação.', quando: 'Definir cronograma na aprovação', quem: 'Infraestrutura / Coordenação do curso', quantoCusta: l.custoEstimadoLacuna ?? 0, justificativa: 'Gerado automaticamente pelo relatório de adequação de infraestrutura.', recomendacaoMec: l.referenciaMec, responsavelUserId: getUserId(req) } })
        criados++
      }
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'PROJETOS_DE_ADEQUACAO', refType: 'AcademicProgram', refId: r.programa.id, detalhes: { criados } })
      res.status(201).json({ criados, lacunas: r.lacunas.length })
    }),
  )
}
