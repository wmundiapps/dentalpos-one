import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { academicErrorHandler, AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { registerEduJob } from '../core/jobs'
import { audit } from '../core/notify'
import { scheduleReminder } from '../core/reminders'
import { getBranding, brandHeaderHtml, escapeHtml as esc } from '../core/branding'
import { MANAGE, TEACH, conformidadeCurso } from './common'
import { CHECKLIST_POLO_PADRAO } from './rules'
import ofertas from './ofertas'
import polos from './polos'
import tutoria, { escalonarAtendimentosVencidos } from './tutoria'
import engajamento, { varrerInatividade } from './engajamento'
import praticas from './praticas'
import pos, { varrerPrazosPos } from './pos'

// Módulo "modalidades" — montado em /api/edu/modalidades.
const router = Router()

router.use(ofertas)
router.use(polos)
router.use(tutoria)
router.use('/engajamento', engajamento)
router.use(praticas)
router.use(pos)

// Bootstrap idempotente: parâmetros padrão, checklist de estrutura dos polos existentes e itens obrigatórios.
router.post('/bootstrap', requireRole(...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const cfg = await prisma.modConfig.upsert({ where: { tenantId }, create: { tenantId }, update: {} })
  const existentes = await prisma.modPolo.findMany({ where: { tenantId }, select: { id: true } })
  let itens = 0
  for (const p of existentes) {
    const r = await prisma.modPoloChecklistItem.createMany({ data: CHECKLIST_POLO_PADRAO.map((c) => ({ ...c, tenantId, poloId: p.id })), skipDuplicates: true })
    itens += r.count
  }
  await audit({ tenantId, userId: getUserId(req), modulo: 'modalidades', acao: 'BOOTSTRAP' })
  res.json({ config: cfg, polosAtualizados: existentes.length, itensChecklistCriados: itens, checklistPadrao: CHECKLIST_POLO_PADRAO })
}))

// Painel resumido do módulo.
router.get('/painel', requireRole(...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const now = new Date()
  const [polos, polosCred, atendAbertos, atendVencidos, alertas, lives, posAlunos, bolsas] = await Promise.all([
    prisma.modPolo.count({ where: { tenantId, ativo: true } }),
    prisma.modPolo.count({ where: { tenantId, ativo: true, statusCredenciamento: 'CREDENCIADO' } }),
    prisma.modAtendimento.count({ where: { tenantId, status: { in: ['ABERTO', 'EM_ATENDIMENTO', 'ESCALADO'] } } }),
    prisma.modAtendimento.count({ where: { tenantId, status: { in: ['ABERTO', 'EM_ATENDIMENTO', 'ESCALADO'] }, slaLimite: { lt: now }, primeiraRespostaEm: null } }),
    prisma.modAlertaInatividade.count({ where: { tenantId, status: 'ABERTO' } }),
    prisma.modAulaLive.count({ where: { tenantId, status: 'AGENDADA', inicio: { gte: now, lte: new Date(now.getTime() + 7 * 86_400_000) } } }),
    prisma.modPosAluno.count({ where: { tenantId, status: { in: ['MATRICULADO', 'QUALIFICADO'] } } }),
    prisma.modPosBolsa.count({ where: { tenantId, status: 'ATIVA' } }),
  ])
  res.json({ polos, polosCredenciados: polosCred, atendimentosAbertos: atendAbertos, atendimentosComSlaVencido: atendVencidos, alunosInativosAlerta: alertas, livesProximos7d: lives, posAlunosAtivos: posAlunos, bolsasAtivas: bolsas })
}))

// Relatório de conformidade por modalidade em HTML (com logomarca) — pronto para imprimir/anexar a processos regulatórios.
router.get('/relatorios/conformidade', requireRole(...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const [br, programas] = await Promise.all([getBranding(tenantId), prisma.academicProgram.findMany({ where: { tenantId }, select: { id: true }, orderBy: { nome: 'asc' } })])
  const linhas: string[] = []
  const cor = (s: string) => (s === 'CRITICO' ? '#b91c1c' : s === 'ATENCAO' ? '#b45309' : '#475569')
  for (const p of programas) {
    try {
      const r = await conformidadeCurso(tenantId, p.id)
      linhas.push(`<tr><td>${esc(r.program.nome)}</td><td>${r.modalidade}</td><td style="text-align:right">${r.percentualEad}%</td><td style="text-align:right">${r.alunos}/${r.tutores}</td><td style="color:${r.conforme ? '#15803d' : '#b91c1c'};font-weight:700">${r.conforme ? 'CONFORME' : 'NÃO CONFORME'}</td><td>${r.alertas.map((a) => `<div style="color:${cor(a.severidade)}">• ${esc(a.mensagem)}</div>`).join('') || '—'}</td></tr>`)
    } catch { /* ignora curso inválido */ }
  }
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Conformidade por modalidade</title><body style="font-family:system-ui,sans-serif;max-width:1100px;margin:16px auto">
${brandHeaderHtml(br, { titulo: 'Relatório de conformidade por modalidade', subtitulo: `Emitido em ${new Date().toLocaleDateString('pt-BR')}` })}
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px" border="1" cellpadding="6"><thead style="background:${esc(br.cores.primaria)};color:#fff"><tr><th>Curso</th><th>Modalidade</th><th>% EAD</th><th>Alunos/Tutores</th><th>Situação</th><th>Alertas</th></tr></thead><tbody>${linhas.join('')}</tbody></table></body></html>`
  res.type('html').send(html)
}))

