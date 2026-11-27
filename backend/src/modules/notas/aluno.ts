import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, requireRole } from '../academico/middleware'
import { qs } from '../core/crud'
import { getBranding, brandHeaderHtml, escapeHtml as esc } from '../core/branding'
import { getBoletimAluno, getHistoricoAluno } from './service'
import { SITUACAO_LABEL, Situacao } from './calc'
import { assertAcessoAluno, minhaStudentId, httpErr } from './common'

const router = Router()
const ALL = ['STUDENT', 'TEACHER', 'COORDINATOR', 'SECRETARY'] as const

// Atalhos do aluno logado
router.get('/meu/boletim', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = await getBoletimAluno(getTenantId(req), minhaStudentId(req), qs(req.query.termId))
  if (!b) throw httpErr(404, 'Aluno não encontrado.')
  res.json(b)
}))

router.get('/meu/historico', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const h = await getHistoricoAluno(getTenantId(req), minhaStudentId(req))
  if (!h) throw httpErr(404, 'Aluno não encontrado.')
  res.json(h)
}))

router.get('/alunos/:studentId/boletim', requireRole(...ALL), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const studentId = String(req.params.studentId)
  await assertAcessoAluno(req, studentId)
  const b = await getBoletimAluno(getTenantId(req), studentId, qs(req.query.termId))
  if (!b) throw httpErr(404, 'Aluno não encontrado.')
  res.json(b)
}))

router.get('/alunos/:studentId/historico', requireRole(...ALL), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const studentId = String(req.params.studentId)
  await assertAcessoAluno(req, studentId)
  const h = await getHistoricoAluno(getTenantId(req), studentId)
  if (!h) throw httpErr(404, 'Aluno não encontrado.')
  res.json(h)
}))

// Histórico escolar imprimível (cabeçalho com logomarca da instituição). Documento oficial é emitido pela secretaria.
router.get('/alunos/:studentId/historico.html', requireRole(...ALL), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const studentId = String(req.params.studentId)
  await assertAcessoAluno(req, studentId)
  const [h, brand] = await Promise.all([getHistoricoAluno(tenantId, studentId), getBranding(tenantId)])
  if (!h) throw httpErr(404, 'Aluno não encontrado.')
  const cor = esc(brand.cores.primaria)
  const blocos = h.periodos.map((p) => `<h3 style="color:${cor};margin:18px 0 6px">Período letivo ${esc(p.periodoLetivo)} <small style="color:#64748b">CR do período: ${p.cr ?? '—'}</small></h3>
<table><thead><tr><th style="text-align:left">Disciplina</th><th>CH</th><th>Média final</th><th>Freq.</th><th>Situação</th></tr></thead><tbody>
${p.disciplinas.map((d: any) => `<tr><td style="text-align:left">${esc(d.disciplina)}</td><td>${d.cargaHoraria}</td><td>${d.mediaFinal ?? '—'}</td><td>${d.frequenciaPct != null ? d.frequenciaPct + '%' : '—'}</td><td>${esc(SITUACAO_LABEL[d.situacao as Situacao])}</td></tr>`).join('')}</tbody></table>`).join('')
  const pend = h.obrigatoriasPendentes.length ? `<h3 style="color:${cor}">Disciplinas obrigatórias a cursar</h3><p style="font-size:12px">${h.obrigatoriasPendentes.map((p) => esc(p.disciplina)).join(' · ')}</p>` : ''
  res.type('html').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Histórico escolar — ${esc(h.aluno.nomeCompleto)}</title>
<style>body{font-family:Arial,sans-serif;margin:0;color:#0f172a}main{padding:20px 28px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #cbd5e1;padding:5px 8px;text-align:center}th{background:${cor};color:#fff}@media print{@page{size:A4;margin:12mm}}</style></head><body>
${brandHeaderHtml(brand, { titulo: 'Histórico Escolar', subtitulo: h.programas.map((p) => p.nome).join(' / ') })}
<main><p style="font-size:13px"><b>${esc(h.aluno.nomeCompleto)}</b> · RA ${esc(h.aluno.ra)}${h.aluno.cpf ? ' · CPF ' + esc(h.aluno.cpf) : ''}</p>
${blocos || '<p>Nenhuma disciplina cursada.</p>'}
<p style="font-size:13px;margin-top:18px"><b>CR geral:</b> ${h.crGeral ?? '—'} · <b>Carga horária integralizada:</b> ${h.cargaHoraria.integralizada}h de ${h.cargaHoraria.matriz}h (${h.cargaHoraria.percentual ?? '—'}%)</p>${pend}
<p style="font-size:10px;color:#64748b;margin-top:30px">Documento para conferência, emitido em ${new Date().toLocaleString('pt-BR')}. O histórico oficial é emitido e assinado pela Secretaria Acadêmica.</p></main></body></html>`)
}))

export default router
