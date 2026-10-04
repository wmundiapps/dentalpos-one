import type { Request } from 'express'
import { prisma } from '../../lib/prisma'

// ============================================================
// Log de segurança (SegEvento). NUNCA lança erro: se a tabela ainda não existe
// (migração não aplicada) ou o banco falha, apenas avisa no console.
// NUNCA grava segredos, senhas, tokens ou códigos: o `detalhe` passa por redação.
// ============================================================

export type SegSeveridadeTipo = 'INFO' | 'ATENCAO' | 'CRITICO'

export interface EventoInput {
  tenantId?: string | null
  userId?: string | null
  tipo: string
  severidade?: SegSeveridadeTipo
  ip?: string | null
  userAgent?: string | null
  detalhe?: Record<string, unknown> | null
}

const CHAVE_SENSIVEL = /(senha|password|secret|segredo|token|authorization|cookie|codigo|code|otp|hash|dataurl|base64|conteudo)/i

/** Remove valores de chaves sensíveis e trunca textos longos. */
export function redigir(valor: unknown, profundidade = 0): unknown {
  if (valor == null) return valor
  if (typeof valor === 'string') return valor.length > 300 ? valor.slice(0, 300) + '…' : valor
  if (typeof valor === 'number' || typeof valor === 'boolean') return valor
  if (profundidade > 3) return '[...]'
  if (Array.isArray(valor)) return valor.slice(0, 20).map((v) => redigir(v, profundidade + 1))
  if (typeof valor === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      out[k] = CHAVE_SENSIVEL.test(k) && typeof v !== 'number' && typeof v !== 'boolean' ? '[omitido]' : redigir(v, profundidade + 1)
    }
    return out
  }
  return String(valor)
}

export async function registrarEvento(e: EventoInput): Promise<void> {
  try {
    await prisma.segEvento.create({
      data: {
        tenantId: e.tenantId || 'global',
        userId: e.userId ?? null,
        tipo: e.tipo.slice(0, 80),
        severidade: e.severidade ?? 'INFO',
        ip: e.ip ? String(e.ip).slice(0, 64) : null,
        userAgent: e.userAgent ? String(e.userAgent).slice(0, 300) : null,
        detalhe: e.detalhe ? (redigir(e.detalhe) as any) : undefined,
      },
    })
  } catch (err: any) {
    console.warn('[seguranca] não foi possível registrar evento', e.tipo, '-', String(err?.code || err?.message || err).slice(0, 120))
  }
}

export function ipDaRequisicao(req: Request): string {
  return String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '')
}

export function eventoDeRequisicao(req: Request, e: Omit<EventoInput, 'ip' | 'userAgent'>): Promise<void> {
  return registrarEvento({ ...e, ip: ipDaRequisicao(req), userAgent: req.get('user-agent') || null })
}

// Limita eventos repetitivos (ex.: origem negada em loop) a 1 por chave/janela, na memória do processo.
const recentes = new Map<string, number>()
export function deveRegistrarComLimite(chave: string, janelaMs = 60_000): boolean {
  const agora = Date.now()
  const ult = recentes.get(chave)
  if (ult && agora - ult < janelaMs) return false
  recentes.set(chave, agora)
  if (recentes.size > 5000) for (const [k, t] of recentes) if (agora - t > janelaMs) recentes.delete(k)
  return true
}
