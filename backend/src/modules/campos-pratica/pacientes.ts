import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { cancelReminders } from '../core/reminders'
import { hashDocumento, mascararEmail, mascararTelefone, soDigitos } from '../lgpd/mascara'
import { cifrar, decifrar } from '../seguranca/cripto'
import { MOD, RECEPCAO, SUPERVISAO, dt, ehGestor, ehRecepcao, exigir, exigirPrograma, getConfig, httpErr, logAcesso, mapaUsuarios, zId } from './servico'

export const abreviar = (nome: string) => { const p = nome.trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0] }
const idade = (d?: Date | null) => (d ? Math.floor((Date.now() - d.getTime()) / (365.25 * 86_400_000)) : null)
const dec = (s?: string | null) => { if (!s) return null; try { return decifrar(s) } catch { return null } }

/** Aluno/professor só enxergam pacientes que constam das suas próprias consultas. */
export async function podeVerPaciente(req: AuthenticatedRequest, pacienteId: string) {
  if (ehRecepcao(req)) return true
  const u = req.user!
  const where: any = { tenantId: u.tenantId, pacienteId }
  if (u.role === 'TEACHER') where.supervisorUserId = u.id
  else if (u.role === 'STUDENT') where.alunoStudentId = u.studentId ?? '__nenhum__'
  else return false
  return !!(await prisma.cprConsulta.findFirst({ where, select: { id: true } }))
}

export function visaoPaciente(req: AuthenticatedRequest, p: any, detalhe = false) {
  const completo = ehRecepcao(req)
  const base: any = {
    id: p.id, tipo: p.tipo, nome: completo ? p.nome : abreviar(p.nome), idade: idade(p.dataNascimento), menor: p.menor, consentimentoStatus: p.consentimentoStatus,
    faltasConsecutivas: p.faltasConsecutivas, faltasTotal: p.faltasTotal, anonimizado: !!p.anonimizadoEm, cpf: p.cpfFinal ? `***.***.***-${p.cpfFinal}` : null,
  }
  if (detalhe) {
    base.consentimentoVersao = p.consentimentoVersao; base.consentimentoFinalidade = p.consentimentoFinalidade; base.consentimentoEm = p.consentimentoEm; base.baseLegal = p.baseLegal
    base.responsavelNome = completo ? p.responsavelNome : p.responsavelNome ? abreviar(p.responsavelNome) : null
    if (completo) { base.telefone = dec(p.telefoneCifrado); base.email = dec(p.emailCifrado); base.dataNascimento = p.dataNascimento }
    else { base.telefone = p.telefoneCifrado ? mascararTelefone(dec(p.telefoneCifrado)) : null; base.email = p.emailCifrado ? mascararEmail(dec(p.emailCifrado)) : null }
  }
  return base
}

const schemaPaciente = z.object({
  tipo: z.enum(['PACIENTE', 'TUTOR']).default('PACIENTE'),
  nome: z.string().trim().min(3).max(160),
  cpf: z.string().trim().max(20).optional(),
  telefone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(120).optional(),
  dataNascimento: dt.optional(),
  saude: z.string().trim().max(2000).optional(),
  responsavelNome: z.string().trim().max(160).optional(),
  responsavelCpf: z.string().trim().max(20).optional(),
  consentimento: z.object({ aceito: z.boolean(), finalidade: z.string().trim().min(10).max(300), versao: z.string().max(20).optional() }),
})

