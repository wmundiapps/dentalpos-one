import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, pageParams, qs, dateISO } from '../core/crud'
import { audit } from '../core/notify'
import { scheduleReminder } from '../core/reminders'
import { credencialVigente, normalizarPlaca, ocupacaoPct, placaValida } from './calc'
import { GESTAO, LEITURA, MODULO, ensureSpace, fail, money } from './util'

const PORTARIA = [...GESTAO, 'SUPPORT', 'STAFF'] as const
const TIPOS_VAGA = ['COMUM', 'PCD', 'IDOSO', 'MOTO', 'DOCENTE', 'VISITANTE', 'ADMINISTRATIVO'] as const
const placaSchema = z.string().min(6).transform(normalizarPlaca).refine(placaValida, 'Placa inválida (AAA9999 ou AAA9A99).')

// Regras de elegibilidade de vaga para um veículo. Retorna motivo de negação ou null.
export function restricaoVaga(vagaTipo: string, veiculo: { tipo: string; vinculo: string; vagaEspecial?: string | null } | null): string | null {
  if (vagaTipo === 'COMUM' || vagaTipo === 'VISITANTE') return vagaTipo === 'VISITANTE' && veiculo && veiculo.vinculo !== 'VISITANTE' ? 'Vaga reservada a visitantes.' : null
  if (vagaTipo === 'MOTO') return veiculo?.tipo === 'MOTO' ? null : 'Vaga exclusiva para motos.'
  if (vagaTipo === 'DOCENTE') return veiculo && (veiculo.vinculo === 'DOCENTE' || veiculo.vagaEspecial === 'DOCENTE') ? null : 'Vaga exclusiva para docentes.'
  if (vagaTipo === 'ADMINISTRATIVO') return veiculo && (veiculo.vinculo === 'FUNCIONARIO' || veiculo.vinculo === 'DOCENTE') ? null : 'Vaga exclusiva para equipe administrativa.'
  if (vagaTipo === 'PCD' || vagaTipo === 'IDOSO') return veiculo?.vagaEspecial === vagaTipo ? null : `Vaga ${vagaTipo === 'PCD' ? 'PcD' : 'de idoso'} exige credencial especial.`
  return null
}

export async function ocupacaoAreas(tenantId: string) {
  const [areas, vagas, abertos] = await Promise.all([
    prisma.infAreaEstacionamento.findMany({ where: { tenantId, ativo: true }, orderBy: { nome: 'asc' } }),
    prisma.infVaga.findMany({ where: { tenantId, ativo: true } }),
    prisma.infAcessoEstacionamento.findMany({ where: { tenantId, saidaEm: null, autorizado: true } }),
  ])
  return areas.map((a) => {
    const vs = vagas.filter((v) => v.areaId === a.id)
    const ab = abertos.filter((x) => x.areaId === a.id)
    const porTipo: Record<string, { total: number; ocupadas: number }> = {}
    for (const v of vs) {
      const t = (porTipo[v.tipo] ??= { total: 0, ocupadas: 0 })
      t.total++
      if (ab.some((x) => x.vagaId === v.id)) t.ocupadas++
    }
    return { areaId: a.id, nome: a.nome, totalVagas: vs.length, ocupadas: ab.length, livres: Math.max(0, vs.length - ab.length), ocupacaoPct: ocupacaoPct(ab.length, vs.length), porTipo }
  })
}

