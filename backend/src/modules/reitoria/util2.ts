import { Response } from 'express'
import { prisma } from '../../lib/prisma'
import { qs } from '../core/crud'

// Utilitários compartilhados da Reitoria parte 2 (agenda, DOU, convênios, painéis, comparativo).

export const DAY = 86_400_000
export const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }) }
export const round1 = (n: number) => Math.round(n * 10) / 10
export const round2 = (n: number) => Math.round(n * 100) / 100
export const pct = (a: number, b: number) => (b > 0 ? round1((a / b) * 100) : null)
export const addDias = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
export const dia = (d: Date) => d.toISOString().slice(0, 10)
export const mesChave = (d: Date) => d.toISOString().slice(0, 7)
export const somar = (xs: Array<number | null | undefined>) => xs.reduce<number>((s, x) => s + (Number(x) || 0), 0)
export const media = (xs: Array<number | null | undefined>) => {
  const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  return v.length ? round2(v.reduce((s, x) => s + x, 0) / v.length) : null
}

/** Dia local (America/Sao_Paulo, UTC-3 fixo desde 2019) -> intervalo [início, fim) em Date. */
export function inicioDoDia(ymd: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) fail(400, 'Data inválida (use AAAA-MM-DD).')
  const d = new Date(`${ymd}T00:00:00-03:00`)
  if (isNaN(d.getTime())) fail(400, 'Data inválida (use AAAA-MM-DD).')
  return d
}

export function hojeLocal(now = new Date()): string {
  return new Date(now.getTime() - 3 * 3_600_000).toISOString().slice(0, 10)
}

/** Lê ?de/&ate (AAAA-MM-DD) ou assume os últimos `dias` dias. */
export function periodoQuery(q: any, dias = 365, now = new Date()): { de: Date; ate: Date } {
  const de = qs(q.de) ? inicioDoDia(String(qs(q.de))) : addDias(now, -dias)
  const ate = qs(q.ate) ? addDias(inicioDoDia(String(qs(q.ate))), 1) : addDias(now, 1)
  if (ate <= de) fail(400, 'Período inválido: "ate" deve ser posterior a "de".')
  return { de, ate }
}

const csvCel = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  const s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export function toCsv(colunas: Array<{ key: string; label: string }>, linhas: Array<Record<string, any>>): string {
  return '﻿' + [colunas.map((c) => csvCel(c.label)).join(';'), ...linhas.map((l) => colunas.map((c) => csvCel(l[c.key])).join(';'))].join('\r\n') + '\r\n'
}
export function enviarCsv(res: Response, nome: string, csv: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${nome}.csv"`)
  res.send(csv)
}

export const escHtml = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

/** Executa uma consulta tolerante: falha/tabela ausente vira o valor padrão (e registra a fonte indisponível). */
export async function seguro<T>(nome: string, falhas: string[], f: () => Promise<T>, padrao: T): Promise<T> {
  try { return await f() } catch (e: any) { falhas.push(nome); if (process.env.REI_DEBUG) console.error('[reitoria2]', nome, e?.message); return padrao }
}

/** Delegate Prisma de módulo que pode ainda não existir (Jurídico, RH...). Devolve null se ausente. */
export function delegateOpcional(nome: string): any | null {
  const d = (prisma as any)[nome]
  return d && typeof d.findMany === 'function' ? d : null
}

export function normalizar(s: string): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function soDigitos(s: string | null | undefined): string { return String(s ?? '').replace(/\D/g, '') }

export function cnpjValido(cnpj: string): boolean {
  const d = soDigitos(cnpj)
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
  const calc = (len: number) => {
    let soma = 0, pos = len - 7
    for (let i = len; i >= 1; i--) { soma += Number(d[len - i]) * pos--; if (pos < 2) pos = 9 }
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
}
