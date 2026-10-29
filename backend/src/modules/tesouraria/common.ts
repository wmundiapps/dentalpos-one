import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import type { AuthenticatedRequest } from '../academico/middleware'
import { getTenantId, getUserId } from '../academico/middleware'
import { audit } from '../core/notify'
import { usuarioTem2faAtivo, validarSegundoFator } from '../seguranca/doisFatores'

export const MODULO = 'tesouraria'

// Papéis com acesso total (espelham SUPER_ROLES de academico/middleware).
export const SUPERS = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
// Quem opera a tesouraria (lança, recebe, concilia) e quem só confere/autoriza.
export const OPERA: any[] = ['FINANCE']
export const CONFERE: any[] = ['FINANCE', 'COORDINATOR']
export const LEITURA: any[] = ['FINANCE', 'COORDINATOR', 'SUPPLIES']

export const tid = (req: AuthenticatedRequest) => getTenantId(req)
export const uid = (req: AuthenticatedRequest) => getUserId(req)
export const papelDe = (req: AuthenticatedRequest) => String(req.user?.role || '').toUpperCase()
export const ehSuper = (papel: string) => SUPERS.includes(String(papel).toUpperCase())

export function httpError(status: number, message: string, extra?: Record<string, unknown>) {
  return Object.assign(new Error(message), { status, ...(extra || {}) })
}

export const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100
export const soDigitos = (s?: string | null) => String(s ?? '').replace(/\D+/g, '')
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** Data de calendário (meio-dia UTC) a partir de 'AAAA-MM-DD' ou Date. */
export function dia(v: string | Date): Date {
  const d = new Date(v)
  if (isNaN(d.getTime())) throw httpError(400, 'Data inválida.')
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) d.setUTCHours(12, 0, 0, 0)
  return d
}
export const iso10 = (d: Date) => d.toISOString().slice(0, 10)

export function periodo(q: Record<string, any>, padraoDias = 30) {
  const hoje = new Date()
  const de = q.de ? dia(String(q.de)) : new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1, 0, 0, 0))
  let ate = q.ate ? dia(String(q.ate)) : new Date(de.getTime() + padraoDias * 86_400_000)
  if (q.ate && /^\d{4}-\d{2}-\d{2}$/.test(String(q.ate))) ate = new Date(Date.UTC(ate.getUTCFullYear(), ate.getUTCMonth(), ate.getUTCDate(), 23, 59, 59))
  if (ate < de) throw httpError(400, '"ate" deve ser posterior a "de".')
  return { de, ate }
}

/** Número sequencial atômico por tenant/chave (UPSERT incrementando). */
export async function proximoNumero(tenantId: string, chave: string, tx: Prisma.TransactionClient | typeof prisma = prisma): Promise<number> {
  const r = await tx.tesSequencia.upsert({
    where: { tenantId_chave: { tenantId, chave } },
    create: { tenantId, chave, ultimo: 1 },
    update: { ultimo: { increment: 1 } },
  })
  return r.ultimo
}

export async function getConfig(tenantId: string) {
  return prisma.tesConfig.upsert({ where: { tenantId }, create: { tenantId }, update: {} })
}

export const log = (req: AuthenticatedRequest, acao: string, refType: string, refId: string, detalhes?: unknown) =>
  audit({ tenantId: tid(req), userId: req.user?.id, modulo: MODULO, acao, refType, refId, detalhes })

/**
 * Reautenticação 2FA para ações financeiras sensíveis. Só é exigida quando o valor
 * alcança `exige2faAcima` (configuração) ou a faixa de alçada marca `exige2fa`.
 * O código TOTP (ou de recuperação) vem em `codigo2fa` no corpo.
 */
export async function exigir2fa(req: AuthenticatedRequest, valor: number, forcar = false): Promise<boolean> {
  const cfg = await getConfig(tid(req))
  const limite = cfg.exige2faAcima
  const precisa = forcar || (limite != null && valor >= limite)
  if (!precisa) return false
  const userId = uid(req)
  if (!(await usuarioTem2faAtivo(userId))) {
    throw httpError(403, 'Esta ação exige verificação em duas etapas (2FA), mas o seu usuário ainda não ativou o 2FA.', { code: '2FA_NAO_CONFIGURADO' })
  }
  const codigo = String(req.body?.codigo2fa ?? '')
  if (!codigo) throw httpError(403, 'Informe o código do autenticador (codigo2fa) para confirmar esta ação.', { code: '2FA_REQUERIDO' })
  const r = await validarSegundoFator(userId, { code: codigo, recoveryCode: codigo })
  if (!r.ok) throw httpError(403, 'Código 2FA inválido.', { code: '2FA_INVALIDO' })
  return true
}

/** Nome do usuário (para exibição na trilha). */
export async function nomesUsuarios(tenantId: string, ids: Array<string | null | undefined>) {
  const lista = Array.from(new Set(ids.filter(Boolean) as string[]))
  if (!lista.length) return {} as Record<string, string>
  const us = await prisma.user.findMany({ where: { tenantId, id: { in: lista } }, select: { id: true, firstName: true, lastName: true } })
  return Object.fromEntries(us.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()])) as Record<string, string>
}

// ---------- valor por extenso (recibos) ----------
const UN = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CT = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

function ate999(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100)
  const resto = n % 100
  const partes: string[] = []
  if (c) partes.push(CT[c])
  if (resto) {
    if (resto < 20) partes.push(UN[resto])
    else {
      const d = Math.floor(resto / 10)
      const u = resto % 10
      partes.push(u ? `${DZ[d]} e ${UN[u]}` : DZ[d])
    }
  }
  return partes.join(' e ')
}

export function inteiroPorExtenso(n: number): string {
  if (n === 0) return 'zero'
  const grupos: Array<[number, string, string]> = [[1_000_000_000, 'bilhão', 'bilhões'], [1_000_000, 'milhão', 'milhões'], [1000, 'mil', 'mil']]
  let resto = n
  const partes: string[] = []
  for (const [base, sing, plur] of grupos) {
    const q = Math.floor(resto / base)
    if (q) {
      resto -= q * base
      partes.push(base === 1000 && q === 1 ? 'mil' : `${ate999(q)} ${q === 1 ? sing : plur}`)
    }
  }
  if (resto) partes.push(ate999(resto))
  // "e" antes do último grupo quando ele é < 100 ou centena exata
  if (partes.length > 1) {
    const ultimo = n % 1000
    if (ultimo && (ultimo < 100 || ultimo % 100 === 0)) return partes.slice(0, -1).join(' ') + ' e ' + partes[partes.length - 1]
    return partes.join(' ')
  }
  return partes[0]
}

export function valorPorExtenso(valor: number): string {
  const v = Math.round(Math.abs(valor) * 100)
  const reais = Math.floor(v / 100)
  const cent = v % 100
  const partes: string[] = []
  if (reais) {
    const milhoes = reais % 1_000_000 === 0 && reais >= 1_000_000
    partes.push(`${inteiroPorExtenso(reais)}${milhoes ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`)
  }
  if (cent) partes.push(`${inteiroPorExtenso(cent)} ${cent === 1 ? 'centavo' : 'centavos'}`)
  return partes.length ? partes.join(' e ') : 'zero real'
}

export const brl = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