export function mountEstacionamento(router: Router) {
  mountCrud(router, {
    model: 'infAreaEstacionamento', path: '/estacionamento/areas', read: [...LEITURA, 'SUPPORT', 'STAFF'], write: GESTAO, modulo: MODULO, removeMode: 'soft',
    create: z.object({ nome: z.string().min(2), spaceId: z.string().optional().nullable(), campusId: z.string().optional().nullable(), descricao: z.string().optional().nullable(), ativo: z.boolean().optional() }),
    search: ['nome'], filters: ['ativo', 'campusId'], orderBy: { nome: 'asc' },
    beforeCreate: async (d: any, req) => { await ensureSpace(getTenantId(req), d.spaceId) },
  })

  mountCrud(router, {
    model: 'infVaga', path: '/estacionamento/vagas', read: [...LEITURA, 'SUPPORT', 'STAFF'], write: GESTAO, modulo: MODULO,
    create: z.object({ areaId: z.string().min(1), codigo: z.string().min(1).max(20), tipo: z.enum(TIPOS_VAGA).default('COMUM'), ativo: z.boolean().optional() }),
    filters: ['areaId', 'tipo', 'ativo'], orderBy: [{ areaId: 'asc' }, { codigo: 'asc' }],
    beforeCreate: async (d: any, req) => { if (!(await prisma.infAreaEstacionamento.findFirst({ where: { id: d.areaId, tenantId: getTenantId(req) } }))) fail(400, 'Área não encontrada.') },
  })

  // Criação de vagas em lote: prefixo + numeração.
  router.post(
    '/estacionamento/areas/:id/vagas-lote',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(z.object({ prefixo: z.string().max(6).default('V'), inicio: z.number().int().min(1).default(1), quantidade: z.number().int().min(1).max(500), tipo: z.enum(TIPOS_VAGA).default('COMUM') }), req.body)
      const area = await prisma.infAreaEstacionamento.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!area) return res.status(404).json({ error: 'Área não encontrada.' })
      const data = Array.from({ length: d.quantidade }, (_, i) => ({ tenantId, areaId: area.id, codigo: `${d.prefixo}${String(d.inicio + i).padStart(3, '0')}`, tipo: d.tipo }))
      const r = await prisma.infVaga.createMany({ data, skipDuplicates: true })
      res.status(201).json({ criadas: r.count, ignoradasPorDuplicidade: d.quantidade - r.count })
    }),
  )

  // ----- Veículos / credenciais -----
  mountCrud(router, {
    model: 'infVeiculo', path: '/estacionamento/veiculos', read: [...LEITURA, 'SUPPORT', 'STAFF'], write: GESTAO, modulo: MODULO,
    create: z.object({
      placa: placaSchema, tipo: z.enum(['CARRO', 'MOTO', 'BICICLETA', 'OUTRO']).default('CARRO'), modelo: z.string().optional().nullable(), cor: z.string().optional().nullable(),
      vinculo: z.enum(['ALUNO', 'DOCENTE', 'FUNCIONARIO', 'VISITANTE', 'TERCEIRIZADO']).default('ALUNO'), proprietarioNome: z.string().min(2),
      proprietarioUserId: z.string().optional().nullable(), studentId: z.string().optional().nullable(), contato: z.string().optional().nullable(),
      credencial: z.string().optional().nullable(), validade: dateISO().optional().nullable(), vagaEspecial: z.enum(['PCD', 'IDOSO', 'DOCENTE']).optional().nullable(),
    }),
    update: z.object({
      tipo: z.enum(['CARRO', 'MOTO', 'BICICLETA', 'OUTRO']), modelo: z.string().nullable(), cor: z.string().nullable(), vinculo: z.enum(['ALUNO', 'DOCENTE', 'FUNCIONARIO', 'VISITANTE', 'TERCEIRIZADO']),
      proprietarioNome: z.string().min(2), contato: z.string().nullable(), credencial: z.string().nullable(), vagaEspecial: z.enum(['PCD', 'IDOSO', 'DOCENTE']).nullable(), validade: dateISO().nullable(),
    }).partial(),
    search: ['placa', 'proprietarioNome', 'credencial'], filters: ['vinculo', 'credencialStatus', 'tipo'], orderBy: { placa: 'asc' },
    beforeCreate: async (d: any, req) => {
      const tenantId = getTenantId(req)
      if (d.validade && d.validade < new Date()) fail(400, 'Validade já expirada.')
      if (d.studentId && !(await prisma.student.findFirst({ where: { id: d.studentId, tenantId }, select: { id: true } }))) fail(400, 'Aluno não encontrado.')
    },
    afterCreate: async (row: any) => { if (row.validade) await agendarVencimentoCredencial(row) },
  })

  async function agendarVencimentoCredencial(v: any) {
    await scheduleReminder({ tenantId: v.tenantId, modulo: MODULO, titulo: `Credencial de estacionamento vence: ${v.placa} (${v.proprietarioNome})`, dueAt: v.validade, antecedenciaDias: 15, refType: 'InfVeiculo', refId: v.id, assigneeUserId: v.proprietarioUserId ?? undefined, assigneeRole: v.proprietarioUserId ? undefined : 'FACILITIES', dedupeKey: `inf-cred-${v.id}-${new Date(v.validade).toISOString().slice(0, 10)}` })
  }

  router.post(
    '/estacionamento/veiculos/:id/credencial',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(z.object({ acao: z.enum(['SUSPENDER', 'REVOGAR', 'REATIVAR', 'RENOVAR']), validade: dateISO().optional(), motivo: z.string().optional() }), req.body)
      const v = await prisma.infVeiculo.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!v) return res.status(404).json({ error: 'Veículo não encontrado.' })
      if (v.credencialStatus === 'REVOGADA' && d.acao !== 'RENOVAR') fail(409, 'Credencial revogada: só pode ser renovada.')
      const data: any = {}
      if (d.acao === 'SUSPENDER') data.credencialStatus = 'SUSPENSA'
      if (d.acao === 'REVOGAR') data.credencialStatus = 'REVOGADA'
      if (d.acao === 'REATIVAR') { if (v.validade && v.validade < new Date()) fail(409, 'Credencial vencida: renove com nova validade.'); data.credencialStatus = 'ATIVA' }
      if (d.acao === 'RENOVAR') { if (!d.validade || d.validade < new Date()) fail(400, 'Informe uma nova validade futura.'); data.validade = d.validade; data.credencialStatus = 'ATIVA' }
      const nv = await prisma.infVeiculo.update({ where: { id: v.id }, data })
      if (d.acao === 'RENOVAR') await agendarVencimentoCredencial(nv)
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: `CREDENCIAL_${d.acao}`, refType: 'InfVeiculo', refId: v.id, detalhes: { motivo: d.motivo } })
      res.json(nv)
    }),
  )

  // ----- Controle de acesso -----
  router.post(
    '/estacionamento/acessos/entrada',
    requireRole(...PORTARIA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const d = parseBody(z.object({ placa: placaSchema, areaId: z.string().min(1), vagaId: z.string().optional().nullable(), visitante: z.boolean().default(false) }), req.body)
      const area = await prisma.infAreaEstacionamento.findFirst({ where: { id: d.areaId, tenantId, ativo: true } })
      if (!area) fail(400, 'Área não encontrada ou inativa.')
      const veic = await prisma.infVeiculo.findFirst({ where: { tenantId, placa: d.placa } })
      const dentro = await prisma.infAcessoEstacionamento.findFirst({ where: { tenantId, placa: d.placa, saidaEm: null, autorizado: true } })
      let negado: string | null = null
      let criarOcorrencia: string | null = null
      if (dentro) negado = 'Veículo já consta como dentro do estacionamento (registre a saída antes).'
      else if (!veic && !d.visitante) negado = 'Placa não cadastrada. Cadastre o veículo ou registre como visitante.'
      else if (veic) {
        const c = credencialVigente(veic.credencialStatus, veic.validade)
        if (!c.ok) { negado = c.motivo!; criarOcorrencia = 'CREDENCIAL_VENCIDA' }
      }
      let vaga: any = null
      if (!negado && d.vagaId) {
        vaga = await prisma.infVaga.findFirst({ where: { id: d.vagaId, tenantId, areaId: d.areaId, ativo: true } })
        if (!vaga) negado = 'Vaga inexistente nesta área.'
        else {
          const ocup = await prisma.infAcessoEstacionamento.findFirst({ where: { tenantId, vagaId: vaga.id, saidaEm: null, autorizado: true } })
          if (ocup) negado = `Vaga ${vaga.codigo} já ocupada.`
          else {
            const r = restricaoVaga(vaga.tipo, veic ? { tipo: veic.tipo, vinculo: veic.vinculo, vagaEspecial: veic.vagaEspecial } : { tipo: 'CARRO', vinculo: 'VISITANTE', vagaEspecial: null })
            if (r) { negado = r; criarOcorrencia = 'VAGA_INDEVIDA' }
          }
        }
      }
      if (!negado) {
        const [vagas, ocupadas] = await Promise.all([prisma.infVaga.count({ where: { tenantId, areaId: d.areaId, ativo: true } }), prisma.infAcessoEstacionamento.count({ where: { tenantId, areaId: d.areaId, saidaEm: null, autorizado: true } })])
        if (vagas > 0 && ocupadas >= vagas) negado = 'Estacionamento lotado.'
      }
      const reg = await prisma.infAcessoEstacionamento.create({ data: { tenantId, areaId: d.areaId, vagaId: negado ? null : vaga?.id ?? null, veiculoId: veic?.id, placa: d.placa, autorizado: !negado, motivoNegado: negado, registradoPorId: userId } })
      if (criarOcorrencia) await prisma.infOcorrenciaEstacionamento.create({ data: { tenantId, areaId: d.areaId, vagaId: d.vagaId ?? null, veiculoId: veic?.id, placa: d.placa, tipo: criarOcorrencia, descricao: negado!, registradoPorId: userId } })
      if (negado) return res.status(403).json({ error: negado, registro: reg })
      res.status(201).json(reg)
    }),
  )

  router.post(
    '/estacionamento/acessos/saida',
    requireRole(...PORTARIA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(z.object({ placa: placaSchema }), req.body)
      const ab = await prisma.infAcessoEstacionamento.findFirst({ where: { tenantId, placa: d.placa, saidaEm: null, autorizado: true }, orderBy: { entradaEm: 'desc' } })
      if (!ab) fail(404, 'Não há entrada em aberto para esta placa.')
      const reg = await prisma.infAcessoEstacionamento.update({ where: { id: ab.id }, data: { saidaEm: new Date() } })
      res.json({ ...reg, permanenciaMin: Math.round((reg.saidaEm!.getTime() - reg.entradaEm.getTime()) / 60000) })
    }),
  )

  router.get(
    '/estacionamento/acessos',
    requireRole(...PORTARIA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId }
      if (qs(req.query.areaId)) where.areaId = qs(req.query.areaId)
      if (qs(req.query.placa)) where.placa = normalizarPlaca(qs(req.query.placa)!)
      if (qs(req.query.dentro) === 'true') { where.saidaEm = null; where.autorizado = true }
      if (qs(req.query.negados) === 'true') where.autorizado = false
      const [items, total] = await Promise.all([prisma.infAcessoEstacionamento.findMany({ where, orderBy: { entradaEm: 'desc' }, skip, take }), prisma.infAcessoEstacionamento.count({ where })])
      res.json({ items, total, page, pageSize })
    }),
  )

  router.get(
    '/estacionamento/ocupacao',
    requireRole(...PORTARIA, ...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const areas = await ocupacaoAreas(getTenantId(req))
      const totalVagas = areas.reduce((s, a) => s + a.totalVagas, 0), ocupadas = areas.reduce((s, a) => s + a.ocupadas, 0)
      res.json({ areas, total: { totalVagas, ocupadas, livres: Math.max(0, totalVagas - ocupadas), ocupacaoPct: ocupacaoPct(ocupadas, totalVagas) } })
    }),
  )

  // ----- Ocorrências -----
  mountCrud(router, {
    model: 'infOcorrenciaEstacionamento', path: '/estacionamento/ocorrencias', read: [...LEITURA, 'SUPPORT'], write: [...GESTAO, 'SUPPORT', 'STAFF'], modulo: MODULO,
    create: z.object({ areaId: z.string().optional().nullable(), vagaId: z.string().optional().nullable(), placa: z.string().optional().nullable().transform((p) => (p ? normalizarPlaca(p) : p)), tipo: z.enum(['MAU_ESTACIONAMENTO', 'VAGA_INDEVIDA', 'DANO', 'FURTO', 'ACIDENTE', 'CREDENCIAL_VENCIDA', 'OUTRO']), descricao: z.string().min(3), gravidade: z.enum(['LEVE', 'MEDIA', 'GRAVE']).default('LEVE'), fotoUrl: z.string().url().optional().nullable() }),
    update: z.object({ descricao: z.string().min(3), gravidade: z.enum(['LEVE', 'MEDIA', 'GRAVE']), status: z.enum(['ABERTA', 'EM_ANALISE', 'ARQUIVADA']) }).partial(),
    filters: ['status', 'tipo', 'areaId', 'gravidade'], search: ['placa', 'descricao'],
    beforeCreate: async (d: any, req) => {
      const tenantId = getTenantId(req)
      if (d.areaId && !(await prisma.infAreaEstacionamento.findFirst({ where: { id: d.areaId, tenantId } }))) fail(400, 'Área não encontrada.')
      if (d.placa) { const v = await prisma.infVeiculo.findFirst({ where: { tenantId, placa: d.placa } }); if (v) d.veiculoId = v.id }
      d.registradoPorId = getUserId(req)
    },
    afterCreate: async (row: any) => {
      if (row.gravidade === 'GRAVE') await scheduleReminder({ tenantId: row.tenantId, modulo: MODULO, titulo: `Ocorrência GRAVE no estacionamento: ${row.tipo}`, dueAt: new Date(Date.now() + 2 * 86_400_000), antecedenciaDias: 0, severity: 'CRITICO', refType: 'InfOcorrenciaEstacionamento', refId: row.id, assigneeRole: 'FACILITIES', dedupeKey: `inf-ocor-${row.id}` })
    },
  })
  router.post(
    '/estacionamento/ocorrencias/:id/resolver',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(z.object({ resolucao: z.string().min(3), suspenderCredencial: z.boolean().default(false) }), req.body)
      const o = await prisma.infOcorrenciaEstacionamento.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!o) return res.status(404).json({ error: 'Ocorrência não encontrada.' })
      if (['RESOLVIDA', 'ARQUIVADA'].includes(o.status)) fail(409, 'Ocorrência já encerrada.')
      if (d.suspenderCredencial && o.veiculoId) await prisma.infVeiculo.updateMany({ where: { id: o.veiculoId, tenantId }, data: { credencialStatus: 'SUSPENSA' } })
      const { completeReminders } = await import('../core/reminders')
      await completeReminders({ tenantId, refType: 'InfOcorrenciaEstacionamento', refId: o.id, userId: getUserId(req) })
      res.json(await prisma.infOcorrenciaEstacionamento.update({ where: { id: o.id }, data: { status: 'RESOLVIDA', resolucao: d.resolucao, resolvidaEm: new Date() } }))
    }),
  )

  // ----- Relatório de ocupação -----
  router.get(
    '/estacionamento/relatorios/ocupacao',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const ate = qs(req.query.ate) ? new Date(qs(req.query.ate)!) : new Date()
      const de = qs(req.query.de) ? new Date(qs(req.query.de)!) : new Date(ate.getTime() - 30 * 86_400_000)
      const [acessos, ocorr, atual] = await Promise.all([
        prisma.infAcessoEstacionamento.findMany({ where: { tenantId, entradaEm: { gte: de, lte: ate } }, take: 50000 }),
        prisma.infOcorrenciaEstacionamento.groupBy({ by: ['tipo'], where: { tenantId, createdAt: { gte: de, lte: ate } }, _count: { _all: true } }),
        ocupacaoAreas(tenantId),
      ])
      const aut = acessos.filter((a) => a.autorizado)
      const porHora = Array.from({ length: 24 }, (_, h) => ({ hora: h, entradas: 0 }))
      const porDia: Record<string, number> = {}
      let somaPerm = 0, nPerm = 0
      for (const a of aut) {
        porHora[a.entradaEm.getHours()].entradas++
        const k = a.entradaEm.toISOString().slice(0, 10)
        porDia[k] = (porDia[k] ?? 0) + 1
        if (a.saidaEm) { somaPerm += a.saidaEm.getTime() - a.entradaEm.getTime(); nPerm++ }
      }
      const pico = [...porHora].sort((a, b) => b.entradas - a.entradas)[0]
      res.json({
        periodo: { de, ate }, entradasAutorizadas: aut.length, acessosNegados: acessos.length - aut.length,
        permanenciaMediaMin: nPerm ? money(somaPerm / nPerm / 60000) : null, horarioPico: pico?.entradas ? pico : null,
        porHora, porDia: Object.entries(porDia).map(([dia, entradas]) => ({ dia, entradas })).sort((a, b) => a.dia.localeCompare(b.dia)),
        ocorrenciasPorTipo: ocorr.map((o) => ({ tipo: o.tipo, quantidade: o._count._all })), ocupacaoAtual: atual,
      })
    }),
  )
}

