import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { toCsv } from './calculo'
import { montarCarteira, politicaPara, sincronizarCasos } from './carteira'
import { CANAIS_COB, sincronizarTentativas, tentarContato } from './contato'
import { registrarPromessa } from './promessas'
import { OPERA_COB } from './roles'
import { enviarCsv, httpErr, intervalo } from './util'

const router = Router()

async function casoDoAluno(tenantId: string, studentId: string) {
  const cart = await montarCarteira(tenantId, new Date(), { studentId })
  await sincronizarCasos(tenantId, cart)
  const caso = await prisma.cobCaso.findFirst({ where: { tenantId, studentId } })
  if (!caso) throw httpErr(422, 'O aluno não está em cobrança (sem débito vencido nem histórico).')
  return { caso, pol: politicaPara(cart.politicas, cart.info.get(studentId)?.segmento ?? 'GRADUACAO'), nome: cart.info.get(studentId)?.nome }
}

// Histórico completo de contatos/tentativas (conformidade: inclui bloqueios por opt-out, janela e limite).
router.get('/contatos', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  await sincronizarTentativas(tenantId, 200)
  const where: any = { tenantId }
  for (const k of ['studentId', 'casoId', 'canal', 'resultado', 'tipo', 'direcao'] as const) if (qs(req.query[k])) where[k] = qs(req.query[k])
  if (qs(req.query.automatico)) where.automatico = qs(req.query.automatico) === 'true'
  if (qs(req.query.de) || qs(req.query.ate)) {
    const { de, ate } = intervalo({ de: qs(req.query.de), ate: qs(req.query.ate) }, 30)
    where.createdAt = { gte: de, lte: ate }
  }
  const csv = qs(req.query.formato) === 'csv'
  const { skip, take, page, pageSize } = pageParams(req.query)
  const [rows, total] = await Promise.all([prisma.cobContato.findMany({ where, orderBy: { createdAt: 'desc' }, ...((csv ? { take: 10000 } : { skip, take }) as { skip?: number; take: number }) }), prisma.cobContato.count({ where })])
  const alunos = await prisma.student.findMany({ where: { tenantId, id: { in: [...new Set(rows.map((r) => r.studentId))] } }, select: { id: true, nomeCompleto: true, ra: true } })
  const am = new Map(alunos.map((a) => [a.id, a]))
  const items = rows.map((r) => ({ ...r, aluno: am.get(r.studentId)?.nomeCompleto ?? '', ra: am.get(r.studentId)?.ra ?? '' }))
  if (csv) {
    await audit({ tenantId, userId: getUserId(req), modulo: 'cobranca', acao: 'EXPORTACAO_CSV_CONTATOS', detalhes: { linhas: items.length } })
    return enviarCsv(res, 'historico-contatos.csv', toCsv([{ key: 'createdAt', label: 'Data' }, { key: 'aluno', label: 'Aluno' }, { key: 'ra', label: 'RA' }, { key: 'tipo', label: 'Tipo' }, { key: 'direcao', label: 'Direção' }, { key: 'canal', label: 'Canal' }, { key: 'automatico', label: 'Automático' }, { key: 'resultado', label: 'Resultado' }, { key: 'destino', label: 'Destino' }, { key: 'baseLegal', label: 'Base legal' }, { key: 'observacao', label: 'Observação' }, { key: 'erro', label: 'Erro/Motivo' }], items as any))
  }
  const resumo = await prisma.cobContato.groupBy({ by: ['resultado'], where, _count: { _all: true } })
  res.json({ items, total, page, pageSize, resumo: Object.fromEntries(resumo.map((r) => [r.resultado, r._count._all])) })
}))

