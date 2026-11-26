import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest } from '../academico/middleware'
import { ipDaRequisicao } from '../seguranca/eventos'

const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']

/** Roteamento automático por palavra-chave: olha o texto da 1ª mensagem e devolve o departamento competente, se alguma regra bater. */
export async function rotearDepartamento(tenantId: string, texto: string): Promise<string | null> {
  const alvo = String(texto || '').toLowerCase()
  if (!alvo) return null
  const regras = await prisma.comRegraDepartamento.findMany({ where: { tenantId, ativa: true }, orderBy: { prioridade: 'desc' } })
  for (const r of regras) {
    if (r.palavrasChave.some((p) => alvo.includes(p.toLowerCase()))) return r.departamento
  }
  return null
}

/**
 * Conversa sigilosa: só vê quem está atendendo agora (atribuidoAId, enquanto a conversa não for
 * resolvida/arquivada) ou quem tiver um pedido de acesso APROVADO por Jurídico/Reitoria. Papéis
 * super (ADMIN/OWNER/RECTOR/BOARD) e Jurídico sempre veem.
 */
export async function podeVerConversa(req: AuthenticatedRequest, conversa: { id: string; tenantId: string; sigilosa: boolean; atribuidoAId: string | null; status: string }): Promise<boolean> {
  if (!conversa.sigilosa) return true
  const role = String(req.user?.role || '').toUpperCase()
  if (SUPER.includes(role) || role === 'LEGAL') return true
  const userId = req.user?.id
  if (!userId) return false
  const ativa = !['RESOLVIDA', 'ARQUIVADA'].includes(conversa.status)
  if (ativa && conversa.atribuidoAId === userId) return true
  const aprovado = await prisma.comAcessoSolicitacao.findFirst({ where: { tenantId: conversa.tenantId, conversaId: conversa.id, solicitanteId: userId, status: 'APROVADO' } })
  return Boolean(aprovado)
}

export async function registrarAcessoLog(input: { tenantId: string; conversaId: string; userId: string; acao: string; req?: AuthenticatedRequest; detalhes?: string }) {
  await prisma.comAcessoLog.create({
    data: {
      tenantId: input.tenantId,
      conversaId: input.conversaId,
      userId: input.userId,
      acao: input.acao,
      ip: input.req ? ipDaRequisicao(input.req) : null,
      detalhes: input.detalhes,
    },
  })
}