// Job: vence credenciais, avisa as que vencem em 15 dias e fecha acessos esquecidos (> 24h).
export async function jobEstacionamento(agora = new Date()) {
  const venc = await prisma.infVeiculo.updateMany({ where: { credencialStatus: 'ATIVA', validade: { lt: agora } }, data: { credencialStatus: 'VENCIDA' } })
  const aVencer = await prisma.infVeiculo.findMany({ where: { credencialStatus: 'ATIVA', validade: { gte: agora, lte: new Date(agora.getTime() + 15 * 86_400_000) } }, take: 1000 })
  for (const v of aVencer) {
    await scheduleReminder({ tenantId: v.tenantId, modulo: MODULO, titulo: `Credencial de estacionamento vence: ${v.placa} (${v.proprietarioNome})`, dueAt: v.validade!, antecedenciaDias: 15, refType: 'InfVeiculo', refId: v.id, assigneeUserId: v.proprietarioUserId ?? undefined, assigneeRole: v.proprietarioUserId ? undefined : 'FACILITIES', dedupeKey: `inf-cred-${v.id}-${v.validade!.toISOString().slice(0, 10)}` })
  }
  const esquecidos = await prisma.infAcessoEstacionamento.updateMany({ where: { saidaEm: null, autorizado: true, entradaEm: { lt: new Date(agora.getTime() - 24 * 3_600_000) } }, data: { saidaEm: agora } })
  return { credenciaisVencidas: venc.count, avisadas: aVencer.length, acessosFechadosAuto: esquecidos.count }
}
