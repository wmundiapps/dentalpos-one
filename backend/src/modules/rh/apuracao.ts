// Motor de apuração (usa banco): junta marcações, jornada, feriados, atestados, licenças, férias e ajustes aprovados.
import { prisma } from '../../lib/prisma'
import { feriadosNacionais } from '../lgpd/prazos'
import { DiaApurado, MarcacaoIn, ResumoMes, addDiasStr, apurarDia, diaLocal, diasDoMes, instanteLocal, jornadaDoDia, resumirMes } from './calculo'
import { cfgPonto, getConfig } from './common'

export async function feriadosDe(tenantId: string, comp: string): Promise<Set<string>> {
  const ano = +comp.slice(0, 4)
  const s = new Set<string>([...feriadosNacionais(ano), ...feriadosNacionais(ano - 1).size ? [] : []])
  const ini = new Date(`${comp}-01T00:00:00Z`); const fim = new Date(ini.getTime() + 32 * 86400000)
  const locais = await prisma.rheFeriado.findMany({ where: { tenantId, data: { gte: ini, lt: fim } }, select: { data: true } })
  for (const l of locais) s.add(l.data.toISOString().slice(0, 10))
  return s
}

/** Atribui cada marcação ao dia de apuração (dia da ENTRADA do turno, para turnos que viram a meia-noite). */
export function agruparPorDia(ms: MarcacaoIn[]): Map<string, MarcacaoIn[]> {
  const ord = [...ms].sort((a, b) => a.dataHora.getTime() - b.dataHora.getTime())
  const out = new Map<string, MarcacaoIn[]>()
  let atual: string | null = null; let ultima = 0
  for (const m of ord) {
    const t = m.dataHora.getTime()
    if (m.tipo === 'ENTRADA' || atual === null || t - ultima > 16 * 3600000) atual = diaLocal(m.dataHora)
    ultima = t
    const arr = out.get(atual) ?? []; arr.push(m); out.set(atual, arr)
  }
  return out
}

export interface ApuracaoMes { competencia: string; dias: DiaApurado[]; resumo: ResumoMes; avisos: string[] }

export async function apurarColaboradorMes(tenantId: string, colab: { id: string; jornadaId: string | null; dataAdmissao: Date | null; dataDesligamento: Date | null }, comp: string, hoje = new Date()): Promise<ApuracaoMes> {
  const cfg = await getConfig(tenantId)
  const jornada = colab.jornadaId ? await prisma.rheJornada.findFirst({ where: { id: colab.jornadaId, tenantId } }) : null
  const dias = diasDoMes(comp)
  const feriados = await feriadosDe(tenantId, comp)
  const ini = instanteLocal(addDiasStr(dias[0], -1), '00:00'); const fim = instanteLocal(addDiasStr(dias[dias.length - 1], 2), '00:00')
  const [marcs, atestados, licencas, ferias, ajustes] = await Promise.all([
    prisma.rheMarcacao.findMany({ where: { tenantId, colaboradorId: colab.id, dataHora: { gte: ini, lt: fim } }, orderBy: { dataHora: 'asc' } }),
    prisma.rheAtestado.findMany({ where: { tenantId, colaboradorId: colab.id, status: { not: 'REJEITADO' }, abonaPonto: true, dataInicio: { lte: fim }, dataFim: { gte: ini } }, select: { dataInicio: true, dataFim: true, tipo: true } }),
    prisma.rheLicenca.findMany({ where: { tenantId, colaboradorId: colab.id, status: { in: ['APROVADA', 'ENCERRADA'] }, inicio: { lte: fim }, fim: { gte: ini } }, select: { inicio: true, fim: true, tipo: true } }),
    prisma.rheFeriasProg.findMany({ where: { tenantId, colaboradorId: colab.id, status: { in: ['APROVADA', 'EM_GOZO', 'CONCLUIDA'] }, inicio: { lte: fim }, fim: { gte: ini } }, select: { inicio: true, fim: true } }),
    prisma.rheAjustePonto.findMany({ where: { tenantId, colaboradorId: colab.id, status: 'APROVADO', tipo: { in: ['ABONO_FALTA', 'JUSTIFICAR_ATRASO'] }, data: { gte: ini, lt: fim } }, select: { data: true, tipo: true } }),
  ])
  const porDia = agruparPorDia(marcs.map((m) => ({ tipo: m.tipo, dataHora: m.dataHora })))
  const dd = (d: Date) => d.toISOString().slice(0, 10)
  const cobre = (a: Date, b: Date, d: string) => dd(a) <= d && d <= dd(b)
  const admin = colab.dataAdmissao ? dd(colab.dataAdmissao) : null, desl = colab.dataDesligamento ? dd(colab.dataDesligamento) : null
  const hojeStr = diaLocal(hoje)
  const out: DiaApurado[] = []; const avisos: string[] = []
  for (const d of dias) {
    if ((admin && d < admin) || (desl && d > desl)) continue
    let abono: string | null = null
    if (ferias.some((f) => cobre(f.inicio, f.fim, d))) abono = 'FERIAS'
    else if (licencas.some((l) => cobre(l.inicio, l.fim, d))) abono = 'LICENCA'
    else if (atestados.some((a) => cobre(a.dataInicio, a.dataFim, d))) abono = 'ATESTADO'
    else if (ajustes.some((a) => dd(a.data) === d)) abono = 'AJUSTE_APROVADO'
    const marcacoes = porDia.get(d) ?? []
    const futuro = d > hojeStr
    const jd = futuro && marcacoes.length === 0 ? null : jornadaDoDia(jornada as any, d)
    out.push(apurarDia({ data: d, jornada: jd, jornadaTipo: jornada?.tipo, marcacoes, feriado: feriados.has(d), abono, descontaIntervaloAuto: jornada?.descontaIntervaloAuto, cfg: cfgPonto(cfg) }))
  }
  if (!jornada) avisos.push('Colaborador sem jornada cadastrada: sem cálculo de atrasos/faltas.')
  const resumo = resumirMes(comp, out, feriados)
  return { competencia: comp, dias: out, resumo, avisos }
}
