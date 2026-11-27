import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { notify } from '../core/notify'
import { registerEduJob } from '../core/jobs'
import { HR, Req, asyncHandler, audit, data, erro, getTenantId, getUserId, num, pick, requireRole, txt, DIA } from './util'

// CIPA e SST: membros, brigada de incêndio, calendário de treinamentos, instruções de urgência/emergência, telefones e registro de CAT.
// CAT vai direto aos responsáveis por vários canais, é reforçada e escalonada até alguém confirmar a providência. /api/edu/cipa
const router = Router()
const gestao = requireRole(HR, 'FACILITIES')
const CATEGORIAS = ['URGENCIA', 'EMERGENCIA', 'AUTOSSOCORRO', 'SOCORRO_PROXIMO', 'LIMITES']
const ABERTAS = ['REGISTRADA', 'EM_TRATATIVA']
const HORAS_REFORCO = 4, HORAS_ESCALONA = 24

const crud = (rota: string, modelo: string, campos: Record<string, any>, ordem: any) => {
  const m = () => (prisma as any)[modelo]
  router.get(`/${rota}`, asyncHandler(async (req: Req, res: Response) => res.json(await m().findMany({ where: { tenantId: getTenantId(req) }, orderBy: ordem, take: 500 }))))
  router.post(`/${rota}`, gestao, asyncHandler(async (req: Req, res: Response) => {
    res.status(201).json(await m().create({ data: { tenantId: getTenantId(req), ...pick(req.body, campos) } }))
  }))
  router.patch(`/${rota}/:id`, gestao, asyncHandler(async (req: Req, res: Response) => {
    const tenantId = getTenantId(req), id = String(req.params.id)
    await m().findFirst({ where: { id, tenantId } }) ?? erro(404, 'Registro não encontrado.')
    res.json(await m().update({ where: { id }, data: pick(req.body, campos) }))
  }))
  router.delete(`/${rota}/:id`, gestao, asyncHandler(async (req: Req, res: Response) => {
    res.json({ ok: (await m().deleteMany({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })).count > 0 })
  }))
}
crud('membros', 'cipMembro', { nome: 'str', colaboradorId: 'str', funcao: 'str', representacao: 'str', poloId: 'str', setor: 'str', mandatoInicio: 'date', mandatoFim: 'date', contato: 'str', ativo: 'bool' }, [{ funcao: 'asc' }, { nome: 'asc' }])
crud('brigada', 'cipBrigadista', { nome: 'str', colaboradorId: 'str', funcao: 'str', setor: 'str', poloId: 'str', turno: 'str', contato: 'str', certificadoAte: 'date', ativo: 'bool' }, [{ funcao: 'asc' }, { nome: 'asc' }])
crud('eventos', 'cipEvento', { tipo: 'str', titulo: 'str', descricao: 'str', inicio: 'date', fim: 'date', local: 'str', instrutor: 'str', cargaHoras: 'num', publico: 'str', status: 'str', participantes: 'json' }, { inicio: 'asc' })
crud('instrucoes', 'cipInstrucao', { categoria: 'str', titulo: 'str', passos: 'str', ordem: 'num', ativo: 'bool' }, [{ categoria: 'asc' }, { ordem: 'asc' }])
crud('contatos', 'cipContato', { nome: 'str', numero: 'str', categoria: 'str', poloId: 'str', ordem: 'num' }, [{ ordem: 'asc' }])

router.get('/painel', asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req), agora = new Date()
  const [membros, brigada, proximos, cats, abertas] = await Promise.all([
    prisma.cipMembro.count({ where: { tenantId, ativo: true } }),
    prisma.cipBrigadista.findMany({ where: { tenantId, ativo: true } }),
    prisma.cipEvento.findMany({ where: { tenantId, inicio: { gte: agora }, status: 'AGENDADO' }, orderBy: { inicio: 'asc' }, take: 5 }),
    prisma.cipCat.count({ where: { tenantId } }),
    prisma.cipCat.findMany({ where: { tenantId, status: { in: ABERTAS } }, orderBy: { createdAt: 'desc' } }),
  ])
  res.json({
    membros, brigadistas: brigada.length,
    certificadosVencendo: brigada.filter((b) => b.certificadoAte && b.certificadoAte.getTime() < agora.getTime() + 60 * DIA).length,
    proximosEventos: proximos, catsTotal: cats, catsAbertas: abertas.length, catsAbertasLista: abertas,
  })
}))

