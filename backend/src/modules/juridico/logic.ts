// Regras PURAS do módulo Jurídico (sem banco): testáveis isoladamente.
// Todo texto/critério jurídico aqui é um MODELO de apoio e precisa ser validado por advogado.

export const DAY = 86_400_000

// ------------------------------------------------------------------ número CNJ (Resolução CNJ 65/2008)
/** Normaliza para NNNNNNN-DD.AAAA.J.TR.OOOO; null se não tiver 20 dígitos. */
export function formatarCnj(v: unknown): string | null {
  const d = String(v ?? '').replace(/\D+/g, '')
  if (d.length !== 20) return null
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`
}

/** Dígito verificador (módulo 97 base 10, ISO 7064): DD = 98 - ((NNNNNNN AAAA JTR OOOO 00) mod 97). */
export function dvCnj(d: string): number {
  const base = d.slice(0, 7) + d.slice(9, 20) + '00'
  return 98 - Number(BigInt(base) % 97n)
}

export function validarCnj(v: unknown): { ok: boolean; numero?: string; motivo?: string } {
  const d = String(v ?? '').replace(/\D+/g, '')
  if (d.length !== 20) return { ok: false, motivo: 'O número CNJ deve ter 20 dígitos (NNNNNNN-DD.AAAA.J.TR.OOOO).' }
  const dv = dvCnj(d)
  if (dv !== Number(d.slice(7, 9))) return { ok: false, motivo: `Dígito verificador do número CNJ inválido (esperado ${String(dv).padStart(2, '0')}).` }
  const ano = Number(d.slice(9, 13))
  if (ano < 1900 || ano > new Date().getFullYear() + 1) return { ok: false, motivo: 'Ano do número CNJ inválido.' }
  return { ok: true, numero: formatarCnj(d)! }
}

/** Gera um número CNJ válido (uso em seeds/testes). */
export function gerarCnj(seq: number, ano: number, j = 8, tr = 26, orgao = 100): string {
  const n = String(seq).padStart(7, '0'), o = String(orgao).padStart(4, '0')
  const meio = `${ano}${j}${String(tr).padStart(2, '0')}${o}`
  const dv = String(dvCnj(n + '00' + meio)).padStart(2, '0')
  return formatarCnj(n + dv + meio)!
}

// ------------------------------------------------------------------ vencimentos (30/60/90 dias)
export const LIMITES_VENCIMENTO = [90, 60, 30] as const
export type Faixa = 'VENCIDO' | 'D30' | 'D60' | 'D90' | 'OK'

export function diasAte(data: Date | string | null | undefined, hoje = new Date()): number | null {
  if (!data) return null
  const d = new Date(data)
  if (isNaN(d.getTime())) return null
  const a = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const b = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate())
  return Math.round((a - b) / DAY)
}

export function faixaVencimento(dias: number | null): Faixa | null {
  if (dias === null) return null
  if (dias < 0) return 'VENCIDO'
  if (dias <= 30) return 'D30'
  if (dias <= 60) return 'D60'
  if (dias <= 90) return 'D90'
  return 'OK'
}

export const severidadePorDias = (dias: number): 'INFO' | 'ATENCAO' | 'CRITICO' => (dias < 0 || dias <= 7 ? 'CRITICO' : dias <= 30 ? 'ATENCAO' : 'INFO')

/** Quais lembretes agendar para um vencimento: futuros (due - N) + 1 "de alcance" (agora) para o limite já cruzado. */
export function planoLembretes(due: Date, limites: readonly number[], hoje = new Date()): Array<{ limite: number | 'vencido'; remindAt: Date }> {
  const out: Array<{ limite: number | 'vencido'; remindAt: Date }> = []
  const dias = diasAte(due, hoje)
  if (dias === null) return out
  if (dias < 0) return [{ limite: 'vencido', remindAt: hoje }]
  const cruzados = limites.filter((n) => n >= dias)
  const menor = cruzados.length ? Math.min(...cruzados) : null
  for (const n of limites) {
    const at = new Date(due.getTime() - n * DAY)
    if (n === menor) out.push({ limite: n, remindAt: hoje })
    else if (n < dias) out.push({ limite: n, remindAt: at })
  }
  return out
}

// ------------------------------------------------------------------ riscos
export function scoreRisco(prob: number, imp: number) { return prob * imp }
export function nivelRisco(score: number): 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO' {
  return score >= 16 ? 'CRITICO' : score >= 10 ? 'ALTO' : score >= 5 ? 'MEDIO' : 'BAIXO'
}

// ------------------------------------------------------------------ locação
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function ultimoDiaMes(ano: number, mes0: number) { return new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate() }

/** Parcelas mensais entre início e fim (inclusive). Vencimento no dia informado (limitado ao último dia do mês). */
export function gerarParcelas(inicio: Date, fim: Date, dia: number, valor: number): Array<{ competencia: string; vencimento: Date; valor: number }> {
  const out: Array<{ competencia: string; vencimento: Date; valor: number }> = []
  let y = inicio.getUTCFullYear(), m = inicio.getUTCMonth()
  const fy = fim.getUTCFullYear(), fm = fim.getUTCMonth()
  while ((y < fy || (y === fy && m <= fm)) && out.length < 600) {
    const d = Math.min(dia, ultimoDiaMes(y, m))
    out.push({ competencia: `${y}-${String(m + 1).padStart(2, '0')}`, vencimento: new Date(Date.UTC(y, m, d, 12)), valor: r2(valor) })
    m++; if (m > 11) { m = 0; y++ }
  }
  return out
}

export const aplicarReajuste = (valor: number, pct: number) => r2(valor * (1 + pct / 100))

// ------------------------------------------------------------------ comissão de polo
export function comissaoEstimada(c: { comissionamentoTipo: string; comissionamentoPercentual?: number | null; comissionamentoValor?: number | null }, alunosAtivos: number): { valorMensal: number | null; nota: string } {
  switch (c.comissionamentoTipo) {
    case 'FIXO_MENSAL': return { valorMensal: r2(c.comissionamentoValor ?? 0), nota: 'Valor fixo mensal.' }
    case 'VALOR_POR_ALUNO': return { valorMensal: r2((c.comissionamentoValor ?? 0) * alunosAtivos), nota: `${alunosAtivos} aluno(s) ativo(s) x valor por aluno.` }
    case 'PERCENTUAL_MENSALIDADE': return { valorMensal: null, nota: `${c.comissionamentoPercentual ?? 0}% sobre as mensalidades dos alunos do polo (base de cálculo definida no financeiro).` }
    case 'MISTO': return { valorMensal: r2((c.comissionamentoValor ?? 0) * alunosAtivos), nota: 'Parte fixa por aluno estimada; a parte percentual depende das mensalidades.' }
    default: return { valorMensal: 0, nota: 'Sem comissionamento.' }
  }
}

// ------------------------------------------------------------------ inteligência de processos sofridos
export interface CausaInfo { chave: string; rotulo: string; causaProvavel: string; recomendacoes: string[]; setorSugerido: string }

export const CATALOGO_CAUSAS: CausaInfo[] = [
  { chave: 'COBRANCA_INDEVIDA', rotulo: 'Cobrança indevida / negativação', setorSugerido: 'Financeiro/Cobrança', causaProvavel: 'Falha de conciliação de pagamentos, cobrança de aluno já quitado ou com acordo, negativação sem notificação prévia.', recomendacoes: ['Revisar a régua de cobrança e exigir conferência de acordos/baixas antes de negativar.', 'Notificar o aluno por escrito antes de qualquer negativação e guardar prova do envio.', 'Criar rotina mensal de conciliação de baixas e estornos.'] },
  { chave: 'RESCISAO_CONTRATO_ALUNO', rotulo: 'Rescisão contratual / cancelamento de matrícula', setorSugerido: 'Secretaria/Financeiro', causaProvavel: 'Cláusulas de cancelamento e multa pouco claras, devolução de valores fora do prazo ou fora do contrato.', recomendacoes: ['Revisar cláusulas de cancelamento e devolução com o jurídico e destacá-las no contrato.', 'Padronizar o fluxo de cancelamento com protocolo e prazo de resposta.', 'Treinar a secretaria para registrar o motivo e a data do pedido.'] },
  { chave: 'PUBLICIDADE_ENGANOSA', rotulo: 'Publicidade / promessa não cumprida', setorSugerido: 'Marketing/Admissões', causaProvavel: 'Divulgação de cursos, reconhecimento, bolsas ou vagas sem lastro documental ou com condições omitidas.', recomendacoes: ['Submeter peças publicitárias à revisão jurídica antes da publicação.', 'Exibir condições, prazos e ato de reconhecimento em toda oferta.', 'Arquivar versão de cada campanha (documento no acervo) com período de vigência.'] },
  { chave: 'DIPLOMA_CERTIFICADO_ATRASO', rotulo: 'Atraso na emissão de diploma/certificado/histórico', setorSugerido: 'Secretaria', causaProvavel: 'Fila de registro sem prazo monitorado, pendências documentais não comunicadas ao aluno.', recomendacoes: ['Monitorar o prazo de emissão com alerta e responsável.', 'Comunicar pendências documentais por escrito e com prazo.', 'Priorizar casos com data limite (concursos, posse).'] },
  { chave: 'QUALIDADE_ENSINO', rotulo: 'Qualidade do ensino / falha na prestação do serviço', setorSugerido: 'Acadêmico/Coordenação', causaProvavel: 'Troca de docentes, carga horária não cumprida, falta de infraestrutura prometida (laboratórios, estágio).', recomendacoes: ['Acompanhar cumprimento de carga horária e registrar reposições.', 'Garantir estágios e laboratórios previstos no PPC antes de ofertar turmas.', 'Canal de resolução prévia (ouvidoria) com prazo de resposta.'] },
  { chave: 'DISCRIMINACAO_ASSEDIO', rotulo: 'Discriminação / assédio / dano moral', setorSugerido: 'RH/Ouvidoria', causaProvavel: 'Ausência de política e canal de denúncia efetivos; apuração tardia de relatos.', recomendacoes: ['Publicar política de combate ao assédio e discriminação e treinar gestores.', 'Garantir canal de denúncia com apuração em prazo definido e registro.', 'Documentar medidas adotadas em cada caso.'] },
  { chave: 'ACIDENTE_DANO_PESSOAL', rotulo: 'Acidente / dano pessoal em atividade', setorSugerido: 'Infraestrutura/Segurança', causaProvavel: 'Manutenção preventiva atrasada, falta de sinalização, atividade prática sem protocolo de segurança.', recomendacoes: ['Cumprir plano de manutenção preventiva e registrar vistorias.', 'Exigir termo de ciência e protocolo de segurança em aulas práticas.', 'Verificar cobertura de seguro de acidentes pessoais/responsabilidade civil.'] },
  { chave: 'TRABALHISTA_HORAS_EXTRAS', rotulo: 'Trabalhista: jornada e horas extras', setorSugerido: 'RH', causaProvavel: 'Controle de jornada inconsistente, banco de horas sem acordo formal, docentes com hora-atividade não paga.', recomendacoes: ['Implantar controle de jornada confiável e auditável.', 'Formalizar acordos de banco de horas e compensação.', 'Revisar o pagamento de hora-atividade e DSR de docentes.'] },
  { chave: 'TRABALHISTA_VINCULO', rotulo: 'Trabalhista: reconhecimento de vínculo', setorSugerido: 'RH/Jurídico', causaProvavel: 'Prestadores (PJ/autônomos) com subordinação e habitualidade; contratos sem escopo claro.', recomendacoes: ['Revisar contratos de prestação de serviços e a real forma de execução.', 'Evitar subordinação direta e controle de jornada de prestadores.', 'Mapear funções críticas para contratação via CLT.'] },
  { chave: 'TRABALHISTA_VERBAS_RESCISORIAS', rotulo: 'Trabalhista: verbas rescisórias e FGTS', setorSugerido: 'RH/Departamento Pessoal', causaProvavel: 'Atraso no pagamento rescisório, recolhimento de FGTS divergente, homologação com ressalvas.', recomendacoes: ['Checklist de desligamento com prazo legal de pagamento.', 'Conciliação mensal de FGTS e encargos.', 'Revisão jurídica prévia de desligamentos sensíveis.'] },
  { chave: 'CONTRATUAL_FORNECEDOR', rotulo: 'Contratual: fornecedores e prestadores', setorSugerido: 'Compras/Jurídico', causaProvavel: 'Contratos sem cláusulas de entrega, multa e rescisão; aditivos informais.', recomendacoes: ['Adotar modelos padrão com SLA, multa e rescisão.', 'Registrar aditivos formalmente e monitorar vigência.', 'Qualificar fornecedores antes da contratação.'] },
  { chave: 'LOCACAO_IMOVEL', rotulo: 'Locação / imóveis', setorSugerido: 'Infraestrutura/Jurídico', causaProvavel: 'Reajustes e garantias mal controlados, renovação não negociada a tempo, benfeitorias sem acordo.', recomendacoes: ['Monitorar vencimento e janela de renovatória (alerta 90 dias).', 'Formalizar benfeitorias e vistorias de entrada/saída.', 'Controlar reajuste e garantia por contrato.'] },
  { chave: 'TRIBUTARIO_FISCAL', rotulo: 'Tributário / fiscal', setorSugerido: 'Contabilidade/Fiscal', causaProvavel: 'Divergência de enquadramento, obrigações acessórias em atraso, imunidade/isenção não comprovada.', recomendacoes: ['Revisar anualmente o enquadramento e a documentação de imunidade/isenção.', 'Calendário fiscal com responsáveis e alertas.', 'Guardar certidões negativas atualizadas.'] },
  { chave: 'PROTECAO_DADOS', rotulo: 'Proteção de dados (LGPD)', setorSugerido: 'DPO/TI', causaProvavel: 'Incidente de segurança, compartilhamento sem base legal, solicitações de titulares fora do prazo.', recomendacoes: ['Manter ROPA e consentimentos atualizados (Central LGPD).', 'Responder solicitações de titulares dentro de 15 dias.', 'Testar o plano de resposta a incidentes.'] },
  { chave: 'PARCERIA_POLO', rotulo: 'Parcerias e polos EAD', setorSugerido: 'Modalidades/Jurídico', causaProvavel: 'Contrato de polo sem regra de comissão, patrimônio cedido sem inventário, rescisão mal conduzida.', recomendacoes: ['Todo polo com contrato vigente, comissão definida e patrimônio inventariado.', 'Checklist de rescisão (alunos, patrimônio, comunicação ao MEC).', 'Auditoria periódica da atuação do polo.'] },
  { chave: 'OUTRA', rotulo: 'Outra / não classificada', setorSugerido: '—', causaProvavel: 'Causa ainda não classificada: classifique para que a recorrência seja detectada.', recomendacoes: ['Classificar a causa raiz do processo assim que a análise inicial for concluída.'] },
]

export const normalizarCausa = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '_').slice(0, 80)
export const infoCausa = (chave?: string | null): CausaInfo | undefined => CATALOGO_CAUSAS.find((c) => c.chave === chave)

export interface ProcLite {
  id?: string; area: string; assunto: string; causaRaiz?: string | null; setorOrigem?: string | null; tipoOrigem?: string | null
  valorCausa?: number | null; provisaoValor?: number | null; resultado?: string | null; status?: string; risco?: string
  dataDistribuicao?: Date | string | null; createdAt?: Date | string
}

export interface Grupo { chave: string; qtd: number; valorCausa: number; provisao: number; perdidos: number; ganhos: number; acordos: number; encerrados: number; taxaPerda: number | null; ultimoEm: string | null }

const dataProc = (p: ProcLite) => new Date((p.dataDistribuicao ?? p.createdAt) as any)

export function agrupar(procs: ProcLite[], chaveDe: (p: ProcLite) => string | null | undefined): Grupo[] {
  const m = new Map<string, Grupo & { _u: number }>()
  for (const p of procs) {
    const k = (chaveDe(p) || 'NAO_INFORMADO') as string
    const g = m.get(k) ?? { chave: k, qtd: 0, valorCausa: 0, provisao: 0, perdidos: 0, ganhos: 0, acordos: 0, encerrados: 0, taxaPerda: null, ultimoEm: null, _u: 0 }
    g.qtd++; g.valorCausa += p.valorCausa ?? 0; g.provisao += p.provisaoValor ?? 0
    if (p.status === 'ENCERRADO') g.encerrados++
    if (p.resultado === 'PERDIDO') g.perdidos++
    if (p.resultado === 'GANHO') g.ganhos++
    if (p.resultado === 'ACORDO') g.acordos++
    const t = dataProc(p).getTime(); if (t > g._u) g._u = t
    m.set(k, g)
  }
  return [...m.values()].map(({ _u, ...g }) => ({ ...g, valorCausa: r2(g.valorCausa), provisao: r2(g.provisao), taxaPerda: g.encerrados ? r2((g.perdidos / g.encerrados) * 100) : null, ultimoEm: _u ? new Date(_u).toISOString() : null }))
    .sort((a, b) => b.qtd - a.qtd || b.valorCausa - a.valorCausa)
}

export interface Recorrencia { causaRaiz: string; qtd12m: number; qtdAnterior12m: number; variacaoPct: number | null; tendencia: 'ALTA' | 'ESTAVEL' | 'QUEDA' | 'NOVA'; recorrente: boolean; setorMaisAfetado: string | null; ultimos90d: number; valorCausa12m: number }

/** Recorrência por causa raiz: ≥3 processos em 12 meses OU ≥2 nos últimos 90 dias = recorrente. */
export function recorrencia(procs: ProcLite[], hoje = new Date()): Recorrencia[] {
  const t12 = hoje.getTime() - 365 * DAY, t24 = hoje.getTime() - 730 * DAY, t90 = hoje.getTime() - 90 * DAY
  const porCausa = new Map<string, ProcLite[]>()
  for (const p of procs) { const k = p.causaRaiz || 'NAO_INFORMADO'; (porCausa.get(k) ?? porCausa.set(k, []).get(k)!).push(p) }
  const out: Recorrencia[] = []
  for (const [causa, ps] of porCausa) {
    const a = ps.filter((p) => dataProc(p).getTime() >= t12)
    const b = ps.filter((p) => { const t = dataProc(p).getTime(); return t >= t24 && t < t12 })
    const u90 = ps.filter((p) => dataProc(p).getTime() >= t90).length
    const setores = new Map<string, number>()
    for (const p of a) if (p.setorOrigem) setores.set(p.setorOrigem, (setores.get(p.setorOrigem) ?? 0) + 1)
    const setor = [...setores.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null
    const variacao = b.length ? r2(((a.length - b.length) / b.length) * 100) : null
    const tendencia: Recorrencia['tendencia'] = !b.length && a.length ? 'NOVA' : a.length > b.length ? 'ALTA' : a.length < b.length ? 'QUEDA' : 'ESTAVEL'
    out.push({ causaRaiz: causa, qtd12m: a.length, qtdAnterior12m: b.length, variacaoPct: variacao, tendencia, recorrente: a.length >= 3 || u90 >= 2, setorMaisAfetado: setor, ultimos90d: u90, valorCausa12m: r2(a.reduce((s, p) => s + (p.valorCausa ?? 0), 0)) })
  }
  return out.filter((r) => r.qtd12m > 0).sort((x, y) => y.qtd12m - x.qtd12m || y.valorCausa12m - x.valorCausa12m)
}

/** Pontuação para o ranking de causas: volume pesa mais; valor e recorrência desempatam. */
export function pontuacaoCausa(r: Recorrencia): number {
  return r.qtd12m * 10 + Math.min(50, Math.round(r.valorCausa12m / 10_000)) + (r.recorrente ? 15 : 0) + (r.tendencia === 'ALTA' ? 10 : 0)
}
