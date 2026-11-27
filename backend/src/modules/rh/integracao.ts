// ============================================================
// RH -> Financeiro (Tesouraria / contas a pagar): CONTRATO SIMPLES, sem dependência de código de outros módulos.
//
//   import { gerarLancamentosFolha, registrarConsumidorFolha } from '../rh/integracao'
//
//   1) Sob demanda:   const lancs = await gerarLancamentosFolha(tenantId, '2026-10')   // exige folha MENSAL FECHADA
//   2) Por evento:    registrarConsumidorFolha(async ({ tenantId, competencia, lancamentos }) => { ...criar contas a pagar... })
//                     (chamado em processo quando o RH fecha a folha; falhas do consumidor NÃO impedem o fechamento)
//   3) Por HTTP:      GET /api/edu/rh/folha/:competencia/lancamentos  (RH/Financeiro)
//
// Cada lançamento traz `chaveIdempotencia` ESTÁVEL: o consumidor deve usá-la para não duplicar (re-fechamentos geram as mesmas chaves).
// Todos os lançamentos saem como `PARA_CONFERENCIA` com `exigeAutorizacao: true`: o Financeiro confere e autoriza o pagamento.
// Dados bancários/PIX NÃO são enviados (sensíveis): consulte GET /api/edu/rh/dados-bancarios/:colaboradorId (RH/Financeiro, com log de acesso).
// Valores e vencimentos são MODELO a validar pelo contador.
// ============================================================
import { prisma } from '../../lib/prisma'
import { addDiasUteis } from '../lgpd/prazos'
import { addDiasStr, diasDoMes, r2 } from './calculo'

export type TipoLancamentoFolha = 'SALARIO' | 'DECIMO_TERCEIRO' | 'PRO_LABORE' | 'TERCEIRO_RPA' | 'TERCEIRO_PJ' | 'COLABORADOR_PJ' | 'INSS' | 'IRRF' | 'FGTS'
export interface LancamentoFolha {
  chaveIdempotencia: string
  origem: 'RH_FOLHA'
  tipo: TipoLancamentoFolha
  descricao: string
  beneficiario: { tipo: 'COLABORADOR' | 'SOCIO' | 'TERCEIRO' | 'ORGAO'; nome: string; documentoMascarado: string | null; refId: string | null }
  competencia: string
  vencimento: string          // YYYY-MM-DD
  valor: number               // sempre positivo, 2 casas
  centroCusto: string | null
  categoriaSugerida: 'FOLHA_SALARIOS' | 'DECIMO_TERCEIRO' | 'PRO_LABORE' | 'SERVICOS_TERCEIROS' | 'ENCARGOS_SOCIAIS' | 'IMPOSTOS_RETIDOS'
  meioPagamentoSugerido: 'PIX_OU_TED' | 'GUIA'
  refType: string
  refId: string
  status: 'PARA_CONFERENCIA'
  exigeAutorizacao: true
  modeloAValidar: true
}
export interface EventoFolhaFechada { tenantId: string; competencia: string; lancamentos: LancamentoFolha[] }
export type ConsumidorFolha = (ev: EventoFolhaFechada) => Promise<void> | void

const consumidores: ConsumidorFolha[] = []
export function registrarConsumidorFolha(fn: ConsumidorFolha): () => void {
  consumidores.push(fn)
  return () => { const i = consumidores.indexOf(fn); if (i >= 0) consumidores.splice(i, 1) }
}
export async function notificarFolhaFechada(ev: EventoFolhaFechada) {
  const falhas: string[] = []
  for (const c of consumidores) { try { await c(ev) } catch (e: any) { falhas.push(String(e?.message || e).slice(0, 200)); console.error('[rh] consumidor da folha falhou:', e?.message) } }
  return { consumidores: consumidores.length, falhas }
}

