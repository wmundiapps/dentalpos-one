// Regras PURAS dos prazos de lançamento de notas/diário.

export const OFFSETS_LEMBRETE_DIAS = [7, 3, 1]
const DAY = 86_400_000

export interface PrazoLike {
  abertura?: Date | null
  prazo: Date
  prorrogadoAte?: Date | null
  ativo?: boolean
}

export type SituacaoPrazo = 'NAO_ABERTO' | 'ABERTO' | 'VENCE_EM_BREVE' | 'ENCERRADO' | 'CANCELADO'

/** Prazo efetivo = maior entre prazo original, prorrogação geral e exceção individual. */
export function prazoEfetivo(p: PrazoLike, excecaoAte?: Date | null): Date {
  const c = [p.prazo.getTime()]
  if (p.prorrogadoAte) c.push(p.prorrogadoAte.getTime())
  if (excecaoAte) c.push(excecaoAte.getTime())
  return new Date(Math.max(...c))
}

export function situacaoPrazo(p: PrazoLike, now = new Date(), excecaoAte?: Date | null) {
  const efetivo = prazoEfetivo(p, excecaoAte)
  const diasRestantes = Math.ceil((efetivo.getTime() - now.getTime()) / DAY)
  let situacao: SituacaoPrazo
  if (p.ativo === false) situacao = 'CANCELADO'
  else if (p.abertura && now.getTime() < p.abertura.getTime()) situacao = 'NAO_ABERTO'
  else if (now.getTime() > efetivo.getTime()) situacao = 'ENCERRADO'
  else if (diasRestantes <= 3) situacao = 'VENCE_EM_BREVE'
  else situacao = 'ABERTO'
  return {
    situacao,
    efetivo,
    diasRestantes,
    aberto: situacao === 'ABERTO' || situacao === 'VENCE_EM_BREVE',
    prorrogado: efetivo.getTime() > p.prazo.getTime(),
  }
}

/** Instantes (futuros) de lembrete D-7/D-3/D-1 para um prazo efetivo. */
export function agendaLembretes(efetivo: Date, now = new Date(), offsets = OFFSETS_LEMBRETE_DIAS) {
  return offsets
    .map((d) => ({ dias: d, remindAt: new Date(efetivo.getTime() - d * DAY) }))
    .filter((x) => x.remindAt.getTime() > now.getTime() - 12 * 3_600_000 && efetivo.getTime() > now.getTime())
}

/** Etapa de escalonamento aplicável aos pendentes: 0 nenhuma, 1 coordenação (vencido), 2 direção (vencido há 3+ dias). */
export function nivelEscalonamento(efetivo: Date, now = new Date()): 0 | 1 | 2 {
  const atraso = now.getTime() - efetivo.getTime()
  if (atraso <= 0) return 0
  return atraso >= 3 * DAY ? 2 : 1
}
