import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, requireRole } from '../academico/middleware'
import { brandHeaderHtml, escapeHtml as esc, getBranding } from '../core/branding'
import { pageParams, qs } from '../core/crud'
import { SEC_LEITURA, carregarAluno } from './common'
import { montarHistorico } from './documentos'
import { mascararCpf } from './logic'

// ============================================================
// SITUAÇÃO DO ALUNO — visão consolidada para consulta do admin/secretaria
// ============================================================

export async function situacaoDoAluno(tenantId: string, studentId: string) {
  const { student, matriculas } = await carregarAluno(tenantId, studentId)
  const agora = new Date()
  const [protocolos, conferencias, certificados, diplomas, documentos, hist] = await Promise.all([
    prisma.secProtocolo.findMany({ where: { tenantId, studentId }, include: { tipo: { select: { nome: true } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.secConferencia.findMany({ where: { tenantId, studentId, status: { in: ['EM_ANDAMENTO', 'PENDENTE'] } }, select: { id: true, titulo: true, status: true } }),
    prisma.secCertificado.count({ where: { tenantId, studentId, status: 'EMITIDO' } }),
    prisma.secDiploma.findMany({ where: { tenantId, studentId }, select: { id: true, tipo: true, status: true, numeroRegistro: true } }),
    prisma.secDocumentoEmitido.count({ where: { tenantId, studentId, cancelado: false } }),
    montarHistorico(tenantId, studentId).catch(() => null),
  ])
  let financeiro = { titulosEmAberto: 0, titulosVencidos: 0, valorVencido: 0 }
  try {
    const t = await prisma.accountReceivable.findMany({ where: { tenantId, studentId, status: { in: ['PENDENTE', 'ATRASADO'] } }, select: { valor: true, dataVencimento: true } })
    const venc = t.filter((x) => x.dataVencimento < agora)
    financeiro = { titulosEmAberto: t.length, titulosVencidos: venc.length, valorVencido: Math.round(venc.reduce((s, x) => s + x.valor, 0) * 100) / 100 }
  } catch { /* financeiro indisponível */ }
  const pendencias: string[] = []
  if (financeiro.titulosVencidos) pendencias.push(`${financeiro.titulosVencidos} título(s) financeiro(s) vencido(s) (R$ ${financeiro.valorVencido.toFixed(2)})`)
  const abertos = protocolos.filter((p) => ['ABERTO', 'EM_ANALISE', 'PENDENTE_DOCUMENTO'].includes(p.status))
  for (const p of abertos.filter((x) => x.status === 'PENDENTE_DOCUMENTO')) pendencias.push(`Protocolo ${p.numero} aguardando documentos do aluno`)
  for (const c of conferencias) pendencias.push(`Conferência documental "${c.titulo}" ${c.status}`)
  if (['TRANCADO', 'CANCELADO', 'DESISTENTE'].includes(student.status)) pendencias.push(`Situação acadêmica: ${student.status}`)
  return {
    aluno: { id: student.id, nome: student.nomeCompleto, ra: student.ra, cpf: mascararCpf(student.cpf) ?? student.cpf, status: student.status },
    matriculas: matriculas.map((m) => ({ id: m.id, curso: m.program.nome, modalidade: m.program.modalidade, periodoLetivo: m.term.codigo, status: m.status, dataMatricula: m.dataMatricula })),
    academico: hist ? { ...hist.resumo, fonteNotas: hist.fonteNotas } : null,
    financeiro,
    secretaria: {
      protocolosAbertos: abertos.map((p) => ({ id: p.id, numero: p.numero, tipo: p.tipo.nome, status: p.status, prazoEm: p.prazoEm })),
      protocolosTotal: protocolos.length,
      conferenciasPendentes: conferencias,
      certificadosEmitidos: certificados,
      documentosEmitidos: documentos,
      diplomas,
    },
    pendencias,
    regular: pendencias.length === 0,
  }
}

export function mountSituacao(router: Router) {
  // Busca de aluno por nome, RA ou CPF (dados mínimos).
  router.get('/alunos', requireRole(...SEC_LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const q = qs(req.query.q)
    const where: any = { tenantId }
    if (q) where.OR = [{ nomeCompleto: { contains: q, mode: 'insensitive' } }, { ra: { contains: q } }, { cpf: { contains: q.replace(/\D/g, '') || q } }]
    const status = qs(req.query.status)
    if (status) where.status = status
    const [items, total] = await Promise.all([prisma.student.findMany({ where, select: { id: true, nomeCompleto: true, ra: true, status: true }, orderBy: { nomeCompleto: 'asc' }, skip, take }), prisma.student.count({ where })])
    res.json({ items, total, page, pageSize })
  }))

  router.get('/alunos/:studentId/situacao', requireRole(...SEC_LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await situacaoDoAluno(getTenantId(req), String(req.params.studentId)))
  }))

  // Declaração de situação do aluno (impressão) para consulta administrativa.
  router.get('/alunos/:studentId/situacao/html', requireRole(...SEC_LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const s = await situacaoDoAluno(tenantId, String(req.params.studentId))
    const b = await getBranding(tenantId)
    const li = (a: string[]) => (a.length ? `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p>Nenhuma pendência.</p>')
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Situação do aluno</title><style>body{font-family:Georgia,serif;max-width:820px;margin:20px auto;color:#0f172a;line-height:1.6}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #cbd5e1;padding:5px 7px;text-align:left}th{background:#f1f5f9}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Imprimir</button>${brandHeaderHtml(b, { titulo: 'Declaração de situação do aluno', subtitulo: `Emitida em ${new Date().toLocaleString('pt-BR')} (uso interno)` })}
<h3>${esc(s.aluno.nome)} — RA ${esc(s.aluno.ra)}</h3><p>Situação acadêmica: <b>${esc(s.aluno.status)}</b> — ${s.regular ? '<b style="color:#15803d">REGULAR</b>' : '<b style="color:#b91c1c">COM PENDÊNCIAS</b>'}</p>
<table><thead><tr><th>Curso</th><th>Modalidade</th><th>Período</th><th>Status</th></tr></thead><tbody>${s.matriculas.map((m) => `<tr><td>${esc(m.curso)}</td><td>${esc(m.modalidade)}</td><td>${esc(m.periodoLetivo)}</td><td>${esc(m.status)}</td></tr>`).join('')}</tbody></table>
${s.academico ? `<p>Carga horária integralizada: <b>${s.academico.cargaHorariaCursada}h</b> · Aprovadas: ${s.academico.disciplinasAprovadas} · Em curso: ${s.academico.disciplinasEmCurso} · CR: ${s.academico.coeficienteRendimento ?? '—'}</p>` : ''}
<h4>Pendências</h4>${li(s.pendencias)}<p>Protocolos em aberto: ${s.secretaria.protocolosAbertos.length} · Certificados: ${s.secretaria.certificadosEmitidos} · Documentos emitidos: ${s.secretaria.documentosEmitidos}</p></body></html>`)
  }))
}
