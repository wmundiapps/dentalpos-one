import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, requireRole } from '../academico/middleware'
import { qs } from '../core/crud'
import { brandHeaderHtml, escapeHtml as esc, getBranding } from '../core/branding'
import { calcOcupacao, Faixa } from './conflicts'
import { DAY_MS, DIAS_SEMANA, DIAS_SEMANA_CURTO, localDateKey, minToHHMM, startOfLocalDay, toLocal } from './time'
import { GESTAO, MODULO, SlotRow, carregarMalha, enriquecerSlots, erro, requireTerm } from './service'
import { listarOcorrencias } from './eventos'

const arred = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d
const fmtData = (d: Date) => {
  const l = toLocal(d)
  return `${String(l.getUTCDate()).padStart(2, '0')}/${String(l.getUTCMonth() + 1).padStart(2, '0')}/${l.getUTCFullYear()}`
}

export function registerRelatorios(router: Router) {
  // ---------- Ocupação e ociosidade ----------
  router.get(
    '/relatorios/ocupacao',
    requireRole(...GESTAO, 'FACILITIES'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const termId = qs(req.query.termId)
      if (!termId) throw erro(400, 'Informe termId.')
      await requireTerm(tenantId, termId)
      const limiar = Math.min(1, Math.max(0, parseFloat(qs(req.query.limiarOciosidade) ?? '0.3') || 0.3))
      const dias = (qs(req.query.dias) ?? '1,2,3,4,5').split(',').map((x) => parseInt(x, 10)).filter((x) => x >= 1 && x <= 7)
      const turnos = qs(req.query.turnos)?.split(',')
      const malhaRows = (await carregarMalha(tenantId)).filter((h) => !turnos?.length || turnos.includes(h.turno))
      const malha: Faixa[] = []
      for (const d of dias) for (const h of malhaRows) malha.push({ dia: d, inicio: h.inicioMin, fim: h.fimMin })
      const espacos = await prisma.eduSpace.findMany({
        where: { tenantId, ativo: true, ...(qs(req.query.campusId) ? { campusId: qs(req.query.campusId) } : {}), ...(qs(req.query.tipo) ? { tipo: qs(req.query.tipo) as any } : {}) },
        orderBy: { codigo: 'asc' },
        take: 1000,
      })
      const slots = await prisma.calSlot.findMany({ where: { tenantId, termId, ativo: true, spaceId: { in: espacos.map((e) => e.id) } } })
      const oc = calcOcupacao(slots.map((s) => ({ id: s.id, diaSemana: s.diaSemana, inicioMin: s.inicioMin, fimMin: s.fimMin, spaceId: s.spaceId })), espacos.map((e) => ({ id: e.id, nome: e.nome, tipo: e.tipo, capacidade: e.capacidade })), malha)
      const em = new Map(espacos.map((e) => [e.id, e]))
      const detalhe = qs(req.query.detalhe) === 'true'
      const itens = oc.map((o) => ({
        spaceId: o.spaceId, codigo: em.get(o.spaceId)?.codigo, nome: o.nome, tipo: o.tipo, capacidade: em.get(o.spaceId)?.capacidade,
        horasOcupadasSemana: arred(o.minutosOcupados / 60, 1), horasDisponiveisSemana: arred(o.minutosDisponiveis / 60, 1), taxaOcupacao: arred(o.taxa), ociosidade: arred(o.ociosidade),
        porDia: Object.fromEntries(Object.entries(o.porDia).map(([d, v]) => [DIAS_SEMANA[Number(d)], arred(v.taxa)])),
        ...(detalhe ? { mapa: o.mapa.map((m) => ({ dia: DIAS_SEMANA[m.dia], inicio: minToHHMM(m.inicio), fim: minToHHMM(m.fim), ocupado: m.ocupado })) } : {}),
      }))
      const porTipo = new Map<string, { espacos: number; ocupados: number; disponiveis: number }>()
      for (const o of oc) {
        const t = porTipo.get(o.tipo ?? 'OUTRO') ?? { espacos: 0, ocupados: 0, disponiveis: 0 }
        t.espacos++
        t.ocupados += o.minutosOcupados
        t.disponiveis += o.minutosDisponiveis
        porTipo.set(o.tipo ?? 'OUTRO', t)
      }
      // pico por dia/horário (quantos espaços ocupados / total de espaços)
      const pico: Array<{ dia: string; inicio: string; fim: string; espacosOcupados: number; taxa: number }> = []
      for (const f of malha) {
        const n = oc.filter((o) => o.mapa.some((m) => m.dia === f.dia && m.inicio === f.inicio && m.ocupado)).length
        pico.push({ dia: DIAS_SEMANA[f.dia], inicio: minToHHMM(f.inicio), fim: minToHHMM(f.fim), espacosOcupados: n, taxa: arred(espacos.length ? n / espacos.length : 0) })
      }
      const totalOc = oc.reduce((s, o) => s + o.minutosOcupados, 0)
      const totalDisp = oc.reduce((s, o) => s + o.minutosDisponiveis, 0)
      const ociosos = itens.filter((i) => i.taxaOcupacao < limiar).sort((a, b) => a.taxaOcupacao - b.taxaOcupacao)
      const horasReservadas = await prisma.calReserva.findMany({ where: { tenantId, status: 'APROVADA', bloqueio: false, spaceId: { in: espacos.map((e) => e.id) } }, select: { spaceId: true, inicio: true, fim: true }, take: 20000 })
      const resv = new Map<string, number>()
      for (const r of horasReservadas) resv.set(r.spaceId, (resv.get(r.spaceId) ?? 0) + (r.fim.getTime() - r.inicio.getTime()) / 3_600_000)
      res.json({
        termId,
        limiarOciosidade: limiar,
        resumo: { espacos: espacos.length, taxaMediaOcupacao: arred(totalDisp ? totalOc / totalDisp : 0), espacosOciosos: ociosos.length, espacosSemNenhumaAula: itens.filter((i) => i.taxaOcupacao === 0).length },
        porTipo: [...porTipo.entries()].map(([tipo, v]) => ({ tipo, espacos: v.espacos, taxaOcupacao: arred(v.disponiveis ? v.ocupados / v.disponiveis : 0) })),
        horariosDePico: pico.sort((a, b) => b.taxa - a.taxa).slice(0, 10),
        horariosOciosos: pico.sort((a, b) => a.taxa - b.taxa).slice(0, 10),
        ociosos: ociosos.slice(0, 50),
        maisOcupados: [...itens].sort((a, b) => b.taxaOcupacao - a.taxaOcupacao).slice(0, 10),
        horasReservadasTotal: Object.fromEntries([...resv.entries()].map(([k, v]) => [em.get(k)?.codigo ?? k, arred(v, 1)])),
        itens,
      })
    }),
  )

  // ---------- Choques ----------
  router.get(
    '/relatorios/conflitos',
    requireRole(...GESTAO, 'FACILITIES'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const termId = qs(req.query.termId)
      const where: any = { tenantId, ...(termId ? { termId } : {}) }
      const rows = await prisma.calConflito.findMany({ where, orderBy: { detectadoEm: 'desc' }, take: 5000 })
      const porTipo: Record<string, { abertos: number; resolvidos: number; ignorados: number }> = {}
      let somaDias = 0
      let nRes = 0
      const trinta = Date.now() - 30 * DAY_MS
      let resolvidos30 = 0
      for (const c of rows) {
        const t = (porTipo[c.tipo] ??= { abertos: 0, resolvidos: 0, ignorados: 0 })
        if (c.status === 'ABERTO') t.abertos++
        else if (c.status === 'RESOLVIDO') {
          t.resolvidos++
          if (c.resolvidoEm) {
            somaDias += (c.resolvidoEm.getTime() - c.detectadoEm.getTime()) / DAY_MS
            nRes++
            if (c.resolvidoEm.getTime() >= trinta) resolvidos30++
          }
        } else t.ignorados++
      }
      res.json({
        termId: termId ?? null,
        total: rows.length,
        abertos: rows.filter((c) => c.status === 'ABERTO').length,
        resolvidos: rows.filter((c) => c.status === 'RESOLVIDO').length,
        resolvidosUltimos30Dias: resolvidos30,
        ignorados: rows.filter((c) => c.status === 'IGNORADO').length,
        tempoMedioResolucaoDias: nRes ? arred(somaDias / nRes, 2) : null,
        porTipo,
        abertosRecentes: rows.filter((c) => c.status === 'ABERTO').slice(0, 50).map((c) => ({ id: c.id, tipo: c.tipo, descricao: c.descricao, detectadoEm: c.detectadoEm })),
      })
    }),
  )

  // ---------- Reservas ----------
  router.get(
    '/relatorios/reservas',
    requireRole(...GESTAO, 'FACILITIES'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const de = qs(req.query.de) ? new Date(qs(req.query.de)!) : new Date(Date.now() - 90 * DAY_MS)
      const ate = qs(req.query.ate) ? new Date(qs(req.query.ate)!) : new Date(Date.now() + 90 * DAY_MS)
      const rows = await prisma.calReserva.findMany({ where: { tenantId, inicio: { gte: de, lte: ate } }, take: 20000 })
      const porStatus: Record<string, number> = {}
      const horasPorEspaco = new Map<string, number>()
      const porTipo: Record<string, number> = {}
      let somaDecisaoH = 0
      let nDec = 0
      for (const r of rows) {
        porStatus[r.status] = (porStatus[r.status] ?? 0) + 1
        porTipo[r.tipo] = (porTipo[r.tipo] ?? 0) + 1
        if (r.status === 'APROVADA') horasPorEspaco.set(r.spaceId, (horasPorEspaco.get(r.spaceId) ?? 0) + (r.fim.getTime() - r.inicio.getTime()) / 3_600_000)
        if (r.decididoEm && (r.status === 'APROVADA' || r.status === 'REJEITADA') && !r.bloqueio) {
          somaDecisaoH += (r.decididoEm.getTime() - r.createdAt.getTime()) / 3_600_000
          nDec++
        }
      }
      const esp = await prisma.eduSpace.findMany({ where: { tenantId, id: { in: [...horasPorEspaco.keys()] } }, select: { id: true, codigo: true, nome: true } })
      const em = new Map(esp.map((e) => [e.id, e]))
      const aprov = porStatus.APROVADA ?? 0
      const rej = porStatus.REJEITADA ?? 0
      res.json({
        de, ate, total: rows.length, porStatus, porTipo,
        taxaAprovacao: aprov + rej ? arred(aprov / (aprov + rej)) : null,
        tempoMedioDecisaoHoras: nDec ? arred(somaDecisaoH / nDec, 1) : null,
        pendentes: porStatus.PENDENTE ?? 0,
        horasAprovadasPorEspaco: [...horasPorEspaco.entries()].map(([id, h]) => ({ spaceId: id, codigo: em.get(id)?.codigo, nome: em.get(id)?.nome, horas: arred(h, 1) })).sort((a, b) => b.horas - a.horas).slice(0, 50),
      })
    }),
  )

  // ---------- Resumo ----------
  router.get(
    '/relatorios/resumo',
    requireRole(...GESTAO, 'FACILITIES'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const termId = qs(req.query.termId)
      if (!termId) throw erro(400, 'Informe termId.')
      const term = await requireTerm(tenantId, termId)
      const agora = new Date()
      const [slots, secoes, secoesComSlot, provas, provasProx, prazosAbertos, resPend, conflAbertos, eventos] = await Promise.all([
        prisma.calSlot.count({ where: { tenantId, termId, ativo: true } }),
        prisma.classSection.count({ where: { tenantId, termId } }),
        prisma.calSlot.findMany({ where: { tenantId, termId, ativo: true }, select: { classSectionId: true }, distinct: ['classSectionId'] }),
        prisma.calExame.count({ where: { tenantId, termId, status: { notIn: ['CANCELADA', 'REMARCADA'] } } }),
        prisma.calExame.count({ where: { tenantId, termId, status: { in: ['AGENDADA', 'CONFIRMADA'] }, inicio: { gte: agora, lte: new Date(agora.getTime() + 14 * DAY_MS) } } }),
        prisma.calPrazoNotas.count({ where: { tenantId, termId, ativo: true, prazo: { gte: agora } } }),
        prisma.calReserva.count({ where: { tenantId, status: 'PENDENTE', fim: { gte: agora } } }),
        prisma.calConflito.count({ where: { tenantId, termId, status: 'ABERTO' } }),
        prisma.calEvento.count({ where: { tenantId, ativo: true, OR: [{ termId }, { termId: null }] } }),
      ])
      res.json({
        periodo: { id: term.id, codigo: term.codigo, inicio: term.dataInicio, fim: term.dataFim },
        grade: { slots, turmas: secoes, turmasComGrade: secoesComSlot.length, turmasSemGrade: Math.max(0, secoes - secoesComSlot.length) },
        provas: { agendadas: provas, proximos14Dias: provasProx },
        prazosAbertos, reservasPendentes: resPend, conflitosAbertos: conflAbertos, eventosNoCalendario: eventos,
      })
    }),
  )

  // ---------- HTML imprimível ----------
  router.get(
    '/relatorios/grade.html',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const where: any = { tenantId, ativo: true }
      if (qs(req.query.termId)) where.termId = qs(req.query.termId)
      let titulo = 'Grade horária'
      if (qs(req.query.turmaId)) { where.classSectionId = qs(req.query.turmaId); titulo = 'Grade horária da turma' }
      else if (qs(req.query.grupo)) { where.grupo = qs(req.query.grupo); titulo = 'Grade horária da turma/série' }
      else if (qs(req.query.professorId)) { where.professorUserId = qs(req.query.professorId); titulo = 'Grade horária do professor' }
      else if (qs(req.query.espacoId)) { where.spaceId = qs(req.query.espacoId); titulo = 'Ocupação do espaço' }
      else if (!temPapelGestao(req)) throw erro(400, 'Informe turmaId, grupo, professorId ou espacoId.')
      const slots = (await prisma.calSlot.findMany({ where, take: 3000 })) as unknown as SlotRow[]
      const en = await enriquecerSlots(tenantId, slots)
      const term = qs(req.query.termId) ? await requireTerm(tenantId, qs(req.query.termId)!) : null
      const b = await getBranding(tenantId)
      const dias = [1, 2, 3, 4, 5, ...(en.some((s) => s.diaSemana === 6) ? [6] : []), ...(en.some((s) => s.diaSemana === 7) ? [7] : [])]
      const linhas = [...new Map(en.map((s) => [`${s.inicioMin}-${s.fimMin}`, { i: s.inicioMin, f: s.fimMin }])).values()].sort((a, b) => a.i - b.i)
      const cel = (dia: number, l: { i: number; f: number }) =>
        en.filter((s) => s.diaSemana === dia && s.inicioMin < l.f && s.fimMin > l.i && s.inicioMin <= l.i)
          .map((s) => `<div class="aula${s.tipoAula === 'PRATICA' ? ' pratica' : ''}"><b>${esc(s.disciplina ?? '')}</b><br/><small>${esc(s.turma ?? '')}${s.professor ? ' · ' + esc(s.professor) : ''}${s.espaco ? ' · ' + esc(s.espaco.codigo) : ''}</small></div>`)
          .join('')
      const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>${esc(titulo)}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#0f172a}main{padding:20px 28px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:${esc(b.cores.primaria)};color:#fff;padding:6px;border:1px solid #cbd5e1}td{border:1px solid #cbd5e1;padding:4px;vertical-align:top;min-width:110px}td.h{font-weight:700;white-space:nowrap;background:#f1f5f9}.aula{background:#eff6ff;border-left:3px solid ${esc(b.cores.primaria)};padding:3px 5px;margin-bottom:3px}.aula.pratica{background:#ecfdf5;border-left-color:${esc(b.cores.destaque)}}small{color:#475569}footer{margin-top:14px;font-size:10px;color:#64748b}@media print{@page{size:landscape;margin:12mm}}</style></head><body>
${brandHeaderHtml(b, { titulo, subtitulo: term ? `Período letivo ${term.codigo}` : undefined })}
<main><table><thead><tr><th>Horário</th>${dias.map((d) => `<th>${DIAS_SEMANA[d]}</th>`).join('')}</tr></thead><tbody>
${linhas.map((l) => `<tr><td class="h">${minToHHMM(l.i)}–${minToHHMM(l.f)}</td>${dias.map((d) => `<td>${cel(d, l)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${dias.length + 1}">Sem aulas alocadas.</td></tr>`}
</tbody></table><footer>Emitido em ${fmtData(new Date())} · EduMaster Pro</footer></main></body></html>`
      res.type('html').send(html)
    }),
  )

  router.get(
    '/relatorios/calendario.html',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const termId = qs(req.query.termId)
      const term = termId ? await requireTerm(tenantId, termId) : null
      const de = term ? startOfLocalDay(term.dataInicio) : new Date(`${qs(req.query.ano) ?? new Date().getFullYear()}-01-01T03:00:00Z`)
      const ate = term ? term.dataFim : new Date(`${qs(req.query.ano) ?? new Date().getFullYear()}-12-31T23:59:00Z`)
      const role = String(req.user?.role)
      const extra = role === 'STUDENT' ? { publico: { in: ['TODOS', 'ALUNOS'] } } : role === 'TEACHER' ? { publico: { in: ['TODOS', 'PROFESSORES'] } } : {}
      const evs = await listarOcorrencias(tenantId, de, ate, { termId: termId ?? undefined, extra })
      const b = await getBranding(tenantId)
      const porMes = new Map<string, typeof evs>()
      for (const e of evs) {
        const k = localDateKey(e.inicio).slice(0, 7)
        porMes.set(k, [...(porMes.get(k) ?? []), e])
      }
      const MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
      const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Calendário acadêmico</title>
<style>body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#0f172a}main{padding:20px 28px}h2{color:${esc(b.cores.secundaria)};border-bottom:2px solid ${esc(b.cores.primaria)};padding-bottom:4px;margin-top:22px}table{width:100%;border-collapse:collapse;font-size:12px}td{padding:5px 6px;border-bottom:1px solid #e2e8f0;vertical-align:top}td.d{white-space:nowrap;width:150px;font-weight:700}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}small{color:#64748b}@media print{@page{margin:12mm}}</style></head><body>
${brandHeaderHtml(b, { titulo: 'Calendário acadêmico', subtitulo: term ? `Período letivo ${term.codigo} (${fmtData(term.dataInicio)} a ${fmtData(term.dataFim)})` : undefined })}
<main>${[...porMes.entries()].map(([k, lista]) => `<h2>${MESES[parseInt(k.slice(5), 10)]} de ${k.slice(0, 4)}</h2><table>${lista.map((e) => {
        const ini = localDateKey(e.inicio)
        const fim = localDateKey(new Date(e.fim.getTime() - 1))
        const dt = ini === fim ? fmtData(e.inicio) : `${fmtData(e.inicio)} a ${fmtData(new Date(e.fim.getTime() - 1))}`
        return `<tr><td class="d">${dt}</td><td><span class="dot" style="background:${esc(e.cor ?? '#64748b')}"></span>${esc(e.titulo)}${e.local ? ` <small>· ${esc(e.local)}</small>` : ''}</td></tr>`
      }).join('')}</table>`).join('') || '<p>Nenhum evento no período.</p>'}
<footer style="margin-top:16px;font-size:10px;color:#64748b">Emitido em ${fmtData(new Date())} · EduMaster Pro</footer></main></body></html>`
      res.type('html').send(html)
    }),
  )
}

function temPapelGestao(req: AuthenticatedRequest) {
  return ['ADMIN', 'OWNER', 'RECTOR', 'BOARD', 'COORDINATOR', 'SECRETARY'].includes(String(req.user?.role))
}

