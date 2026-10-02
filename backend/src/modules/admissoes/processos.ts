import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { dateISO, mountCrud, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { cancelReminders, scheduleReminder } from '../core/reminders'
import { calcularNotaFinal, classificar, proximaChamada, type CandidatoClassif } from './logic'
import { convocarCandidato, expirarConvocacoes, httpErr, mudarStatusCandidato } from './services'

const router = Router()
const GESTAO = ['ADMISSIONS', 'COORDINATOR', 'SECRETARY'] as const
const LEITURA = ['ADMISSIONS', 'COORDINATOR', 'SECRETARY', 'MARKETING', 'FINANCE'] as const
const DAY = 86_400_000

const tipoEnum = z.enum(['VESTIBULAR_TRADICIONAL', 'VESTIBULAR_AGENDADO', 'ENEM', 'TRANSFERENCIA_EXTERNA', 'PORTADOR_DIPLOMA', 'POS_LATO_SENSU', 'POS_STRICTO_SENSU'])
const componenteEnum = z.enum(['PROVA', 'REDACAO', 'ENEM', 'ENTREVISTA', 'HISTORICO', 'ANALISE_CURRICULAR', 'PROJETO'])

const processoSchema = z.object({
  codigo: z.string().min(2).max(40),
  nome: z.string().min(3),
  tipo: tipoEnum,
  nivel: z.enum(['GRADUACAO', 'POS_LATO', 'POS_STRICTO']).optional(),
  termId: z.string().optional().nullable(),
  edital: z.string().optional().nullable(),
  editalUrl: z.string().url().optional().nullable(),
  inscricaoInicio: dateISO(),
  inscricaoFim: dateISO(),
  provaData: dateISO().optional().nullable(),
  resultadoData: dateISO().optional().nullable(),
  matriculaInicio: dateISO().optional().nullable(),
  matriculaFim: dateISO().optional().nullable(),
  taxaInscricao: z.number().min(0).optional(),
  notaMinima: z.number().min(0).max(100).optional(),
  pesos: z.record(z.string(), z.number().min(0)).optional().nullable(),
  criteriosDesempate: z.array(z.string()).optional().nullable(),
  listaEspera: z.boolean().optional(),
  diasPrazoMatricula: z.number().int().min(1).max(60).optional(),
  observacoes: z.string().optional().nullable(),
})

function validarDatas(d: any, atual?: any) {
  const ini = d.inscricaoInicio ?? atual?.inscricaoInicio
  const fim = d.inscricaoFim ?? atual?.inscricaoFim
  if (ini && fim && fim < ini) throw httpErr(400, 'O fim das inscrições deve ser posterior ao início.')
  const prova = d.provaData ?? atual?.provaData
  if (prova && fim && prova < fim) throw httpErr(400, 'A data da prova deve ser posterior ao fim das inscrições.')
  const mi = d.matriculaInicio ?? atual?.matriculaInicio
  const mf = d.matriculaFim ?? atual?.matriculaFim
  if (mi && mf && mf < mi) throw httpErr(400, 'Fim da matrícula anterior ao início.')
}

async function validarTermo(tenantId: string, termId?: string | null) {
  if (termId && !(await prisma.academicTerm.findFirst({ where: { id: termId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Período letivo não encontrado.')
}

// Exclusão só de processo sem movimento (rascunho/cancelado e sem candidatos): apagar com candidatos os deixaria órfãos.
router.delete('/processos/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const id = String(req.params.id)
  const p = await prisma.admProcessoSeletivo.findFirst({ where: { id, tenantId } })
  if (!p) return res.status(404).json({ error: 'Registro não encontrado.' })
  if (!['RASCUNHO', 'CANCELADO'].includes(p.status)) return res.status(409).json({ error: `Processo ${p.status} não pode ser excluído; cancele-o antes.` })
  if (await prisma.admCandidato.count({ where: { tenantId, processoId: id } })) return res.status(409).json({ error: 'Processo possui candidatos e não pode ser excluído.' })
  await prisma.$transaction([prisma.admOferta.deleteMany({ where: { tenantId, processoId: id } }), prisma.admProcessoSeletivo.delete({ where: { id } })])
  await cancelReminders({ tenantId, refType: 'AdmProcessoSeletivo', refId: id })
  await audit({ tenantId, userId: getUserId(req), modulo: 'admissoes', acao: 'REMOVER', refType: 'AdmProcessoSeletivo', refId: id })
  res.status(204).end()
}))

mountCrud(router, {
  model: 'admProcessoSeletivo',
  path: '/processos',
  read: [...LEITURA],
  write: [...GESTAO],
  create: processoSchema,
  update: processoSchema.partial(),
  search: ['nome', 'codigo'],
  filters: ['status', 'tipo', 'nivel'],
  include: { ofertas: { where: { ativo: true } }, _count: { select: { candidatos: true } } },
  orderBy: { inscricaoInicio: 'desc' },
  modulo: 'admissoes',
  beforeCreate: async (d, req) => {
    validarDatas(d)
    await validarTermo(getTenantId(req), d.termId)
    if (!d.nivel) d.nivel = d.tipo === 'POS_LATO_SENSU' ? 'POS_LATO' : d.tipo === 'POS_STRICTO_SENSU' ? 'POS_STRICTO' : 'GRADUACAO'
    return d
  },
  beforeUpdate: async (d, req, cur) => {
    if (['FINALIZADO', 'CANCELADO'].includes(cur.status)) throw httpErr(409, 'Processo finalizado/cancelado não pode ser alterado.')
    validarDatas(d, cur)
    await validarTermo(getTenantId(req), d.termId)
    return d
  },
})

// ---------- Ofertas ----------

const ofertaSchema = z.object({
  processoId: z.string(),
  programId: z.string().optional().nullable(),
  nomeCurso: z.string().min(2),
  turno: z.enum(['MATUTINO', 'VESPERTINO', 'NOTURNO', 'INTEGRAL', 'FLEXIVEL']).optional(),
  modalidade: z.enum(['PRESENCIAL', 'SEMIPRESENCIAL', 'EAD']).optional(),
  campusId: z.string().optional().nullable(),
  poloNome: z.string().optional().nullable(),
  vagas: z.number().int().min(0),
  valorMensalidade: z.number().min(0).optional(),
  parcelas: z.number().int().min(1).max(60).optional(),
  ativo: z.boolean().optional(),
})

// Oferta com candidatos/convocações/matrículas não pode ser apagada (use ativo=false).
router.delete('/ofertas/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const id = String(req.params.id)
  const o = await prisma.admOferta.findFirst({ where: { id, tenantId } })
  if (!o) return res.status(404).json({ error: 'Registro não encontrado.' })
  const [cands, convs, mats] = await Promise.all([
    prisma.admCandidato.count({ where: { tenantId, OR: [{ ofertaId: id }, { ofertaId2: id }, { ofertaAlocadaId: id }] } }),
    prisma.admConvocacao.count({ where: { tenantId, ofertaId: id } }),
    prisma.admMatricula.count({ where: { tenantId, ofertaId: id } }),
  ])
  if (cands + convs + mats > 0) return res.status(409).json({ error: 'Oferta possui candidatos/convocações/matrículas; desative-a (ativo=false) em vez de excluir.' })
  await prisma.admOferta.delete({ where: { id } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'admissoes', acao: 'REMOVER', refType: 'AdmOferta', refId: id })
  res.status(204).end()
}))

mountCrud(router, {
  model: 'admOferta',
  path: '/ofertas',
  read: [...LEITURA],
  write: [...GESTAO],
  create: ofertaSchema,
  update: ofertaSchema.omit({ processoId: true }).partial(),
  search: ['nomeCurso', 'poloNome'],
  filters: ['processoId', 'turno', 'modalidade', 'ativo'],
  orderBy: { nomeCurso: 'asc' },
  modulo: 'admissoes',
  beforeCreate: async (d, req) => {
    const tenantId = getTenantId(req)
    const p = await prisma.admProcessoSeletivo.findFirst({ where: { id: d.processoId, tenantId } })
    if (!p) throw httpErr(404, 'Processo seletivo não encontrado.')
    if (['FINALIZADO', 'CANCELADO'].includes(p.status)) throw httpErr(409, 'Processo encerrado.')
    if (d.programId && !(await prisma.academicProgram.findFirst({ where: { id: d.programId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Curso (AcademicProgram) não encontrado.')
    return d
  },
  beforeUpdate: async (d, req, cur) => {
    const tenantId = getTenantId(req)
    if (d.vagas != null && d.vagas < cur.vagas) {
      const ocupadas = await prisma.admConvocacao.count({ where: { tenantId, ofertaId: cur.id, status: { in: ['CONVOCADO', 'MATRICULADO'] } } })
      if (d.vagas < ocupadas) throw httpErr(409, `Não é possível reduzir para ${d.vagas} vagas: ${ocupadas} já convocadas/matriculadas.`)
    }
    return d
  },
})

// ---------- Ciclo de vida do processo ----------

const LIFECYCLE: Record<string, { de: string[]; para: string }> = {
  abrir: { de: ['RASCUNHO'], para: 'ABERTO' },
  encerrar: { de: ['ABERTO'], para: 'ENCERRADO' },
  cancelar: { de: ['RASCUNHO', 'ABERTO', 'ENCERRADO', 'CLASSIFICADO', 'EM_CONVOCACAO'], para: 'CANCELADO' },
  finalizar: { de: ['EM_CONVOCACAO', 'CLASSIFICADO'], para: 'FINALIZADO' },
}

for (const [acao, def] of Object.entries(LIFECYCLE)) {
  router.post(
    `/processos/:id/${acao}`,
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const p = await prisma.admProcessoSeletivo.findFirst({ where: { id: String(req.params.id), tenantId }, include: { ofertas: { where: { ativo: true } } } })
      if (!p) return res.status(404).json({ error: 'Processo não encontrado.' })
      if (!def.de.includes(p.status)) return res.status(409).json({ error: `Ação "${acao}" inválida para processo ${p.status}.` })
      if (acao === 'abrir') {
        if (!p.ofertas.length) return res.status(409).json({ error: 'Cadastre ao menos uma oferta ativa antes de abrir.' })
        if (!p.ofertas.some((o) => o.vagas > 0)) return res.status(409).json({ error: 'Nenhuma oferta com vagas.' })
        if (p.inscricaoFim < new Date()) return res.status(409).json({ error: 'O período de inscrições já terminou; ajuste as datas.' })
      }
      if (acao === 'finalizar') {
        await expirarConvocacoes(tenantId)
        await prisma.admChamada.updateMany({ where: { tenantId, processoId: p.id, status: 'ABERTA' }, data: { status: 'ENCERRADA' } })
      }
      const upd = await prisma.admProcessoSeletivo.update({ where: { id: p.id }, data: { status: def.para as any } })
      if (acao === 'abrir') {
        await scheduleReminder({ tenantId, modulo: 'admissoes', titulo: `Encerramento das inscrições: ${p.nome}`, dueAt: p.inscricaoFim, antecedenciaDias: 2, refType: 'AdmProcessoSeletivo', refId: p.id, assigneeRole: 'ADMISSIONS', dedupeKey: `adm-proc-fim-${p.id}` })
        if (p.provaData) await scheduleReminder({ tenantId, modulo: 'admissoes', titulo: `Prova do processo ${p.nome}`, dueAt: p.provaData, antecedenciaDias: 7, refType: 'AdmProcessoSeletivo', refId: p.id, assigneeRole: 'ADMISSIONS', dedupeKey: `adm-proc-prova-${p.id}` })
        if (p.resultadoData) await scheduleReminder({ tenantId, modulo: 'admissoes', titulo: `Divulgar resultado: ${p.nome}`, dueAt: p.resultadoData, antecedenciaDias: 2, refType: 'AdmProcessoSeletivo', refId: p.id, assigneeRole: 'ADMISSIONS', severity: 'ATENCAO', dedupeKey: `adm-proc-res-${p.id}` })
      }
      if (acao === 'cancelar' || acao === 'finalizar') await cancelReminders({ tenantId, refType: 'AdmProcessoSeletivo', refId: p.id })
      await audit({ tenantId, userId: getUserId(req), modulo: 'admissoes', acao: acao.toUpperCase(), refType: 'AdmProcessoSeletivo', refId: p.id })
      res.json(upd)
    }),
  )
}

// ---------- Ocupação de vagas ----------

export async function calcularOcupacao(tenantId: string, processoId: string) {
  const ofertas = await prisma.admOferta.findMany({ where: { tenantId, processoId }, orderBy: { nomeCurso: 'asc' } })
  const ids = ofertas.map((o) => o.id)
  const convs = await prisma.admConvocacao.groupBy({ by: ['ofertaId', 'status'], where: { tenantId, ofertaId: { in: ids } }, _count: true })
  const inscritos = await prisma.admCandidato.groupBy({ by: ['ofertaId'], where: { tenantId, processoId, status: { not: 'LEAD' } }, _count: true })
  return ofertas.map((o) => {
    const n = (st: string) => convs.filter((c) => c.ofertaId === o.id && c.status === st).reduce((s, c) => s + c._count, 0)
    const matriculados = n('MATRICULADO')
    const convocados = n('CONVOCADO')
    const insc = inscritos.filter((i) => i.ofertaId === o.id).reduce((s, i) => s + i._count, 0)
    return {
      ofertaId: o.id, nomeCurso: o.nomeCurso, turno: o.turno, modalidade: o.modalidade, poloNome: o.poloNome,
      vagas: o.vagas, inscritos: insc, relacaoCandidatoVaga: o.vagas > 0 ? Math.round((insc / o.vagas) * 100) / 100 : null,
      convocadosPendentes: convocados, matriculados, vagasLivres: Math.max(0, o.vagas - matriculados - convocados),
      ocupacaoPct: o.vagas > 0 ? Math.round((matriculados / o.vagas) * 1000) / 10 : null,
    }
  })
}

router.get('/processos/:id/ocupacao', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const p = await prisma.admProcessoSeletivo.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!p) return res.status(404).json({ error: 'Processo não encontrado.' })
  res.json(await calcularOcupacao(tenantId, p.id))
}))

// ---------- Notas ----------

const notaItem = z.object({ componente: componenteEnum, nota: z.number().min(0), notaMaxima: z.number().positive().optional(), observacao: z.string().optional() })

export async function lancarNotas(tenantId: string, candidatoId: string, notas: Array<z.infer<typeof notaItem>>, userId?: string) {
  const c = await prisma.admCandidato.findFirst({ where: { id: candidatoId, tenantId }, include: { processo: true } })
  if (!c) throw httpErr(404, 'Candidato não encontrado.')
  if (['DESISTENTE', 'LEAD', 'MATRICULADO'].includes(c.status)) throw httpErr(409, `Candidato com status ${c.status} não pode receber notas.`)
  for (const n of notas) {
    const max = n.notaMaxima ?? 100
    if (n.nota > max) throw httpErr(400, `Nota ${n.nota} maior que a máxima (${max}) em ${n.componente}.`)
    await prisma.admResultadoProva.upsert({
      where: { candidatoId_componente: { candidatoId, componente: n.componente } },
      create: { tenantId, candidatoId, componente: n.componente, nota: n.nota, notaMaxima: max, observacao: n.observacao, lancadoPorId: userId },
      update: { nota: n.nota, notaMaxima: max, observacao: n.observacao, lancadoPorId: userId },
    })
  }
  const todas = await prisma.admResultadoProva.findMany({ where: { tenantId, candidatoId } })
  const final = calcularNotaFinal(todas.map((t) => ({ componente: t.componente, nota: t.nota, notaMaxima: t.notaMaxima })), (c.processo?.pesos as any) ?? null)
  const upd = await prisma.admCandidato.update({ where: { id: candidatoId }, data: { notaFinal: final } })
  if (c.status === 'INSCRITO') await mudarStatusCandidato({ tenantId, candidatoId, para: 'PROVA', userId, motivo: 'Notas lançadas' })
  return { candidato: upd, notas: todas, notaFinal: final }
}

router.post('/candidatos/:id/notas', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const body = parseBody(z.object({ notas: z.array(notaItem).min(1) }), req.body)
  const r = await lancarNotas(getTenantId(req), String(req.params.id), body.notas, getUserId(req))
  res.json(r)
}))

