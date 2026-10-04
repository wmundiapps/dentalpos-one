import { Prisma } from '@prisma/client'
import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { Branding, brandHeaderHtml, escapeHtml as esc, getBranding } from '../core/branding'
import { audit } from '../core/notify'
import { MODULO, SEC, SEC_GESTAO, SEC_LEITURA, carregarAluno, escolherMatricula, exigirAluno, urlVerificacao } from './common'
import { LinhaHistorico, dataExtenso, gerarCodigoVerificacao, normalizarSituacao, resumoHistorico, sha256, situacaoDisciplina } from './logic'

// ============================================================
// DOCUMENTOS ACADÊMICOS EM HTML IMPRIMÍVEL
// ============================================================

export const TIPOS_DOCUMENTO = {
  DECLARACAO_MATRICULA: { nome: 'Declaração de matrícula', validadeDias: 30 },
  DECLARACAO_VINCULO: { nome: 'Declaração de vínculo e frequência', validadeDias: 30 },
  HISTORICO_ESCOLAR: { nome: 'Histórico escolar', validadeDias: 90 },
  COMPROVANTE_CONCLUSAO: { nome: 'Comprovante de conclusão de curso', validadeDias: 180 },
} as const
export type TipoDocumento = keyof typeof TIPOS_DOCUMENTO

// ---------- dados acadêmicos ----------

let notasCache: { model: string; campos: Record<string, string | undefined> } | null | undefined

// O módulo `notas` (tabelas NtXxx) é opcional: descobre dinamicamente, via DMMF, um model com
// studentId + campo de nota final. Tolerante à ausência.
function descobrirModeloNotas() {
  if (notasCache !== undefined) return notasCache
  notasCache = null
  try {
    const models = (Prisma as any).dmmf?.datamodel?.models ?? []
    const pref = ['mediaFinal', 'notaFinal', 'media', 'nota']
    let melhor: { model: string; campos: Record<string, string | undefined>; score: number } | null = null
    for (const m of models) {
      if (!/^Nt/.test(m.name)) continue
      const f: string[] = m.fields.map((x: any) => x.name)
      if (!f.includes('studentId') || !f.includes('tenantId')) continue
      const nota = pref.find((p) => f.includes(p))
      if (!nota) continue
      const ligacao = f.includes('classSectionId') ? 'classSectionId' : f.includes('disciplineId') ? 'disciplineId' : undefined
      if (!ligacao) continue
      const score = (/Final|Media|Resultado|Boletim/i.test(m.name) ? 5 : 0) + (f.includes('mediaFinal') || f.includes('notaFinal') ? 3 : 0)
      if (!melhor || score > melhor.score)
        melhor = {
          model: m.name.charAt(0).toLowerCase() + m.name.slice(1),
          score,
          campos: {
            nota,
            ligacao,
            situacao: ['situacao', 'resultado', 'status'].find((x) => f.includes(x)),
            frequencia: ['frequencia', 'frequenciaPct', 'percentualFrequencia', 'freq'].find((x) => f.includes(x)),
          },
        }
    }
    if (melhor) notasCache = { model: melhor.model, campos: melhor.campos }
  } catch {
    notasCache = null
  }
  return notasCache
}