// ---------------- CAT
async function destinatarios(tenantId: string, extras: any[]) {
  const fixos = await prisma.user.findMany({ where: { tenantId, isActive: true, role: { in: ['HR', 'FACILITIES', 'ADMIN', 'OWNER'] } }, select: { id: true, email: true, firstName: true, lastName: true, phone: true }, take: 8 })
  const lista = [...extras.map((e) => ({ userId: e.userId, nome: e.nome, email: e.email, telefone: e.telefone })), ...fixos.map((u) => ({ userId: u.id, nome: `${u.firstName} ${u.lastName}`.trim(), email: u.email, telefone: u.phone }))]
  const vistos = new Set<string>()
  return lista.filter((d) => { const k = d.userId || d.email || d.nome; if (!k || vistos.has(k)) return false; vistos.add(k); return true })
}

async function avisar(tenantId: string, cat: any, nivel: number) {
  const dests = await destinatarios(tenantId, Array.isArray(cat.responsaveis) ? cat.responsaveis : [])
  const rotulo = nivel === 0 ? 'NOVA OCORRÊNCIA' : nivel === 1 ? 'LEMBRETE — providência pendente' : 'ESCALONAMENTO — sem confirmação'
  const assunto = `[CIPA] ${rotulo}: ${cat.protocolo} (${cat.gravidade})`
  const msg = `${rotulo}\nProtocolo ${cat.protocolo} — ${cat.colaboradorNome}${cat.setor ? ` (${cat.setor})` : ''}.\n${cat.descricao}\n\nÉ necessário registrar a PROVIDÊNCIA em CIPA > Registros de CAT. O aviso se repete até a confirmação.`
  for (const d of dests) {
    await notify({ tenantId, canal: 'IN_APP', userId: d.userId, assunto, mensagem: msg, refType: 'CipCat', refId: cat.id })
    await prisma.cipAviso.create({ data: { tenantId, catId: cat.id, canal: 'IN_APP', destinatario: d.nome, destinatarioId: d.userId, nivel } })
    if (d.email) { await notify({ tenantId, canal: 'EMAIL', destino: d.email, assunto, mensagem: msg, refType: 'CipCat', refId: cat.id }); await prisma.cipAviso.create({ data: { tenantId, catId: cat.id, canal: 'EMAIL', destinatario: d.nome, destinatarioId: d.userId, nivel } }) }
    if (d.telefone) { await notify({ tenantId, canal: 'WHATSAPP', destino: d.telefone, assunto, mensagem: msg, refType: 'CipCat', refId: cat.id }); await prisma.cipAviso.create({ data: { tenantId, catId: cat.id, canal: 'WHATSAPP', destinatario: d.nome, destinatarioId: d.userId, nivel } }) }
  }
  return dests.length
}

