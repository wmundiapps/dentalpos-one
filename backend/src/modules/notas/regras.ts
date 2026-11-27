import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud } from '../core/crud'
import { audit } from '../core/notify'
import { resolverRegra } from './service'
import { httpErr } from './common'

const router = Router()

const compModelo = z.object({
  codigo: z.string().trim().min(1).max(20),
  nome: z.string().trim().min(2),
  tipo: z.enum(['AVALIACAO', 'RECUPERACAO', 'EXAME']).default('AVALIACAO'),
  peso: z.number().positive().default(1),
  notaMaxima: z.number().positive().default(10),
  obrigatorio: z.boolean().default(true),
})

const regraSchema = z.object({
  nome: z.string().trim().min(3),
  escopo: z.enum(['TENANT', 'CURSO', 'TURMA']).default('TENANT'),
  programId: z.string().optional().nullable(),
  classSectionId: z.string().optional().nullable(),
  padrao: z.boolean().optional(),
  regraMedia: z.enum(['ARITMETICA', 'PONDERADA']).default('PONDERADA'),
  notaMaxima: z.number().positive().max(1000).default(10),
  mediaAprovacao: z.number().min(0).default(7),
  mediaMinimaRecuperacao: z.number().min(0).default(4),
  recuperacao: z.enum(['NENHUMA', 'SUBSTITUI_MENOR', 'SUBSTITUI_MEDIA', 'MEDIA_COM_PARCIAL']).default('SUBSTITUI_MENOR'),
  exame: z.enum(['NENHUM', 'MEDIA_PONDERADA', 'SUBSTITUI']).default('MEDIA_PONDERADA'),
  pesoParcial: z.number().min(0).max(1).default(0.6),
  pesoExame: z.number().min(0).max(1).default(0.4),
  mediaAprovacaoExame: z.number().min(0).default(5),
  frequenciaMinima: z.number().min(0).max(100).default(75),
  abonaJustificadas: z.boolean().default(true),
  arredondamento: z.enum(['NENHUM', 'UM_DECIMAL', 'MEIO_PONTO', 'INTEIRO']).default('UM_DECIMAL'),
  diasRevisao: z.number().int().min(0).max(90).default(7),
  componentes: z.array(compModelo).optional().nullable(),
  ativo: z.boolean().optional(),
})