export async function montarHistorico(tenantId: string, studentId: string, enrollmentId?: string | null) {
  const { student, matriculas } = await carregarAluno(tenantId, studentId)
  const matricula = escolherMatricula(matriculas, enrollmentId)
  const idsMatricula = enrollmentId ? [enrollmentId] : matriculas.map((m) => m.id)
  const vinculos = idsMatricula.length
    ? await prisma.classSectionEnrollment.findMany({
        where: { enrollmentId: { in: idsMatricula } },
        include: { classSection: { include: { discipline: true, term: true } } },
      })
    : []

  // Notas do módulo `notas` (se existir)
  const notasPorTurma = new Map<string, { nota?: number; situacao?: string; freq?: number }>()
  const notasPorDisc = new Map<string, { nota?: number; situacao?: string; freq?: number }>()
  const desc = descobrirModeloNotas()
  if (desc) {
    try {
      const rows: any[] = await (prisma as any)[desc.model].findMany({ where: { tenantId, studentId }, take: 2000 })
      for (const r of rows) {
        const v = Number(r[desc.campos.nota!])
        const item = { nota: Number.isFinite(v) ? v : undefined, situacao: desc.campos.situacao ? String(r[desc.campos.situacao] ?? '') : undefined, freq: desc.campos.frequencia && r[desc.campos.frequencia] != null ? Number(r[desc.campos.frequencia]) : undefined }
        const key = r[desc.campos.ligacao!]
        if (key) (desc.campos.ligacao === 'classSectionId' ? notasPorTurma : notasPorDisc).set(String(key), item)
      }
    } catch {
      /* módulo notas indisponível: usa fallback do núcleo */
    }
  }

  // Fallback do núcleo: média das tentativas finalizadas por disciplina + frequência por turma.
  const tentativas = await prisma.assessmentAttempt.findMany({
    where: { studentId, finalizadoEm: { not: null }, notaFinal: { not: null } },
    include: { assessment: { select: { disciplineId: true, classSectionId: true } } },
    take: 5000,
  })
  const notaPorDisc = new Map<string, number[]>()
  for (const t of tentativas) {
    const k = t.assessment.disciplineId
    notaPorDisc.set(k, [...(notaPorDisc.get(k) ?? []), t.notaFinal as number])
  }
  const sessoes = vinculos.length
    ? await prisma.classSession.findMany({ where: { classSectionId: { in: vinculos.map((v) => v.classSectionId) }, status: 'REALIZADA' }, select: { id: true, classSectionId: true } })
    : []
  const presencas = sessoes.length ? await prisma.attendance.findMany({ where: { studentId, classSessionId: { in: sessoes.map((s) => s.id) } }, select: { classSessionId: true, presente: true } }) : []
  const presMap = new Map(presencas.map((p) => [p.classSessionId, p.presente]))

  const linhas: LinhaHistorico[] = vinculos.map((v) => {
    const cs = v.classSection
    const nt = notasPorTurma.get(cs.id) ?? notasPorDisc.get(cs.disciplineId)
    const arr = notaPorDisc.get(cs.disciplineId)
    const notaCore = arr?.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : undefined
    const nota = nt?.nota ?? notaCore ?? null
    const ss = sessoes.filter((s) => s.classSectionId === cs.id)
    const freq = nt?.freq ?? (ss.length ? Math.round((ss.filter((s) => presMap.get(s.id) === true).length / ss.length) * 100) : null)
    const sit = normalizarSituacao(nt?.situacao) ?? situacaoDisciplina(nota, freq)
    return { disciplina: cs.discipline.nome, periodo: cs.term.codigo, cargaHoraria: cs.discipline.cargaHoraria, nota, frequencia: freq, situacao: sit }
  })
  linhas.sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)) || a.disciplina.localeCompare(b.disciplina))
  return { student, matricula, matriculas, linhas, resumo: resumoHistorico(linhas), fonteNotas: desc ? `módulo notas (${desc.model})` : 'avaliações do núcleo acadêmico' }
}

// ---------- HTML ----------

