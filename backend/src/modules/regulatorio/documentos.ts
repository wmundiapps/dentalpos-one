import { Router, Response } from 'express'
import { createHash } from 'crypto'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, qs, pageParams } from '../core/crud'
import { audit } from '../core/notify'
import { scheduleReminder } from '../core/reminders'
import { callAIForJSON } from '../../services-ai/client'
import { analisarDocumentoHeuristico, addDays, AnaliseHeuristica, isoDeBR } from './rules'
import { MODULO, READ, WRITE, bad } from './common'

type Tarefa = AnaliseHeuristica['tarefasSugeridas'][number]

function normalizaIA(r: any, fallback: AnaliseHeuristica): AnaliseHeuristica & { riscos?: string[] } {
  const prazos = Array.isArray(r?.prazos)
    ? r.prazos.slice(0, 30).map((p: any) => {
        let data: string | undefined = typeof p?.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.data) ? p.data : undefined
        if (!data && typeof p?.data === 'string') { const m = p.data.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) data = isoDeBR(m[1], m[2], m[3]) }
        return { texto: String(p?.texto ?? p?.descricao ?? '').slice(0, 200), data, dias: Number.isFinite(p?.dias) ? Number(p.dias) : undefined, contexto: String(p?.contexto ?? p?.descricao ?? '').slice(0, 240) }
      })
    : fallback.prazos
  const exigencias = Array.isArray(r?.exigencias) ? r.exigencias.slice(0, 40).map((e: any) => String(typeof e === 'string' ? e : e?.texto ?? '').slice(0, 300)).filter(Boolean) : fallback.exigencias
  const tarefas: Tarefa[] = Array.isArray(r?.tarefas)
    ? r.tarefas.slice(0, 20).map((t: any) => ({
        titulo: String(t?.titulo ?? '').slice(0, 140), prazo: typeof t?.prazo === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.prazo) ? t.prazo : undefined,
        prazoDias: Number.isFinite(t?.prazoDias) ? Number(t.prazoDias) : undefined, severity: ['INFO', 'ATENCAO', 'CRITICO'].includes(t?.severity) ? t.severity : 'ATENCAO',
      })).filter((t: Tarefa) => t.titulo)
    : fallback.tarefasSugeridas
  return { resumo: String(r?.resumo ?? fallback.resumo).slice(0, 2000), numeroAto: r?.numeroAto ? String(r.numeroAto).slice(0, 60) : fallback.numeroAto, prazos, exigencias, tarefasSugeridas: tarefas, riscos: Array.isArray(r?.riscos) ? r.riscos.slice(0, 10).map(String) : undefined }
}

async function criarTarefas(tenantId: string, analiseId: string, tarefas: Tarefa[], processoId: string | null, responsavelId?: string) {
  const criadas: any[] = []
  const agora = new Date()
  for (const t of tarefas) {
    const due = t.prazo ? new Date(t.prazo + 'T12:00:00Z') : addDays(agora, t.prazoDias ?? 15)
    const key = 'reg:ia:' + createHash('sha1').update(analiseId + '|' + t.titulo).digest('hex').slice(0, 20)
    const r = await scheduleReminder({
      tenantId, modulo: MODULO, titulo: t.titulo, descricao: 'Tarefa sugerida pela análise de documento regulatório.', dueAt: due, antecedenciaDias: 5, severity: t.severity,
      refType: processoId ? 'RegProcesso' : 'RegAnaliseDocumento', refId: processoId ?? analiseId, assigneeUserId: responsavelId, assigneeRole: responsavelId ? undefined : 'COORDINATOR', dedupeKey: key,
    })
    criadas.push({ lembreteId: r.id, titulo: t.titulo, dueAt: due })
  }
  return criadas
}

