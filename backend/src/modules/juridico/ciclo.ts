import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { audit } from '../core/notify'
import { AuthenticatedRequest, Response, WRITE, asyncHandler, fail, money, parseBody, reqDate, requireRole, tid, uid } from './common'

// Ciclo de vida comum a contratos, locações e contratos de polo:
//   RASCUNHO/EM_NEGOCIACAO --ativar--> VIGENTE --encerrar--> ENCERRADO | --rescindir--> RESCINDIDO | --renovar--> VIGENTE (nova vigência)
// O status não é editável pelo PUT genérico (ver `travarStatus`).
export interface CicloOpts {
  path: string; model: string; modulo: string; refType: string; campoValor?: string
  onChange: (row: any, reabrir: boolean) => Promise<void>
  validarAtivar?: (row: any, tenantId: string) => Promise<void> | void
  aoRenovar?: (row: any, b: { novaVigenciaFim: Date; novoValor?: number; descricao?: string }, userId: string) => Promise<void>
}

export const travarStatus = (d: any, cur: any, extra: string[] = []) => {
  for (const k of ['status', 'rescindidoEm', 'motivoRescisao', ...extra]) if (k in d && d[k] !== undefined && d[k] !== cur[k]) fail(422, 'Use as ações /ativar, /encerrar, /rescindir ou /renovar para mudar a situação do contrato.')
  for (const k of ['status', 'rescindidoEm', 'motivoRescisao', ...extra]) delete d[k]
}

export function mountCiclo(router: Router, o: CicloOpts) {
  const get = async (req: AuthenticatedRequest, res: Response) => {
    const row = await (prisma as any)[o.model].findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!row) res.status(404).json({ error: 'Registro não encontrado.' })
    return row
  }
  const gravar = async (req: AuthenticatedRequest, row: any, data: any, acao: string, detalhes?: any) => {
    const nova = await (prisma as any)[o.model].update({ where: { id: row.id }, data })
    await o.onChange(nova, true)
    await audit({ tenantId: tid(req), userId: uid(req), modulo: o.modulo, acao, refType: o.refType, refId: row.id, detalhes })
    return nova
  }

  router.post(`${o.path}/:id/ativar`, requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const row = await get(req, res); if (!row) return
    if (!['RASCUNHO', 'EM_NEGOCIACAO'].includes(row.status)) fail(409, `Somente registros em rascunho/negociação podem ser ativados (status atual: ${row.status}).`)
    if (row.vigenciaFim && new Date(row.vigenciaFim).getTime() < Date.now() - 86_400_000) fail(422, 'A vigência já terminou: ajuste o fim da vigência antes de ativar.')
    await o.validarAtivar?.(row, tid(req))
    res.json(await gravar(req, row, { status: 'VIGENTE' }, 'ATIVAR'))
  }))

  router.post(`${o.path}/:id/encerrar`, requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const row = await get(req, res); if (!row) return
    if (row.status !== 'VIGENTE') fail(409, 'Somente registros vigentes podem ser encerrados.')
    res.json(await gravar(req, row, { status: 'ENCERRADO' }, 'ENCERRAR'))
  }))

  router.post(`${o.path}/:id/rescindir`, requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const row = await get(req, res); if (!row) return
    const b = parseBody(z.object({ motivo: z.string().min(5).max(1000), data: reqDate().optional() }), req.body)
    if (row.status !== 'VIGENTE') fail(409, 'Somente registros vigentes podem ser rescindidos.')
    res.json(await gravar(req, row, { status: 'RESCINDIDO', rescindidoEm: b.data ?? new Date(), motivoRescisao: b.motivo }, 'RESCINDIR', { motivo: b.motivo }))
  }))

  router.post(`${o.path}/:id/renovar`, requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const row = await get(req, res); if (!row) return
    const b = parseBody(z.object({ novaVigenciaFim: reqDate(), novoValor: money().optional(), descricao: z.string().max(1000).optional() }), req.body)
    if (row.status !== 'VIGENTE') fail(409, 'Somente registros vigentes podem ser renovados (reative o registro encerrado criando um novo).')
    if (row.vigenciaFim && b.novaVigenciaFim.getTime() <= new Date(row.vigenciaFim).getTime()) fail(422, 'A nova vigência deve ser posterior à vigência atual.')
    await o.aoRenovar?.(row, b, uid(req))
    const data: any = { vigenciaFim: b.novaVigenciaFim }
    if (b.novoValor !== undefined && o.campoValor) data[o.campoValor] = b.novoValor
    res.json(await gravar(req, row, data, 'RENOVAR', { de: row.vigenciaFim, para: b.novaVigenciaFim, novoValor: b.novoValor }))
  }))
}

/** O PUT/PATCH genérico não altera a situação do registro: devolve 422 se o corpo trouxer `status` (use as ações dedicadas). */
export function bloquearStatus(router: Router, path: string, acoes = '/ativar, /encerrar, /rescindir ou /renovar') {
  router.use(`${path}/:id`, (req, _res, next) => {
    if ((req.method === 'PUT' || req.method === 'PATCH') && req.body && typeof req.body === 'object' && 'status' in req.body) fail(422, `A situação não é editável diretamente: use as ações ${acoes}.`)
    next()
  })
}
