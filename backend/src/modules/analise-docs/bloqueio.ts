// Bloqueio de conclusão de processos por documento crítico. Módulo SEM dependências de outros módulos de negócio
// (apenas prisma) para poder ser importado por secretaria/jurídico/financeiro sem ciclo.
import { prisma } from '../../lib/prisma'

export interface RefBloqueio { refType: string; refId: string }

/** Decisões que mantêm o processo travado até haver um novo parecer favorável. */
const DECISOES_QUE_BLOQUEIAM = ['REJEITAR', 'SOLICITAR_NOVO_DOCUMENTO']

/**
 * Procura o caso mais recente ligado ao registro (por refType/refId ou, para protocolos, protocoloId) e informa se o
 * processo deve permanecer bloqueado: caso crítico sem decisão humana, ou decidido como REJEITAR/SOLICITAR_NOVO_DOCUMENTO.
 */
export async function statusBloqueio(tenantId: string, ref: RefBloqueio) {
  const or: any[] = [{ refType: ref.refType, refId: ref.refId }]
  if (ref.refType === 'SecProtocolo') or.push({ protocoloId: ref.refId })
  const casos = await prisma.adcCaso.findMany({ where: { tenantId, OR: or }, orderBy: { createdAt: 'desc' }, select: { id: true, codigo: true, bloqueado: true, decisao: true, status: true, resultado: true }, take: 20 })
  const ultimo = casos[0]
  if (!ultimo) return { bloqueado: false as const }
  const porDecisao = !!ultimo.decisao && DECISOES_QUE_BLOQUEIAM.includes(ultimo.decisao)
  const bloqueado = ultimo.bloqueado || porDecisao
  return { bloqueado, caso: ultimo, motivo: ultimo.bloqueado ? 'CRITICO_SEM_DECISAO' : porDecisao ? 'DECISAO_DESFAVORAVEL' : undefined }
}

/** Lança 409 (com mensagem em português) se o registro estiver bloqueado pelo Agente de documentos. */
export async function exigirSemBloqueio(tenantId: string, ref: RefBloqueio, acao = 'concluir este processo') {
  const s = await statusBloqueio(tenantId, ref)
  if (!s.bloqueado || !s.caso) return
  const motivo = s.motivo === 'CRITICO_SEM_DECISAO'
    ? 'há documento com achado CRÍTICO aguardando decisão humana (reitoria/diretoria)'
    : 'a análise de documentos foi decidida como desfavorável; anexe novo documento e reanalise'
  throw Object.assign(new Error(`Não é possível ${acao}: ${motivo} (caso ${s.caso.codigo} do Agente de documentos).`), { status: 409, casoId: s.caso.id, codigo: 'ADC_BLOQUEADO' })
}

/** Bloqueio por aluno (ex.: registro/entrega de diploma). */
export async function exigirAlunoSemBloqueio(tenantId: string, studentId: string, acao = 'prosseguir') {
  const c = await prisma.adcCaso.findFirst({ where: { tenantId, studentId, bloqueado: true }, select: { codigo: true, id: true } })
  if (c) throw Object.assign(new Error(`Não é possível ${acao}: o aluno possui documento crítico aguardando decisão humana (caso ${c.codigo} do Agente de documentos).`), { status: 409, casoId: c.id, codigo: 'ADC_BLOQUEADO' })
}
