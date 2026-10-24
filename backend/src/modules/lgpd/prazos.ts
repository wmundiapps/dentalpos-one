// Prazos e estados LGPD (funções puras, sem banco).
//  - Solicitação do titular: 15 dias (art. 19, II) - dias corridos.
//  - Comunicação de incidente à ANPD e aos titulares: 3 dias úteis (Res. CD/ANPD nº 15/2024, art. 6º).

export const PRAZO_SOLICITACAO_DIAS = 15
export const PRORROGACAO_SOLICITACAO_DIAS = 15      // extensão excepcional, com justificativa registrada
export const PRAZO_INCIDENTE_DIAS_UTEIS = 3
const DIA = 86_400_000

export const addDias = (d: Date, n: number) => new Date(d.getTime() + n * DIA)

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), em UTC. */
function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(ano, mes - 1, dia))
}

/** Feriados nacionais (fixos + Sexta-feira Santa), como "YYYY-MM-DD". Feriados locais não entram. */
export function feriadosNacionais(ano: number): Set<string> {
  const f = [`${ano}-01-01`, `${ano}-04-21`, `${ano}-05-01`, `${ano}-09-07`, `${ano}-10-12`, `${ano}-11-02`, `${ano}-11-15`, `${ano}-12-25`]
  if (ano >= 2024) f.push(`${ano}-11-20`)                     // Consciência Negra (nacional desde a Lei 14.759/2023)
  const sexta = addDias(pascoa(ano), -2)
  f.push(sexta.toISOString().slice(0, 10))
  return new Set(f)
}

export function ehDiaUtil(d: Date): boolean {
  const dow = d.getUTCDay()
  if (dow === 0 || dow === 6) return false
  return !feriadosNacionais(d.getUTCFullYear()).has(d.toISOString().slice(0, 10))
}

/** Soma n dias úteis (sábados, domingos e feriados nacionais não contam). Preserva o horário. */
export function addDiasUteis(inicio: Date, n: number): Date {
  let d = new Date(inicio.getTime())
  let falta = n
  while (falta > 0) {
    d = addDias(d, 1)
    if (ehDiaUtil(d)) falta--
  }
  return d
}

export type EstadoPrazo = 'NO_PRAZO' | 'VENCENDO' | 'VENCIDA' | 'ENCERRADA'

/** Semáforo do prazo: VENCENDO quando restam <= 5 dias (ou >= 80% do prazo usado), VENCIDA depois do prazo. */
export function estadoPrazo(criadoEm: Date, prazoEm: Date, aberta = true, agora = new Date()): { estado: EstadoPrazo; diasRestantes: number } {
  const diasRestantes = Math.ceil((prazoEm.getTime() - agora.getTime()) / DIA)
  if (!aberta) return { estado: 'ENCERRADA', diasRestantes }
  if (agora.getTime() > prazoEm.getTime()) return { estado: 'VENCIDA', diasRestantes }
  const total = Math.max(1, prazoEm.getTime() - criadoEm.getTime())
  const usado = (agora.getTime() - criadoEm.getTime()) / total
  return { estado: diasRestantes <= 5 || usado >= 0.8 ? 'VENCENDO' : 'NO_PRAZO', diasRestantes }
}

export function formatarProtocolo(prefixo: string, ano: number, seq: number) {
  return `${prefixo}-${ano}-${String(seq).padStart(5, '0')}`
}
export const protocoloValido = (p: string) => /^LGPD-\d{4}-\d{5}$/.test(p)

export function maiorDeIdade(nascimento: Date | string | null | undefined, ref = new Date()): boolean | null {
  if (!nascimento) return null
  const n = new Date(nascimento)
  if (isNaN(n.getTime())) return null
  const limite = new Date(Date.UTC(n.getUTCFullYear() + 18, n.getUTCMonth(), n.getUTCDate()))
  return ref.getTime() >= limite.getTime()
}
