import type { Request } from 'express'
import { prisma, tenantDe, usuarioDe } from './host'

/** Registra quem acessou dados pessoais de um cliente (LGPD art. 37). Melhor esforço: nunca derruba a operação. */
export async function registrarAcesso(req: Request, clienteId: string, acao: 'VISUALIZOU' | 'EXPORTOU' | 'BAIXOU_ANEXO' | 'EXPORTOU_TITULAR' | 'ANONIMIZOU' | 'EXCLUIU' | 'PORTAL', detalhe?: string) {
  try {
    const tenantId = tenantDe(req), userId = usuarioDe(req)
    // visualizações repetidas do mesmo usuário em 10 minutos viram um único registro
    if (acao === 'VISUALIZOU') {
      const recente = await prisma.ctbLgpdAcesso.findFirst({ where: { tenantId, clienteId, userId, acao, em: { gte: new Date(Date.now() - 10 * 60_000) } }, select: { id: true } })
      if (recente) return
    }
    await prisma.ctbLgpdAcesso.create({ data: { tenantId, clienteId, userId, acao, detalhe: detalhe?.slice(0, 300) } })
  } catch (e: any) { console.error('[carteira-lgpd-acesso]', e?.message) }
}