async function validar(tenantId: string, d: any, atual?: any) {
  const m = { ...(atual ?? {}), ...d }
  if (m.escopo === 'CURSO') {
    if (!m.programId) throw httpErr(400, 'Regra de escopo CURSO exige programId.')
    if (!(await prisma.academicProgram.findFirst({ where: { id: m.programId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Curso não encontrado.')
  }
  if (m.escopo === 'TURMA') {
    if (!m.classSectionId) throw httpErr(400, 'Regra de escopo TURMA exige classSectionId.')
    if (!(await prisma.classSection.findFirst({ where: { id: m.classSectionId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Turma não encontrada.')
  }
  if (m.mediaMinimaRecuperacao > m.mediaAprovacao) throw httpErr(400, 'A média mínima para recuperação não pode exceder a média de aprovação.')
  if (m.mediaAprovacao > m.notaMaxima) throw httpErr(400, 'A média de aprovação não pode exceder a nota máxima.')
  if (Math.abs(m.pesoParcial + m.pesoExame - 1) > 0.001) throw httpErr(400, 'pesoParcial + pesoExame deve ser igual a 1.')
  if (Array.isArray(m.componentes)) {
    const cods = m.componentes.map((c: any) => String(c.codigo).toLowerCase())
    if (new Set(cods).size !== cods.length) throw httpErr(400, 'Códigos de componentes duplicados no modelo.')
    if (m.componentes.filter((c: any) => c.tipo === 'RECUPERACAO').length > 1 || m.componentes.filter((c: any) => c.tipo === 'EXAME').length > 1) throw httpErr(400, 'No máximo uma recuperação e um exame por modelo.')
    if (!m.componentes.some((c: any) => (c.tipo ?? 'AVALIACAO') === 'AVALIACAO')) throw httpErr(400, 'O modelo precisa de ao menos um componente de avaliação.')
  }
}

// Resolução efetiva (turma > curso > padrão do tenant > sistema). Antes do CRUD para não colidir com /:id.
router.get('/regras/resolver/:classSectionId', requireRole('TEACHER', 'COORDINATOR', 'SECRETARY'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await resolverRegra(getTenantId(req), String(req.params.classSectionId)))
}))

async function desmarcarOutrosPadroes(row: any) {
  if (row.padrao && row.escopo === 'TENANT') await prisma.ntRegraAvaliacao.updateMany({ where: { tenantId: row.tenantId, escopo: 'TENANT', id: { not: row.id } }, data: { padrao: false } })
}

mountCrud(router, {
  model: 'ntRegraAvaliacao', path: '/regras', modulo: 'notas',
  read: ['COORDINATOR', 'SECRETARY', 'TEACHER'], write: ['COORDINATOR'],
  create: regraSchema, update: regraSchema.partial(),
  filters: ['escopo', 'programId', 'classSectionId', 'ativo'], search: ['nome'], orderBy: { nome: 'asc' },
  beforeCreate: async (d, req) => { await validar(getTenantId(req), d); return d },
  beforeUpdate: async (d, req, cur) => { await validar(getTenantId(req), d, cur); return d },
  afterCreate: desmarcarOutrosPadroes,
  afterUpdate: desmarcarOutrosPadroes,
})

// ---------- Bootstrap: regras padrão para IES brasileira (idempotente por nome) ----------

export const REGRAS_PADRAO = [
  {
    nome: 'Graduação presencial — P1 + P2 + Trabalhos (média 7,0)', padrao: true, regraMedia: 'PONDERADA', mediaAprovacao: 7, mediaMinimaRecuperacao: 4,
    recuperacao: 'SUBSTITUI_MENOR', exame: 'MEDIA_PONDERADA', pesoParcial: 0.6, pesoExame: 0.4, mediaAprovacaoExame: 5, frequenciaMinima: 75,
    componentes: [
      { codigo: 'P1', nome: 'Primeira prova', tipo: 'AVALIACAO', peso: 4 }, { codigo: 'P2', nome: 'Segunda prova', tipo: 'AVALIACAO', peso: 4 },
      { codigo: 'TRAB', nome: 'Trabalhos e atividades', tipo: 'AVALIACAO', peso: 2 },
      { codigo: 'REC', nome: 'Prova de recuperação', tipo: 'RECUPERACAO', peso: 1, obrigatorio: false }, { codigo: 'EXAME', nome: 'Exame final', tipo: 'EXAME', peso: 1, obrigatorio: false },
    ],
  },
  {
    nome: 'Graduação — N1/N2 média aritmética (média 6,0)', regraMedia: 'ARITMETICA', mediaAprovacao: 6, mediaMinimaRecuperacao: 3,
    recuperacao: 'SUBSTITUI_MENOR', exame: 'NENHUM', frequenciaMinima: 75,
    componentes: [
      { codigo: 'N1', nome: 'Nota 1', tipo: 'AVALIACAO', peso: 1 }, { codigo: 'N2', nome: 'Nota 2', tipo: 'AVALIACAO', peso: 1 },
      { codigo: 'REC', nome: 'Recuperação', tipo: 'RECUPERACAO', peso: 1, obrigatorio: false },
    ],
  },
  {
    nome: 'EAD — Atividades 40% + Prova presencial 60%', regraMedia: 'PONDERADA', mediaAprovacao: 6, mediaMinimaRecuperacao: 3,
    recuperacao: 'SUBSTITUI_MEDIA', exame: 'NENHUM', frequenciaMinima: 75,
    componentes: [
      { codigo: 'ATIV', nome: 'Atividades virtuais (AVA)', tipo: 'AVALIACAO', peso: 4 }, { codigo: 'PROVA', nome: 'Prova presencial', tipo: 'AVALIACAO', peso: 6 },
      { codigo: 'REC', nome: 'Prova de recuperação', tipo: 'RECUPERACAO', peso: 1, obrigatorio: false },
    ],
  },
  {
    nome: 'Pós-graduação lato sensu — avaliação final (média 7,0)', regraMedia: 'PONDERADA', mediaAprovacao: 7, mediaMinimaRecuperacao: 7,
    recuperacao: 'NENHUMA', exame: 'NENHUM', frequenciaMinima: 75, arredondamento: 'UM_DECIMAL',
    componentes: [{ codigo: 'AF', nome: 'Avaliação final da disciplina', tipo: 'AVALIACAO', peso: 7 }, { codigo: 'TRAB', nome: 'Trabalho da disciplina', tipo: 'AVALIACAO', peso: 3 }],
  },
  {
    nome: 'Saúde — Provas parciais + Prova integrada', regraMedia: 'PONDERADA', mediaAprovacao: 7, mediaMinimaRecuperacao: 5,
    recuperacao: 'SUBSTITUI_MENOR', exame: 'MEDIA_PONDERADA', pesoParcial: 0.6, pesoExame: 0.4, mediaAprovacaoExame: 6, frequenciaMinima: 75,
    componentes: [
      { codigo: 'P1', nome: 'Prova parcial 1', tipo: 'AVALIACAO', peso: 3 }, { codigo: 'P2', nome: 'Prova parcial 2', tipo: 'AVALIACAO', peso: 3 },
      { codigo: 'PI', nome: 'Prova integrada', tipo: 'AVALIACAO', peso: 4 },
      { codigo: 'REC', nome: 'Recuperação', tipo: 'RECUPERACAO', peso: 1, obrigatorio: false }, { codigo: 'EXAME', nome: 'Exame final', tipo: 'EXAME', peso: 1, obrigatorio: false },
    ],
  },
] as const

router.post('/bootstrap', requireRole('COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const criadas: string[] = []
  const jaExistiam: string[] = []
  const temPadrao = (await prisma.ntRegraAvaliacao.count({ where: { tenantId, escopo: 'TENANT', padrao: true } })) > 0
  for (const r of REGRAS_PADRAO) {
    const ex = await prisma.ntRegraAvaliacao.findFirst({ where: { tenantId, nome: r.nome } })
    if (ex) { jaExistiam.push(r.nome); continue }
    const { padrao, ...resto } = r as any
    await prisma.ntRegraAvaliacao.create({ data: { tenantId, escopo: 'TENANT', padrao: !!padrao && !temPadrao, ...resto } })
    criadas.push(r.nome)
  }
  await audit({ tenantId, userId: getUserId(req), modulo: 'notas', acao: 'BOOTSTRAP', detalhes: { criadas: criadas.length } })
  res.status(criadas.length ? 201 : 200).json({ criadas, jaExistiam })
}))

export default router