router.get('/candidatos/:id/notas', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await prisma.admResultadoProva.findMany({ where: { tenantId: getTenantId(req), candidatoId: String(req.params.id) } }))
}))

// Lançamento em lote (ex.: planilha de correção). Identifica por protocolo ou CPF.
router.post('/processos/:id/notas-lote', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const body = parseBody(z.object({ itens: z.array(z.object({ protocolo: z.string().optional(), cpf: z.string().optional(), componente: componenteEnum, nota: z.number().min(0), notaMaxima: z.number().positive().optional() })).min(1).max(2000) }), req.body)
  const processoId = String(req.params.id)
  const resultado = { lancados: 0, erros: [] as Array<{ linha: number; erro: string }> }
  let i = 0
  for (const it of body.itens) {
    i++
    try {
      const cpf = it.cpf?.replace(/\D/g, '')
      const c = await prisma.admCandidato.findFirst({ where: { tenantId, processoId, ...(it.protocolo ? { protocolo: it.protocolo } : cpf ? { cpf } : { id: '__none__' }) } })
      if (!c) throw httpErr(404, 'Candidato não encontrado no processo.')
      await lancarNotas(tenantId, c.id, [{ componente: it.componente, nota: it.nota, notaMaxima: it.notaMaxima }], getUserId(req))
      resultado.lancados++
    } catch (e: any) {
      resultado.erros.push({ linha: i, erro: e.message })
    }
  }
  res.json(resultado)
}))