export function mountDocumentos(router: Router) {
  const guard = requireRole(...READ, ...WRITE)

  router.post(
    '/analise-documentos',
    requireRole(...WRITE),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const b = parseBody(z.object({
        texto: z.string().min(30, 'cole o texto do documento').max(200000), tipoDocumento: z.enum(['PORTARIA', 'RELATORIO_AVALIACAO', 'DILIGENCIA', 'OUTRO']).default('OUTRO'),
        titulo: z.string().max(200).optional(), processoId: z.string().optional(), criarTarefas: z.boolean().optional(), responsavelId: z.string().optional(),
      }), req.body)
      if (b.processoId && !(await prisma.regProcesso.findFirst({ where: { id: b.processoId, tenantId }, select: { id: true } }))) throw bad('Processo não encontrado.')
      const heur = analisarDocumentoHeuristico(b.texto)
      let analise: AnaliseHeuristica & { riscos?: string[] } = heur
      let modo = 'HEURISTICO'
      let aviso: string | undefined
      try {
        const hoje = new Date().toISOString().slice(0, 10)
        const r = await callAIForJSON<any>({
          system:
            'Você é analista de regulação da educação superior brasileira (MEC/INEP/e-MEC). Leia o documento e responda SOMENTE JSON com: ' +
            '{"resumo": string (até 6 linhas), "numeroAto": string|null, "prazos": [{"texto": string, "data": "AAAA-MM-DD"|null, "dias": number|null, "contexto": string}], ' +
            '"exigencias": [string], "riscos": [string], "tarefas": [{"titulo": string, "prazo": "AAAA-MM-DD"|null, "prazoDias": number|null, "severity": "INFO"|"ATENCAO"|"CRITICO"}]}. ' +
            'Não invente prazos que não estejam no texto; prazos relativos ficam em "dias". Hoje é ' + hoje + '.',
          user: `TIPO: ${b.tipoDocumento}\n${b.titulo ? 'TÍTULO: ' + b.titulo + '\n' : ''}DOCUMENTO:\n${b.texto.slice(0, 30000)}`,
          maxTokens: 2500,
          ctx: { clinicId: req.user?.clinicId, tenantId, actorId: userId, referenceType: 'RegAnaliseDocumento' },
        })
        analise = normalizaIA(r, heur)
        modo = 'IA'
      } catch (e: any) {
        aviso = 'IA indisponível ou falhou — análise heurística (datas e verbos de exigência). Revise manualmente e complemente as tarefas.'
      }
      const reg = await prisma.regAnaliseDocumento.create({
        data: { tenantId, tipoDocumento: b.tipoDocumento, titulo: b.titulo, processoId: b.processoId, texto: b.texto.slice(0, 200000), modo, resumo: analise.resumo, prazos: analise.prazos as any, exigencias: analise.exigencias as any, userId },
      })
      let tarefasCriadas: any[] = []
      if (b.criarTarefas && analise.tarefasSugeridas.length) {
        tarefasCriadas = await criarTarefas(tenantId, reg.id, analise.tarefasSugeridas, b.processoId ?? null, b.responsavelId)
        await prisma.regAnaliseDocumento.update({ where: { id: reg.id }, data: { tarefasCriadas: tarefasCriadas as any } })
      }
      await audit({ tenantId, userId, modulo: MODULO, acao: 'ANALISE_DOCUMENTO', refType: 'RegAnaliseDocumento', refId: reg.id, detalhes: { modo } })
      res.status(201).json({ id: reg.id, modo, aviso, ...analise, tarefasSugeridas: analise.tarefasSugeridas, tarefasCriadas })
    }),
  )

  // Cria depois os lembretes das tarefas sugeridas (todas ou as de índices escolhidos; pode editar títulos/prazos)
  router.post(
    '/analise-documentos/:id/criar-tarefas',
    requireRole(...WRITE),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const b = parseBody(z.object({
        tarefas: z.array(z.object({ titulo: z.string().min(3).max(140), prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), prazoDias: z.number().int().min(0).max(730).optional(), severity: z.enum(['INFO', 'ATENCAO', 'CRITICO']).default('ATENCAO') })).min(1).max(30),
        responsavelId: z.string().optional(),
      }), req.body)
      const a = await prisma.regAnaliseDocumento.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!a) return res.status(404).json({ error: 'Análise não encontrada.' })
      const criadas = await criarTarefas(tenantId, a.id, b.tarefas, a.processoId, b.responsavelId)
      const antes = Array.isArray(a.tarefasCriadas) ? (a.tarefasCriadas as any[]) : []
      await prisma.regAnaliseDocumento.update({ where: { id: a.id }, data: { tarefasCriadas: [...antes, ...criadas] as any } })
      res.status(201).json({ criadas })
    }),
  )

  router.get(
    '/analise-documentos',
    guard,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId }
      const p = qs(req.query.processoId); if (p) where.processoId = p
      const [items, total] = await Promise.all([
        prisma.regAnaliseDocumento.findMany({ where, select: { id: true, tipoDocumento: true, titulo: true, processoId: true, modo: true, resumo: true, createdAt: true, tarefasCriadas: true }, orderBy: { createdAt: 'desc' }, skip, take }),
        prisma.regAnaliseDocumento.count({ where }),
      ])
      res.json({ items, total, page, pageSize })
    }),
  )
  router.get(
    '/analise-documentos/:id',
    guard,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const a = await prisma.regAnaliseDocumento.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
      if (!a) return res.status(404).json({ error: 'Análise não encontrada.' })
      res.json(a)
    }),
  )
}
