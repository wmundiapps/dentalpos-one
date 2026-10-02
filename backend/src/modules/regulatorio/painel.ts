import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, requireRole } from '../academico/middleware'
import { getBranding, brandHeaderHtml, escapeHtml as esc } from '../core/branding'
import { statusAto, classificarRisco, prontidao } from './rules'
import { READ, WRITE } from './common'

const DAY = 86_400_000
const TIPOS_CURSO = ['PORTARIA_AUTORIZACAO', 'PORTARIA_RECONHECIMENTO', 'PORTARIA_RENOVACAO']

export async function montarPainel(tenantId: string, agora = new Date()) {
  const [programas, atos, processos, checklists, dilig, lembretes] = await Promise.all([
    prisma.academicProgram.findMany({ where: { tenantId }, select: { id: true, nome: true, modalidade: true }, orderBy: { nome: 'asc' }, take: 500 }),
    prisma.regAto.findMany({ where: { tenantId, revogado: false }, orderBy: { dataPublicacao: 'desc' }, take: 3000 }),
    prisma.regProcesso.findMany({ where: { tenantId, etapa: { notIn: ['ARQUIVADO'] } }, orderBy: { updatedAt: 'desc' }, take: 2000 }),
    prisma.regChecklist.findMany({ where: { tenantId }, include: { itens: { select: { status: true, peso: true, obrigatorio: true, prazo: true, dimensao: true } } }, take: 2000 }),
    prisma.regDiligencia.findMany({ where: { tenantId, status: { in: ['ABERTA', 'VENCIDA'] } }, include: { processo: { select: { titulo: true, programId: true } } }, orderBy: { prazoResposta: 'asc' }, take: 500 }),
    prisma.eduReminder.findMany({ where: { tenantId, modulo: 'regulatorio', status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } }, orderBy: { dueAt: 'asc' }, take: 25 }),
  ])
  const abertos = processos.filter((p) => !['PUBLICADO'].includes(p.etapa))
  const dias = (d: Date) => Math.ceil((d.getTime() - agora.getTime()) / DAY)
  const pront = (cls: typeof checklists) => {
    const itens = cls.flatMap((c) => c.itens as any[])
    return itens.length ? prontidao(itens.map((i) => ({ ...i, status: i.status })), agora) : null
  }

  const cursos = programas.map((pg) => {
    const atosC = atos.filter((a) => a.escopo === 'CURSO' && (a.programId === pg.id || (!a.programId && a.cursoNome && a.cursoNome.toLowerCase() === pg.nome.toLowerCase())))
    const principal = atosC.find((a) => TIPOS_CURSO.includes(a.tipo)) ?? atosC[0] ?? null
    const st = principal ? statusAto(principal.vencimento, agora) : null
    const procs = abertos.filter((p) => p.programId === pg.id)
    const cls = checklists.filter((c) => c.programId === pg.id || (c.processoId && procs.some((p) => p.id === c.processoId)))
    const pr = pront(cls)
    const dl = dilig.filter((d) => d.processo.programId === pg.id)
    const diligVenc = dl.filter((d) => d.prazoResposta < agora).length
    const prazos: number[] = []
    if (principal?.vencimento) prazos.push(dias(principal.vencimento))
    for (const p of procs) if (p.etapa === 'PREPARACAO' && p.prazoProtocolo) prazos.push(dias(p.prazoProtocolo))
    for (const d of dl) prazos.push(dias(d.prazoResposta))
    const diasParaPrazo = prazos.length ? Math.min(...prazos) : null
    const r = classificarRisco({ prontidao: pr?.percentual, diasParaPrazo, atoVencido: st?.situacao === 'VENCIDO', diligenciasVencidas: diligVenc, obrigatoriosPendentes: pr?.obrigatoriosPendentes })
    if (!principal) { r.motivos.push('Nenhum ato regulatório (autorização/reconhecimento) registrado para o curso'); if (r.risco === 'BAIXO') r.risco = 'MEDIO' }
    return {
      programId: pg.id, curso: pg.nome, modalidade: pg.modalidade,
      ato: principal ? { id: principal.id, tipo: principal.tipo, numero: principal.numero, vencimento: principal.vencimento, vagasAutorizadas: principal.vagasAutorizadas, situacao: st!.situacao, diasRestantes: st!.diasRestantes } : null,
      processosAbertos: procs.map((p) => ({ id: p.id, tipo: p.tipo, etapa: p.etapa, titulo: p.titulo })),
      prontidao: pr?.percentual ?? null, obrigatoriosPendentes: pr?.obrigatoriosPendentes ?? 0,
      diligenciasAbertas: dl.length, diligenciasVencidas: diligVenc, diasParaPrazo, risco: r.risco, motivosRisco: r.motivos,
    }
  })

  const atosInst = atos.filter((a) => a.escopo === 'INSTITUICAO').map((a) => ({ id: a.id, tipo: a.tipo, numero: a.numero, vencimento: a.vencimento, ...statusAto(a.vencimento, agora) }))
  const contagem: Record<string, number> = { SEM_PRAZO: 0, VIGENTE: 0, RENOVACAO_ABERTA: 0, VENCENDO: 0, VENCIDO: 0 }
  for (const a of atos) contagem[statusAto(a.vencimento, agora).situacao]++

  const proximosPrazos = [
    ...lembretes.map((l) => ({ origem: 'LEMBRETE', titulo: l.titulo, prazo: l.dueAt, dias: dias(l.dueAt), severity: l.severity, refType: l.refType, refId: l.refId })),
    ...dilig.slice(0, 15).map((d) => ({ origem: 'DILIGENCIA', titulo: `Diligência: ${d.processo.titulo}`, prazo: d.prazoResposta, dias: dias(d.prazoResposta), severity: d.prazoResposta < agora ? 'CRITICO' : 'ATENCAO', refType: 'RegDiligencia', refId: d.id })),
    ...abertos.filter((p) => p.etapa === 'PREPARACAO' && p.prazoProtocolo).map((p) => ({ origem: 'PROCESSO', titulo: `Protocolar: ${p.titulo}`, prazo: p.prazoProtocolo!, dias: dias(p.prazoProtocolo!), severity: dias(p.prazoProtocolo!) <= 30 ? 'CRITICO' : 'ATENCAO', refType: 'RegProcesso', refId: p.id })),
  ].sort((a, b) => a.prazo.getTime() - b.prazo.getTime()).slice(0, 30)

  const ordemRisco: Record<string, number> = { CRITICO: 0, ALTO: 1, MEDIO: 2, BAIXO: 3 }
  const riscos = cursos.filter((c) => c.risco !== 'BAIXO').sort((a, b) => ordemRisco[a.risco] - ordemRisco[b.risco])
  const prs = cursos.filter((c) => c.prontidao != null).map((c) => c.prontidao as number)
  return {
    geradoEm: agora,
    resumo: {
      cursos: cursos.length, atos: atos.length, atosPorSituacao: contagem, processosAbertos: abertos.filter((p) => p.etapa !== 'PUBLICADO').length,
      diligenciasAbertas: dilig.length, diligenciasVencidas: dilig.filter((d) => d.prazoResposta < agora).length,
      prontidaoMedia: prs.length ? Math.round((prs.reduce((s, v) => s + v, 0) / prs.length) * 10) / 10 : null,
      cursosEmRisco: { CRITICO: cursos.filter((c) => c.risco === 'CRITICO').length, ALTO: cursos.filter((c) => c.risco === 'ALTO').length, MEDIO: cursos.filter((c) => c.risco === 'MEDIO').length },
    },
    atosInstitucionais: atosInst, cursos, proximosPrazos, riscos,
  }
}