// ---------- Classificação ----------

async function carregarClassificacao(tenantId: string, processoId: string) {
  const p = await prisma.admProcessoSeletivo.findFirst({ where: { id: processoId, tenantId }, include: { ofertas: { where: { ativo: true } } } })
  if (!p) throw httpErr(404, 'Processo não encontrado.')
  const cands = await prisma.admCandidato.findMany({
    where: { tenantId, processoId, status: { in: ['INSCRITO', 'PROVA', 'APROVADO', 'REPROVADO'] }, ...(p.taxaInscricao > 0 ? { taxaPaga: true } : {}) },
    include: { notas: true },
  })
  const entrada: CandidatoClassif[] = cands.map((c) => ({
    id: c.id, ofertaId: c.ofertaId, ofertaId2: c.ofertaId2, notaFinal: c.notaFinal,
    notas: c.notas.map((n) => ({ componente: n.componente, nota: n.nota, notaMaxima: n.notaMaxima })),
    dataNascimento: c.dataNascimento, criadoEm: c.createdAt, cota: c.cota,
  }))
  const vagas = Object.fromEntries(p.ofertas.map((o) => [o.id, o.vagas]))
  const out = classificar(entrada, vagas, { notaMinima: p.notaMinima, criterios: (p.criteriosDesempate as string[] | null) ?? undefined, listaEspera: p.listaEspera })
  return { p, cands, ...out }
}

