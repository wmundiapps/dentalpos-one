import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { completeReminders, scheduleReminder } from '../core/reminders'
import { decifrar } from '../seguranca/cripto'
import { abreviar } from './pacientes'
import { DIA, MOD, RECEPCAO, dt, ehGestor, ehRecepcao, exigir, exigirAluno, exigirUser, getConfig, httpErr, mapaAlunos, mapaUsuarios, zId } from './servico'

export const ESPECIES: Record<'PEQUENO' | 'GRANDE', string[]> = { PEQUENO: ['CAO', 'GATO', 'COELHO', 'AVE', 'OUTRO'], GRANDE: ['BOVINO', 'EQUINO', 'OVINO', 'CAPRINO', 'SUINO', 'OUTRO'] }
const LEIT = [...RECEPCAO, 'TEACHER', 'STUDENT'] as const
const CLIN = ['COORDINATOR', 'TEACHER', 'STUDENT'] as const

/** Gestão e professores registram livremente; aluno só em animais dos seus atendimentos/internações. */
async function podeAtuar(req: AuthenticatedRequest, animalId: string) {
  const u = req.user!
  if (ehGestor(req) || u.role === 'TEACHER') return true
  if (u.role !== 'STUDENT' || !u.studentId) return false
  const tenantId = u.tenantId
  const [c, i] = await Promise.all([
    prisma.cprConsulta.count({ where: { tenantId, animalId, alunoStudentId: u.studentId, status: { in: ['AGENDADO', 'CONFIRMADO', 'CHEGOU', 'EM_ATENDIMENTO'] } } }),
    prisma.cprInternacao.count({ where: { tenantId, animalId, alunoStudentId: u.studentId, status: 'INTERNADO' } }),
  ])
  return c + i > 0
}

async function escalaVigente(tenantId: string, unidadeId: string, supervisorUserId: string, quando: Date) {
  return prisma.cprEscala.findFirst({ where: { tenantId, unidadeId, supervisorUserId, status: 'ATIVA', inicio: { lte: quando }, fim: { gte: quando } } })
}

async function saldoSup(tenantId: string, itemIds: string[]) {
  const g = await prisma.supSaldo.groupBy({ by: ['itemId'], where: { tenantId, itemId: { in: itemIds } }, _sum: { quantidade: true } })
  return new Map(g.map((x) => [x.itemId, x._sum.quantidade ?? 0]))
}

export async function jobLembretesVacina() {
  const tenants = await prisma.cprProfilaxia.findMany({ distinct: ['tenantId'], select: { tenantId: true } })
  let notificados = 0
  for (const { tenantId } of tenants) {
    const cfg = await getConfig(tenantId)
    const lim = new Date(Date.now() + cfg.diasLembreteVacina * DIA)
    const pend = await prisma.cprProfilaxia.findMany({ where: { tenantId, proximaDose: { lte: lim }, lembreteEnviadoEm: null }, take: 500 })
    for (const p of pend) {
      const prox = await prisma.cprProfilaxia.count({ where: { tenantId, animalId: p.animalId, tipo: p.tipo, aplicadaEm: { gt: p.aplicadaEm } } })
      if (prox) { await prisma.cprProfilaxia.update({ where: { id: p.id }, data: { lembreteEnviadoEm: new Date() } }); continue }
      const an = await prisma.cprAnimal.findFirst({ where: { id: p.animalId, tenantId, status: 'ATIVO' } })
      if (!an) continue
      const tutor = await prisma.cprPaciente.findFirst({ where: { id: an.tutorId, tenantId } })
      if (!tutor || tutor.consentimentoStatus !== 'ATIVO') continue
      let destino: string | undefined
      try { destino = tutor.telefoneCifrado ? decifrar(tutor.telefoneCifrado) : undefined } catch { /* sem telefone */ }
      await notify({ tenantId, canal: destino ? 'WHATSAPP' : 'IN_APP', destino, assunto: `${p.tipo === 'VACINA' ? 'Vacina' : 'Vermifugação'} de ${an.nome}`, mensagem: `Olá! A próxima dose (${p.produto}) de ${an.nome} vence em ${p.proximaDose!.toLocaleDateString('pt-BR')}. Agende no hospital veterinário-escola.`, refType: 'CprProfilaxia', refId: p.id })
      await prisma.cprProfilaxia.update({ where: { id: p.id }, data: { lembreteEnviadoEm: new Date() } })
      notificados++
    }
  }
  return { notificados }
}

