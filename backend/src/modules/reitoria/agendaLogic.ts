import { DAY, inicioDoDia } from './util2'

// Lógica PURA da agenda executiva: intervalos de visão (dia/semana/mês) e expansão de recorrência.
// Fuso: America/Sao_Paulo (UTC-3 fixo). Semana começa na segunda-feira.

export type Visao = 'dia' | 'semana' | 'mes'

export function intervaloVisao(visao: Visao, ymd: string): { de: Date; ate: Date; rotulo: string } {
  const base = inicioDoDia(ymd)
  if (visao === 'dia') return { de: base, ate: new Date(base.getTime() + DAY), rotulo: ymd }
  if (visao === 'semana') {
    const dow = base.getUTCDay()   // base está em 03:00Z; dia da semana local = UTC pois 03:00Z ainda é o mesmo dia
    const delta = (dow + 6) % 7                                                  // segunda = 0
    const de = new Date(base.getTime() - delta * DAY)
    const ate = new Date(de.getTime() + 7 * DAY)
    return { de, ate, rotulo: `${ymdLocal(de)} a ${ymdLocal(new Date(ate.getTime() - DAY))}` }
  }
  const [a, m] = ymd.split('-').map(Number)
  const de = inicioDoDia(`${a}-${String(m).padStart(2, '0')}-01`)
  const prox = m === 12 ? inicioDoDia(`${a + 1}-01-01`) : inicioDoDia(`${a}-${String(m + 1).padStart(2, '0')}-01`)
  return { de, ate: prox, rotulo: `${a}-${String(m).padStart(2, '0')}` }
}

export function ymdLocal(d: Date): string {
  return new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10)
}

export interface Ocorrencia { inicio: Date; fim: Date }

/** Expande uma recorrência (NENHUMA|SEMANAL|MENSAL|ANUAL) dentro de [de, ate). Máx. 400 ocorrências. */
export function expandirRecorrencia(c: { inicio: Date; fim: Date; recorrencia: string; recorrenciaAte?: Date | null }, de: Date, ate: Date): Ocorrencia[] {
  const dur = c.fim.getTime() - c.inicio.getTime()
  const out: Ocorrencia[] = []
  const limite = c.recorrenciaAte ? new Date(Math.min(ate.getTime(), c.recorrenciaAte.getTime() + DAY)) : ate
  if (c.recorrencia === 'NENHUMA' || !c.recorrencia) {
    if (c.inicio < ate && c.fim >= de) out.push({ inicio: c.inicio, fim: c.fim })
    return out
  }
  const loc = new Date(c.inicio.getTime() - 3 * 3_600_000)           // componentes locais
  const hh = loc.getUTCHours(), mm = loc.getUTCMinutes()
  for (let i = 0; i < 4000 && out.length < 400; i++) {
    let ini: Date
    if (c.recorrencia === 'SEMANAL') ini = new Date(c.inicio.getTime() + i * 7 * DAY)
    else {
      const ano = loc.getUTCFullYear() + (c.recorrencia === 'ANUAL' ? i : 0)
      const mes = c.recorrencia === 'MENSAL' ? loc.getUTCMonth() + i : loc.getUTCMonth()
      const a2 = ano + Math.floor(mes / 12), m2 = ((mes % 12) + 12) % 12
      const ultimo = new Date(Date.UTC(a2, m2 + 1, 0)).getUTCDate()
      const d2 = Math.min(loc.getUTCDate(), ultimo)                  // 29/02 -> 28/02 em ano comum
      ini = new Date(`${a2}-${String(m2 + 1).padStart(2, '0')}-${String(d2).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-03:00`)
    }
    if (ini >= limite) break
    const fim = new Date(ini.getTime() + dur)
    if (fim >= de) out.push({ inicio: ini, fim })
  }
  return out
}

export interface ItemAgenda {
  id: string
  origem: string          // reitoria | calendario | regulatorio | dou | juridico | rh | convenios | governanca | externo
  tipo: string            // COMPROMISSO | REUNIAO | AUDIENCIA | PRAZO_REGULATORIO | PRAZO_JURIDICO | EFEMERIDE | ANIVERSARIO | VENCIMENTO | EVENTO_ACADEMICO | OUTRO
  titulo: string
  descricao?: string | null
  inicio: Date
  fim: Date
  diaInteiro: boolean
  status?: string | null
  prioridade: 'BAIXA' | 'NORMAL' | 'ALTA' | 'CRITICA'
  local?: string | null
  rota?: string | null
  ref?: { type: string; id: string } | null
  editavel?: boolean
}