router.post('/processos/:id/classificar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const processoId = String(req.params.id)
  const simular = qs(req.query.simular) === 'true'
  const { p, cands, resultados, filaPorOferta } = await carregarClassificacao(tenantId, processoId)
  if (!simular) {
    if (!['ABERTO', 'ENCERRADO', 'CLASSIFICADO'].includes(p.status)) throw httpErr(409, `Processo ${p.status} não permite classificação.`)
    if (p.status === 'ABERTO' && p.inscricaoFim > new Date()) throw httpErr(409, 'Inscrições ainda abertas: encerre o processo antes de classificar (ou use ?simular=true).')
    if (await prisma.admChamada.count({ where: { tenantId, processoId } })) throw httpErr(409, 'Já existem chamadas: a classificação não pode ser refeita.')
    const mapa = new Map(cands.map((c) => [c.id, c]))
    for (const r of resultados) {
      const c = mapa.get(r.id)!
      await prisma.admCandidato.update({ where: { id: r.id }, data: { classificacao: r.posicaoGeral, situacaoClassificacao: r.situacao, ofertaAlocadaId: r.ofertaAlocada } })
      const alvo = r.situacao === 'DESCLASSIFICADO' ? 'REPROVADO' : 'APROVADO'
      if (c.status !== alvo) await mudarStatusCandidato({ tenantId, candidatoId: r.id, para: alvo, userId: getUserId(req), motivo: r.situacao === 'DESCLASSIFICADO' ? r.motivo : r.situacao === 'LISTA_ESPERA' ? 'Lista de espera' : 'Classificado', forcar: true })
    }
    await prisma.admProcessoSeletivo.update({ where: { id: p.id }, data: { status: 'CLASSIFICADO' } })
    await audit({ tenantId, userId: getUserId(req), modulo: 'admissoes', acao: 'CLASSIFICAR', refType: 'AdmProcessoSeletivo', refId: p.id, detalhes: { total: resultados.length } })
  }
  const resumo = {
    classificados: resultados.filter((r) => r.situacao === 'CLASSIFICADO').length,
    listaEspera: resultados.filter((r) => r.situacao === 'LISTA_ESPERA').length,
    desclassificados: resultados.filter((r) => r.situacao === 'DESCLASSIFICADO').length,
  }
  res.json({ simulacao: simular, resumo, resultados, filaPorOferta })
}))

