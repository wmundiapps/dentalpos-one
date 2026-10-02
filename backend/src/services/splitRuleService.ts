// Regra de repasse ao dentista, a partir do acordo cadastrado no Corpo Clínico.

type DoctorRule = {
  contractType?: string | null
  revenueModel?: string | null
  revenuePercent?: number | null
  commissionPercent?: number | null
  revenueBase?: string | null
}

export type RuleSuggestion =
  | { ok: true; percent: number; base: 'BRUTO' | 'LIQUIDO'; label: string }
  | { ok: false; reason: string }

export function suggestRule(d: DoctorRule): RuleSuggestion {
  if (d.revenueModel === 'LOCACAO') return { ok: false, reason: 'Locação de espaço: o dentista cobra o paciente direto; não há repasse pela clínica.' }
  const percent = d.revenueModel === 'HONORARIO' ? Number(d.commissionPercent ?? d.revenuePercent ?? 0) : Number(d.revenuePercent ?? d.commissionPercent ?? 0)
  if (!(percent > 0 && percent <= 100)) return { ok: false, reason: 'Sem percentual de repasse no cadastro do dentista.' }
  const base = d.revenueBase === 'LIQUIDO' ? 'LIQUIDO' : 'BRUTO'
  const kind = d.revenueModel === 'HONORARIO' ? 'Honorário' : 'Participação'
  return { ok: true, percent, base, label: `${kind} de ${percent.toLocaleString('pt-BR')}% sobre o valor ${base === 'LIQUIDO' ? 'líquido (após taxas)' : 'bruto'}` }
}

const round2 = (n: number) => Math.round(n * 100) / 100

export type SplitRequest = { doctorId: string; mode?: 'RULE' | 'PERCENT' | 'FIXED'; value?: number }
export type ResolvedSplit = {
  asaas: { percentualValue?: number; fixedValue?: number; totalFixedValue?: number }
  line: { mode: 'PERCENT' | 'FIXED'; percent: number | null; plannedAmount: number }
}

// Converte o pedido em split do Asaas. Percentual do Asaas incide sobre o valor LÍQUIDO; para base BRUTO vira valor fixo.
export function resolveSplit(req: SplitRequest, doctor: DoctorRule, gross: number, installments: number): { ok: true; split: ResolvedSplit } | { ok: false; error: string } {
  const mode = req.mode || 'RULE'
  let percent: number | null = null
  let fixed: number | null = null
  let net = false

  if (mode === 'RULE') {
    const rule = suggestRule(doctor)
    if (!rule.ok) return { ok: false, error: rule.reason }
    if (rule.base === 'LIQUIDO') { percent = rule.percent; net = true } else { fixed = round2((gross * rule.percent) / 100); percent = rule.percent }
  } else if (mode === 'PERCENT') {
    const v = Number(req.value)
    if (!(v > 0 && v <= 100)) return { ok: false, error: 'Percentual de repasse inválido (use entre 0 e 100).' }
    percent = v; net = true
  } else {
    const v = Number(req.value)
    if (!(v > 0)) return { ok: false, error: 'Valor de repasse inválido.' }
    fixed = round2(v)
  }

  if (fixed !== null && fixed >= gross) return { ok: false, error: 'O repasse não pode ser igual ou maior que o valor da cobrança.' }
  if (net) {
    return { ok: true, split: { asaas: { percentualValue: round2(percent as number) }, line: { mode: 'PERCENT', percent, plannedAmount: round2((gross * (percent as number)) / 100) } } }
  }
  return {
    ok: true,
    split: {
      asaas: installments > 1 ? { totalFixedValue: fixed as number } : { fixedValue: fixed as number },
      line: { mode: 'FIXED', percent, plannedAmount: fixed as number }
    }
  }
}
