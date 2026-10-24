import { NextFunction, Request, Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { exigirGestorLgpd, hashesDe, httpError, tid, trilha, uid } from './base'

// ============================================================
// 7) Dados sensíveis (art. 5º, II; art. 11) e de menores (art. 14):
//    - marcação de campos sensíveis (padrão do código + complemento por instituição)
//    - log de acesso: QUEM viu O QUÊ (leituras de prontuário de apoio, laudos, renda, ocorrências, pacote do titular)
// ============================================================

export interface CampoSensivelDef { modelo: string; campo: string; categoria: string; observacao?: string }

export const CAMPOS_SENSIVEIS_PADRAO: CampoSensivelDef[] = [
  { modelo: 'apoAtendimento', campo: 'motivo', categoria: 'SAUDE', observacao: 'Atendimento psicopedagógico/psicológico/social (art. 11)' },
  { modelo: 'apoAtendimento', campo: 'relato', categoria: 'SAUDE' },
  { modelo: 'apoAtendimento', campo: 'encaminhamentos', categoria: 'SAUDE' },
  { modelo: 'apoPlanoAee', campo: 'necessidade', categoria: 'DEFICIENCIA', observacao: 'Deficiência/necessidade educacional especial' },
  { modelo: 'apoPlanoAee', campo: 'laudoReferencia', categoria: 'DEFICIENCIA' },
  { modelo: 'apoPlanoAee', campo: 'observacoes', categoria: 'DEFICIENCIA' },
  { modelo: 'apoPlanoAee', campo: 'recursos', categoria: 'DEFICIENCIA' },
  { modelo: 'apoTermoEstagio', campo: 'alunoPcd', categoria: 'DEFICIENCIA' },
  { modelo: 'apoInscricaoBolsa', campo: 'rendaFamiliar', categoria: 'SOCIOECONOMICO', observacao: 'Não é sensível pelo art. 5º, II, mas exige proteção reforçada' },
  { modelo: 'apoInscricaoBolsa', campo: 'rendaPerCapita', categoria: 'SOCIOECONOMICO' },
  { modelo: 'apoInscricaoBolsa', campo: 'condicoes', categoria: 'SOCIOECONOMICO' },
  { modelo: 'apoOcorrencia', campo: 'descricao', categoria: 'DISCIPLINAR' },
  { modelo: 'apoOcorrencia', campo: 'defesa', categoria: 'DISCIPLINAR' },
  { modelo: 'student', campo: 'dataNascimento', categoria: 'MENOR', observacao: 'Define o tratamento de menores (art. 14)' },
  { modelo: 'student', campo: 'cpf', categoria: 'IDENTIFICACAO' },
  { modelo: 'admCandidato', campo: 'cota', categoria: 'ORIGEM_RACIAL', observacao: 'Cotas raciais/PCD/renda revelam origem racial/saúde' },
]

export async function camposSensiveis(tenantId: string): Promise<CampoSensivelDef[]> {
  const extra = await prisma.lgpCampoSensivel.findMany({ where: { tenantId } })
  const m = new Map<string, CampoSensivelDef>()
  for (const c of CAMPOS_SENSIVEIS_PADRAO) m.set(`${c.modelo}.${c.campo}`, c)
  for (const c of extra) m.set(`${c.modelo}.${c.campo}`, { modelo: c.modelo, campo: c.campo, categoria: c.categoria, observacao: c.observacao ?? undefined })
  return [...m.values()]
}

/** Substitui por "[restrito]" os campos sensíveis do registro (usar em listagens para perfis sem necessidade de ver). */
export function ocultarSensiveis<T extends Record<string, any>>(modelo: string, row: T, defs: CampoSensivelDef[] = CAMPOS_SENSIVEIS_PADRAO): T {
  const out: any = { ...row }
  for (const d of defs) if (d.modelo === modelo && d.campo in out && out[d.campo] != null && d.categoria !== 'MENOR' && d.categoria !== 'IDENTIFICACAO') out[d.campo] = '[restrito]'
  return out
}

// ------------------------------------------------------------------ log de acesso
export interface AcessoInput { recurso: string; recursoId?: string; categoria: string; acao?: string; titularTipo?: string; titularId?: string; motivo?: string }

export async function registrarAcessoSensivel(req: AuthenticatedRequest, a: AcessoInput) {
  try {
    if (!req.user) return
    await prisma.lgpAcessoSensivel.create({
      data: {
        tenantId: req.user.tenantId, userId: req.user.id, papel: String(req.user.role), recurso: a.recurso.slice(0, 120), recursoId: a.recursoId?.slice(0, 80),
        categoria: a.categoria, acao: a.acao ?? 'LEITURA', metodo: req.method, titularTipo: a.titularTipo, titularId: a.titularId, motivo: a.motivo?.slice(0, 300),
        ipHash: hashesDe(req, req.user.tenantId).ipHash,
      },
    })
  } catch (e: any) {
    console.warn('[lgpd] não foi possível registrar acesso sensível:', String(e?.code || e?.message || e).slice(0, 100))
  }
}

// Prefixos (relativos a /api/edu) que expõem dados sensíveis, e como achar o titular do registro lido.
const ROTAS_SENSIVEIS: Array<{ prefixo: string; categoria: string; model?: string; campoAluno?: string }> = [
  { prefixo: '/apoio/atendimentos', categoria: 'SAUDE', model: 'apoAtendimento', campoAluno: 'studentId' },
  { prefixo: '/apoio/aee', categoria: 'DEFICIENCIA', model: 'apoPlanoAee', campoAluno: 'studentId' },
  { prefixo: '/apoio/ocorrencias', categoria: 'DISCIPLINAR', model: 'apoOcorrencia', campoAluno: 'studentId' },
  { prefixo: '/apoio/bolsas/inscricoes', categoria: 'SOCIOECONOMICO', model: 'apoInscricaoBolsa', campoAluno: 'studentId' },
]

const ID_RE = /^[0-9a-fA-F-]{20,40}$/

/** Middleware: grava quem acessou dados sensíveis (resposta 2xx). Não altera a resposta e nunca bloqueia. */
export function acessoSensivelLog(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const rota = ROTAS_SENSIVEIS.find((r) => req.path === r.prefixo || req.path.startsWith(r.prefixo + '/'))
  if (!rota || !req.user || req.method === 'OPTIONS' || /\/(meus|minhas)(\/|$)/.test(req.path)) return next()
  const path = req.path
  res.on('finish', () => {
    if (res.statusCode >= 300) return
    const resto = path.slice(rota.prefixo.length).split('/').filter(Boolean)
    const recursoId = resto.find((s) => ID_RE.test(s))
    void (async () => {
      let titularId: string | undefined
      if (recursoId && rota.model && rota.campoAluno) {
        try { titularId = (await (prisma as any)[rota.model].findFirst({ where: { id: recursoId, tenantId: req.user!.tenantId }, select: { [rota.campoAluno]: true } }))?.[rota.campoAluno] } catch { /* melhor esforço */ }
      }
      await registrarAcessoSensivel(req, { recurso: 'apoio' + rota.prefixo.slice('/apoio'.length), recursoId, categoria: rota.categoria, acao: req.method === 'GET' ? 'LEITURA' : 'ESCRITA', titularTipo: titularId ? 'ALUNO' : undefined, titularId })
    })()
  })
  next()
}

export function mountSensiveis(router: Router) {
  router.get('/campos-sensiveis', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json({ campos: await camposSensiveis(tid(req)), aviso: 'Dados sensíveis (art. 11) exigem base legal específica e acesso restrito e registrado.' })
  }))

  router.post('/campos-sensiveis', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ modelo: z.string().min(2).max(60), campo: z.string().min(1).max(60), categoria: z.enum(['SAUDE', 'DEFICIENCIA', 'BIOMETRIA', 'ORIGEM_RACIAL', 'CONVICCAO', 'SOCIOECONOMICO', 'MENOR', 'DISCIPLINAR']), mascarar: z.boolean().default(true), observacao: z.string().max(300).optional() }), req.body)
    const r = await prisma.lgpCampoSensivel.upsert({ where: { tenantId_modelo_campo: { tenantId, modelo: b.modelo, campo: b.campo } }, create: { ...b, tenantId }, update: b })
    await trilha({ tenantId, refType: 'CampoSensivel', refId: r.id, acao: 'MARCADO', userId: uid(req), ator: 'EQUIPE', detalhe: b })
    res.status(201).json(r)
  }))

  router.delete('/campos-sensiveis/:id', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const c = await prisma.lgpCampoSensivel.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) throw httpError(404, 'Marcação não encontrada.')
    await prisma.lgpCampoSensivel.delete({ where: { id: c.id } })
    res.status(204).end()
  }))

  router.get('/acessos-sensiveis', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['userId', 'categoria', 'recurso', 'titularId', 'titularTipo', 'acao']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const desde = qs(req.query.desde), ate = qs(req.query.ate)
    if (desde || ate) where.createdAt = { ...(desde ? { gte: new Date(desde) } : {}), ...(ate ? { lte: new Date(ate) } : {}) }
    const [items, total] = await Promise.all([prisma.lgpAcessoSensivel.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.lgpAcessoSensivel.count({ where })])
    const users = await prisma.user.findMany({ where: { tenantId, id: { in: [...new Set(items.map((i) => i.userId).filter(Boolean) as string[])] } }, select: { id: true, firstName: true, lastName: true } })
    const nome = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]))
    res.json({ items: items.map((i) => ({ ...i, usuario: i.userId ? nome.get(i.userId) ?? null : null })), total, page, pageSize })
  }))
}

export type { Request }