router.get('/processos/:id/classificacao', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const where: any = { tenantId, processoId: String(req.params.id), classificacao: { not: null } }
  const o = qs(req.query.ofertaId)
  if (o) where.ofertaAlocadaId = o
  const s = qs(req.query.situacao)
  if (s) where.situacaoClassificacao = s
  res.json(await prisma.admCandidato.findMany({
    where, orderBy: { classificacao: 'asc' },
    select: { id: true, protocolo: true, nome: true, notaFinal: true, classificacao: true, situacaoClassificacao: true, ofertaAlocadaId: true, status: true, ofertaId: true, ofertaId2: true },
  }))
}))

// ---------- Chamadas / convocações ----------

router.get('/processos/:id/chamadas', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await prisma.admChamada.findMany({ where: { tenantId: getTenantId(req), processoId: String(req.params.id) }, include: { convocacoes: { include: { candidato: { select: { id: true, nome: true, protocolo: true, classificacao: true } } } } }, orderBy: { numero: 'asc' } }))
}))

router.post('/processos/:id/chamadas', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const body = parseBody(z.object({ prazoMatricula: dateISO().optional(), simular: z.boolean().optional() }), req.body ?? {})
  const p = await prisma.admProcessoSeletivo.findFirst({ where: { id: String(req.params.id), tenantId }, include: { ofertas: { where: { ativo: true } } } })
  if (!p) return res.status(404).json({ error: 'Processo não encontrado.' })
  if (!['CLASSIFICADO', 'EM_CONVOCACAO'].includes(p.status)) return res.status(409).json({ error: 'Classifique o processo antes de convocar.' })
  await expirarConvocacoes(tenantId)
  const abertas = await prisma.admChamada.findFirst({ where: { tenantId, processoId: p.id, status: 'ABERTA' } })
  if (abertas && !body.simular) return res.status(409).json({ error: `A chamada ${abertas.numero} ainda está aberta; encerre-a antes de gerar a próxima.` })
  const prazo = body.prazoMatricula ?? new Date(Date.now() + p.diasPrazoMatricula * DAY)
  if (prazo.getTime() <= Date.now()) return res.status(400).json({ error: 'Prazo de matrícula deve ser futuro.' })

  const ids = p.ofertas.map((o) => o.id)
  const convs = await prisma.admConvocacao.findMany({ where: { tenantId, ofertaId: { in: ids }, chamada: { processoId: p.id } } })
  const ocupadas = (oid: string) => convs.filter((c) => c.ofertaId === oid && (c.status === 'MATRICULADO' || c.status === 'CONVOCADO')).length
  const candidatos = await prisma.admCandidato.findMany({
    where: { tenantId, processoId: p.id, status: 'APROVADO', classificacao: { not: null }, situacaoClassificacao: { in: ['CLASSIFICADO', 'LISTA_ESPERA'] } },
    orderBy: { classificacao: 'asc' }, select: { id: true, ofertaId: true, ofertaId2: true, ofertaAlocadaId: true, situacaoClassificacao: true },
  })
  const ofertasEstado = p.ofertas.map((o) => ({
    ofertaId: o.id, vagas: o.vagas, ocupadas: ocupadas(o.id),
    fila: [
      ...candidatos.filter((c) => c.ofertaAlocadaId === o.id).map((c) => c.id),
      ...candidatos.filter((c) => c.situacaoClassificacao === 'LISTA_ESPERA' && (c.ofertaId === o.id || c.ofertaId2 === o.id)).map((c) => c.id),
    ],
  }))
  const jaConv = new Set(convs.map((c) => c.candidatoId)) // quem já foi convocado (qualquer desfecho) não é reconvocado
  const selecionados = proximaChamada(ofertasEstado, jaConv)
  if (body.simular) return res.json({ simulacao: true, convocacoes: selecionados })
  if (!selecionados.length) return res.status(409).json({ error: 'Não há vagas livres ou candidatos na fila para convocar.' })

  const numero = (await prisma.admChamada.count({ where: { tenantId, processoId: p.id } })) + 1
  const chamada = await prisma.admChamada.create({ data: { tenantId, processoId: p.id, numero, prazoMatricula: prazo, geradaPorId: getUserId(req) } })
  for (const s of selecionados) await convocarCandidato({ tenantId, candidatoId: s.candidatoId, chamadaId: chamada.id, ofertaId: s.ofertaId, prazo, userId: getUserId(req), processoNome: p.nome })
  await prisma.admProcessoSeletivo.update({ where: { id: p.id }, data: { status: 'EM_CONVOCACAO' } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'admissoes', acao: 'GERAR_CHAMADA', refType: 'AdmChamada', refId: chamada.id, detalhes: { numero, convocados: selecionados.length } })
  res.status(201).json({ chamada, convocados: selecionados.length })
}))