// Registro manual: ligação, visita, mensagem recebida, nota. NÃO envia nada (para enviar use /contatos/enviar).
router.post('/contatos/registrar', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({
    studentId: z.string(),
    tipo: z.enum(['LIGACAO', 'VISITA', 'MENSAGEM', 'EMAIL', 'NOTA']),
    direcao: z.enum(['SAIDA', 'ENTRADA']).default('SAIDA'),
    canal: z.enum(['TELEFONE', 'PRESENCIAL', 'WHATSAPP', 'SMS', 'EMAIL', 'TELEGRAM', 'SISTEMA']).default('TELEFONE'),
    resultado: z.enum(['ATENDEU', 'NAO_ATENDEU', 'CAIXA_POSTAL', 'NUMERO_ERRADO', 'RECUSOU', 'PROMESSA', 'ACORDO', 'REGISTRADO']).default('REGISTRADO'),
    observacao: z.string().min(3).max(2000),
    promessa: z.object({ valor: z.number().positive(), dataPrometida: dateISO() }).optional(),
  }), req.body)
  const { caso, pol } = await casoDoAluno(tenantId, b.studentId)
  const c = await prisma.cobContato.create({ data: { tenantId, casoId: caso.id, studentId: b.studentId, tipo: b.tipo, direcao: b.direcao, canal: b.canal, resultado: b.resultado, observacao: b.observacao, usuarioId: getUserId(req), baseLegal: pol.baseLegal } })
  if (b.resultado !== 'NAO_ATENDEU' && b.resultado !== 'NUMERO_ERRADO' || b.tipo !== 'NOTA') await prisma.cobCaso.update({ where: { id: caso.id }, data: { ultimoContatoEm: new Date(), ultimoContatoCanal: b.canal, ultimoContatoResultado: b.resultado } })
  let promessa: any = null
  if (b.promessa) promessa = await registrarPromessa(tenantId, { studentId: b.studentId, valor: b.promessa.valor, dataPrometida: b.promessa.dataPrometida, canal: b.canal, observacao: b.observacao, usuarioId: getUserId(req) })
  res.status(201).json({ contato: c, promessa })
}))

// Envio manual de mensagem: passa pelas MESMAS barreiras do motor (opt-out, janela, limite, conformidade do texto).
router.post('/contatos/enviar', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ studentId: z.string(), canal: z.enum(CANAIS_COB), canalFallback: z.enum(CANAIS_COB).optional(), assunto: z.string().max(200).optional(), mensagem: z.string().min(10).max(1500) }), req.body)
  const { caso, pol, nome } = await casoDoAluno(tenantId, b.studentId)
  const r = await tentarContato({ tenantId, caso, politica: pol, canal: b.canal, canalFallback: b.canalFallback, assunto: b.assunto, mensagem: b.mensagem, automatico: false, usuarioId: getUserId(req), nomeAluno: nome })
  const bloqueado = r.resultado.startsWith('BLOQUEADO') || r.resultado === 'SEM_DESTINO' || r.resultado === 'FALHA'
  res.status(bloqueado ? 409 : 201).json({ ...r, enviado: !bloqueado, erro: bloqueado ? (r.motivo ?? `Contato não realizado: ${r.resultado}`) : undefined })
}))

// Retorno do provedor de voz IA (webhook autenticado pelo ponto de integração): atualiza o resultado da ligação.
router.post('/voz-ia/resultado', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({
    contatoId: z.string(), resultado: z.enum(['ENTREGUE', 'ATENDEU', 'NAO_ATENDEU', 'CAIXA_POSTAL', 'FALHA', 'PROMESSA', 'OPT_OUT']),
    duracaoSeg: z.number().int().min(0).optional(), transcricao: z.string().max(4000).optional(), promessa: z.object({ valor: z.number().positive(), dataPrometida: dateISO() }).optional(),
  }), req.body)
  const c = await prisma.cobContato.findFirst({ where: { id: b.contatoId, tenantId, canal: 'VOZ_IA' } })
  if (!c) throw httpErr(404, 'Chamada não encontrada.')
  const obs = [c.observacao, `retorno: ${b.resultado}${b.duracaoSeg != null ? ` (${b.duracaoSeg}s)` : ''}`, b.transcricao ? `transcrição: ${b.transcricao.slice(0, 500)}` : ''].filter(Boolean).join(' | ')
  const upd = await prisma.cobContato.update({ where: { id: c.id }, data: { resultado: b.resultado === 'OPT_OUT' ? 'REGISTRADO' : b.resultado, observacao: obs.slice(0, 2000) } })
  if (b.resultado === 'OPT_OUT' && c.casoId) {
    const dados = (await (await import('../comunicacao/campanhas')).contatosDeAlunos(tenantId, [c.studentId])).get(c.studentId)
    if (dados?.contatoId) await (await import('../comunicacao/store')).registrarPreferencia({ tenantId, contatoId: dados.contatoId, canal: 'VOZ', finalidade: 'COBRANCA', consentimento: false, origem: 'VOZ_IA', motivo: 'Pedido durante a ligação' })
  }
  let promessa: any = null
  if (b.promessa) promessa = await registrarPromessa(tenantId, { studentId: c.studentId, valor: b.promessa.valor, dataPrometida: b.promessa.dataPrometida, canal: 'VOZ_IA', observacao: 'Registrada pelo agente de voz', usuarioId: getUserId(req) })
  res.json({ contato: upd, promessa })
}))

export default router