const fmtData = (d?: Date | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—')

function paginaHtml(b: Branding, opts: { titulo: string; subtitulo?: string; corpo: string; codigo: string; url: string; assinaturas?: Array<{ nome: string; cargo: string }>; emitidoEm: Date }) {
  const assin = (opts.assinaturas ?? [{ nome: b.reitorNome || '____________________', cargo: b.reitorCargo || 'Secretaria Acadêmica' }])
    .map((a) => `<div class="ass"><div class="linha"></div><div><b>${esc(a.nome)}</b></div><div class="mut">${esc(a.cargo)}</div></div>`)
    .join('')
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(opts.titulo)} — ${esc(b.nome)}</title>
<style>
 @page{size:A4;margin:14mm}
 body{margin:0;background:#eef1f6;font-family:Georgia,'Times New Roman',serif;color:#0f172a}
 .folha{max-width:820px;margin:18px auto;background:#fff;box-shadow:0 2px 12px #0002;min-height:1000px;position:relative}
 .corpo{padding:28px 44px;font-size:15px;line-height:1.7;text-align:justify}
 .corpo h2{font-size:17px;color:${esc(b.cores.secundaria)};margin:18px 0 6px}
 table{width:100%;border-collapse:collapse;font-size:12.5px;margin:10px 0}
 th,td{border:1px solid #cbd5e1;padding:5px 7px;text-align:left}
 th{background:#f1f5f9}
 .mut{color:#64748b;font-size:12px}
 .assinaturas{display:flex;gap:40px;justify-content:center;margin:48px 40px 16px;flex-wrap:wrap}
 .ass{text-align:center;min-width:240px;font-size:13px}.ass .linha{border-top:1px solid #0f172a;margin-bottom:4px}
 footer{border-top:1px solid #cbd5e1;padding:12px 44px;display:flex;gap:16px;align-items:center;font:11px sans-serif;color:#475569}
 #qr{width:84px;height:84px;flex:none}
 .barra{max-width:820px;margin:10px auto;text-align:right;font:13px sans-serif}
 @media print{body{background:#fff}.folha{box-shadow:none;margin:0;max-width:none}.barra{display:none}}
</style></head><body>
<div class="barra"><button onclick="window.print()">Imprimir / salvar PDF</button></div>
<div class="folha">
${brandHeaderHtml(b, { titulo: opts.titulo, subtitulo: opts.subtitulo })}
<div class="corpo">${opts.corpo}
<p class="mut" style="text-align:right">${esc(b.endereco?.split(',').slice(-2, -1)[0]?.trim() || '')}${b.endereco ? ', ' : ''}${esc(dataExtenso(opts.emitidoEm))}.</p>
<div class="assinaturas">${assin}</div></div>
<footer><div id="qr" data-url="${esc(opts.url)}"></div>
<div>Documento emitido eletronicamente em ${opts.emitidoEm.toLocaleString('pt-BR')}.<br/>Autenticidade: acesse <b>${esc(opts.url)}</b> e informe o código <b style="font-size:13px">${esc(opts.codigo)}</b>.</div></footer>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<script>try{var q=document.getElementById('qr');new QRCode(q,{text:q.dataset.url,width:84,height:84})}catch(e){}</script>
</body></html>`
}

export interface DocumentoGerado {
  tipo: TipoDocumento
  titulo: string
  html: string
  codigo: string
  validoAte: Date
}

export async function renderDocumento(p: { tenantId: string; tipo: TipoDocumento; studentId: string; enrollmentId?: string | null; codigo?: string; emitidoEm?: Date }): Promise<DocumentoGerado> {
  const def = TIPOS_DOCUMENTO[p.tipo]
  if (!def) throw Object.assign(new Error('Tipo de documento desconhecido.'), { status: 400 })
  const emitidoEm = p.emitidoEm ?? new Date()
  const codigo = p.codigo ?? gerarCodigoVerificacao()
  const h = await montarHistorico(p.tenantId, p.studentId, p.enrollmentId)
  const b = await getBranding(p.tenantId)
  const { student, matricula } = h
  const curso = matricula?.program
  const nome = esc(student.nomeCompleto)
  const cpf = student.cpf ? `, inscrito(a) no CPF sob o nº ${esc(student.cpf)}` : ''
  const ident = `<b>${nome}</b>${cpf}, registro acadêmico (RA) <b>${esc(student.ra)}</b>`
  let corpo = ''

  if (p.tipo === 'DECLARACAO_MATRICULA') {
    if (!matricula) throw Object.assign(new Error('Aluno sem matrícula registrada.'), { status: 409 })
    if (matricula.status !== 'ATIVA') throw Object.assign(new Error(`Matrícula não está ativa (${matricula.status}); não é possível declarar matrícula.`), { status: 409 })
    corpo = `<p>Declaramos, para os devidos fins, que ${ident}, está regularmente <b>matriculado(a)</b> no curso de <b>${esc(curso?.nome)}</b>, modalidade <b>${esc(curso?.modalidade)}</b>, no período letivo <b>${esc(matricula.term.codigo)}</b> (${fmtData(matricula.term.dataInicio)} a ${fmtData(matricula.term.dataFim)}), com carga horária total do curso de ${esc(curso?.cargaHorariaTotal)} horas, tendo ingressado em ${fmtData(matricula.dataMatricula)}.</p>
<p class="mut">Esta declaração tem validade de ${def.validadeDias} dias a contar da data de emissão.</p>`
  } else if (p.tipo === 'DECLARACAO_VINCULO') {
    const emCurso = h.linhas.filter((l) => l.situacao === 'EM CURSO' || l.situacao === 'APROVADO' || l.situacao.startsWith('REPROVADO'))
    const comFreq = h.linhas.filter((l) => l.frequencia != null)
    const freqMedia = comFreq.length ? Math.round(comFreq.reduce((s, l) => s + (l.frequencia as number), 0) / comFreq.length) : null
    corpo = `<p>Declaramos que ${ident}, possui <b>vínculo ${matricula?.status === 'ATIVA' ? 'ativo' : 'não ativo (' + esc(matricula?.status ?? student.status) + ')'}</b> com esta Instituição${curso ? `, no curso de <b>${esc(curso.nome)}</b> (${esc(curso.modalidade)})` : ''}, situação acadêmica geral: <b>${esc(student.status)}</b>.</p>
<p>${freqMedia != null ? `A frequência média apurada nas disciplinas cursadas é de <b>${freqMedia}%</b> (mínimo regimental de 75%).` : 'Não há registros de frequência consolidados até a presente data.'} ${emCurso.length ? `Disciplinas vinculadas: ${emCurso.length}.` : ''}</p>
<p class="mut">Validade: ${def.validadeDias} dias.</p>`
  } else if (p.tipo === 'HISTORICO_ESCOLAR') {
    const r = h.resumo
    const linhas = h.linhas
      .map((l) => `<tr><td>${esc(l.periodo)}</td><td>${esc(l.disciplina)}</td><td>${l.cargaHoraria}</td><td>${l.nota != null ? Number(l.nota).toFixed(1).replace('.', ',') : '—'}</td><td>${l.frequencia != null ? l.frequencia + '%' : '—'}</td><td>${esc(l.situacao)}</td></tr>`)
      .join('')
    corpo = `<p style="text-align:left"><b>Aluno(a):</b> ${nome} &nbsp; <b>RA:</b> ${esc(student.ra)}${student.cpf ? ` &nbsp; <b>CPF:</b> ${esc(student.cpf)}` : ''}${student.dataNascimento ? ` &nbsp; <b>Nascimento:</b> ${fmtData(student.dataNascimento)}` : ''}<br/>
<b>Curso:</b> ${esc(curso?.nome ?? '—')} (${esc(curso?.modalidade ?? '—')}) &nbsp; <b>Ingresso:</b> ${fmtData(matricula?.dataMatricula)} &nbsp; <b>Situação:</b> ${esc(student.status)}</p>
<table><thead><tr><th>Período</th><th>Disciplina</th><th>CH</th><th>Nota</th><th>Freq.</th><th>Situação</th></tr></thead><tbody>${linhas || '<tr><td colspan="6">Sem disciplinas registradas.</td></tr>'}</tbody></table>
<p style="text-align:left"><b>Carga horária integralizada:</b> ${r.cargaHorariaCursada}h${curso ? ` de ${curso.cargaHorariaTotal}h` : ''} &nbsp; <b>Aprovadas:</b> ${r.disciplinasAprovadas} &nbsp; <b>Em curso:</b> ${r.disciplinasEmCurso} &nbsp; <b>Reprovadas:</b> ${r.disciplinasReprovadas} &nbsp; <b>Coef. de rendimento:</b> ${r.coeficienteRendimento != null ? r.coeficienteRendimento.toFixed(2).replace('.', ',') : '—'}</p>
<p class="mut">Fonte das notas: ${esc(h.fonteNotas)}.</p>`
  } else {
    const r = h.resumo
    const concluiu = ['CONCLUIDO', 'FORMADO'].includes(student.status) || matricula?.status === 'CONCLUIDA'
    if (!concluiu) throw Object.assign(new Error('O aluno ainda não consta como concluinte.'), { status: 409 })
    corpo = `<p>Declaramos que ${ident}, <b>concluiu</b> todas as atividades curriculares do curso de <b>${esc(curso?.nome)}</b>, tendo integralizado <b>${r.cargaHorariaCursada}</b> horas${r.coeficienteRendimento != null ? ` com coeficiente de rendimento ${r.coeficienteRendimento.toFixed(2).replace('.', ',')}` : ''}, restando apenas a colação de grau e o registro do diploma, caso ainda não realizados.</p>
<p class="mut">Este comprovante não substitui o diploma. Validade: ${def.validadeDias} dias.</p>`
  }

  const html = paginaHtml(b, { titulo: def.nome, subtitulo: curso?.nome, corpo, codigo, url: urlVerificacao(codigo), emitidoEm })
  return { tipo: p.tipo, titulo: def.nome, html, codigo, validoAte: new Date(emitidoEm.getTime() + def.validadeDias * 86_400_000) }
}

// Gera e registra o documento (código de verificação único + SHA-256).
export async function emitirDocumento(p: { tenantId: string; tipo: string; studentId: string; enrollmentId?: string | null; protocoloId?: string | null; userId?: string }) {
  const tipo = String(p.tipo).toUpperCase() as TipoDocumento
  for (let i = 0; i < 4; i++) {
    const doc = await renderDocumento({ tenantId: p.tenantId, tipo, studentId: p.studentId, enrollmentId: p.enrollmentId })
    try {
      const row = await prisma.secDocumentoEmitido.create({
        data: { tenantId: p.tenantId, tipo, studentId: p.studentId, protocoloId: p.protocoloId ?? undefined, codigo: doc.codigo, hash: sha256(doc.html), html: doc.html, validoAte: doc.validoAte, emitidoPorId: p.userId },
      })
      await audit({ tenantId: p.tenantId, userId: p.userId, modulo: MODULO, acao: 'DOCUMENTO_EMITIDO', refType: 'SecDocumentoEmitido', refId: row.id, detalhes: { tipo, studentId: p.studentId } })
      return row
    } catch (e: any) {
      if (e?.code !== 'P2002') throw e // colisão de código: tenta outro
    }
  }
  throw Object.assign(new Error('Falha ao gerar código de verificação.'), { status: 503 })
}

const docSchema = z.object({ tipo: z.enum(['DECLARACAO_MATRICULA', 'DECLARACAO_VINCULO', 'HISTORICO_ESCOLAR', 'COMPROVANTE_CONCLUSAO']), studentId: z.string().min(1), enrollmentId: z.string().optional(), protocoloId: z.string().optional() })

function sendHtml(res: Response, html: string) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(html)
}

export function mountDocumentos(router: Router) {
  router.get('/documentos/tipos', requireRole(...SEC_LEITURA, 'STUDENT'), (_req, res) => {
    res.json(Object.entries(TIPOS_DOCUMENTO).map(([codigo, d]) => ({ codigo, ...d })))
  })

  // Pré-visualização (não grava). ?formato=html devolve a página pronta para imprimir/PDF.
  router.post(
    '/documentos/preview',
    requireRole(...SEC),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const b = parseBody(docSchema, req.body)
      const doc = await renderDocumento({ tenantId, tipo: b.tipo, studentId: b.studentId, enrollmentId: b.enrollmentId, codigo: 'PRE-VISUALIZACAO' })
      if (qs(req.query.formato) === 'html') return sendHtml(res, doc.html)
      res.json({ titulo: doc.titulo, html: doc.html })
    }),
  )

  router.post(
    '/documentos/emitir',
    requireRole(...SEC),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const b = parseBody(docSchema, req.body)
      const row = await emitirDocumento({ tenantId, ...b, userId: getUserId(req) })
      if (qs(req.query.formato) === 'html') return sendHtml(res, row.html)
      res.status(201).json(row)
    }),
  )

  router.get(
    '/documentos',
    requireRole(...SEC_LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId }
      for (const f of ['tipo', 'studentId', 'protocoloId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
      const [items, total] = await Promise.all([
        prisma.secDocumentoEmitido.findMany({ where, select: { id: true, tipo: true, studentId: true, codigo: true, hash: true, validoAte: true, cancelado: true, createdAt: true, protocoloId: true }, orderBy: { createdAt: 'desc' }, skip, take }),
        prisma.secDocumentoEmitido.count({ where }),
      ])
      res.json({ items, total, page, pageSize })
    }),
  )

  router.get(
    '/documentos/:id/html',
    requireRole(...SEC_LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const d = await prisma.secDocumentoEmitido.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
      if (!d) return res.status(404).json({ error: 'Documento não encontrado.' })
      sendHtml(res, d.html)
    }),
  )

  router.post(
    '/documentos/:id/cancelar',
    requireRole(...SEC_GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = await prisma.secDocumentoEmitido.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!d) return res.status(404).json({ error: 'Documento não encontrado.' })
      await prisma.secDocumentoEmitido.update({ where: { id: d.id }, data: { cancelado: true } })
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'DOCUMENTO_CANCELADO', refType: 'SecDocumentoEmitido', refId: d.id })
      res.json({ ok: true })
    }),
  )

  // Portal: autoatendimento de declarações (limite diário).
  router.post(
    '/portal/documentos/emitir',
    requireRole('STUDENT'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const studentId = exigirAluno(req)
      const b = parseBody(z.object({ tipo: z.enum(['DECLARACAO_MATRICULA', 'DECLARACAO_VINCULO']), enrollmentId: z.string().optional() }), req.body)
      const hoje = await prisma.secDocumentoEmitido.count({ where: { tenantId, studentId, createdAt: { gte: new Date(Date.now() - 86_400_000) }, emitidoPorId: req.user!.id } })
      if (hoje >= 5) return res.status(429).json({ error: 'Limite diário de emissões atingido. Abra um requerimento.' })
      const row = await emitirDocumento({ tenantId, tipo: b.tipo, studentId, enrollmentId: b.enrollmentId, userId: req.user!.id })
      if (qs(req.query.formato) === 'html') return sendHtml(res, row.html)
      res.status(201).json({ id: row.id, codigo: row.codigo, tipo: row.tipo, validoAte: row.validoAte, html: row.html })
    }),
  )

  router.get(
    '/portal/documentos',
    requireRole('STUDENT'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const studentId = exigirAluno(req)
      res.json(await prisma.secDocumentoEmitido.findMany({ where: { tenantId: getTenantId(req), studentId, cancelado: false }, select: { id: true, tipo: true, codigo: true, validoAte: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 100 }))
    }),
  )

  router.get(
    '/portal/documentos/:id/html',
    requireRole('STUDENT'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const d = await prisma.secDocumentoEmitido.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req), studentId: exigirAluno(req), cancelado: false } })
      if (!d) return res.status(404).json({ error: 'Documento não encontrado.' })
      sendHtml(res, d.html)
    }),
  )

  // Histórico em JSON (para telas/consulta)
  router.get(
    '/alunos/:studentId/historico',
    requireRole(...SEC_LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const h = await montarHistorico(getTenantId(req), String(req.params.studentId), qs(req.query.enrollmentId))
      res.json({ aluno: { id: h.student.id, nome: h.student.nomeCompleto, ra: h.student.ra, status: h.student.status }, curso: h.matricula?.program?.nome, linhas: h.linhas, resumo: h.resumo, fonteNotas: h.fonteNotas })
    }),
  )
}