export function mountPainel(router: Router) {
  const guard = requireRole(...READ, ...WRITE)

  router.get('/painel', guard, asyncHandler(async (req: AuthenticatedRequest, res: Response) => res.json(await montarPainel(getTenantId(req)))))

  router.get(
    '/alertas',
    guard,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const status = String(req.query.status || 'abertos')
      const where: any = { tenantId, modulo: 'regulatorio', status: status === 'todos' ? undefined : { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } }
      const items = await prisma.eduReminder.findMany({ where, orderBy: { dueAt: 'asc' }, take: 200 })
      res.json({ items, total: items.length })
    }),
  )

  // Relatório de situação regulatória (HTML imprimível, com cabeçalho/logomarca da instituição)
  router.get(
    '/relatorios/situacao.html',
    guard,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const [p, b] = await Promise.all([montarPainel(tenantId), getBranding(tenantId)])
      const fd = (d: any) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—')
      const cor: Record<string, string> = { CRITICO: '#b91c1c', ALTO: '#c2410c', MEDIO: '#a16207', BAIXO: '#15803d' }
      const linhas = p.cursos
        .map((c) => `<tr><td>${esc(c.curso)}</td><td>${esc(c.ato ? `${c.ato.tipo.replace(/_/g, ' ')} ${c.ato.numero}` : 'sem ato')}</td><td>${fd(c.ato?.vencimento)}</td><td>${esc(c.ato?.situacao ?? '—')}</td><td>${c.prontidao ?? '—'}${c.prontidao != null ? '%' : ''}</td><td style="color:${cor[c.risco]};font-weight:700">${c.risco}</td><td>${esc(c.motivosRisco.join('; '))}</td></tr>`)
        .join('')
      const prazos = p.proximosPrazos.map((x) => `<li>${fd(x.prazo)} (${x.dias}d) — ${esc(x.titulo)}</li>`).join('')
      res.type('html').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Situação regulatória</title>
<style>body{font-family:Arial,sans-serif;color:#0f172a;margin:0}main{padding:24px 28px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f1f5f9}.k{display:inline-block;margin:0 16px 8px 0}@media print{main{padding:8px}}</style></head><body>
${brandHeaderHtml(b, { titulo: 'Situação Regulatória', subtitulo: `Emitido em ${fd(p.geradoEm)}` })}
<main>
<p><span class="k"><b>${p.resumo.cursos}</b> cursos</span><span class="k"><b>${p.resumo.atos}</b> atos</span><span class="k"><b>${p.resumo.atosPorSituacao.VENCENDO}</b> vencendo</span><span class="k"><b>${p.resumo.atosPorSituacao.VENCIDO}</b> vencidos</span><span class="k"><b>${p.resumo.processosAbertos}</b> processos abertos</span><span class="k"><b>${p.resumo.diligenciasAbertas}</b> diligências abertas</span><span class="k">prontidão média <b>${p.resumo.prontidaoMedia ?? '—'}</b></span></p>
<table><thead><tr><th>Curso</th><th>Ato</th><th>Vencimento</th><th>Situação</th><th>Prontidão</th><th>Risco</th><th>Motivos</th></tr></thead><tbody>${linhas}</tbody></table>
<h3>Próximos prazos</h3><ul>${prazos || '<li>Nenhum prazo em aberto.</li>'}</ul>
<p style="font-size:11px;color:#64748b">Documento gerencial interno. Os indicadores simulados (CPC/CC) não têm valor oficial; confira atos e prazos no e-MEC.</p>
</main></body></html>`)
    }),
  )
}
