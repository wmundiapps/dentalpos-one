import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma'

function clinicIdFrom(req: Request) {
  return String((req as any).clinicId || req.headers['x-clinic-id'] || '')
}

function period(req: Request) {
  const now = new Date()
  const toText = String(req.query.to || now.toISOString().slice(0, 10))
  const fromText = String(req.query.from || `${toText.slice(0, 7)}-01`)
  return {
    from: new Date(`${fromText}T00:00:00.000`),
    to: new Date(`${toText}T23:59:59.999`),
    fromText,
    toText,
  }
}

function makeCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return ''
  const keys = Object.keys(rows[0])
  const q = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
  return [keys.map(q).join(';'), ...rows.map((row) => keys.map((key) => q(row[key])).join(';'))].join('\n')
}

function respond(req: Request, res: Response, name: string, summary: Record<string, unknown>, rows: Record<string, unknown>[]) {
  if (String(req.query.format || '').toLowerCase() === 'csv') {
    res.setHeader('content-type', 'text/csv; charset=utf-8')
    res.setHeader('content-disposition', `attachment; filename="${name}.csv"`)
    return res.send('\ufeff' + makeCsv(rows))
  }
  return res.json({ name, summary, rows })
}

const paidStatuses = ['PAID', 'RECEIVED', 'PAGO', 'RECEBIDO', 'SETTLED']
const attendedStatuses = ['COMPLETED', 'DONE', 'ATTENDED', 'FINALIZED', 'CONCLUIDO', 'COMPARECEU', 'FINALIZADO']
const noShowStatuses = ['NO_SHOW', 'MISSED', 'FALTOU', 'AUSENTE']