/** Prioridade automática para prazos: quanto mais perto (ou vencido), mais alta. */
export function prioridadePrazo(prazo: Date, now = new Date()): ItemAgenda['prioridade'] {
  const dias = (prazo.getTime() - now.getTime()) / DAY
  if (dias < 0) return 'CRITICA'
  if (dias <= 7) return 'ALTA'
  if (dias <= 30) return 'NORMAL'
  return 'BAIXA'
}

export function agruparPorDia(itens: ItemAgenda[]): Record<string, ItemAgenda[]> {
  const out: Record<string, ItemAgenda[]> = {}
  for (const it of itens) {
    // item que atravessa dias aparece em cada dia (máx. 62 dias)
    const d0 = ymdLocal(it.inicio)
    const fimEfetivo = it.fim.getTime() > it.inicio.getTime() ? new Date(it.fim.getTime() - 1) : it.inicio
    let d = d0
    for (let k = 0; k < 62; k++) {
      ;(out[d] ??= []).push(it)
      if (d >= ymdLocal(fimEfetivo)) break
      d = ymdLocal(new Date(inicioDoDia(d).getTime() + DAY))
    }
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.inicio.getTime() - b.inicio.getTime() || a.titulo.localeCompare(b.titulo))
  return out
}

export function detectarConflitos<T extends { id: string; inicio: Date; fim: Date; diaInteiro?: boolean }>(alvo: { id?: string; inicio: Date; fim: Date }, outros: T[]): T[] {
  return outros.filter((o) => o.id !== alvo.id && !o.diaInteiro && o.inicio < alvo.fim && o.fim > alvo.inicio)
}

/** Aniversário/efeméride de data fixa (mês/dia) que cai em [de, ate). */
export function ocorrenciasAnuais(mes: number, diaMes: number, de: Date, ate: Date): Date[] {
  const out: Date[] = []
  const a0 = new Date(de.getTime() - 3 * 3_600_000).getUTCFullYear()
  const a1 = new Date(ate.getTime() - 3 * 3_600_000).getUTCFullYear()
  for (let a = a0; a <= a1; a++) {
    const ultimo = new Date(Date.UTC(a, mes, 0)).getUTCDate()
    const d = inicioDoDia(`${a}-${String(mes).padStart(2, '0')}-${String(Math.min(diaMes, ultimo)).padStart(2, '0')}`)
    if (d >= de && d < ate) out.push(d)
  }
  return out
}

export function ics(itens: ItemAgenda[], nome = 'Agenda da Reitoria'): string {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const fd = (d: Date) => ymdLocal(d).replace(/-/g, '')
  const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EduMaster Pro//Reitoria//PT-BR', `X-WR-CALNAME:${esc(nome)}`, 'CALSCALE:GREGORIAN']
  for (const it of itens) {
    linhas.push('BEGIN:VEVENT', `UID:${it.id.replace(/[^\w:.-]/g, '_')}@edumaster`, `DTSTAMP:${f(new Date())}`)
    if (it.diaInteiro) linhas.push(`DTSTART;VALUE=DATE:${fd(it.inicio)}`, `DTEND;VALUE=DATE:${fd(new Date(Math.max(it.fim.getTime(), it.inicio.getTime()) + DAY))}`)
    else linhas.push(`DTSTART:${f(it.inicio)}`, `DTEND:${f(it.fim)}`)
    linhas.push(`SUMMARY:${esc(it.titulo)}`)
    if (it.descricao) linhas.push(`DESCRIPTION:${esc(it.descricao)}`)
    if (it.local) linhas.push(`LOCATION:${esc(it.local)}`)
    linhas.push(`CATEGORIES:${esc(it.tipo)}`, 'END:VEVENT')
  }
  linhas.push('END:VCALENDAR')
  return linhas.join('\r\n') + '\r\n'
}