router.use(academicErrorHandler)
export default router

// Rotas PÚBLICAS: polos credenciados (sem dados sensíveis) para o site da instituição.
export const publicRouter = Router()
publicRouter.get('/polos', asyncHandler(async (req, res) => {
  const tenantId = String(req.query.tenantId ?? '')
  if (!tenantId) return res.status(400).json({ error: 'tenantId obrigatório.' })
  const items = await prisma.modPolo.findMany({
    where: { tenantId, ativo: true, statusCredenciamento: 'CREDENCIADO' },
    select: { id: true, nome: true, cidade: true, uf: true, logradouro: true, numero: true, bairro: true, cep: true, responsavelTelefone: true, responsavelEmail: true },
    orderBy: [{ uf: 'asc' }, { cidade: 'asc' }],
  })
  res.json(items)
}))
publicRouter.use(academicErrorHandler)

// ---------- Jobs periódicos ----------
async function alertarAtosDePolos() {
  const limite = new Date(Date.now() + 180 * 86_400_000)
  const polos = await prisma.modPolo.findMany({ where: { ativo: true, statusCredenciamento: 'CREDENCIADO', atoValidade: { lte: limite } }, take: 500 })
  for (const p of polos) {
    await scheduleReminder({ tenantId: p.tenantId, modulo: 'modalidades', titulo: `Ato de credenciamento do polo ${p.nome} ${p.atoValidade! < new Date() ? 'VENCIDO' : 'vence em breve'}`, dueAt: p.atoValidade!, antecedenciaDias: 180, severity: p.atoValidade! < new Date() ? 'CRITICO' : 'ATENCAO', assigneeRole: 'COORDINATOR', refType: 'ModPolo', refId: p.id, dedupeKey: `mod-polo-ato-${p.id}`, recorrenciaDias: 30 })
  }
  return { polos: polos.length }
}
async function encerrarLives() {
  // lives AO_VIVO/AGENDADA cujo horário já passou há mais de 2h sem encerramento: sinaliza ao professor
  const limite = new Date(Date.now() - 2 * 3_600_000)
  const lives = await prisma.modAulaLive.findMany({ where: { status: { in: ['AGENDADA', 'AO_VIVO'] }, fim: { lt: limite } }, take: 500 })
  for (const l of lives) {
    await scheduleReminder({ tenantId: l.tenantId, modulo: 'modalidades', titulo: `Encerrar aula ao vivo "${l.titulo}" e consolidar presença`, dueAt: l.fim, remindAt: new Date(), severity: 'ATENCAO', assigneeUserId: l.professorUserId ?? undefined, assigneeRole: l.professorUserId ? undefined : 'COORDINATOR', refType: 'ModAulaLive', refId: l.id, dedupeKey: `mod-live-enc-${l.id}` })
  }
  return { pendentes: lives.length }
}
registerEduJob('modalidades.sla-tutoria', () => escalonarAtendimentosVencidos())
registerEduJob('modalidades.inatividade-ava', () => varrerInatividade())
registerEduJob('modalidades.prazos-pos', () => varrerPrazosPos())
registerEduJob('modalidades.atos-polos', () => alertarAtosDePolos())
registerEduJob('modalidades.lives-pendentes', () => encerrarLives())

// Funções exportadas para outros módulos
export { conformidadeCurso } from './common'
export { avaliarConformidade, relacaoAlunoTutor, calcularRiscoEngajamento, calcularPresencaLive, validarLato, calcularPrazosStricto, resumoHorasPraticas } from './rules'
export { getRiscoEvasaoEngajamento, calcularMetricasAluno } from './engajamento'
export { listarOfertasPosPublicadas } from './pos'