export function mountPacientes(router: Router) {
  const recepcao = requireRole(...RECEPCAO)
  const amplo = requireRole(...RECEPCAO, 'TEACHER', 'STUDENT')

  router.post('/clinicas/pacientes', recepcao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(schemaPaciente, req.body)
    const cfg = await getConfig(tenantId)
    if (!b.consentimento.aceito) throw httpErr(400, 'O consentimento (LGPD) do titular ou responsável é obrigatório para o cadastro.', 'CONSENTIMENTO_OBRIGATORIO')
    if (b.saude && req.user!.role !== 'COORDINATOR' && !ehGestor(req)) throw httpErr(403, 'A recepção não registra informações de saúde; elas são colhidas no atendimento.')
    if (b.saude && b.tipo === 'TUTOR') throw httpErr(400, 'Tutores não possuem dados de saúde neste cadastro.')
    const cpf = soDigitos(b.cpf)
    if (b.cpf && cpf.length !== 11) throw httpErr(400, 'CPF deve ter 11 dígitos.')
    const menor = b.dataNascimento ? Date.now() - b.dataNascimento.getTime() < 18 * 365.25 * 86_400_000 : false
    if (menor && (!b.responsavelNome || soDigitos(b.responsavelCpf).length !== 11)) throw httpErr(400, 'Paciente menor de idade: informe nome e CPF do responsável legal, que dá o consentimento (LGPD, art. 14).', 'RESPONSAVEL_OBRIGATORIO')
    const cpfHash = cpf ? hashDocumento(cpf, tenantId) : null
    if (cpfHash && (await prisma.cprPaciente.findFirst({ where: { tenantId, cpfHash } }))) throw httpErr(409, 'Já existe cadastro com este CPF.', 'CPF_DUPLICADO')
    const p = await prisma.cprPaciente.create({
      data: {
        tenantId, tipo: b.tipo, nome: b.nome, cpfHash, cpfCifrado: cpf ? cifrar(cpf) : null, cpfFinal: cpf ? cpf.slice(-2) : null, telefoneCifrado: b.telefone ? cifrar(b.telefone) : null, emailCifrado: b.email ? cifrar(b.email) : null,
        saudeCifrado: b.saude ? cifrar(b.saude) : null, dataNascimento: b.dataNascimento, menor, responsavelNome: b.responsavelNome, responsavelCpfCifrado: b.responsavelCpf ? cifrar(soDigitos(b.responsavelCpf)) : null,
        consentimentoStatus: 'ATIVO', consentimentoVersao: b.consentimento.versao ?? cfg.consentimentoVersao, consentimentoFinalidade: b.consentimento.finalidade, consentimentoEm: new Date(),
        baseLegal: b.tipo === 'PACIENTE' ? (menor ? 'ART_14_CONSENTIMENTO_RESPONSAVEL + ART_11_II_F_TUTELA_SAUDE' : 'ART_11_I_CONSENTIMENTO + ART_11_II_F_TUTELA_SAUDE') : 'ART_7_I_CONSENTIMENTO',
      },
    })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CADASTRAR_PACIENTE', refType: 'CprPaciente', refId: p.id, detalhes: { tipo: b.tipo } })
    await logAcesso(req, { recurso: 'pacientes', recursoId: p.id, pacienteId: p.id, acao: 'ESCRITA' })
    res.status(201).json(visaoPaciente(req, p, true))
  }))

  router.get('/clinicas/pacientes', amplo, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId, anonimizadoEm: null }
    const tipo = qs(req.query.tipo); if (tipo) where.tipo = tipo
    const q = qs(req.query.q); if (q) where.nome = { contains: q, mode: 'insensitive' }
    const st = qs(req.query.consentimento); if (st) where.consentimentoStatus = st
    if (!ehRecepcao(req)) {
      const cw: any = { tenantId }
      if (req.user!.role === 'TEACHER') cw.supervisorUserId = req.user!.id
      else cw.alunoStudentId = req.user!.studentId ?? '__nenhum__'
      const ids = (await prisma.cprConsulta.findMany({ where: cw, select: { pacienteId: true }, distinct: ['pacienteId'], take: 1000 })).map((c) => c.pacienteId)
      where.id = { in: ids }
    }
    const [rows, total] = await Promise.all([prisma.cprPaciente.findMany({ where, orderBy: { nome: 'asc' }, skip, take }), prisma.cprPaciente.count({ where })])
    res.json({ items: rows.map((p) => visaoPaciente(req, p)), total, page, pageSize })
  }))

  router.get('/clinicas/pacientes/:id', amplo, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await exigir(prisma.cprPaciente.findFirst({ where: { id: String(req.params.id), tenantId } }), 'Paciente não encontrado.')
    if (!(await podeVerPaciente(req, p.id))) { await logAcesso(req, { recurso: 'pacientes', recursoId: p.id, pacienteId: p.id, acao: 'NEGADO' }); throw httpErr(403, 'Você não atende este paciente.') }
    const v = visaoPaciente(req, p, true)
    // Resumo de saúde: somente quem supervisiona o paciente ou a coordenação (clínica).
    const clinico = req.user!.role === 'TEACHER' || req.user!.role === 'COORDINATOR' || ehGestor(req)
    if (clinico && p.saudeCifrado && p.tipo === 'PACIENTE') v.saude = dec(p.saudeCifrado)
    await logAcesso(req, { recurso: 'pacientes', recursoId: p.id, pacienteId: p.id, acao: 'LEITURA' })
    res.json(v)
  }))

  router.patch('/clinicas/pacientes/:id', recepcao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await exigir(prisma.cprPaciente.findFirst({ where: { id: String(req.params.id), tenantId } }), 'Paciente não encontrado.')
    if (p.anonimizadoEm) throw httpErr(409, 'Cadastro anonimizado não pode ser alterado.')
    const b = parseBody(z.object({ nome: z.string().trim().min(3).max(160).optional(), telefone: z.string().trim().max(30).optional(), email: z.string().trim().email().optional(), responsavelNome: z.string().max(160).optional(), saude: z.string().trim().max(2000).optional() }), req.body)
    if (b.saude !== undefined && !ehGestor(req)) throw httpErr(403, 'Somente a coordenação clínica altera o resumo de saúde.')
    const r = await prisma.cprPaciente.update({ where: { id: p.id }, data: { ...(b.nome ? { nome: b.nome } : {}), ...(b.telefone ? { telefoneCifrado: cifrar(b.telefone) } : {}), ...(b.email ? { emailCifrado: cifrar(b.email) } : {}), ...(b.responsavelNome ? { responsavelNome: b.responsavelNome } : {}), ...(b.saude !== undefined ? { saudeCifrado: b.saude ? cifrar(b.saude) : null } : {}) } })
    await logAcesso(req, { recurso: 'pacientes', recursoId: p.id, pacienteId: p.id, acao: 'ESCRITA' })
    res.json(visaoPaciente(req, r, true))
  }))

  router.post('/clinicas/pacientes/:id/consentimento', recepcao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await exigir(prisma.cprPaciente.findFirst({ where: { id: String(req.params.id), tenantId } }), 'Paciente não encontrado.')
    if (p.anonimizadoEm) throw httpErr(409, 'Cadastro anonimizado.')
    const b = parseBody(z.object({ aceito: z.literal(true, { message: 'O aceite é obrigatório.' }), finalidade: z.string().trim().min(10).max(300) }), req.body)
    const cfg = await getConfig(tenantId)
    const r = await prisma.cprPaciente.update({ where: { id: p.id }, data: { consentimentoStatus: 'ATIVO', consentimentoEm: new Date(), consentimentoRevogadoEm: null, consentimentoFinalidade: b.finalidade, consentimentoVersao: cfg.consentimentoVersao } })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CONSENTIR', refType: 'CprPaciente', refId: p.id })
    res.json(visaoPaciente(req, r, true))
  }))

  router.post('/clinicas/pacientes/:id/consentimento/revogar', recepcao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await exigir(prisma.cprPaciente.findFirst({ where: { id: String(req.params.id), tenantId } }), 'Paciente não encontrado.')
    const b = parseBody(z.object({ motivo: z.string().trim().max(300).optional() }), req.body ?? {})
    const futuras = await prisma.cprConsulta.findMany({ where: { tenantId, pacienteId: p.id, status: { in: ['AGENDADO', 'CONFIRMADO'] }, inicio: { gt: new Date() } }, select: { id: true } })
    await prisma.$transaction([
      prisma.cprPaciente.update({ where: { id: p.id }, data: { consentimentoStatus: 'REVOGADO', consentimentoRevogadoEm: new Date() } }),
      prisma.cprConsulta.updateMany({ where: { id: { in: futuras.map((f) => f.id) } }, data: { status: 'CANCELADO', motivoCancelamento: 'Consentimento revogado pelo titular' } }),
      prisma.cprFila.updateMany({ where: { tenantId, pacienteId: p.id, status: { in: ['AGUARDANDO', 'CHAMADO'] } }, data: { status: 'DESISTIU' } }),
    ])
    for (const f of futuras) await cancelReminders({ tenantId, refType: 'CprConsulta', refId: f.id })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'REVOGAR_CONSENTIMENTO', refType: 'CprPaciente', refId: p.id, detalhes: { consultasCanceladas: futuras.length, motivo: b.motivo } })
    res.json({ ok: true, consultasCanceladas: futuras.length })
  }))

  // Eliminação/anonimização (art. 18, IV e VI): identificadores removidos; registros clínicos permanecem de forma não identificada (guarda legal de prontuário).
  router.post('/clinicas/pacientes/:id/anonimizar', requireRole('COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await exigir(prisma.cprPaciente.findFirst({ where: { id: String(req.params.id), tenantId } }), 'Paciente não encontrado.')
    if (p.anonimizadoEm) throw httpErr(409, 'Cadastro já anonimizado.')
    const aberta = await prisma.cprConsulta.count({ where: { tenantId, pacienteId: p.id, status: { in: ['AGENDADO', 'CONFIRMADO', 'CHEGOU', 'EM_ATENDIMENTO'] } } })
    if (aberta) throw httpErr(409, 'Há consultas em aberto: cancele-as antes de anonimizar.', 'CONSULTAS_ABERTAS')
    b0(req)
    await prisma.$transaction([
      prisma.cprPaciente.update({ where: { id: p.id }, data: { nome: 'Titular anonimizado', cpfHash: null, cpfCifrado: null, cpfFinal: null, telefoneCifrado: null, emailCifrado: null, saudeCifrado: null, responsavelNome: null, responsavelCpfCifrado: null, dataNascimento: null, consentimentoStatus: 'REVOGADO', anonimizadoEm: new Date() } }),
      prisma.cprFila.updateMany({ where: { tenantId, pacienteId: p.id, status: { in: ['AGUARDANDO', 'CHAMADO'] } }, data: { status: 'DESISTIU' } }),
    ])
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'ANONIMIZAR_PACIENTE', refType: 'CprPaciente', refId: p.id })
    await logAcesso(req, { recurso: 'pacientes', recursoId: p.id, pacienteId: p.id, acao: 'ESCRITA', motivo: 'anonimização' })
    res.json({ ok: true })
  }))

  // Quem acessou dados sensíveis (somente coordenação/administração).
  router.get('/clinicas/acessos', requireRole('COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['pacienteId', 'userId', 'acao', 'recurso']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const [rows, total] = await Promise.all([prisma.cprAcessoLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.cprAcessoLog.count({ where })])
    const us = await mapaUsuarios(tenantId, rows.map((r) => r.userId))
    res.json({ items: rows.map((r) => ({ ...r, usuario: us.get(r.userId) ?? null })), total, page, pageSize })
  }))

  // ---------------------------------------------------------------- unidades e consultórios
  const AREAS = ['PSICOLOGIA', 'BIOMEDICINA', 'FONOAUDIOLOGIA', 'VETERINARIA', 'ODONTOLOGIA', 'MEDICINA'] as const
  mountCrud(router, {
    model: 'cprUnidade', path: '/clinicas/unidades', read: [...RECEPCAO, 'TEACHER', 'STUDENT'], write: ['COORDINATOR'], modulo: MOD, filters: ['area', 'tipo', 'ativo'], search: ['nome'], orderBy: { nome: 'asc' },
    create: z.object({ nome: z.string().trim().min(3).max(160), tipo: z.enum(['CLINICA_ESCOLA', 'AMBULATORIO', 'HOSPITAL_VET', 'LABORATORIO']).default('CLINICA_ESCOLA'), area: z.enum(AREAS), programId: zId.optional(), endereco: z.string().max(200).optional(), telefone: z.string().max(30).optional(), ativo: z.boolean().optional() }),
    beforeCreate: async (d, req) => { if (d.programId) await exigirPrograma(getTenantId(req), d.programId); if (d.tipo === 'HOSPITAL_VET' && d.area !== 'VETERINARIA') throw httpErr(400, 'Hospital veterinário deve ser da área Veterinária.') },
  })
  mountCrud(router, {
    model: 'cprConsultorio', path: '/clinicas/consultorios', read: [...RECEPCAO, 'TEACHER', 'STUDENT'], write: ['COORDINATOR'], modulo: MOD, filters: ['unidadeId', 'ativo'], search: ['nome'], orderBy: { nome: 'asc' },
    create: z.object({ unidadeId: zId, nome: z.string().trim().min(1).max(120), tipo: z.enum(['CONSULTORIO', 'SALA_ATENDIMENTO', 'CENTRO_CIRURGICO', 'A_CAMPO']).default('CONSULTORIO'), capacidade: z.number().int().min(1).max(50).default(1), ativo: z.boolean().optional() }),
    beforeCreate: async (d, req) => { await exigir(prisma.cprUnidade.findFirst({ where: { id: d.unidadeId, tenantId: getTenantId(req) } }), 'Unidade não encontrada.', 400) },
  })
  void SUPERVISAO
}

function b0(_r: AuthenticatedRequest) { /* ponto de extensão: pedido formal do titular */ }