export function mountAnimal(router: Router) {
  const leit = requireRole(...LEIT)
  const clin = requireRole(...CLIN)
  const cadastro = requireRole('COORDINATOR', 'SECRETARY', 'STAFF', 'TEACHER')

  mountCrud(router, {
    model: 'cprPropriedade', path: '/animal/propriedades', read: [...LEIT], write: ['COORDINATOR', 'SECRETARY', 'STAFF', 'TEACHER'], modulo: MOD, search: ['nome', 'municipio'], filters: ['tutorId'], orderBy: { nome: 'asc' },
    create: z.object({ tutorId: zId, nome: z.string().trim().min(2).max(120), municipio: z.string().max(80).optional(), uf: z.string().max(2).optional(), hectares: z.number().positive().max(1e6).optional(), exploracao: z.enum(['BOVINOCULTURA_CORTE', 'LEITE', 'EQUINOCULTURA', 'OVINOCAPRINO', 'SUINOCULTURA', 'AVICULTURA', 'MISTA']).optional() }),
    beforeCreate: async (d, req) => { await exigir(prisma.cprPaciente.findFirst({ where: { id: d.tutorId, tenantId: getTenantId(req), tipo: 'TUTOR' } }), 'Tutor não encontrado.', 400) },
  })

  // ---------------------------------------------------------------- animais
  const schemaAnimal = z.object({ nome: z.string().trim().min(1).max(80), grupo: z.enum(['PEQUENO', 'GRANDE']), especie: z.string().trim().toUpperCase().max(20), raca: z.string().max(80).optional(), sexo: z.enum(['M', 'F']).optional(), nascimento: dt.optional(), pelagem: z.string().max(60).optional(), identificacao: z.string().trim().max(60).optional(), tutorId: zId, propriedadeId: zId.optional(), pesoAtualKg: z.number().positive().max(2000).optional(), observacoes: z.string().max(500).optional() })

  router.post('/animal/animais', cadastro, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(schemaAnimal, req.body)
    if (!ESPECIES[b.grupo].includes(b.especie)) throw httpErr(400, `Espécie ${b.especie} não é válida para ${b.grupo === 'PEQUENO' ? 'pequenos' : 'grandes'} animais (${ESPECIES[b.grupo].join(', ')}).`)
    const tutor = await exigir(prisma.cprPaciente.findFirst({ where: { id: b.tutorId, tenantId, tipo: 'TUTOR' } }), 'Tutor não encontrado.', 400)
    if (tutor.consentimentoStatus !== 'ATIVO') throw httpErr(409, 'O tutor não tem consentimento (LGPD) ativo.', 'CONSENTIMENTO_AUSENTE')
    if (b.propriedadeId) await exigir(prisma.cprPropriedade.findFirst({ where: { id: b.propriedadeId, tenantId, tutorId: tutor.id } }), 'Propriedade não pertence ao tutor.', 400)
    if (b.identificacao && (await prisma.cprAnimal.findFirst({ where: { tenantId, identificacao: b.identificacao } }))) throw httpErr(409, 'Já existe animal com esta identificação (microchip/brinco).', 'IDENTIFICACAO_DUPLICADA')
    const a = await prisma.cprAnimal.create({ data: { ...b, tenantId } })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CADASTRAR_ANIMAL', refType: 'CprAnimal', refId: a.id })
    res.status(201).json(a)
  }))

  router.get('/animal/animais', leit, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['grupo', 'especie', 'tutorId', 'status']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const q = qs(req.query.q); if (q) where.OR = [{ nome: { contains: q, mode: 'insensitive' } }, { identificacao: { contains: q, mode: 'insensitive' } }]
    const [rows, total] = await Promise.all([prisma.cprAnimal.findMany({ where, orderBy: { nome: 'asc' }, skip, take }), prisma.cprAnimal.count({ where })])
    const tutores = await prisma.cprPaciente.findMany({ where: { tenantId, id: { in: rows.map((r) => r.tutorId) } }, select: { id: true, nome: true } })
    const intern = await prisma.cprInternacao.findMany({ where: { tenantId, status: 'INTERNADO', animalId: { in: rows.map((r) => r.id) } }, select: { animalId: true } })
    res.json({ items: rows.map((a) => { const t = tutores.find((x) => x.id === a.tutorId); return { ...a, tutor: t ? (ehRecepcao(req) ? t.nome : abreviar(t.nome)) : null, internado: intern.some((i) => i.animalId === a.id) } }), total, page, pageSize })
  }))

  router.get('/animal/animais/:id', leit, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const a = await exigir(prisma.cprAnimal.findFirst({ where: { id: String(req.params.id), tenantId } }), 'Animal não encontrado.')
    const [tutor, prop, prof, manejos, internacoes, usos] = await Promise.all([
      prisma.cprPaciente.findFirst({ where: { id: a.tutorId, tenantId }, select: { nome: true, consentimentoStatus: true } }), a.propriedadeId ? prisma.cprPropriedade.findFirst({ where: { id: a.propriedadeId, tenantId } }) : null,
      prisma.cprProfilaxia.findMany({ where: { tenantId, animalId: a.id }, orderBy: { aplicadaEm: 'desc' }, take: 50 }), prisma.cprManejo.findMany({ where: { tenantId, animalId: a.id }, orderBy: { data: 'desc' }, take: 50 }),
      prisma.cprInternacao.findMany({ where: { tenantId, animalId: a.id }, orderBy: { entradaEm: 'desc' }, take: 20 }), prisma.cprUsoMedicamento.findMany({ where: { tenantId, animalId: a.id }, orderBy: { data: 'desc' }, take: 50 }),
    ])
    res.json({ ...a, tutor: tutor ? (ehRecepcao(req) ? tutor.nome : abreviar(tutor.nome)) : null, tutorConsentimento: tutor?.consentimentoStatus, propriedade: prop, profilaxia: prof, manejos, internacoes, medicamentos: usos })
  }))

  router.patch('/animal/animais/:id', cadastro, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const a = await exigir(prisma.cprAnimal.findFirst({ where: { id: String(req.params.id), tenantId } }), 'Animal não encontrado.')
    const b = parseBody(z.object({ nome: z.string().trim().min(1).max(80), raca: z.string().max(80), pelagem: z.string().max(60), observacoes: z.string().max(500), status: z.enum(['ATIVO', 'OBITO', 'TRANSFERIDO']), propriedadeId: zId }).partial(), req.body)
    if (b.propriedadeId) await exigir(prisma.cprPropriedade.findFirst({ where: { id: b.propriedadeId, tenantId, tutorId: a.tutorId } }), 'Propriedade não pertence ao tutor.', 400)
    res.json(await prisma.cprAnimal.update({ where: { id: a.id }, data: b }))
  }))

  // ---------------------------------------------------------------- profilaxia (vacina / vermífugo)
  router.post('/animal/animais/:id/profilaxia', clin, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const a = await exigir(prisma.cprAnimal.findFirst({ where: { id: String(req.params.id), tenantId } }), 'Animal não encontrado.')
    if (!(await podeAtuar(req, a.id))) throw httpErr(403, 'Você não está escalado neste atendimento/internação.')
    if (a.status !== 'ATIVO') throw httpErr(409, 'Animal inativo.')
    const b = parseBody(z.object({ tipo: z.enum(['VACINA', 'VERMIFUGO', 'ANTIPARASITARIO']), produto: z.string().trim().min(2).max(120), lote: z.string().max(40).optional(), aplicadaEm: dt, proximaDose: dt.optional(), intervaloDias: z.number().int().min(1).max(1500).optional(), supItemId: zId.optional(), supervisorUserId: zId.optional(), observacao: z.string().max(300).optional() }), req.body)
    if (b.aplicadaEm.getTime() > Date.now() + DIA) throw httpErr(400, 'A data de aplicação não pode ser futura.')
    const proxima = b.proximaDose ?? (b.intervaloDias ? new Date(b.aplicadaEm.getTime() + b.intervaloDias * DIA) : undefined)
    if (proxima && proxima <= b.aplicadaEm) throw httpErr(400, 'A próxima dose deve ser depois da aplicação.')
    if (b.supItemId) await exigir(prisma.supItem.findFirst({ where: { id: b.supItemId, tenantId } }), 'Item do estoque (suprimentos) não encontrado.', 400)
    if (b.supervisorUserId) await exigirUser(tenantId, b.supervisorUserId, 'Supervisor não encontrado.')
    const { intervaloDias, proximaDose, ...dados } = b
    void intervaloDias; void proximaDose
    const p = await prisma.cprProfilaxia.create({ data: { ...dados, tenantId, animalId: a.id, proximaDose: proxima, aplicadoPorStudentId: req.user!.role === 'STUDENT' ? req.user!.studentId : undefined, supervisorUserId: b.supervisorUserId ?? (req.user!.role === 'TEACHER' ? req.user!.id : undefined) } })
    // a dose anterior pendente deste mesmo tipo deixa de gerar lembrete
    const ant = await prisma.cprProfilaxia.findMany({ where: { tenantId, animalId: a.id, tipo: b.tipo, id: { not: p.id }, proximaDose: { not: null } }, select: { id: true } })
    for (const x of ant) await completeReminders({ tenantId, refType: 'CprProfilaxia', refId: x.id, userId: getUserId(req) })
    if (proxima) {
      const cfg = await getConfig(tenantId)
      await scheduleReminder({ tenantId, modulo: MOD, titulo: `${b.tipo === 'VACINA' ? 'Vacina' : 'Vermifugação'} de ${a.nome}: ${b.produto}`, dueAt: proxima, antecedenciaDias: cfg.diasLembreteVacina, severity: 'INFO', refType: 'CprProfilaxia', refId: p.id, assigneeUserId: p.supervisorUserId ?? undefined, assigneeRole: p.supervisorUserId ? undefined : 'COORDINATOR', dedupeKey: `cpr:profilaxia:${p.id}` })
    }
    res.status(201).json(p)
  }))

  router.get('/animal/profilaxia/pendentes', leit, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const dias = Math.min(365, Math.max(1, parseInt(qs(req.query.dias) ?? '30', 10) || 30))
    const lim = new Date(Date.now() + dias * DIA)
    const regs = await prisma.cprProfilaxia.findMany({ where: { tenantId, proximaDose: { lte: lim } }, orderBy: { proximaDose: 'asc' }, take: 1000 })
    // só vale a última dose de cada animal+tipo
    const ultimos = new Map<string, (typeof regs)[number]>()
    const todas = await prisma.cprProfilaxia.findMany({ where: { tenantId, animalId: { in: [...new Set(regs.map((r) => r.animalId))] } }, orderBy: { aplicadaEm: 'asc' } })
    for (const r of todas) ultimos.set(`${r.animalId}:${r.tipo}`, r)
    const vigentes = regs.filter((r) => ultimos.get(`${r.animalId}:${r.tipo}`)?.id === r.id)
    const animais = await prisma.cprAnimal.findMany({ where: { tenantId, id: { in: vigentes.map((r) => r.animalId) }, status: 'ATIVO' } })
    const tutores = await prisma.cprPaciente.findMany({ where: { tenantId, id: { in: animais.map((a) => a.tutorId) } }, select: { id: true, nome: true } })
    const items = vigentes.filter((r) => animais.some((a) => a.id === r.animalId)).map((r) => {
      const a = animais.find((x) => x.id === r.animalId)!
      const t = tutores.find((x) => x.id === a.tutorId)
      const d = Math.ceil((r.proximaDose!.getTime() - Date.now()) / DIA)
      return { id: r.id, animalId: a.id, animal: a.nome, especie: a.especie, grupo: a.grupo, tutor: t ? (ehRecepcao(req) ? t.nome : abreviar(t.nome)) : null, tipo: r.tipo, produto: r.produto, proximaDose: r.proximaDose, diasRestantes: d, situacao: d < 0 ? 'ATRASADA' : d <= 7 ? 'PROXIMA' : 'A_VENCER', lembreteEnviadoEm: r.lembreteEnviadoEm }
    })
    res.json({ items, total: items.length })
  }))

  // ---------------------------------------------------------------- manejo e pesagem
  router.post('/animal/animais/:id/manejos', clin, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const a = await exigir(prisma.cprAnimal.findFirst({ where: { id: String(req.params.id), tenantId } }), 'Animal não encontrado.')
    if (!(await podeAtuar(req, a.id))) throw httpErr(403, 'Você não está escalado neste atendimento/internação.')
    const b = parseBody(z.object({ tipo: z.enum(['PESAGEM', 'CASCOS', 'TOSQUIA', 'EXAME_CLINICO', 'EVOLUCAO', 'ALIMENTACAO', 'REPRODUTIVO', 'OUTRO']), data: dt.default(new Date()), pesoKg: z.number().positive().max(2000).optional(), descricao: z.string().max(600).optional(), internacaoId: zId.optional() }), req.body)
    if (b.data.getTime() > Date.now() + DIA) throw httpErr(400, 'A data não pode ser futura.')
    if (b.tipo === 'PESAGEM') {
      if (!b.pesoKg) throw httpErr(400, 'Informe o peso (kg) da pesagem.')
      const [min, max] = a.grupo === 'PEQUENO' ? [0.05, 150] : [1, 1500]
      if (b.pesoKg < min || b.pesoKg > max) throw httpErr(400, `Peso implausível para ${a.grupo === 'PEQUENO' ? 'pequenos' : 'grandes'} animais (${min} a ${max} kg).`, 'PESO_IMPLAUSIVEL')
    } else if (!b.descricao) throw httpErr(400, 'Descreva o manejo.')
    if (b.internacaoId) await exigir(prisma.cprInternacao.findFirst({ where: { id: b.internacaoId, tenantId, animalId: a.id } }), 'Internação não pertence ao animal.', 400)
    const m = await prisma.cprManejo.create({ data: { ...b, tenantId, animalId: a.id, responsavelUserId: getUserId(req), alunoStudentId: req.user!.role === 'STUDENT' ? req.user!.studentId : undefined } })
    if (b.tipo === 'PESAGEM') {
      const nova = await prisma.cprManejo.findFirst({ where: { tenantId, animalId: a.id, tipo: 'PESAGEM', data: { gt: b.data } } })
      if (!nova) await prisma.cprAnimal.update({ where: { id: a.id }, data: { pesoAtualKg: b.pesoKg } })
    }
    res.status(201).json(m)
  }))

  router.get('/animal/animais/:id/pesagens', leit, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const a = await exigir(prisma.cprAnimal.findFirst({ where: { id: String(req.params.id), tenantId } }), 'Animal não encontrado.')
    const ps = await prisma.cprManejo.findMany({ where: { tenantId, animalId: a.id, tipo: 'PESAGEM' }, orderBy: { data: 'asc' }, select: { id: true, data: true, pesoKg: true } })
    let gmd: number | null = null
    if (ps.length >= 2) { const d = (ps[ps.length - 1].data.getTime() - ps[0].data.getTime()) / DIA; if (d > 0) gmd = Math.round((((ps[ps.length - 1].pesoKg ?? 0) - (ps[0].pesoKg ?? 0)) / d) * 1000) / 1000 }
    res.json({ items: ps, ganhoMedioDiarioKg: gmd, variacaoKg: ps.length >= 2 ? Math.round(((ps[ps.length - 1].pesoKg ?? 0) - (ps[0].pesoKg ?? 0)) * 100) / 100 : null })
  }))

  // ---------------------------------------------------------------- baias e internação
  router.get('/animal/baias/ocupacao', leit, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const baias = await prisma.cprBaia.findMany({ where: { tenantId }, orderBy: { nome: 'asc' } })
    const ints = await prisma.cprInternacao.findMany({ where: { tenantId, status: 'INTERNADO' } })
    const animais = await prisma.cprAnimal.findMany({ where: { tenantId, id: { in: ints.map((i) => i.animalId) } }, select: { id: true, nome: true, especie: true } })
    res.json({ items: baias.map((b) => { const ocup = ints.filter((i) => i.baiaId === b.id); return { ...b, ocupadas: ocup.length, livres: Math.max(0, b.capacidade - ocup.length), animais: ocup.map((i) => ({ internacaoId: i.id, ...(animais.find((a) => a.id === i.animalId) ?? {}) })) } }) })
  }))
  mountCrud(router, {
    model: 'cprBaia', path: '/animal/baias', read: [...LEIT], write: ['COORDINATOR', 'TEACHER'], modulo: MOD, filters: ['unidadeId', 'grupo', 'tipo', 'status'], orderBy: { nome: 'asc' },
    create: z.object({ unidadeId: zId, nome: z.string().trim().min(1).max(80), tipo: z.enum(['BAIA', 'PIQUETE', 'CANIL', 'GATIL', 'ISOLAMENTO']).default('BAIA'), grupo: z.enum(['PEQUENO', 'GRANDE']).default('GRANDE'), capacidade: z.number().int().min(1).max(200).default(1), status: z.enum(['ATIVA', 'MANUTENCAO']).optional() }),
    beforeCreate: async (d, req) => { await exigir(prisma.cprUnidade.findFirst({ where: { id: d.unidadeId, tenantId: getTenantId(req), tipo: 'HOSPITAL_VET' } }), 'Informe uma unidade do tipo hospital veterinário.', 400) },
  })

  router.post('/animal/internacoes', requireRole('COORDINATOR', 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ animalId: zId, baiaId: zId, motivo: z.string().trim().min(5).max(500), supervisorUserId: zId.optional(), alunoStudentId: zId.optional(), entradaEm: dt.optional() }), req.body)
    const a = await exigir(prisma.cprAnimal.findFirst({ where: { id: b.animalId, tenantId } }), 'Animal não encontrado.', 400)
    if (a.status !== 'ATIVO') throw httpErr(409, 'Animal inativo.')
    const sup = b.supervisorUserId ?? req.user!.id
    await exigirUser(tenantId, sup, 'Supervisor não encontrado.')
    if (req.user!.role === 'TEACHER' && sup !== req.user!.id) throw httpErr(403, 'Professores internam apenas sob a própria supervisão.')
    const baia = await exigir(prisma.cprBaia.findFirst({ where: { id: b.baiaId, tenantId } }), 'Baia/piquete não encontrado.', 400)
    if (baia.status !== 'ATIVA') throw httpErr(409, 'Baia em manutenção.', 'BAIA_INDISPONIVEL')
    if (baia.grupo !== a.grupo) throw httpErr(409, `${baia.nome} é destinada a ${baia.grupo === 'PEQUENO' ? 'pequenos' : 'grandes'} animais.`, 'BAIA_INCOMPATIVEL')
    const quando = b.entradaEm ?? new Date()
    if (b.alunoStudentId) {
      await exigirAluno(tenantId, b.alunoStudentId)
      const esc = await escalaVigente(tenantId, baia.unidadeId, sup, quando)
      if (!esc || !(await prisma.cprEscalaAluno.findFirst({ where: { escalaId: esc.id, studentId: b.alunoStudentId } }))) throw httpErr(409, 'Aluno só acompanha internação com supervisor e aluno escalados neste horário.', 'SEM_SUPERVISOR_ESCALADO')
    }
    const row = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'cpr-baia:' + tenantId + ':' + baia.id}))`
      if (await tx.cprInternacao.findFirst({ where: { tenantId, animalId: a.id, status: 'INTERNADO' } })) throw httpErr(409, 'O animal já está internado.', 'JA_INTERNADO')
      const n = await tx.cprInternacao.count({ where: { tenantId, baiaId: baia.id, status: 'INTERNADO' } })
      if (n >= baia.capacidade) throw httpErr(409, `${baia.nome} está lotada (${n}/${baia.capacidade}).`, 'BAIA_LOTADA')
      return tx.cprInternacao.create({ data: { tenantId, animalId: a.id, baiaId: baia.id, supervisorUserId: sup, alunoStudentId: b.alunoStudentId, entradaEm: quando, motivo: b.motivo } })
    })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'INTERNAR', refType: 'CprInternacao', refId: row.id })
    res.status(201).json(row)
  }))

  router.get('/animal/internacoes', leit, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const where: any = { tenantId }
    const st = qs(req.query.status); if (st) where.status = st
    if (req.user!.role === 'STUDENT') where.alunoStudentId = req.user!.studentId ?? '__'
    if (req.user!.role === 'TEACHER') where.supervisorUserId = req.user!.id
    const rows = await prisma.cprInternacao.findMany({ where, orderBy: { entradaEm: 'desc' }, take: 300 })
    const [an, baias, us, als] = await Promise.all([prisma.cprAnimal.findMany({ where: { tenantId, id: { in: rows.map((r) => r.animalId) } }, select: { id: true, nome: true, especie: true, grupo: true } }), prisma.cprBaia.findMany({ where: { tenantId, id: { in: rows.map((r) => r.baiaId) } }, select: { id: true, nome: true } }), mapaUsuarios(tenantId, rows.map((r) => r.supervisorUserId)), mapaAlunos(tenantId, rows.map((r) => r.alunoStudentId))])
    res.json({ items: rows.map((r) => ({ ...r, animal: an.find((a) => a.id === r.animalId) ?? null, baia: baias.find((b) => b.id === r.baiaId)?.nome ?? null, supervisor: us.get(r.supervisorUserId) ?? null, aluno: r.alunoStudentId ? als.get(r.alunoStudentId) ?? null : null, diasInternado: Math.max(0, Math.floor(((r.saidaEm ?? new Date()).getTime() - r.entradaEm.getTime()) / DIA)) })) })
  }))

  router.post('/animal/internacoes/:id/alta', requireRole('COORDINATOR', 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const i = await exigir(prisma.cprInternacao.findFirst({ where: { id: String(req.params.id), tenantId } }), 'Internação não encontrada.')
    if (i.status !== 'INTERNADO') throw httpErr(409, `Internação já encerrada (${i.status}).`)
    if (req.user!.role === 'TEACHER' && i.supervisorUserId !== req.user!.id) throw httpErr(403, 'Somente o supervisor da internação dá alta.')
    const b = parseBody(z.object({ status: z.enum(['ALTA', 'OBITO', 'TRANSFERIDO']).default('ALTA'), desfecho: z.string().trim().min(5).max(500) }), req.body)
    const r = await prisma.cprInternacao.update({ where: { id: i.id }, data: { status: b.status, desfecho: b.desfecho, saidaEm: new Date() } })
    if (b.status === 'OBITO') await prisma.cprAnimal.update({ where: { id: i.animalId }, data: { status: 'OBITO' } })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'ALTA_' + b.status, refType: 'CprInternacao', refId: i.id })
    res.json(r)
  }))

  // ---------------------------------------------------------------- medicamentos (referência ao módulo suprimentos)
  router.post('/animal/animais/:id/medicamentos', clin, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const a = await exigir(prisma.cprAnimal.findFirst({ where: { id: String(req.params.id), tenantId } }), 'Animal não encontrado.')
    if (!(await podeAtuar(req, a.id))) throw httpErr(403, 'Você não está escalado neste atendimento/internação.')
    const b = parseBody(z.object({ supItemId: zId, quantidade: z.number().positive().max(1e6), unidade: z.string().max(12).optional(), data: dt.default(new Date()), internacaoId: zId.optional(), consultaId: zId.optional(), observacao: z.string().max(300).optional() }), req.body)
    const item = await exigir(prisma.supItem.findFirst({ where: { id: b.supItemId, tenantId } }), 'Item não encontrado no módulo de suprimentos.', 400)
    if (!item.ativo) throw httpErr(409, 'Item inativo no estoque.')
    if (b.internacaoId) await exigir(prisma.cprInternacao.findFirst({ where: { id: b.internacaoId, tenantId, animalId: a.id } }), 'Internação não pertence ao animal.', 400)
    if (b.consultaId) await exigir(prisma.cprConsulta.findFirst({ where: { id: b.consultaId, tenantId, animalId: a.id } }), 'Atendimento não pertence ao animal.', 400)
    const saldo = (await saldoSup(tenantId, [item.id])).get(item.id) ?? 0
    const uso = await prisma.cprUsoMedicamento.create({ data: { ...b, tenantId, animalId: a.id, nomeItem: item.nome, unidade: b.unidade ?? item.unidade, aplicadoPorId: getUserId(req) } })
    res.status(201).json({ ...uso, saldoSuprimentos: saldo, abaixoDoMinimo: saldo - b.quantidade < item.estoqueMinimo, aviso: 'Registro de uso. A baixa de estoque é feita no módulo de suprimentos.' })
  }))

  router.get('/animal/medicamentos/estoque', leit, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const q = qs(req.query.q)
    const usados = await prisma.cprUsoMedicamento.groupBy({ by: ['supItemId'], where: { tenantId, data: { gte: new Date(Date.now() - 30 * DIA) } }, _sum: { quantidade: true } })
    const todos = await prisma.cprUsoMedicamento.findMany({ where: { tenantId }, distinct: ['supItemId'], select: { supItemId: true } })
    const where: any = { tenantId, ativo: true, ...(q ? { nome: { contains: q, mode: 'insensitive' } } : { id: { in: todos.map((t) => t.supItemId) } }) }
    const itens = await prisma.supItem.findMany({ where, orderBy: { nome: 'asc' }, take: 100 })
    const saldos = await saldoSup(tenantId, itens.map((i) => i.id))
    res.json({ items: itens.map((i) => { const s = saldos.get(i.id) ?? 0; return { id: i.id, codigo: i.codigo, nome: i.nome, unidade: i.unidade, saldo: s, estoqueMinimo: i.estoqueMinimo, abaixoDoMinimo: s < i.estoqueMinimo, consumo30dias: usados.find((u) => u.supItemId === i.id)?._sum.quantidade ?? 0 } }), origem: 'suprimentos' })
  }))

  router.get('/animal/painel', leit, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const ini = new Date(); ini.setUTCHours(0, 0, 0, 0)
    const [pequenos, grandes, internados, baias, venc, prox, hoje] = await Promise.all([
      prisma.cprAnimal.count({ where: { tenantId, grupo: 'PEQUENO', status: 'ATIVO' } }), prisma.cprAnimal.count({ where: { tenantId, grupo: 'GRANDE', status: 'ATIVO' } }),
      prisma.cprInternacao.count({ where: { tenantId, status: 'INTERNADO' } }), prisma.cprBaia.aggregate({ where: { tenantId, status: 'ATIVA' }, _sum: { capacidade: true } }),
      prisma.cprProfilaxia.count({ where: { tenantId, proximaDose: { lt: new Date() } } }), prisma.cprProfilaxia.count({ where: { tenantId, proximaDose: { gte: new Date(), lte: new Date(Date.now() + 7 * DIA) } } }),
      prisma.cprConsulta.count({ where: { tenantId, animalId: { not: null }, inicio: { gte: ini, lt: new Date(ini.getTime() + DIA) }, status: { notIn: ['CANCELADO', 'REMARCADO'] } } }),
    ])
    res.json({ pequenosAnimais: pequenos, grandesAnimais: grandes, internados, vagasBaias: baias._sum.capacidade ?? 0, ocupacaoBaiasPct: baias._sum.capacidade ? Math.round((internados / (baias._sum.capacidade ?? 1)) * 1000) / 10 : 0, profilaxiaAtrasada: venc, profilaxiaProximos7Dias: prox, atendimentosHoje: hoje })
  }))
}
