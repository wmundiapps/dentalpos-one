// Quórum, apuração de votos e numeração de deliberações (funções puras).

export type Voto = 'FAVOR' | 'CONTRA' | 'ABSTENCAO'
export type Maioria = 'SIMPLES' | 'ABSOLUTA'
export interface ApuracaoInput {
  totalComVoto: number          // membros ativos com direito a voto
  presentesComVoto: number      // presentes (com voto) na reunião
  votos: Voto[]
  quorumPercent: number
  maioria?: Maioria
}
export interface Apuracao {
  quorumNecessario: number
  quorumOk: boolean
  favor: number
  contra: number
  abstencao: number
  votaram: number
  resultado: 'APROVADA' | 'REJEITADA' | 'EMPATE' | 'SEM_QUORUM' | 'EM_ABERTO'
}

// >=50%: exige MAIS que o percentual (50% => metade + 1); <50%: arredonda para cima.
export function quorumNecessario(totalComVoto: number, percent: number): number {
  if (totalComVoto <= 0) return 1
  return percent >= 50 ? Math.floor((totalComVoto * percent) / 100) + 1 : Math.max(1, Math.ceil((totalComVoto * percent) / 100))
}

export function apurar(i: ApuracaoInput): Apuracao {
  const maioria = i.maioria ?? 'SIMPLES'
  const favor = i.votos.filter((v) => v === 'FAVOR').length
  const contra = i.votos.filter((v) => v === 'CONTRA').length
  const abstencao = i.votos.filter((v) => v === 'ABSTENCAO').length
  const votaram = i.votos.length
  const necessario = quorumNecessario(i.totalComVoto, i.quorumPercent)
  const base = { quorumNecessario: necessario, favor, contra, abstencao, votaram }
  if (i.presentesComVoto < necessario) return { ...base, quorumOk: false, resultado: 'SEM_QUORUM' }
  if (votaram > i.presentesComVoto) return { ...base, quorumOk: true, resultado: 'EM_ABERTO' }
  if (maioria === 'ABSOLUTA') {
    const exigido = Math.floor(i.totalComVoto / 2) + 1
    return { ...base, quorumOk: true, resultado: favor >= exigido ? 'APROVADA' : votaram >= i.presentesComVoto ? 'REJEITADA' : 'EM_ABERTO' }
  }
  if (votaram < i.presentesComVoto) {
    // ainda faltam votos: só decide se o resultado já é irreversível
    const faltam = i.presentesComVoto - votaram
    if (favor > contra + faltam) return { ...base, quorumOk: true, resultado: 'APROVADA' }
    if (contra > favor + faltam) return { ...base, quorumOk: true, resultado: 'REJEITADA' }
    return { ...base, quorumOk: true, resultado: 'EM_ABERTO' }
  }
  if (favor === contra) return { ...base, quorumOk: true, resultado: 'EMPATE' }
  return { ...base, quorumOk: true, resultado: favor > contra ? 'APROVADA' : 'REJEITADA' }
}

export function formatarNumeracao(numero: number, ano: number): string {
  return `${String(numero).padStart(3, '0')}/${ano}`
}
