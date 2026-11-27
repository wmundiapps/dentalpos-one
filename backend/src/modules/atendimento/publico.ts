import { Request, Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { limitar, resolverTenantPublico } from '../apoio/common'
import { mascararNome } from '../lgpd/mascara'
import { audit } from '../core/notify'
import { MOD, nomeInstituicao } from './common'
import { etapasVisiveis, normalizarRastreio, progressoJornada } from './logic'

// Rotas PÚBLICAS (sem login) montadas em /api/public/edu/atendimento. Expõem o mínimo necessário.
export const publicRouter = Router()

const ip = (req: Request) => String(req.ip || req.headers['x-forwarded-for'] || 'x')
const STATUS_ROTULO: Record<string, string> = { ABERTO: 'Recebido', EM_ANDAMENTO: 'Em andamento', PENDENTE_SOLICITANTE: 'Aguardando ação do solicitante', CONCLUIDO: 'Concluído', INDEFERIDO: 'Indeferido', CANCELADO: 'Cancelado' }
const semCache = (res: Response) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex') }

async function porCodigo(req: Request, res: Response) {
  if (!limitar(`atd-rastreio:${ip(req)}`, 40, 60_000)) { res.status(429).json({ error: 'Muitas consultas. Aguarde um minuto.' }); return null }
  const codigo = normalizarRastreio(String(req.params.codigo))
  const p = codigo ? await prisma.atdProtocolo.findUnique({ where: { codigoRastreio: codigo } }) : null
  if (!p) { res.status(404).json({ error: 'Código não encontrado. Confira o código informado no comprovante.' }); return null }
  return p
}

publicRouter.get('/rastreio/:codigo', async (req, res, next) => {
  try {
    semCache(res)
    const p = await porCodigo(req, res)
    if (!p) return
    const [etapas, cfg, eventos, pend, inst] = await Promise.all([
      prisma.atdEtapa.findMany({ where: { protocoloId: p.id }, orderBy: { ordem: 'asc' } }),
      prisma.atdEtapaConfig.findMany({ where: { tenantId: p.tenantId } }),
      prisma.atdEvento.findMany({ where: { protocoloId: p.id, visivelSolicitante: true }, orderBy: { createdAt: 'asc' }, select: { titulo: true, createdAt: true, etapaCodigo: true } }),
      prisma.atdPendencia.findFirst({ where: { protocoloId: p.id, status: { in: ['ABERTA', 'VENCIDA'] } }, orderBy: { prazoEm: 'asc' }, select: { prazoEm: true, status: true } }),
      nomeInstituicao(p.tenantId),
    ])
    const visiveis = etapasVisiveis(etapas, cfg)
    const codigosVisiveis = new Set(visiveis.map((e) => e.codigo))
    res.json({
      instituicao: inst, protocolo: p.numero, servico: p.servicoNome, solicitante: mascararNome(p.solicitanteNome), status: p.status, statusRotulo: STATUS_ROTULO[p.status] ?? p.status,
      abertoEm: p.createdAt, previsaoConclusao: ['CONCLUIDO', 'INDEFERIDO', 'CANCELADO'].includes(p.status) ? null : p.prazoEm, concluidoEm: p.concluidoEm, progresso: progressoJornada(visiveis),
      etapaAtual: visiveis.find((e) => e.status === 'EM_ANDAMENTO')?.nome ?? null,
      etapas: visiveis.map((e) => ({ nome: e.nome, status: e.status, concluidaEm: e.concluidaEm, prazoEm: e.status === 'CONCLUIDA' ? null : e.prazoEm, mensagem: e.mensagem })),
      historico: eventos.filter((e) => !e.etapaCodigo || codigosVisiveis.has(e.etapaCodigo)).map((e) => ({ titulo: e.titulo, em: e.createdAt })),
      pendencia: pend ? { prazoEm: pend.prazoEm, vencida: pend.status === 'VENCIDA' } : null,
      notificacoes: p.notificar,
    })
  } catch (e) { next(e) }
})

publicRouter.post('/rastreio/:codigo/notificacoes', async (req, res, next) => {
  try {
    semCache(res)
    const p = await porCodigo(req, res)
    if (!p) return
    const b = z.object({ receber: z.boolean() }).safeParse(req.body)
    if (!b.success) return void res.status(400).json({ error: 'Informe "receber" (true/false).' })
    await prisma.atdProtocolo.update({ where: { id: p.id }, data: { notificar: b.data.receber } })
    await audit({ tenantId: p.tenantId, modulo: MOD, acao: b.data.receber ? 'NOTIFICACAO_OPTIN' : 'NOTIFICACAO_OPTOUT', refType: 'AtdProtocolo', refId: p.id, detalhes: { origem: 'PUBLICO' } })
    res.json({ notificacoes: b.data.receber })
  } catch (e) { next(e) }
})

// Avaliação (CSAT) por link com token imprevisível enviado ao solicitante.
publicRouter.get('/avaliacao/:token', async (req, res, next) => {
  try {
    semCache(res)
    if (!limitar(`atd-csat:${ip(req)}`, 30, 60_000)) return void res.status(429).json({ error: 'Muitas consultas.' })
    const a = await prisma.atdAtendimento.findUnique({ where: { csatToken: String(req.params.token) }, select: { numero: true, csatNota: true, status: true } })
    if (!a) return void res.status(404).json({ error: 'Link de avaliação inválido.' })
    res.json({ atendimento: a.numero, jaAvaliado: !!a.csatNota })
  } catch (e) { next(e) }
})
publicRouter.post('/avaliacao/:token', async (req, res, next) => {
  try {
    semCache(res)
    if (!limitar(`atd-csat:${ip(req)}`, 30, 60_000)) return void res.status(429).json({ error: 'Muitas consultas.' })
    const b = z.object({ nota: z.number().int().min(1).max(5), comentario: z.string().max(1000).optional() }).safeParse(req.body)
    if (!b.success) return void res.status(400).json({ error: 'Informe nota de 1 a 5.' })
    const a = await prisma.atdAtendimento.findUnique({ where: { csatToken: String(req.params.token) } })
    if (!a) return void res.status(404).json({ error: 'Link de avaliação inválido.' })
    if (!['RESOLVIDO', 'FECHADO'].includes(a.status)) return void res.status(409).json({ error: 'O atendimento ainda não foi resolvido.' })
    if (a.csatNota) return void res.status(409).json({ error: 'Atendimento já avaliado. Obrigado!' })
    await prisma.atdAtendimento.update({ where: { id: a.id }, data: { csatNota: b.data.nota, csatComentario: b.data.comentario, csatEm: new Date() } })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// Base de conhecimento pública por instituição (somente artigos marcados como públicos).
publicRouter.get('/conhecimento/:instituicao', async (req, res, next) => {
  try {
    if (!limitar(`atd-kb:${ip(req)}`, 60, 60_000)) return void res.status(429).json({ error: 'Muitas consultas.' })
    const tenantId = await resolverTenantPublico(String(req.params.instituicao))
    if (!tenantId) return void res.status(404).json({ error: 'Instituição não encontrada.' })
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 80) : ''
    const items = await prisma.atdConhecimento.findMany({ where: { tenantId, ativo: true, publico: true, ...(q ? { OR: [{ pergunta: { contains: q, mode: 'insensitive' } }, { resposta: { contains: q, mode: 'insensitive' } }] } : {}) }, select: { categoria: true, pergunta: true, resposta: true }, take: 50, orderBy: { usos: 'desc' } })
    res.json({ instituicao: await nomeInstituicao(tenantId), items })
  } catch (e) { next(e) }
})