const ultimoDia = (comp: string) => { const d = diasDoMes(comp); return d[d.length - 1] }
const diaUtilAnterior = (dia: string) => { let d = dia; for (let i = 0; i < 7; i++) { const dt = new Date(d + 'T12:00:00Z'); const w = dt.getUTCDay(); if (w !== 0 && w !== 6) return d; d = addDiasStr(d, -1) } return d }
const proxMes = (comp: string) => { const [y, m] = comp.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}` }

/** Lançamentos a pagar da folha FECHADA da competência (salários, 13º, pró-labore, terceiros e guias de tributos). */
export async function gerarLancamentosFolha(tenantId: string, competencia: string): Promise<LancamentoFolha[]> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) throw Object.assign(new Error('Competência inválida (use YYYY-MM).'), { status: 400 })
  const folhas = await prisma.rheFolha.findMany({ where: { tenantId, competencia, status: 'FECHADA' } })
  const mensal = folhas.find((f) => f.tipo === 'MENSAL')
  if (!folhas.length) throw Object.assign(new Error('A folha desta competência não está fechada: feche a folha antes de gerar os lançamentos.'), { status: 409 })
  const out: LancamentoFolha[] = []
  const deps = Object.fromEntries((await prisma.rheDepartamento.findMany({ where: { tenantId }, select: { id: true, centroCusto: true } })).map((d) => [d.id, d.centroCusto]))
  const venSalario = diaUtilAnterior(addDiasUteis(new Date(ultimoDia(competencia) + 'T12:00:00Z'), 5).toISOString().slice(0, 10))
  const venGuia = diaUtilAnterior(`${proxMes(competencia)}-20`)
  let totInss = 0, totIrrf = 0, totFgts = 0
  const mk = (x: Omit<LancamentoFolha, 'origem' | 'status' | 'exigeAutorizacao' | 'modeloAValidar' | 'competencia' | 'valor'> & { valor: number }): void => {
    if (x.valor <= 0.004) return
    out.push({ ...x, valor: r2(x.valor), origem: 'RH_FOLHA', status: 'PARA_CONFERENCIA', exigeAutorizacao: true, modeloAValidar: true, competencia })
  }
  for (const f of folhas) {
    const hs = await prisma.rheHolerite.findMany({ where: { tenantId, folhaId: f.id } })
    const cols = Object.fromEntries((await prisma.rheColaborador.findMany({ where: { tenantId, id: { in: hs.map((h) => h.colaboradorId) } } })).map((c) => [c.id, c]))
    for (const h of hs) {
      const c = cols[h.colaboradorId]; if (!c) continue
      const cc = c.centroCusto ?? (c.departamentoId ? deps[c.departamentoId] : null) ?? null
      const doc = c.cpfFinal ? `***.***.***-${c.cpfFinal}` : null
      const dec = f.tipo !== 'MENSAL'
      const ven = f.tipo === 'DECIMO_1A' ? diaUtilAnterior(`${competencia.slice(0, 4)}-11-30`) : f.tipo === 'DECIMO_2A' ? diaUtilAnterior(`${competencia.slice(0, 4)}-12-20`) : venSalario
      mk({ chaveIdempotencia: `rhe:${tenantId}:${competencia}:${f.tipo}:${h.id}`, tipo: c.vinculo === 'PJ' ? 'COLABORADOR_PJ' : dec ? 'DECIMO_TERCEIRO' : 'SALARIO', descricao: `${c.vinculo === 'PJ' ? 'Honorários PJ' : dec ? (f.tipo === 'DECIMO_1A' ? '13º salário - 1ª parcela' : '13º salário - 2ª parcela') : 'Folha de pagamento'} ${competencia} - ${c.nome}`, beneficiario: { tipo: 'COLABORADOR', nome: c.nome, documentoMascarado: doc, refId: c.id }, vencimento: ven, valor: h.liquido, centroCusto: cc, categoriaSugerida: dec ? 'DECIMO_TERCEIRO' : c.vinculo === 'PJ' ? 'SERVICOS_TERCEIROS' : 'FOLHA_SALARIOS', meioPagamentoSugerido: 'PIX_OU_TED', refType: 'RheHolerite', refId: h.id })
      totInss += h.inss; totIrrf += h.irrf; totFgts += h.fgts
    }
  }
  const patronalHol = (await prisma.rheHolerite.aggregate({ where: { tenantId, folhaId: { in: folhas.map((f) => f.id) } }, _sum: { patronal: true } }))._sum.patronal ?? 0
  if (mensal) {
    const pls = await prisma.rheProLabore.findMany({ where: { tenantId, folhaId: mensal.id } })
    const socios = Object.fromEntries((await prisma.rheSocio.findMany({ where: { tenantId, id: { in: pls.map((p) => p.socioId) } } })).map((s) => [s.id, s]))
    let patPl = 0
    for (const p of pls) {
      const s = socios[p.socioId]
      mk({ chaveIdempotencia: `rhe:${tenantId}:${competencia}:PRO_LABORE:${p.id}`, tipo: 'PRO_LABORE', descricao: `Pró-labore ${competencia} - ${s?.nome ?? 'sócio'}`, beneficiario: { tipo: 'SOCIO', nome: s?.nome ?? 'Sócio', documentoMascarado: s?.cpfFinal ? `***.***.***-${s.cpfFinal}` : null, refId: p.socioId }, vencimento: venSalario, valor: p.liquido, centroCusto: null, categoriaSugerida: 'PRO_LABORE', meioPagamentoSugerido: 'PIX_OU_TED', refType: 'RheProLabore', refId: p.id })
      totInss += p.inss; totIrrf += p.irrf
      patPl += p.bruto * 0.2   // INSS patronal de 20% sobre pró-labore (modelo)
    }
    totInss += patPl
  }
  const pags = await prisma.rhePagamentoTerceiro.findMany({ where: { tenantId, competencia, status: 'APROVADO' } })
  const ters = Object.fromEntries((await prisma.rheTerceiro.findMany({ where: { tenantId, id: { in: pags.map((p) => p.terceiroId) } } })).map((t) => [t.id, t]))
  for (const p of pags) {
    const t = ters[p.terceiroId]
    mk({ chaveIdempotencia: `rhe:${tenantId}:${competencia}:TERCEIRO:${p.id}`, tipo: t?.tipo === 'PJ' ? 'TERCEIRO_PJ' : 'TERCEIRO_RPA', descricao: `${t?.tipo === 'PJ' ? 'Serviço PJ' : 'RPA'} ${competencia} - ${t?.nome ?? 'terceiro'}: ${p.descricao}${p.notaFiscal ? ` (NF ${p.notaFiscal})` : ''}`, beneficiario: { tipo: 'TERCEIRO', nome: t?.nome ?? 'Terceiro', documentoMascarado: t?.documentoFinal ? '***' + t.documentoFinal : null, refId: p.terceiroId }, vencimento: p.dataPrevista ? p.dataPrevista.toISOString().slice(0, 10) : venSalario, valor: p.liquido, centroCusto: null, categoriaSugerida: 'SERVICOS_TERCEIROS', meioPagamentoSugerido: 'PIX_OU_TED', refType: 'RhePagamentoTerceiro', refId: p.id })
    totInss += p.inss + p.patronal; totIrrf += p.irrf
  }
  const gid = (t: string) => `rhe:${tenantId}:${competencia}:${t}`
  const [ano, mes] = competencia.split('-')
  mk({ chaveIdempotencia: gid('GUIA_INSS'), tipo: 'INSS', descricao: `INSS (GPS/DARF previdenciária) ${competencia} - retido de empregados e contribuintes + patronal estimado`, beneficiario: { tipo: 'ORGAO', nome: 'Receita Federal - Previdência', documentoMascarado: null, refId: null }, vencimento: venGuia, valor: totInss + patronalHolPatronal(patronalHol), centroCusto: null, categoriaSugerida: 'ENCARGOS_SOCIAIS', meioPagamentoSugerido: 'GUIA', refType: 'RheFolha', refId: (mensal ?? folhas[0]).id })
  mk({ chaveIdempotencia: gid('GUIA_IRRF'), tipo: 'IRRF', descricao: `IRRF retido na fonte (DARF 0561/0588) ${mes}/${ano}`, beneficiario: { tipo: 'ORGAO', nome: 'Receita Federal - IRRF', documentoMascarado: null, refId: null }, vencimento: venGuia, valor: totIrrf, centroCusto: null, categoriaSugerida: 'IMPOSTOS_RETIDOS', meioPagamentoSugerido: 'GUIA', refType: 'RheFolha', refId: (mensal ?? folhas[0]).id })
  mk({ chaveIdempotencia: gid('GUIA_FGTS'), tipo: 'FGTS', descricao: `FGTS (guia FGTS Digital) ${mes}/${ano}`, beneficiario: { tipo: 'ORGAO', nome: 'Caixa Econômica Federal - FGTS', documentoMascarado: null, refId: null }, vencimento: venGuia, valor: totFgts, centroCusto: null, categoriaSugerida: 'ENCARGOS_SOCIAIS', meioPagamentoSugerido: 'GUIA', refType: 'RheFolha', refId: (mensal ?? folhas[0]).id })
  return out.sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.chaveIdempotencia.localeCompare(b.chaveIdempotencia))
}
const patronalHolPatronal = (v: number) => v
