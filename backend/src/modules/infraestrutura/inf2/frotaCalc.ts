// Funções puras da frota (sem banco): custo por km, consumo e rateio de seguro.
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const DAY = 86_400_000

export interface RegKm { data: Date; km: number; tipo: string; litros?: number | null; valor?: number | null; tanqueCheio?: boolean }

/** Km rodados no período: maior - menor leitura (precisa de ao menos 2 leituras). */
export function kmRodados(regs: Array<{ km: number }>): number {
  if (regs.length < 2) return 0
  const ks = regs.map((r) => r.km)
  return Math.max(...ks) - Math.min(...ks)
}

/** Consumo médio km/l: km rodados ÷ litros dos abastecimentos exceto o primeiro (que só "abre" o tanque). */
export function consumoMedio(regs: RegKm[]): number | null {
  const abast = regs.filter((r) => r.tipo === 'ABASTECIMENTO' && r.litros && r.litros > 0).sort((a, b) => a.data.getTime() - b.data.getTime())
  if (abast.length < 2) return null
  const km = abast[abast.length - 1].km - abast[0].km
  const litros = abast.slice(1).reduce((s, r) => s + (r.litros ?? 0), 0)
  return km > 0 && litros > 0 ? r2(km / litros) : null
}

/** Parcela do prêmio do seguro que cabe no intervalo [de, ate] (rateio linear por dia). */
export function seguroRateado(s: { vigenciaInicio: Date; vigenciaFim: Date; premio: number }, de: Date, ate: Date): number {
  const ini = Math.max(s.vigenciaInicio.getTime(), de.getTime())
  const fim = Math.min(s.vigenciaFim.getTime(), ate.getTime())
  if (fim <= ini) return 0
  const total = Math.max(DAY, s.vigenciaFim.getTime() - s.vigenciaInicio.getTime())
  return r2((s.premio * (fim - ini)) / total)
}

export interface CustoKmIn {
  registros: RegKm[]
  manutencoes: Array<{ custo: number }>
  multas: Array<{ valor: number; valorRessarcido: number; status: string }>
  seguros: Array<{ vigenciaInicio: Date; vigenciaFim: Date; premio: number }>
  de: Date
  ate: Date
}
export function custoPorKm(i: CustoKmIn) {
  const combustivel = r2(i.registros.filter((r) => r.tipo === 'ABASTECIMENTO').reduce((s, r) => s + (r.valor ?? 0), 0))
  const manutencao = r2(i.manutencoes.reduce((s, m) => s + m.custo, 0))
  // multas canceladas não contam; a parte ressarcida pelo responsável sai do custo da instituição
  const multas = r2(i.multas.filter((m) => m.status !== 'CANCELADA').reduce((s, m) => s + Math.max(0, m.valor - m.valorRessarcido), 0))
  const seguro = r2(i.seguros.reduce((s, x) => s + seguroRateado(x, i.de, i.ate), 0))
  const km = kmRodados(i.registros)
  const total = r2(combustivel + manutencao + multas + seguro)
  return { km, combustivel, manutencao, multas, seguro, total, custoPorKm: km > 0 ? r2(total / km) : null, consumoKmPorLitro: consumoMedio(i.registros) }
}

/** CNH válida em uma data? (sem validade informada = não confere) */
export const cnhValidaEm = (validade: Date | null | undefined, em: Date) => !!validade && validade.getTime() >= em.getTime()
export const periodosSeSobrepoem = (a: [Date, Date], b: [Date, Date]) => a[0] < b[1] && b[0] < a[1]
