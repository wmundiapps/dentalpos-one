// ============================================================
// RH — cálculos PUROS (sem banco): ponto, banco de horas, férias, rescisão simulada.
// Tudo aqui é MODELO a validar pelo contador/jurídico trabalhista (CLT, CCT, acordo individual).
// Fuso: America/Sao_Paulo fixo em UTC-3 (sem horário de verão desde 2019).
// ============================================================

export const TZ_OFFSET_MIN = -180
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export const pad = (n: number) => String(n).padStart(2, '0')

export const hhmmToMin = (s: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''))
  if (!m) throw Object.assign(new Error(`Horário inválido: ${s}`), { status: 400 })
  const h = +m[1], mi = +m[2]
  if (h > 23 || mi > 59) throw Object.assign(new Error(`Horário inválido: ${s}`), { status: 400 })
  return h * 60 + mi
}
export const minToHhmm = (m: number) => { const s = m < 0 ? '-' : ''; const a = Math.abs(Math.round(m)); return `${s}${pad(Math.floor(a / 60))}:${pad(a % 60)}` }

/** Minutos desde a época no relógio local. */
export const localMin = (d: Date) => Math.floor(d.getTime() / 60000) + TZ_OFFSET_MIN
export const fromLocalMin = (m: number) => new Date((m - TZ_OFFSET_MIN) * 60000)
export const diaLocal = (d: Date) => new Date((Math.floor(d.getTime() / 60000) + TZ_OFFSET_MIN) * 60000).toISOString().slice(0, 10)
export const horaLocal = (d: Date) => { const m = ((localMin(d) % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}` }
/** Instante UTC para "YYYY-MM-DD" + "HH:MM" locais. */
export const instanteLocal = (dia: string, hhmm: string) => fromLocalMin(Math.floor(Date.parse(dia + 'T00:00:00Z') / 60000) + hhmmToMin(hhmm))
export const diaSemana = (dia: string) => new Date(dia + 'T12:00:00Z').getUTCDay()
export const addDiasStr = (dia: string, n: number) => new Date(Date.parse(dia + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
export const diffDias = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000)
export const competenciaDe = (dia: string) => dia.slice(0, 7)
export const diasDoMes = (comp: string): string[] => {
  const [y, m] = comp.split('-').map(Number)
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: n }, (_, i) => `${comp}-${pad(i + 1)}`)
}
export const competenciaValida = (c: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(c)

// ------------------------------------------------------------------ jornada
export interface DiaJornada { entrada: string; saida: string; intervaloMin?: number }
export interface JornadaDef { tipo: string; dias: any; baseData?: Date | string | null; descontaIntervaloAuto?: boolean }
export interface JornadaDia { entrada: string; saida: string; intervaloMin: number; esperadoMin: number }

export function esperadoDe(d: DiaJornada): number {
  const e = hhmmToMin(d.entrada); let s = hhmmToMin(d.saida)
  if (s <= e) s += 1440
  return Math.max(0, s - e - (d.intervaloMin ?? 0))
}
/** Jornada prevista para o dia (null = folga). */
export function jornadaDoDia(j: JornadaDef | null | undefined, dia: string): JornadaDia | null {
  if (!j) return null
  let d: DiaJornada | undefined
  if (j.tipo === 'ESCALA_12X36') {
    const base = j.baseData ? (j.baseData instanceof Date ? j.baseData.toISOString().slice(0, 10) : String(j.baseData).slice(0, 10)) : null
    if (!base) return null
    const diff = diffDias(base, dia)
    if (Math.abs(diff) % 2 !== 0) return null
    d = j.dias?.escala
  } else d = j.dias?.[String(diaSemana(dia))]
  if (!d || !d.entrada || !d.saida) return null
  return { entrada: d.entrada, saida: d.saida, intervaloMin: d.intervaloMin ?? 0, esperadoMin: esperadoDe(d) }
}
export function validarJornada(tipo: string, dias: any): string[] {
  const erros: string[] = []
  const chk = (d: any, nome: string) => {
    try { esperadoDe(d); if ((d.intervaloMin ?? 0) < 0 || (d.intervaloMin ?? 0) > 240) erros.push(`${nome}: intervalo inválido.`) } catch { erros.push(`${nome}: horários inválidos (use HH:MM).`) }
  }
  if (tipo === 'ESCALA_12X36') { if (!dias?.escala) erros.push('Escala 12x36 exige "escala" {entrada, saida, intervaloMin}.'); else chk(dias.escala, 'escala') }
  else {
    const ks = Object.keys(dias || {})
    if (!ks.length) erros.push('Informe ao menos um dia da semana.')
    for (const k of ks) { if (!/^[0-6]$/.test(k)) erros.push(`Dia da semana inválido: ${k}`); else chk(dias[k], `dia ${k}`) }
  }
  return erros
}
export function cargaSemanalDe(tipo: string, dias: any): number {
  if (tipo === 'ESCALA_12X36') return Math.round(esperadoDe(dias.escala) * 3.5)
  return Object.values(dias || {}).reduce((a: number, d: any) => a + esperadoDe(d), 0)
}

// ------------------------------------------------------------------ apuração diária
export interface CfgPonto {
  toleranciaMarcacaoMin: number; toleranciaDiariaMin: number; adicionalNoturnoPct: number; horaNoturnaReduzida: boolean
  noturnoInicio: string; noturnoFim: string; he50LimiteDiarioMin: number; excedenteCem: boolean
}
export const CFG_PONTO_PADRAO: CfgPonto = { toleranciaMarcacaoMin: 5, toleranciaDiariaMin: 10, adicionalNoturnoPct: 20, horaNoturnaReduzida: true, noturnoInicio: '22:00', noturnoFim: '05:00', he50LimiteDiarioMin: 120, excedenteCem: true }

export type TipoMarcacao = 'ENTRADA' | 'SAIDA_INTERVALO' | 'RETORNO_INTERVALO' | 'SAIDA'
export interface MarcacaoIn { tipo: string; dataHora: Date }
export interface DiaApurado {
  data: string; dow: number; tipoDia: 'UTIL' | 'SABADO' | 'DOMINGO' | 'FERIADO' | 'FOLGA'
  esperadoMin: number; trabalhadoMin: number; atrasoMin: number; faltaMin: number; falta: boolean
  extra50Min: number; extra100Min: number; extraNot50Min: number; extraNot100Min: number
  noturnoMin: number; noturnoRegularMin: number; abonadoMin: number; intervaloSuprimidoMin: number
  marcacoes: string[]; inconsistencias: string[]; abono?: string | null
}

const ABRE = new Set(['ENTRADA', 'RETORNO_INTERVALO'])
const FECHA = new Set(['SAIDA_INTERVALO', 'SAIDA'])

/** Minutos de [s,e) (minutos locais absolutos) dentro da janela noturna (cruza a meia-noite). */
export function sobreposicaoNoturna(s: number, e: number, iniMin: number, fimMin: number): number {
  if (e <= s) return 0
  let tot = 0
  const d0 = Math.floor(s / 1440) - 1, d1 = Math.floor(e / 1440)
  for (let d = d0; d <= d1; d++) {
    const ws = d * 1440 + iniMin
    const we = (iniMin > fimMin ? (d + 1) * 1440 : d * 1440) + fimMin
    tot += Math.max(0, Math.min(e, we) - Math.max(s, ws))
  }
  return tot
}

/** Pareia as marcações (abre/fecha). Devolve intervalos em minutos locais absolutos. */
export function parearMarcacoes(ms: MarcacaoIn[]): { pares: Array<[number, number]>; inconsistencias: string[] } {
  const ord = [...ms].sort((a, b) => a.dataHora.getTime() - b.dataHora.getTime())
  const pares: Array<[number, number]> = []; const inc: string[] = []
  let abre: number | null = null
  for (const m of ord) {
    const t = localMin(m.dataHora)
    if (ABRE.has(m.tipo)) { if (abre !== null) inc.push('ENTRADA_SEM_SAIDA'); abre = t }
    else if (FECHA.has(m.tipo)) { if (abre === null) inc.push('SAIDA_SEM_ENTRADA'); else { if (t > abre) pares.push([abre, t]); abre = null } }
  }
  if (abre !== null) inc.push('MARCACAO_IMPAR')
  return { pares, inconsistencias: inc }
}

function consumirDoFim(pares: Array<[number, number]>, n: number): { consumido: Array<[number, number]> } {
  const out: Array<[number, number]> = []
  let falta = n
  for (let i = pares.length - 1; i >= 0 && falta > 0; i--) {
    const [s, e] = pares[i]; const len = e - s; const take = Math.min(len, falta)
    out.push([e - take, e]); falta -= take
  }
  return { consumido: out }
}

export interface DiaIn {
  data: string; jornada: JornadaDia | null; jornadaTipo?: string; marcacoes: MarcacaoIn[]; feriado: boolean; abono?: string | null
  descontaIntervaloAuto?: boolean; cfg?: Partial<CfgPonto>
}

export function apurarDia(inp: DiaIn): DiaApurado {
  const cfg = { ...CFG_PONTO_PADRAO, ...(inp.cfg || {}) }
  const dow = diaSemana(inp.data)
  const escala12 = inp.jornadaTipo === 'ESCALA_12X36'
  const feriado = inp.feriado && !escala12
  const domingo = dow === 0 && !escala12
  let esperado = inp.jornada && !feriado && !domingo ? inp.jornada.esperadoMin : (inp.jornada && escala12 ? inp.jornada.esperadoMin : 0)
  if (inp.jornada && (feriado || domingo) && !escala12) esperado = 0
  const tipoDia: DiaApurado['tipoDia'] = feriado ? 'FERIADO' : domingo ? 'DOMINGO' : esperado > 0 ? (dow === 6 ? 'SABADO' : 'UTIL') : 'FOLGA'
  const inc: string[] = []
  const { pares, inconsistencias } = parearMarcacoes(inp.marcacoes)
  inc.push(...inconsistencias)

  let bruto = pares.reduce((a, [s, e]) => a + (e - s), 0)
  let intervaloSuprimido = 0
  const intervReq = inp.jornada?.intervaloMin ?? 0
  if (pares.length === 1 && intervReq > 0 && bruto > 6 * 60 && inp.descontaIntervaloAuto !== false) bruto = Math.max(0, bruto - intervReq)   // pré-assinalado
  if (pares.length >= 2) {
    const gap = pares[1][0] - pares[0][1]
    if (bruto > 6 * 60 && intervReq > 0 && gap < intervReq) { intervaloSuprimido = intervReq - gap; inc.push('INTERVALO_INSUFICIENTE') }
    if (gap > 4 * 60) inc.push('INTERVALO_LONGO')
  }
  const trabalhado = bruto
  const abonado = !!inp.abono
  const horaDia = bruto > 10 * 60 + (escala12 ? 120 : 0)
  if (horaDia) inc.push('JORNADA_EXCEDE_10H')

  let atraso = 0, falta = 0, faltaFlag = false, abonadoMin = 0
  let extraTotal = 0, rate100 = false
  const semMarcas = inp.marcacoes.length === 0
  if (esperado > 0) {
    if (abonado) { abonadoMin = esperado; if (trabalhado > 0 && trabalhado > esperado + cfg.toleranciaDiariaMin) extraTotal = trabalhado - esperado }
    else if (semMarcas) { faltaFlag = true; falta = esperado }
    else {
      const saldo = trabalhado - esperado
      if (Math.abs(saldo) > cfg.toleranciaDiariaMin) { if (saldo < 0) atraso = -saldo; else extraTotal = saldo }
    }
    if (feriado || domingo) rate100 = true
  } else if (trabalhado > 0) { extraTotal = trabalhado; rate100 = tipoDia === 'FERIADO' || tipoDia === 'DOMINGO' }
  // intervalo suprimido (art. 71 §4º): o tempo trabalhado a mais já entra como extra no saldo do dia; só sinalizamos

  let e50 = 0, e100 = 0
  if (extraTotal > 0) {
    if (rate100) e100 = extraTotal
    else if (esperado === 0) e50 = extraTotal   // folga (não DSR): todas a 50%
    else if (cfg.excedenteCem) { e50 = Math.min(extraTotal, cfg.he50LimiteDiarioMin); e100 = extraTotal - e50; if (extraTotal > cfg.he50LimiteDiarioMin) inc.push('EXCEDE_LIMITE_HE_DIARIA') }
    else e50 = extraTotal
  }
  // noturno
  const ni = hhmmToMin(cfg.noturnoInicio), nf = hhmmToMin(cfg.noturnoFim)
  const noturno = pares.reduce((a, [s, e]) => a + sobreposicaoNoturna(s, e, ni, nf), 0)
  const trabalhoReal = pares.reduce((a, [s, e]) => a + (e - s), 0)
  const extraEfetivo = Math.min(e50 + e100, trabalhoReal)
  const e100Efetivo = Math.min(e100, extraEfetivo)
  const e50Efetivo = Math.max(0, extraEfetivo - e100Efetivo)
  const seg100 = consumirDoFim(pares, e100Efetivo).consumido
  const resto = pares.map(([s, e]) => [s, e] as [number, number])
  // remove do final o trecho de 100% e calcula o trecho de 50% imediatamente anterior
  let nt100 = seg100.reduce((a, [s, e]) => a + sobreposicaoNoturna(s, e, ni, nf), 0)
  let tmp = e100Efetivo
  for (let i = resto.length - 1; i >= 0 && tmp > 0; i--) { const len = resto[i][1] - resto[i][0]; const t = Math.min(len, tmp); resto[i][1] -= t; tmp -= t }
  const seg50 = consumirDoFim(resto.filter(([s, e]) => e > s), e50Efetivo).consumido
  const nt50 = seg50.reduce((a, [s, e]) => a + sobreposicaoNoturna(s, e, ni, nf), 0)
  const noturnoRegular = Math.max(0, noturno - nt50 - nt100)

  return {
    data: inp.data, dow, tipoDia, esperadoMin: esperado, trabalhadoMin: trabalhado, atrasoMin: atraso, faltaMin: falta, falta: faltaFlag,
    extra50Min: e50, extra100Min: e100, extraNot50Min: nt50, extraNot100Min: nt100, noturnoMin: noturno, noturnoRegularMin: noturnoRegular,
    abonadoMin, intervaloSuprimidoMin: intervaloSuprimido, marcacoes: inp.marcacoes.slice().sort((a, b) => a.dataHora.getTime() - b.dataHora.getTime()).map((m) => `${m.tipo[0]}${horaLocal(m.dataHora)}`),
    inconsistencias: inc, abono: inp.abono ?? null,
  }
}

export interface ResumoMes {
  competencia: string; trabalhadoMin: number; esperadoMin: number; atrasoMin: number; faltas: number; faltaMin: number
  extra50Min: number; extra100Min: number; extraNot50Min: number; extraNot100Min: number; noturnoRegularMin: number; noturnoMin: number
  abonadoMin: number; diasUteis: number; diasDsr: number; inconsistencias: number; saldoMin: number
}

/** Dias úteis (seg-sáb, exceto feriados) e dias de DSR (domingos + feriados em seg-sáb) do mês. */
export function diasUteisEDsr(comp: string, feriados: Set<string>): { uteis: number; dsr: number } {
  let u = 0, d = 0
  for (const dia of diasDoMes(comp)) {
    const dow = diaSemana(dia)
    if (dow === 0) d++
    else if (feriados.has(dia)) d++
    else u++
  }
  return { uteis: u, dsr: d }
}

export function resumirMes(comp: string, dias: DiaApurado[], feriados: Set<string>): ResumoMes {
  const sum = (f: (d: DiaApurado) => number) => dias.reduce((a, d) => a + f(d), 0)
  const { uteis, dsr } = diasUteisEDsr(comp, feriados)
  const r: ResumoMes = {
    competencia: comp, trabalhadoMin: sum((d) => d.trabalhadoMin), esperadoMin: sum((d) => d.esperadoMin), atrasoMin: sum((d) => d.atrasoMin),
    faltas: dias.filter((d) => d.falta).length, faltaMin: sum((d) => d.faltaMin), extra50Min: sum((d) => d.extra50Min), extra100Min: sum((d) => d.extra100Min),
    extraNot50Min: sum((d) => d.extraNot50Min), extraNot100Min: sum((d) => d.extraNot100Min), noturnoRegularMin: sum((d) => d.noturnoRegularMin), noturnoMin: sum((d) => d.noturnoMin),
    abonadoMin: sum((d) => d.abonadoMin), diasUteis: uteis, diasDsr: dsr, inconsistencias: sum((d) => d.inconsistencias.length), saldoMin: 0,
  }
  r.saldoMin = r.extra50Min + r.extra100Min - r.atrasoMin
  return r
}

/** DSR sobre horas extras/adicionais variáveis: (valor variável / dias úteis) × dias de DSR. */
export function dsrSobreVariaveis(valorVariavel: number, diasUteis: number, diasDsr: number): number {
  if (diasUteis <= 0 || valorVariavel <= 0) return 0
  return r2((valorVariavel / diasUteis) * diasDsr)
}

// ------------------------------------------------------------------ banco de horas
export interface BancoRow { id: string; data: Date; tipo: string; minutos: number; venceEm?: Date | null; createdAt?: Date }
export interface BancoSaldo {
  saldoMin: number; creditoMin: number; debitoAbertoMin: number; vencidoMin: number; aVencerMin: number
  creditos: Array<{ id: string; data: string; venceEm: string | null; restanteMin: number; vencido: boolean }>
  excedentePagamentoMin: number
}
/** Repete o razão em ordem cronológica: débitos/compensações/pagamentos consomem créditos por vencimento (FIFO). */
export function saldoBanco(rows: BancoRow[], hoje: Date = new Date(), aVencerDias = 30): BancoSaldo {
  const ord = [...rows].sort((a, b) => a.data.getTime() - b.data.getTime() || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))
  const cred: Array<{ id: string; data: Date; venceEm: Date | null; rest: number }> = []
  let divida = 0, excedente = 0
  for (const r of ord) {
    if (r.minutos > 0) {
      let m = r.minutos
      if (divida > 0) { const c = Math.min(m, divida); divida -= c; m -= c }
      if (m > 0) cred.push({ id: r.id, data: r.data, venceEm: r.venceEm ?? null, rest: m })
    } else if (r.minutos < 0) {
      let need = -r.minutos
      const elegiveis = cred.filter((c) => c.rest > 0 && (r.tipo === 'PAGAMENTO' || !c.venceEm || c.venceEm.getTime() >= r.data.getTime()))
        .sort((a, b) => (a.venceEm?.getTime() ?? Infinity) - (b.venceEm?.getTime() ?? Infinity) || a.data.getTime() - b.data.getTime())
      for (const c of elegiveis) { if (need <= 0) break; const t = Math.min(c.rest, need); c.rest -= t; need -= t }
      if (need > 0) { if (r.tipo === 'PAGAMENTO') excedente += need; else divida += need }
    }
  }
  const aberto = cred.filter((c) => c.rest > 0)
  const venc = (c: { venceEm: Date | null }) => !!c.venceEm && c.venceEm.getTime() < hoje.getTime()
  const limite = hoje.getTime() + aVencerDias * 86400000
  const credito = aberto.reduce((a, c) => a + c.rest, 0)
  return {
    saldoMin: credito - divida, creditoMin: credito, debitoAbertoMin: divida,
    vencidoMin: aberto.filter(venc).reduce((a, c) => a + c.rest, 0),
    aVencerMin: aberto.filter((c) => !venc(c) && c.venceEm && c.venceEm.getTime() <= limite).reduce((a, c) => a + c.rest, 0),
    creditos: aberto.map((c) => ({ id: c.id, data: c.data.toISOString().slice(0, 10), venceEm: c.venceEm ? c.venceEm.toISOString().slice(0, 10) : null, restanteMin: c.rest, vencido: venc(c) })),
    excedentePagamentoMin: excedente,
  }
}
export function addMeses(d: Date, n: number): Date {
  const x = new Date(d.getTime()); const dia = x.getUTCDate()
  x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + n)
  const ult = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate()
  x.setUTCDate(Math.min(dia, ult))
  return x
}
/** Crédito do banco a partir dos extras do dia: horas a 100% creditadas pelo fator (padrão 2). */
export function creditoBancoMin(e50: number, e100: number, fator100 = 2): number { return Math.round(e50 + e100 * fator100) }

// ------------------------------------------------------------------ férias
export function diasDireitoFerias(faltasInjustificadas: number): number {
  if (faltasInjustificadas <= 5) return 30
  if (faltasInjustificadas <= 14) return 24
  if (faltasInjustificadas <= 23) return 18
  if (faltasInjustificadas <= 32) return 12
  return 0
}
export interface PeriodoAq { inicio: string; fim: string; concessivoFim: string }
const addAnos = (dia: string, n: number) => { const d = new Date(dia + 'T12:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() + n); return d.toISOString().slice(0, 10) }
/** Períodos aquisitivos completos ou em curso até `ate`. */
export function periodosAquisitivos(admissao: string, ate: string): PeriodoAq[] {
  const out: PeriodoAq[] = []
  let ini = admissao
  while (ini <= ate) {
    const fim = addDiasStr(addAnos(ini, 1), -1)
    out.push({ inicio: ini, fim, concessivoFim: addAnos(fim, 1) })
    ini = addDiasStr(fim, 1)
  }
  return out
}
export function validarFracionamento(parcelas: number[], diasDireito: number, diasAbono = 0): string[] {
  const erros: string[] = []
  const gozo = parcelas.reduce((a, b) => a + b, 0)
  if (parcelas.some((p) => !Number.isInteger(p) || p <= 0)) erros.push('Os dias de cada parcela devem ser inteiros positivos.')
  if (parcelas.length > 3) erros.push('As férias podem ser divididas em no máximo 3 períodos (CLT art. 134 §1º).')
  if (parcelas.length > 1) {
    if (!parcelas.some((p) => p >= 14)) erros.push('Um dos períodos deve ter no mínimo 14 dias corridos.')
    if (parcelas.some((p) => p < 5)) erros.push('Nenhum período pode ter menos de 5 dias corridos.')
  }
  const maxAbono = Math.floor(diasDireito / 3)
  if (diasAbono < 0 || diasAbono > maxAbono) erros.push(`A venda (abono pecuniário) é limitada a 1/3 do direito (${maxAbono} dias).`)
  if (gozo + diasAbono > diasDireito) erros.push(`Gozo (${gozo}) + venda (${diasAbono}) excedem o saldo de ${diasDireito} dias.`)
  return erros
}
/** Início de férias não pode ocorrer nos 2 dias que antecedem feriado ou repouso semanal (art. 134 §3º). */
export function inicioFeriasInvalido(inicio: string, feriados: Set<string>): boolean {
  for (const k of [1, 2]) { const d = addDiasStr(inicio, k); if (diaSemana(d) === 0 || feriados.has(d)) return true }
  return false
}
export function calcularFerias(p: { salario: number; dias: number; diasAbono?: number; mediaVariaveis?: number }) {
  const base = p.salario + (p.mediaVariaveis ?? 0)
  const vDia = base / 30
  const ferias = r2(vDia * p.dias), terco = r2(ferias / 3)
  const abono = r2(vDia * (p.diasAbono ?? 0)), tercoAbono = r2(abono / 3)
  return { valorDia: r2(vDia), ferias, terco, abono, tercoAbono, total: r2(ferias + terco + abono + tercoAbono) }
}

// ------------------------------------------------------------------ rescisão (SIMULAÇÃO)
export const avisoPrevioDias = (admissao: string, desligamento: string): number => {
  const anos = Math.max(0, Math.floor(diffDias(admissao, desligamento) / 365.25))
  return Math.min(90, 30 + 3 * anos)
}
/** Avos de 13º/férias: meses com 15 dias ou mais trabalhados no intervalo [ini, fim] (datas ISO). */
export function avos(ini: string, fim: string): number {
  let n = 0
  let cur = ini.slice(0, 7) + '-01'
  while (cur <= fim) {
    const [y, m] = cur.split('-').map(Number)
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const a = cur < ini ? ini : cur
    const fimMes = `${cur.slice(0, 7)}-${pad(ultimo)}`
    const b = fimMes > fim ? fim : fimMes
    if (diffDias(a, b) + 1 >= 15) n++
    cur = addDiasStr(fimMes, 1)
  }
  return n
}
export interface ItemRescisao { codigo: string; nome: string; tipo: 'PROVENTO' | 'DESCONTO'; valor: number; memoria?: string }
export function simularRescisao(p: {
  tipo: string; salario: number; admissao: string; desligamento: string; avisoTipo: string; avisoDias?: number
  feriasVencidasPeriodos?: number; feriasVencidasEmDobro?: number; saldoFgts?: number; mediaVariaveis?: number
  inss?: (base: number) => number; irrf?: (bruto: number, inss: number) => number
}) {
  const itens: ItemRescisao[] = []
  const add = (codigo: string, nome: string, tipo: 'PROVENTO' | 'DESCONTO', valor: number, memoria?: string) => { if (valor > 0.004) itens.push({ codigo, nome, tipo, valor: r2(valor), memoria }) }
  const justa = p.tipo === 'JUSTA_CAUSA', pedido = p.tipo === 'PEDIDO_DEMISSAO', acordo = p.tipo === 'ACORDO', semJusta = p.tipo === 'SEM_JUSTA_CAUSA'
  const termino = p.tipo === 'TERMINO_CONTRATO' || p.tipo === 'TERMINO_ESTAGIO' || p.tipo === 'APOSENTADORIA'
  const sal = p.salario + (p.mediaVariaveis ?? 0)
  const diaDeslig = Math.min(30, +p.desligamento.slice(8, 10))
  const aviso = p.avisoDias ?? avisoPrevioDias(p.admissao, p.desligamento)
  add('SALDO_SALARIO', 'Saldo de salário', 'PROVENTO', (p.salario / 30) * diaDeslig, `${diaDeslig} dias`)
  let projecaoDias = 0
  if (p.avisoTipo === 'INDENIZADO' && (semJusta || acordo)) {
    const v = (sal / 30) * aviso * (acordo ? 0.5 : 1)
    add('AVISO_INDENIZADO', acordo ? 'Aviso prévio indenizado (50% - acordo)' : 'Aviso prévio indenizado', 'PROVENTO', v, `${aviso} dias`)
    projecaoDias = acordo ? Math.round(aviso / 2) : aviso
  } else if (pedido && p.avisoTipo === 'INDENIZADO') add('AVISO_DESCONTADO', 'Aviso prévio não cumprido (desconto)', 'DESCONTO', p.salario, '30 dias')
  const fimProj = projecaoDias ? addDiasStr(p.desligamento, projecaoDias) : p.desligamento
  const anoIni = `${fimProj.slice(0, 4)}-01-01`
  const adm13 = p.admissao > anoIni ? p.admissao : anoIni
  let decimo = 0, feriasProp = 0
  if (!justa) {
    const av13 = Math.min(12, avos(adm13, fimProj))
    decimo = (sal / 12) * av13
    add('DECIMO_PROPORCIONAL', '13º salário proporcional', 'PROVENTO', decimo, `${av13}/12`)
    // período aquisitivo corrente
    const per = periodosAquisitivos(p.admissao, p.desligamento).slice(-1)[0]
    const avF = Math.min(12, avos(per.inicio > p.admissao ? per.inicio : p.admissao, fimProj))
    const anosCompletos = Math.floor(diffDias(p.admissao, p.desligamento) / 365.25)
    const proporcionalDevido = !(pedido && anosCompletos < 1) // CLT art.146 p.u. (pedido <1 ano: hoje devido por Súmula 261 TST)
    void proporcionalDevido
    feriasProp = (sal / 12) * avF
    add('FERIAS_PROPORCIONAIS', 'Férias proporcionais', 'PROVENTO', feriasProp, `${avF}/12`)
    add('TERCO_FERIAS_PROP', '1/3 constitucional sobre férias proporcionais', 'PROVENTO', feriasProp / 3)
  }
  const venc = p.feriasVencidasPeriodos ?? 0, dobro = p.feriasVencidasEmDobro ?? 0
  if (venc > 0) { add('FERIAS_VENCIDAS', 'Férias vencidas', 'PROVENTO', sal * venc); add('TERCO_FERIAS_VENC', '1/3 sobre férias vencidas', 'PROVENTO', (sal * venc) / 3) }
  if (dobro > 0) add('FERIAS_DOBRO', 'Dobra das férias vencidas fora do prazo concessivo (art. 137)', 'PROVENTO', sal * dobro)
  const baseInss = (p.salario / 30) * diaDeslig
  const inss = p.inss ? p.inss(baseInss) : 0
  const inss13 = p.inss ? p.inss(decimo) : 0
  add('INSS_SALDO', 'INSS sobre saldo de salário', 'DESCONTO', inss)
  add('INSS_13', 'INSS sobre 13º', 'DESCONTO', inss13)
  const irrf = p.irrf ? p.irrf(baseInss, inss) : 0
  const irrf13 = p.irrf ? p.irrf(decimo, inss13) : 0
  add('IRRF_SALDO', 'IRRF sobre saldo de salário', 'DESCONTO', irrf)
  add('IRRF_13', 'IRRF sobre 13º (tributação exclusiva)', 'DESCONTO', irrf13)
  const totalProv = r2(itens.filter((i) => i.tipo === 'PROVENTO').reduce((a, i) => a + i.valor, 0))
  const totalDesc = r2(itens.filter((i) => i.tipo === 'DESCONTO').reduce((a, i) => a + i.valor, 0))
  const meses = Math.max(0, diffDias(p.admissao, p.desligamento) / 30.4)
  const saldoFgts = p.saldoFgts ?? r2(p.salario * 0.08 * meses)
  const multaFgts = r2(saldoFgts * (semJusta ? 0.4 : acordo ? 0.2 : 0))
  void termino
  return {
    itens, totalProventos: totalProv, totalDescontos: totalDesc, liquido: r2(totalProv - totalDesc), avisoDias: aviso,
    fgts: { saldoEstimado: saldoFgts, multa: multaFgts, saque: justa || pedido ? false : true, observacao: 'Saldo estimado (8% x meses). Use o extrato real do FGTS.' },
    custoTotalInstituicao: r2(totalProv + multaFgts), simulacao: true,
    aviso: 'SIMULAÇÃO: modelo simplificado, não substitui o TRCT oficial nem a homologação. Validar com contador/jurídico trabalhista.',
  }
}