router.get('/cat', gestao, asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req)
  const cats = await prisma.cipCat.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 200 })
  const avisos = await prisma.cipAviso.groupBy({ by: ['catId', 'nivel'], where: { tenantId, catId: { in: cats.map((c) => c.id) } }, _count: true })
  res.json(cats.map((c) => ({ ...c, avisos: avisos.filter((a) => a.catId === c.id).map((a) => ({ nivel: a.nivel, total: a._count })) })))
}))
router.get('/cat/:id', gestao, asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req)
  const c = await prisma.cipCat.findFirst({ where: { id: String(req.params.id), tenantId } }) ?? erro(404, 'Registro não encontrado.')
  res.json({ ...c, avisos: await prisma.cipAviso.findMany({ where: { tenantId, catId: c.id }, orderBy: { enviadoEm: 'asc' } }) })
}))
// Qualquer colaborador pode comunicar uma ocorrência; ela chega aos responsáveis imediatamente.
router.post('/cat', asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req), b = req.body ?? {}
  const descricao = txt(b.descricao, 4000), nome = txt(b.colaboradorNome, 160)
  if (!descricao || !nome) erro(400, 'Informe quem se acidentou e o que aconteceu.')
  const n = (await prisma.cipCat.count({ where: { tenantId } })) + 1
  const gravidade = ['LEVE', 'MODERADA', 'GRAVE', 'FATAL'].includes(b.gravidade) ? b.gravidade : 'LEVE'
  const cat = await prisma.cipCat.create({ data: {
    tenantId, protocolo: `CAT-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`, colaboradorId: txt(b.colaboradorId, 60) || null, colaboradorNome: nome, setor: txt(b.setor, 120) || null, poloId: txt(b.poloId, 60) || null,
    dataOcorrencia: data(b.dataOcorrencia) ?? new Date(), local: txt(b.local, 200) || null, tipo: ['TIPICO', 'TRAJETO', 'DOENCA_OCUPACIONAL', 'INCIDENTE'].includes(b.tipo) ? b.tipo : 'TIPICO', gravidade,
    afastamento: Boolean(b.afastamento), descricao, responsaveis: Array.isArray(b.responsaveis) ? b.responsaveis.slice(0, 10).map((r: any) => ({ userId: r.userId, nome: txt(r.nome, 120), papel: txt(r.papel, 60), email: txt(r.email, 160) || undefined })) : [],
    prazoProvidenciaEm: new Date(Date.now() + (gravidade === 'LEVE' ? 3 : 1) * DIA), criadoPorId: getUserId(req),
  } })
  const enviados = await avisar(tenantId, cat, 0)
  await audit({ tenantId, userId: getUserId(req), modulo: 'cipa', acao: 'CAT_REGISTRADA', refType: 'CipCat', refId: cat.id, detalhes: { gravidade, avisados: enviados } })
  res.status(201).json({ ...cat, avisados: enviados })
}))
router.post('/cat/:id/reconhecer', gestao, asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req), uid = getUserId(req)
  const c = await prisma.cipCat.findFirst({ where: { id: String(req.params.id), tenantId } }) ?? erro(404, 'Registro não encontrado.')
  await prisma.cipAviso.updateMany({ where: { tenantId, catId: c.id, destinatarioId: uid, reconhecidoEm: null }, data: { reconhecidoEm: new Date() } })
  res.json(await prisma.cipCat.update({ where: { id: c.id }, data: { status: c.status === 'REGISTRADA' ? 'EM_TRATATIVA' : c.status } }))
}))
router.post('/cat/:id/providencia', gestao, asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req), uid = getUserId(req)
  const c = await prisma.cipCat.findFirst({ where: { id: String(req.params.id), tenantId } }) ?? erro(404, 'Registro não encontrado.')
  const providencia = txt(req.body?.providencia, 4000)
  if (providencia.length < 10) erro(400, 'Descreva a providência tomada (mín. 10 caracteres).')
  const u = await prisma.user.findFirst({ where: { id: uid }, select: { firstName: true, lastName: true } })
  await prisma.cipAviso.updateMany({ where: { tenantId, catId: c.id, reconhecidoEm: null }, data: { reconhecidoEm: new Date() } })
  const r = await prisma.cipCat.update({ where: { id: c.id }, data: { status: 'PROVIDENCIA_CONFIRMADA', providencia, confirmadoEm: new Date(), confirmadoPor: `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || uid, comunicadoOrgaoEm: req.body?.comunicadoOrgao ? new Date() : c.comunicadoOrgaoEm } })
  await audit({ tenantId, userId: uid, modulo: 'cipa', acao: 'CAT_PROVIDENCIA', refType: 'CipCat', refId: c.id })
  res.json(r)
}))
router.post('/cat/:id/encerrar', gestao, asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req)
  const c = await prisma.cipCat.findFirst({ where: { id: String(req.params.id), tenantId } }) ?? erro(404, 'Registro não encontrado.')
  if (c.status !== 'PROVIDENCIA_CONFIRMADA') erro(409, 'Só é possível encerrar depois de confirmar a providência.')
  res.json(await prisma.cipCat.update({ where: { id: c.id }, data: { status: 'ENCERRADA', encerradoEm: new Date() } }))
}))

/** Reforça (4 h) e escalona (24 h) enquanto não houver providência confirmada. */
export async function cobrarCats() {
  const abertas = await prisma.cipCat.findMany({ where: { status: { in: ABERTAS } } })
  let reforcos = 0
  for (const c of abertas) {
    const ult = await prisma.cipAviso.findFirst({ where: { catId: c.id }, orderBy: { enviadoEm: 'desc' } })
    const ref = ult?.enviadoEm ?? c.createdAt
    const horas = (Date.now() - ref.getTime()) / 3_600_000
    const nivelAtual = ult?.nivel ?? 0
    if (nivelAtual < 1 && horas >= HORAS_REFORCO) { await avisar(c.tenantId, c, 1); reforcos++ }
    else if (nivelAtual >= 1 && horas >= HORAS_ESCALONA) { await avisar(c.tenantId, c, 2); reforcos++ }
  }
  return { cats: abertas.length, reforcos }
}
registerEduJob('cipa.cobrar-providencias', () => cobrarCats())
void num
export default router