router.post('/chamadas/:id/encerrar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ch = await prisma.admChamada.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!ch) return res.status(404).json({ error: 'Chamada não encontrada.' })
  if (ch.status === 'ENCERRADA') return res.status(409).json({ error: 'Chamada já encerrada.' })
  // convocações pendentes são expiradas imediatamente
  await prisma.admConvocacao.updateMany({ where: { tenantId, chamadaId: ch.id, status: 'CONVOCADO' }, data: { prazo: new Date(Date.now() - 1000) } })
  const expiradas = await expirarConvocacoes(tenantId)
  const upd = await prisma.admChamada.update({ where: { id: ch.id }, data: { status: 'ENCERRADA' } })
  res.json({ chamada: upd, convocacoesExpiradas: expiradas })
}))

router.post('/convocacoes/:id/renunciar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const motivo = parseBody(z.object({ motivo: z.string().optional() }), req.body ?? {}).motivo
  const cv = await prisma.admConvocacao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!cv) return res.status(404).json({ error: 'Convocação não encontrada.' })
  if (cv.status !== 'CONVOCADO') return res.status(409).json({ error: `Convocação já está ${cv.status}.` })
  await prisma.admConvocacao.update({ where: { id: cv.id }, data: { status: 'RENUNCIOU' } })
  await mudarStatusCandidato({ tenantId, candidatoId: cv.candidatoId, para: 'DESISTENTE', userId: getUserId(req), motivo: motivo ?? 'Renunciou à vaga', forcar: true })
  await cancelReminders({ tenantId, refType: 'AdmConvocacao', refId: cv.id })
  res.json({ ok: true, observacao: 'Vaga liberada: gere nova chamada para preenchê-la.' })
}))

export default router
