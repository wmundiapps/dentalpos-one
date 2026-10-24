import { Prisma } from '@prisma/client'
import { Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { exigirGestorLgpd, httpError, tid, trilha, uid } from './base'
import { ANON } from './catalogo'

// ============================================================
// 4) Política de retenção e expurgo (art. 15, 16 e 6º, III - necessidade)
//   - cada "alvo" é uma regra de código com filtro e ação fixos (anonimizar ou eliminar);
//   - o prazo é configurável por instituição, respeitando um MÍNIMO legal por alvo;
//   - o job agendado roda em DRY-RUN por padrão (só registra o que faria). Para executar de verdade:
//       LGPD_RETENCAO_EXECUTAR=true (job) ou POST /retencao/executar { dryRun:false, confirmar:true };
//   - NUNCA toca: histórico escolar, diplomas/certificados, notas, frequência, financeiro/fiscal, estágio (art. 16, I).
// ============================================================

type Acao = 'ANONIMIZAR' | 'ELIMINAR'
interface Alvo {
  chave: string
  nome: string
  descricao: string
  acoes: Acao[]
  padraoAcao: Acao
  padraoMeses: number
  minimoMeses: number
  baseLegal: string
  model: string
  where: (tenantId: string, corte: Date) => any
  dados?: Record<string, unknown>                   // ANONIMIZAR
  aposAcao?: (tenantId: string, ids: string[]) => Promise<void>
}

const REM = '[conteúdo removido - LGPD]'

export const ALVOS: Alvo[] = [
  { chave: 'CANDIDATOS_NAO_MATRICULADOS', nome: 'Candidatos que não se matricularam', descricao: 'Anonimiza candidatos/leads sem matrícula após o prazo e remove interações, documentos e notas do processo seletivo.', acoes: ['ANONIMIZAR'], padraoAcao: 'ANONIMIZAR', padraoMeses: 24, minimoMeses: 6,
    baseLegal: 'Necessidade (art. 6º, III) - fim da finalidade (art. 15, I)', model: 'admCandidato',
    where: (t, c) => ({ tenantId: t, createdAt: { lt: c }, matricula: null, NOT: { nome: ANON } }),
    dados: { nome: ANON, cpf: null, email: null, telefone: null, dataNascimento: null, ipOrigem: null, dados: Prisma.DbNull, utmSource: null, utmMedium: null, utmCampaign: null, motivoDesistencia: null, consentimentoMarketing: false },
    aposAcao: async (t, ids) => {
      await prisma.admInteracao.deleteMany({ where: { tenantId: t, candidatoId: { in: ids } } })
      await prisma.admDocumentoCandidato.deleteMany({ where: { tenantId: t, candidatoId: { in: ids } } })
      await prisma.admResultadoProva.deleteMany({ where: { tenantId: t, candidatoId: { in: ids } } })
    } },
  { chave: 'CONTATOS_INATIVOS', nome: 'Contatos de comunicação inativos', descricao: 'Anonimiza contatos desativados há mais que o prazo (a preferência de opt-out é mantida como prova).', acoes: ['ANONIMIZAR'], padraoAcao: 'ANONIMIZAR', padraoMeses: 24, minimoMeses: 6,
    baseLegal: 'Necessidade (art. 6º, III)', model: 'comContato',
    where: (t, c) => ({ tenantId: t, ativo: false, updatedAt: { lt: c }, NOT: { nome: ANON } }),
    dados: { nome: ANON, email: null, telefone: null, telegramChatId: null, instagramId: null, facebookId: null, documento: null, tags: [] } },
  { chave: 'MENSAGENS_ENVIADAS', nome: 'Conteúdo de mensagens enviadas', descricao: 'Remove o conteúdo e o destino de mensagens antigas (mantém data/canal/status para auditoria).', acoes: ['ANONIMIZAR'], padraoAcao: 'ANONIMIZAR', padraoMeses: 12, minimoMeses: 6,
    baseLegal: 'Necessidade (art. 6º, III)', model: 'eduNotification',
    where: (t, c) => ({ tenantId: t, createdAt: { lt: c }, NOT: { mensagem: REM } }), dados: { mensagem: REM, destino: null, assunto: null, erro: null } },
  { chave: 'EVENTOS_SEGURANCA', nome: 'Log de eventos de segurança', descricao: 'Elimina eventos de segurança (login, bloqueios, uploads) antigos. Mínimo de 6 meses por causa do Marco Civil da Internet (art. 15).', acoes: ['ELIMINAR'], padraoAcao: 'ELIMINAR', padraoMeses: 12, minimoMeses: 6,
    baseLegal: 'Marco Civil da Internet, art. 15 (mínimo 6 meses)', model: 'segEvento', where: (t, c) => ({ tenantId: t, createdAt: { lt: c } }) },
  { chave: 'ACESSOS_SENSIVEIS', nome: 'Log de acesso a dados sensíveis', descricao: 'Elimina registros de "quem viu o quê" muito antigos.', acoes: ['ELIMINAR'], padraoAcao: 'ELIMINAR', padraoMeses: 60, minimoMeses: 24,
    baseLegal: 'Segurança e prestação de contas (art. 6º, VII e X)', model: 'lgpAcessoSensivel', where: (t, c) => ({ tenantId: t, createdAt: { lt: c } }) },
  { chave: 'RISCO_EVASAO', nome: 'Pontuações de risco de evasão', descricao: 'Elimina o histórico de perfilamento de risco (decisão assistida - art. 20) após o prazo.', acoes: ['ELIMINAR'], padraoAcao: 'ELIMINAR', padraoMeses: 24, minimoMeses: 6,
    baseLegal: 'Necessidade (art. 6º, III)', model: 'apoRiscoSnapshot', where: (t, c) => ({ tenantId: t, calculadoEm: { lt: c } }) },
  { chave: 'MANIFESTACOES_ENCERRADAS', nome: 'Manifestações da ouvidoria encerradas', descricao: 'Anonimiza a identificação do manifestante em manifestações encerradas/arquivadas.', acoes: ['ANONIMIZAR'], padraoAcao: 'ANONIMIZAR', padraoMeses: 60, minimoMeses: 24,
    baseLegal: 'Fim da finalidade (art. 15, I)', model: 'apoManifestacao',
    where: (t, c) => ({ tenantId: t, status: { in: ['ENCERRADA', 'ARQUIVADA'] }, updatedAt: { lt: c }, anonima: false }),
    dados: { nome: null, email: null, telefone: null, studentId: null, userId: null, anonima: true } },
  { chave: 'ATENDIMENTOS_APOIO', nome: 'Atendimentos de apoio ao estudante (dado sensível)', descricao: 'Remove relato/motivo/encaminhamentos de atendimentos antigos (guarda mínima de 5 anos).', acoes: ['ANONIMIZAR'], padraoAcao: 'ANONIMIZAR', padraoMeses: 60, minimoMeses: 60,
    baseLegal: 'Guarda mínima do registro profissional (verificar norma do conselho) - art. 16, I', model: 'apoAtendimento',
    where: (t, c) => ({ tenantId: t, createdAt: { lt: c }, OR: [{ relato: { not: null } }, { motivo: { not: null } }] }), dados: { motivo: null, relato: null, encaminhamentos: null } },
  { chave: 'SOLICITACOES_LGPD', nome: 'Solicitações de titulares já respondidas', descricao: 'Remove a identificação de solicitações respondidas há mais que o prazo (mantém protocolo, tipo e datas).', acoes: ['ANONIMIZAR'], padraoAcao: 'ANONIMIZAR', padraoMeses: 60, minimoMeses: 24,
    baseLegal: 'Prestação de contas (art. 6º, X)', model: 'lgpSolicitacao',
    where: (t, c) => ({ tenantId: t, status: { in: ['ATENDIDA', 'ATENDIDA_PARCIALMENTE', 'NEGADA', 'CANCELADA'] }, respondidaEm: { lt: c }, NOT: { nome: ANON } }),
    dados: { nome: ANON, email: '', telefone: null, docHash: null, docMascarado: null, descricao: null, dados: Prisma.DbNull, responsavelNome: null } },
]

export const PROTEGIDOS_ART16 = [
  'Histórico escolar, notas, frequência e matrícula', 'Diplomas, certificados e documentos acadêmicos emitidos', 'Mensalidades, cobranças e notas fiscais (5 anos - CTN)',
  'Termos e relatórios de estágio (Lei 11.788/2008)', 'Ocorrências disciplinares (exercício regular de direitos)', 'Prova de consentimento/opt-out (identificação removida em eliminação)',
]

export const alvoPorChave = (c: string) => ALVOS.find((a) => a.chave === c)

export async function semearPoliticas(tenantId: string) {
  let criadas = 0
  for (const a of ALVOS) {
    const ex = await prisma.lgpRetencaoPolitica.findUnique({ where: { tenantId_alvo: { tenantId, alvo: a.chave } } })
    if (ex) continue
    await prisma.lgpRetencaoPolitica.create({ data: { tenantId, alvo: a.chave, nome: a.nome, descricao: a.descricao, prazoMeses: a.padraoMeses, acao: a.padraoAcao, baseLegal: a.baseLegal, ativa: true } })
    criadas++
  }
  return criadas
}

export interface ResultadoRetencao { alvo: string; dryRun: boolean; afetados: number; corte: Date; amostraIds: string[]; execucaoId: string }

export async function executarPolitica(pol: { id: string; tenantId: string; alvo: string; prazoMeses: number; acao: string }, opts: { dryRun: boolean; origem: 'JOB' | 'MANUAL'; userId?: string }): Promise<ResultadoRetencao> {
  const alvo = alvoPorChave(pol.alvo)
  if (!alvo) throw httpError(400, `Alvo de retenção desconhecido: ${pol.alvo}`)
  const meses = Math.max(pol.prazoMeses, alvo.minimoMeses)
  const corte = new Date(); corte.setMonth(corte.getMonth() - meses)
  const acao = (alvo.acoes.includes(pol.acao as Acao) ? pol.acao : alvo.padraoAcao) as Acao
  const exec = await prisma.lgpRetencaoExecucao.create({ data: { tenantId: pol.tenantId, politicaId: pol.id, alvo: pol.alvo, dryRun: opts.dryRun, origem: opts.origem, acao, prazoMeses: meses, corte, executadoPor: opts.userId } })
  try {
    const d = (prisma as any)[alvo.model]
    const where = alvo.where(pol.tenantId, corte)
    const afetados = await d.count({ where })
    const amostra = afetados ? (await d.findMany({ where, select: { id: true }, take: 20 })).map((r: any) => r.id as string) : []
    let efetivos = afetados
    if (!opts.dryRun && afetados) {
      const ids = alvo.aposAcao ? (await d.findMany({ where, select: { id: true } })).map((r: any) => r.id as string) : []
      const r = acao === 'ELIMINAR' ? await d.deleteMany({ where }) : await d.updateMany({ where, data: alvo.dados })
      efetivos = r.count
      if (alvo.aposAcao && ids.length) await alvo.aposAcao(pol.tenantId, ids)
    }
    await prisma.lgpRetencaoExecucao.update({ where: { id: exec.id }, data: { afetados: efetivos, detalhes: { amostraIds: amostra, observacao: opts.dryRun ? 'Simulação: nada foi alterado.' : 'Executado.' } as any, concluidoEm: new Date() } })
    if (!opts.dryRun && efetivos) await trilha({ tenantId: pol.tenantId, refType: 'Retencao', refId: pol.id, acao: acao === 'ELIMINAR' ? 'ELIMINADOS' : 'ANONIMIZADOS', userId: opts.userId, ator: opts.userId ? 'EQUIPE' : 'SISTEMA', detalhe: { alvo: pol.alvo, afetados: efetivos, prazoMeses: meses } })
    return { alvo: pol.alvo, dryRun: opts.dryRun, afetados: efetivos, corte, amostraIds: amostra, execucaoId: exec.id }
  } catch (e: any) {
    await prisma.lgpRetencaoExecucao.update({ where: { id: exec.id }, data: { erro: String(e?.message || e).slice(0, 300), concluidoEm: new Date() } })
    throw e
  }
}

/** Job diário (cron /api/cron/edu). DRY-RUN salvo se LGPD_RETENCAO_EXECUTAR=true. */
export async function jobRetencao() {
  const executar = process.env.LGPD_RETENCAO_EXECUTAR === 'true'
  const pols = await prisma.lgpRetencaoPolitica.findMany({ where: { ativa: true } })
  const out: Array<{ tenantId: string; alvo: string; afetados: number; dryRun: boolean }> = []
  const desde = new Date(Date.now() - 20 * 3_600_000)
  for (const p of pols) {
    const recente = await prisma.lgpRetencaoExecucao.findFirst({ where: { politicaId: p.id, origem: 'JOB', dryRun: !executar, iniciadoEm: { gt: desde }, erro: null } })
    if (recente) continue
    try {
      const r = await executarPolitica(p, { dryRun: !executar, origem: 'JOB' })
      out.push({ tenantId: p.tenantId, alvo: p.alvo, afetados: r.afetados, dryRun: r.dryRun })
    } catch (e: any) {
      console.error('[lgpd-retencao]', p.alvo, String(e?.message || e).slice(0, 200))
    }
  }
  return { modo: executar ? 'EXECUCAO' : 'DRY_RUN', politicas: out.length, afetadosTotal: out.reduce((a, b) => a + b.afetados, 0) }
}

export function mountRetencao(router: Router) {
  router.get('/retencao/alvos', exigirGestorLgpd, asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    res.json({ alvos: ALVOS.map((a) => ({ chave: a.chave, nome: a.nome, descricao: a.descricao, acoes: a.acoes, padraoMeses: a.padraoMeses, minimoMeses: a.minimoMeses, baseLegal: a.baseLegal })), protegidosArt16: PROTEGIDOS_ART16, modoJob: process.env.LGPD_RETENCAO_EXECUTAR === 'true' ? 'EXECUCAO' : 'DRY_RUN' })
  }))

  router.get('/retencao/politicas', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    await semearPoliticas(tenantId)
    const items = await prisma.lgpRetencaoPolitica.findMany({ where: { tenantId }, orderBy: { nome: 'asc' } })
    const ultimas = await prisma.lgpRetencaoExecucao.findMany({ where: { tenantId, politicaId: { in: items.map((i) => i.id) } }, orderBy: { iniciadoEm: 'desc' }, take: 200 })
    res.json({ items: items.map((p) => ({ ...p, minimoMeses: alvoPorChave(p.alvo)?.minimoMeses ?? 0, ultimaExecucao: ultimas.find((u) => u.politicaId === p.id) ?? null })), modoJob: process.env.LGPD_RETENCAO_EXECUTAR === 'true' ? 'EXECUCAO' : 'DRY_RUN' })
  }))

  router.put('/retencao/politicas/:id', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.lgpRetencaoPolitica.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) throw httpError(404, 'Política não encontrada.')
    const alvo = alvoPorChave(p.alvo)!
    const b = parseBody(z.object({ prazoMeses: z.number().int().min(1).max(600).optional(), acao: z.enum(['ANONIMIZAR', 'ELIMINAR']).optional(), ativa: z.boolean().optional() }), req.body)
    if (b.prazoMeses !== undefined && b.prazoMeses < alvo.minimoMeses) throw httpError(422, `Prazo mínimo para "${alvo.nome}": ${alvo.minimoMeses} meses (${alvo.baseLegal}).`)
    if (b.acao && !alvo.acoes.includes(b.acao)) throw httpError(422, `Ação não suportada para este alvo (permitidas: ${alvo.acoes.join(', ')}).`)
    const r = await prisma.lgpRetencaoPolitica.update({ where: { id: p.id }, data: b })
    await trilha({ tenantId, refType: 'Retencao', refId: p.id, acao: 'POLITICA_ALTERADA', userId: uid(req), ator: 'EQUIPE', detalhe: b })
    res.json(r)
  }))

  // Execução manual: dry-run por padrão
  router.post('/retencao/executar', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    await semearPoliticas(tenantId)
    const b = parseBody(z.object({ politicaId: z.string().max(80).optional(), dryRun: z.boolean().default(true), confirmar: z.boolean().default(false) }), req.body ?? {})
    if (!b.dryRun && !b.confirmar) throw httpError(400, 'Execução real é irreversível: envie confirmar=true.')
    const pols = await prisma.lgpRetencaoPolitica.findMany({ where: { tenantId, ativa: true, ...(b.politicaId ? { id: b.politicaId } : {}) } })
    if (b.politicaId && !pols.length) throw httpError(404, 'Política não encontrada ou inativa.')
    const resultados: ResultadoRetencao[] = []
    for (const p of pols) resultados.push(await executarPolitica(p, { dryRun: b.dryRun, origem: 'MANUAL', userId: uid(req) }))
    res.json({ dryRun: b.dryRun, resultados, aviso: b.dryRun ? 'Simulação: nada foi alterado.' : 'Expurgo executado e registrado.', protegidosArt16: PROTEGIDOS_ART16 })
  }))

  router.get('/retencao/execucoes', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    const alvo = qs(req.query.alvo); if (alvo) where.alvo = alvo
    if (qs(req.query.dryRun)) where.dryRun = qs(req.query.dryRun) === 'true'
    const [items, total] = await Promise.all([prisma.lgpRetencaoExecucao.findMany({ where, orderBy: { iniciadoEm: 'desc' }, skip, take }), prisma.lgpRetencaoExecucao.count({ where })])
    res.json({ items, total, page, pageSize })
  }))
}