export async function report(req: Request, res: Response) {
  const clinicId = clinicIdFrom(req)
  if (!clinicId) return res.status(400).json({ error: 'clinicId ausente' })
  const key = String(req.params.key || '')
  const { from, to, fromText, toText } = period(req)

  if (key === 'financial') {
    const entries = await prisma.financialEntry.findMany({
      where: { clinicId, dueDate: { gte: from, lte: to } },
      include: { patient: true },
      orderBy: { dueDate: 'asc' },
    })
    const revenue = entries.filter((e) => e.type.toUpperCase().includes('RECE')).reduce((a, e) => a + e.amount, 0)
    const expense = entries.filter((e) => e.type.toUpperCase().includes('DESP')).reduce((a, e) => a + e.amount, 0)
    const overdue = entries.filter((e) => e.dueDate < new Date() && !paidStatuses.includes(e.status.toUpperCase())).reduce((a, e) => a + e.amount, 0)
    return respond(req, res, 'financeiro', { de: fromText, ate: toText, receitas: revenue, despesas: expense, saldo: revenue - expense, vencido: overdue }, entries.map((e) => ({
      nome: e.patient?.fullName || e.personName, tipo: e.type, categoria: e.category, valor: e.amount, vencimento: e.dueDate, status: e.status, pago_em: e.paidAt || '',
    })))
  }

  if (key === 'fiscal') {
    const rows = await prisma.taxObligation.findMany({ where: { clinicId, dueDate: { gte: from, lte: to } }, orderBy: { dueDate: 'asc' } })
    const forecast = rows.reduce((a, r) => a + Number(r.finalValue ?? r.estimatedValue ?? 0), 0)
    const late = rows.filter((r) => r.dueDate < new Date() && !['PAID', 'PAGO'].includes(r.status.toUpperCase())).length
    return respond(req, res, 'fiscal', { de: fromText, ate: toText, previsao_tributos: forecast, obrigacoes: rows.length, em_atraso: late }, rows.map((r) => ({
      tributo: r.name, entidade: r.entityName, pf_pj: r.legalEntity, competencia: r.competence, vencimento: r.dueDate,
      estimado: r.estimatedValue, valor_final: r.finalValue ?? '', status: r.status,
    })))
  }

  if (key === 'average-ticket') {
    const budgets = await prisma.budget.findMany({ where: { clinicId, createdAt: { gte: from, lte: to } }, include: { patient: true } })
    const total = budgets.reduce((a, b) => a + b.totalAmount, 0)
    const accepted = budgets.filter((b) => Boolean(b.acceptedAt) || ['APPROVED', 'ACCEPTED', 'APROVADO'].includes(b.status.toUpperCase()))
    return respond(req, res, 'ticket-medio', {
      de: fromText, ate: toText, orcamentos: budgets.length, ticket_medio: budgets.length ? total / budgets.length : 0,
      aprovados: accepted.length, conversao_percentual: budgets.length ? (accepted.length / budgets.length) * 100 : 0,
    }, budgets.map((b) => ({ paciente: b.patient.fullName, valor: b.totalAmount, status: b.status, aceito_em: b.acceptedAt || '', criado_em: b.createdAt })))
  }

  if (key === 'no-show') {
    const appointments = await prisma.appointment.findMany({
      where: { clinicId, scheduledAt: { gte: from, lte: to } }, include: { patient: true }, orderBy: { scheduledAt: 'asc' },
    })
    const absent = appointments.filter((a) => noShowStatuses.includes(a.status.toUpperCase()))
    const attended = appointments.filter((a) => attendedStatuses.includes(a.status.toUpperCase()) || Boolean(a.startedAt))
    return respond(req, res, 'agenda-e-faltas', {
      de: fromText, ate: toText, agendadas: appointments.length, compareceram: attended.length, faltaram: absent.length,
      taxa_falta_percentual: appointments.length ? (absent.length / appointments.length) * 100 : 0,
    }, appointments.map((a) => ({ paciente: a.patient.fullName, data: a.scheduledAt, status: a.status, procedimento: a.procedure, origem: a.source })))
  }

  if (key === 'active-patients') {
    const patients = await prisma.patient.findMany({ where: { clinicId, createdAt: { lte: to } }, orderBy: { fullName: 'asc' } })
    const active = patients.filter((p) => p.isActive)
    return respond(req, res, 'pacientes-ativos', { pacientes: patients.length, ativos: active.length, inativos_desistentes: patients.length - active.length }, patients.map((p) => ({
      paciente: p.fullName, status: p.isActive ? 'ATIVO' : 'INATIVO/DESISTENTE', cadastro: p.createdAt, telefone: p.phone, email: p.email || '',
    })))
  }

  if (key === 'consultations-no-close') {
    const appointments = await prisma.appointment.findMany({
      where: { clinicId, scheduledAt: { gte: from, lte: to } },
      include: { patient: { include: { budgets: true } } },
      orderBy: { scheduledAt: 'asc' },
    })
    const rows = appointments.filter((a) => (attendedStatuses.includes(a.status.toUpperCase()) || Boolean(a.startedAt)) &&
      !a.patient.budgets.some((b) => Boolean(b.acceptedAt) || ['APPROVED', 'ACCEPTED', 'APROVADO'].includes(b.status.toUpperCase())))
    return respond(req, res, 'consultas-sem-fechamento', { consultas_sem_fechamento: rows.length }, rows.map((a) => ({
      paciente: a.patient.fullName, consulta: a.scheduledAt, procedimento: a.procedure, status: a.status,
    })))
  }

  if (key === 'patient-flow') {
    const patients = await prisma.patient.findMany({
      where: { clinicId },
      include: { appointments: { orderBy: { scheduledAt: 'asc' } } },
      orderBy: { fullName: 'asc' },
    })
    const rows = patients.map((p) => {
      const inPeriod = p.appointments.filter((a) => a.scheduledAt >= from && a.scheduledAt <= to)
      const first = inPeriod.find((a) => Boolean(a.startedAt) || attendedStatuses.includes(a.status.toUpperCase()))
      const last = [...inPeriod].reverse().find((a) => Boolean(a.endedAt) || ['COMPLETED', 'FINALIZED', 'FINALIZADO', 'CONCLUIDO'].includes(a.status.toUpperCase()))
      return { paciente: p.fullName, iniciou: first?.startedAt || first?.scheduledAt || '', terminou: last?.endedAt || last?.scheduledAt || '', ativo: p.isActive ? 'SIM' : 'NAO' }
    }).filter((r) => r.iniciou || r.terminou)
    return respond(req, res, 'entrada-saida-pacientes', { movimentacoes: rows.length }, rows)
  }

  if (key === 'comparison') {
    const entries = await prisma.financialEntry.findMany({ where: { clinicId, dueDate: { gte: from, lte: to } } })
    const map = new Map<string, { receitas: number, despesas: number }>()
    entries.forEach((e) => {
      const month = e.dueDate.toISOString().slice(0, 7)
      const m = map.get(month) || { receitas: 0, despesas: 0 }
      if (e.type.toUpperCase().includes('RECE')) m.receitas += e.amount
      if (e.type.toUpperCase().includes('DESP')) m.despesas += e.amount
      map.set(month, m)
    })
    const rows = [...map.entries()].sort().map(([mes, v]) => ({ mes, receitas: v.receitas, despesas: v.despesas, resultado: v.receitas - v.despesas }))
    return respond(req, res, 'comparativo-mensal-anual', { meses: rows.length }, rows)
  }

  if (key === 'collections') {
    const patients = await prisma.patient.findMany({ where: { clinicId }, select: { id: true, fullName: true, phone: true, email: true } })
    const messages = await prisma.revahMessage.findMany({ where: { clinicId, createdAt: { gte: from, lte: to } }, orderBy: { createdAt: 'asc' } })
    const entries = await prisma.financialEntry.findMany({ where: { clinicId, patientId: { not: null }, dueDate: { lte: to } } })
    const rows = patients.map((p) => {
      const normalizedPhone = p.phone.replace(/\D/g, '')
      const patientMessages = messages.filter((m) => m.destination.replace(/\D/g, '').endsWith(normalizedPhone) || (p.email && m.destination.toLowerCase() === p.email.toLowerCase()))
      const debts = entries.filter((e) => e.patientId === p.id)
      const effective = debts.filter((e) => Boolean(e.paidAt) || paidStatuses.includes(e.status.toUpperCase())).length
      return { paciente: p.fullName, cobrancas: patientMessages.length, cobrancas_entregues: patientMessages.filter((m) => ['SENT', 'DELIVERED', 'READ'].includes(m.status.toUpperCase())).length, titulos_pagos: effective }
    }).filter((r) => r.cobrancas > 0)
    return respond(req, res, 'cobrancas-e-eficacia', { pacientes_cobrados: rows.length, cobrancas: rows.reduce((a, r) => a + r.cobrancas, 0) }, rows)
  }

  if (key === 'reactivation') {
    const appointments = await prisma.appointment.findMany({ where: { clinicId, scheduledAt: { lte: to } }, include: { patient: true }, orderBy: { scheduledAt: 'asc' } })
    const byPatient = new Map<string, typeof appointments>()
    appointments.forEach((a) => byPatient.set(a.patientId, [...(byPatient.get(a.patientId) || []), a]))
    const rows: Record<string, unknown>[] = []
    byPatient.forEach((list) => {
      for (let i = 1; i < list.length; i++) {
        const gap = (list[i].scheduledAt.getTime() - list[i - 1].scheduledAt.getTime()) / 86400000
        if (gap >= 30 && list[i].scheduledAt >= from && list[i].scheduledAt <= to) {
          rows.push({ paciente: list[i].patient.fullName, retornou_em: list[i].scheduledAt, dias_sem_consulta: Math.floor(gap), origem: list[i].source })
        }
      }
    })
    return respond(req, res, 'reativacao-pacientes', { retornos_apos_30_dias: rows.length }, rows)
  }

  if (key === 'origin') {
    const appointments = await prisma.appointment.findMany({ where: { clinicId, scheduledAt: { gte: from, lte: to } }, include: { patient: true } })
    const firstByPatient = new Map<string, (typeof appointments)[number]>()
    appointments.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()).forEach((a) => { if (!firstByPatient.has(a.patientId)) firstByPatient.set(a.patientId, a) })
    const rows = [...firstByPatient.values()].map((a) => ({ paciente: a.patient.fullName, origem: a.source || 'NAO_INFORMADA', primeira_consulta: a.scheduledAt }))
    const summary: Record<string, number> = {}
    rows.forEach((r) => summary[String(r.origem)] = (summary[String(r.origem)] || 0) + 1)
    return respond(req, res, 'origem-pacientes', summary, rows)
  }

  return res.status(404).json({ error: 'Relatório não encontrado' })
}
