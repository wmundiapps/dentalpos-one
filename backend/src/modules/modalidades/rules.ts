// Funções PURAS do módulo de modalidades (sem acesso a banco) — testadas em __selftest__.ts.

export type Modalidade = 'PRESENCIAL' | 'SEMIPRESENCIAL' | 'EAD' | 'HIBRIDO'

export interface RegrasModalidade {
  maxPctEadPresencial: number
  minPctPresencialSemi: number
  maxPctEadSemi: number
  minEncontrosPresenciaisEad: number
  minAvaliacoesPresenciaisEad: number
  alunosPorTutorEad: number
  alunosPorTutorSemi: number
}

export const REGRAS_PADRAO: RegrasModalidade = {
  maxPctEadPresencial: 40,
  minPctPresencialSemi: 40,
  maxPctEadSemi: 60,
  minEncontrosPresenciaisEad: 1,
  minAvaliacoesPresenciaisEad: 1,
  alunosPorTutorEad: 50,
  alunosPorTutorSemi: 80,
}

export interface DisciplinaCarga {
  id: string
  nome: string
  cargaPresencial: number
  cargaOnline: number
  encontrosPresenciais?: number
  avaliacoesPresenciais?: number
  modalidade?: Modalidade
}

export interface Alerta {
  codigo: string
  severidade: 'INFO' | 'ATENCAO' | 'CRITICO'
  mensagem: string
  disciplinaId?: string
}

const r1 = (n: number) => Math.round(n * 10) / 10
const pct = (a: number, b: number) => (b > 0 ? r1((a / b) * 100) : 0)

export interface ConformidadeInput {
  modalidade: Modalidade
  cargaHorariaTotal?: number
  disciplinas: DisciplinaCarga[]
  regras?: Partial<RegrasModalidade>
  alunos?: number
  tutores?: number
}

export interface ConformidadeResultado {
  conforme: boolean
  modalidade: Modalidade
  cargaTotal: number
  cargaPresencial: number
  cargaOnline: number
  percentualPresencial: number
  percentualEad: number
  limiteEad: number | null
  minimoPresencial: number | null
  alertas: Alerta[]
  porDisciplina: Array<{ id: string; nome: string; carga: number; percentualEad: number; conforme: boolean }>
}

export function avaliarConformidade(input: ConformidadeInput): ConformidadeResultado {
  const regras = { ...REGRAS_PADRAO, ...(input.regras ?? {}) }
  const alertas: Alerta[] = []
  const ds = input.disciplinas
  const cargaPresencial = ds.reduce((s, d) => s + Math.max(0, d.cargaPresencial), 0)
  const cargaOnline = ds.reduce((s, d) => s + Math.max(0, d.cargaOnline), 0)
  const cargaTotal = cargaPresencial + cargaOnline
  const percentualEad = pct(cargaOnline, cargaTotal)
  const percentualPresencial = cargaTotal > 0 ? r1(100 - percentualEad) : 0
  let limiteEad: number | null = null
  let minimoPresencial: number | null = null

  if (ds.length === 0) alertas.push({ codigo: 'SEM_DISCIPLINAS', severidade: 'CRITICO', mensagem: 'Matriz sem disciplinas com carga horária informada.' })
  if (input.cargaHorariaTotal && cargaTotal > 0 && Math.abs(input.cargaHorariaTotal - cargaTotal) > 0.5) {
    alertas.push({
      codigo: 'CARGA_DIVERGENTE',
      severidade: 'ATENCAO',
      mensagem: `Carga distribuída (${cargaTotal}h) difere da carga total do curso (${input.cargaHorariaTotal}h).`,
    })
  }

  const porDisciplina = ds.map((d) => {
    const carga = d.cargaPresencial + d.cargaOnline
    const pe = pct(d.cargaOnline, carga)
    let ok = true
    if (carga <= 0) {
      ok = false
      alertas.push({ codigo: 'DISCIPLINA_SEM_CARGA', severidade: 'ATENCAO', mensagem: `Disciplina "${d.nome}" sem carga horária.`, disciplinaId: d.id })
    }
    if (input.modalidade === 'EAD') {
      if ((d.encontrosPresenciais ?? 0) < regras.minEncontrosPresenciaisEad) {
        ok = false
        alertas.push({
          codigo: 'EAD_SEM_ENCONTRO',
          severidade: 'ATENCAO',
          mensagem: `Disciplina "${d.nome}": mínimo de ${regras.minEncontrosPresenciaisEad} encontro(s) presencial(is) não atendido.`,
          disciplinaId: d.id,
        })
      }
      if ((d.avaliacoesPresenciais ?? 0) < regras.minAvaliacoesPresenciaisEad) {
        ok = false
        alertas.push({
          codigo: 'EAD_SEM_AVALIACAO_PRESENCIAL',
          severidade: 'CRITICO',
          mensagem: `Disciplina "${d.nome}": avaliação presencial obrigatória ausente (mín. ${regras.minAvaliacoesPresenciaisEad}).`,
          disciplinaId: d.id,
        })
      }
    }
    return { id: d.id, nome: d.nome, carga, percentualEad: pe, conforme: ok }
  })

  if (input.modalidade === 'PRESENCIAL') {
    limiteEad = regras.maxPctEadPresencial
    if (percentualEad > limiteEad)
      alertas.push({
        codigo: 'PRESENCIAL_EXCEDE_EAD',
        severidade: 'CRITICO',
        mensagem: `Curso presencial com ${percentualEad}% de carga EAD; limite ${limiteEad}%.`,
      })
    else if (percentualEad > limiteEad * 0.9)
      alertas.push({ codigo: 'PRESENCIAL_PROXIMO_LIMITE', severidade: 'ATENCAO', mensagem: `Carga EAD (${percentualEad}%) próxima do limite de ${limiteEad}%.` })
  } else if (input.modalidade === 'SEMIPRESENCIAL' || input.modalidade === 'HIBRIDO') {
    limiteEad = regras.maxPctEadSemi
    minimoPresencial = regras.minPctPresencialSemi
    if (percentualEad > limiteEad)
      alertas.push({ codigo: 'SEMI_EXCEDE_EAD', severidade: 'CRITICO', mensagem: `Carga online de ${percentualEad}% excede o limite de ${limiteEad}%.` })
    if (percentualPresencial < minimoPresencial)
      alertas.push({
        codigo: 'SEMI_PRESENCIAL_INSUFICIENTE',
        severidade: 'CRITICO',
        mensagem: `Carga presencial de ${percentualPresencial}% abaixo do mínimo de ${minimoPresencial}%.`,
      })
  } else if (input.modalidade === 'EAD') {
    if (cargaTotal > 0 && cargaPresencial === 0)
      alertas.push({ codigo: 'EAD_SEM_PRESENCIAL', severidade: 'ATENCAO', mensagem: 'Curso EAD sem nenhuma atividade presencial (estágio, prática, avaliação).' })
  }

  if (input.alunos != null && input.tutores != null && (input.modalidade === 'EAD' || input.modalidade === 'SEMIPRESENCIAL' || input.modalidade === 'HIBRIDO')) {
    const limite = input.modalidade === 'EAD' ? regras.alunosPorTutorEad : regras.alunosPorTutorSemi
    const rel = relacaoAlunoTutor(input.alunos, input.tutores, limite)
    if (rel.status !== 'OK')
      alertas.push({
        codigo: 'TUTORIA_INSUFICIENTE',
        severidade: rel.status === 'CRITICO' ? 'CRITICO' : 'ATENCAO',
        mensagem: rel.relacao != null ? `Relação aluno/tutor de ${rel.relacao} (limite ${limite}); faltam ${rel.tutoresFaltantes} tutor(es).` : `Curso sem tutores alocados (limite de ${limite} alunos por tutor); faltam ${rel.tutoresFaltantes} tutor(es).`,
      })
  }

  const conforme = !alertas.some((a) => a.severidade === 'CRITICO') && porDisciplina.every((d) => d.conforme)
  return { conforme, modalidade: input.modalidade, cargaTotal, cargaPresencial, cargaOnline, percentualPresencial, percentualEad, limiteEad, minimoPresencial, alertas, porDisciplina }
}

export function relacaoAlunoTutor(alunos: number, tutores: number, limite: number) {
  const necessarios = limite > 0 ? Math.ceil(alunos / limite) : 0
  const relacao = tutores > 0 ? r1(alunos / tutores) : null
  const faltantes = Math.max(0, necessarios - tutores)
  let status: 'OK' | 'ATENCAO' | 'CRITICO' = 'OK'
  if (alunos > 0 && tutores === 0) status = 'CRITICO'
  else if (relacao != null && relacao > limite * 1.25) status = 'CRITICO'
  else if (relacao != null && relacao > limite) status = 'ATENCAO'
  return { alunos, tutores, limite, relacao, tutoresNecessarios: necessarios, tutoresFaltantes: faltantes, status }
}

// ---------- SLA de atendimento ----------
export function slaLimite(abertoEm: Date, prioridade: string, cfg: { slaRespostaHoras: number; slaUrgenteHoras: number }): Date {
  const h = prioridade === 'URGENTE' ? cfg.slaUrgenteHoras : prioridade === 'ALTA' ? Math.max(1, Math.round(cfg.slaRespostaHoras / 2)) : prioridade === 'BAIXA' ? cfg.slaRespostaHoras * 2 : cfg.slaRespostaHoras
  return new Date(abertoEm.getTime() + h * 3_600_000)
}

export function estadoSla(now: Date, abertoEm: Date, limite: Date, respondidoEm?: Date | null) {
  const total = limite.getTime() - abertoEm.getTime()
  if (respondidoEm) return { estado: respondidoEm <= limite ? 'CUMPRIDO' : 'VIOLADO', consumidoPct: 100 }
  const consumido = total > 0 ? ((now.getTime() - abertoEm.getTime()) / total) * 100 : 100
  const estado = now > limite ? 'VENCIDO' : consumido >= 75 ? 'EM_RISCO' : 'NO_PRAZO'
  return { estado, consumidoPct: Math.round(consumido) }
}

// ---------- Engajamento / risco de evasão ----------
export interface MetricasEngajamento {
  diasSemAcesso: number
  horas30d: number
  acessos30d: number
  tarefas30d: number
  tarefasEsperadas30d?: number
  atendimentosSemResposta?: number
}

export function calcularRiscoEngajamento(m: MetricasEngajamento, cfg = { diasInatividadeAtencao: 7, diasInatividadeCritico: 14 }) {
  const fatores: Record<string, number> = {}
  const d = m.diasSemAcesso
  fatores.inatividade = d >= cfg.diasInatividadeCritico ? 50 : d >= cfg.diasInatividadeAtencao ? 30 : d >= 3 ? 10 : 0
  fatores.tempoBaixo = m.horas30d < 2 ? 20 : m.horas30d < 8 ? 10 : 0
  fatores.poucosAcessos = m.acessos30d < 4 ? 10 : m.acessos30d < 12 ? 5 : 0
  const esp = m.tarefasEsperadas30d ?? 4
  const taxa = esp > 0 ? m.tarefas30d / esp : 1
  fatores.entregas = taxa < 0.25 ? 20 : taxa < 0.6 ? 10 : 0
  fatores.atendimentos = Math.min(10, (m.atendimentosSemResposta ?? 0) * 5)
  const score = Math.min(100, Object.values(fatores).reduce((a, b) => a + b, 0))
  const nivel = score >= 70 ? 'CRITICO' : score >= 45 ? 'ALTO' : score >= 20 ? 'MEDIO' : 'BAIXO'
  return { score, nivel, fatores }
}

export function diasEntre(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000)
}

// ---------- Presença em webconferência ----------
export interface EventoPresenca {
  tipo: 'ENTRADA' | 'SAIDA'
  em: Date
}
// Constrói intervalos ENTRADA->SAIDA, recorta na janela da aula e soma minutos (sem sobreposição).
export function calcularPresencaLive(eventos: EventoPresenca[], inicio: Date, fim: Date, minimoPct = 75) {
  const evs = [...eventos].sort((a, b) => a.em.getTime() - b.em.getTime())
  const intervalos: Array<[number, number]> = []
  let aberta: number | null = null
  for (const e of evs) {
    if (e.tipo === 'ENTRADA') {
      if (aberta == null) aberta = e.em.getTime()
    } else if (aberta != null) {
      intervalos.push([aberta, e.em.getTime()])
      aberta = null
    }
  }
  if (aberta != null) intervalos.push([aberta, fim.getTime()]) // sem saída: considera até o fim
  const ini = inicio.getTime()
  const f = fim.getTime()
  const rec = intervalos
    .map(([a, b]) => [Math.max(a, ini), Math.min(b, f)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0])
  let total = 0
  let cur: [number, number] | null = null
  for (const iv of rec) {
    if (!cur) cur = [...iv]
    else if (iv[0] <= cur[1]) cur[1] = Math.max(cur[1], iv[1])
    else {
      total += cur[1] - cur[0]
      cur = [...iv]
    }
  }
  if (cur) total += cur[1] - cur[0]
  const duracao = f - ini
  const percentual = duracao > 0 ? r1((total / duracao) * 100) : 0
  return { minutos: r1(total / 60000), percentual, presente: percentual >= minimoPct }
}

// ---------- Pós-graduação ----------
export const NIVEIS_STRICTO = ['MESTRADO_ACADEMICO', 'MESTRADO_PROFISSIONAL', 'DOUTORADO']
export const ehStricto = (nivel: string) => NIVEIS_STRICTO.includes(nivel)

export function validarLato(p: { cargaHoraria: number; modulos: Array<{ cargaHoraria: number }>; exigeTcc?: boolean; docentes?: Array<{ titulacao: string }> }, cargaMinima = 360) {
  const alertas: Alerta[] = []
  const somaModulos = p.modulos.reduce((s, m) => s + m.cargaHoraria, 0)
  if (p.cargaHoraria < cargaMinima)
    alertas.push({ codigo: 'LATO_CARGA_MINIMA', severidade: 'CRITICO', mensagem: `Carga de ${p.cargaHoraria}h abaixo do mínimo de ${cargaMinima}h (Res. CNE/CES 1/2018).` })
  if (p.modulos.length === 0) alertas.push({ codigo: 'LATO_SEM_MODULOS', severidade: 'ATENCAO', mensagem: 'Programa sem módulos cadastrados.' })
  else if (somaModulos < p.cargaHoraria)
    alertas.push({ codigo: 'LATO_MODULOS_INSUFICIENTES', severidade: 'ATENCAO', mensagem: `Módulos somam ${somaModulos}h, abaixo da carga do curso (${p.cargaHoraria}h).` })
  if (p.docentes && p.docentes.length) {
    const tit = p.docentes.filter((d) => ['MESTRE', 'DOUTOR', 'POS_DOUTOR'].includes(d.titulacao)).length
    if (tit / p.docentes.length < 0.3)
      alertas.push({ codigo: 'LATO_CORPO_DOCENTE', severidade: 'CRITICO', mensagem: 'Menos de 30% do corpo docente com titulação de mestre ou doutor.' })
  }
  return { conforme: !alertas.some((a) => a.severidade === 'CRITICO'), somaModulos, alertas }
}

export function capacidadeOrientador(d: { capacidadeOrientandos: number; orientador: boolean; ativo?: boolean }, orientandosAtuais: number, max = 8) {
  const cap = Math.min(d.capacidadeOrientandos, max)
  const livres = Math.max(0, cap - orientandosAtuais)
  return { podeOrientar: d.orientador && d.ativo !== false && livres > 0, capacidade: cap, atuais: orientandosAtuais, livres }
}

export function addMeses(d: Date, meses: number) {
  const r = new Date(d.getTime())
  const dia = r.getUTCDate()
  r.setUTCDate(1)
  r.setUTCMonth(r.getUTCMonth() + meses)
  const ult = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate()
  r.setUTCDate(Math.min(dia, ult))
  return r
}

// Prazos padrão (stricto): qualificação a 60% do prazo, defesa a 90%, depósito 100%.
export function calcularPrazosStricto(ingresso: Date, prazoMaxMeses: number) {
  return {
    prazoQualificacao: addMeses(ingresso, Math.round(prazoMaxMeses * 0.6)),
    prazoDefesa: addMeses(ingresso, Math.round(prazoMaxMeses * 0.9)),
    prazoDeposito: addMeses(ingresso, prazoMaxMeses),
  }
}

// Marcos de lembrete escalonados (dias antes do prazo) com severidade crescente.
export function marcosLembrete(prazo: Date, now = new Date(), marcos = [90, 60, 30, 15, 7, 1]) {
  const out: Array<{ diasAntes: number; remindAt: Date; severity: 'INFO' | 'ATENCAO' | 'CRITICO' }> = []
  for (const dias of marcos) {
    const remindAt = new Date(prazo.getTime() - dias * 86_400_000)
    if (remindAt.getTime() < now.getTime() - 86_400_000) continue
    out.push({ diasAntes: dias, remindAt, severity: dias <= 7 ? 'CRITICO' : dias <= 30 ? 'ATENCAO' : 'INFO' })
  }
  return out
}

export function progressoStricto(a: { creditosCumpridos: number; qualificadoEm?: Date | null; defendidoEm?: Date | null; depositadoEm?: Date | null }, creditosMinimos: number) {
  const etapas = [
    { chave: 'CREDITOS', ok: creditosMinimos > 0 ? a.creditosCumpridos >= creditosMinimos : true },
    { chave: 'QUALIFICACAO', ok: !!a.qualificadoEm },
    { chave: 'DEFESA', ok: !!a.defendidoEm },
    { chave: 'DEPOSITO', ok: !!a.depositadoEm },
  ]
  const parcialCred = creditosMinimos > 0 ? Math.min(1, a.creditosCumpridos / creditosMinimos) : 1
  const pctTotal = Math.round(((parcialCred + etapas.slice(1).filter((e) => e.ok).length) / 4) * 100)
  return { etapas, percentual: pctTotal, aptoTitulacao: etapas.every((e) => e.ok) }
}

export function resumoHorasPraticas(horas: Array<{ horas: number; status: string }>, exigidas: number) {
  const validadas = horas.filter((h) => h.status === 'VALIDADA').reduce((s, h) => s + h.horas, 0)
  const pendentes = horas.filter((h) => h.status === 'PENDENTE').reduce((s, h) => s + h.horas, 0)
  return { validadas: r1(validadas), pendentes: r1(pendentes), exigidas, faltam: r1(Math.max(0, exigidas - validadas)), percentual: exigidas > 0 ? Math.min(100, r1((validadas / exigidas) * 100)) : 0, concluido: validadas >= exigidas }
}

export function ocupacaoPolo(capacidade: number, ocupados: number) {
  const pc = capacidade > 0 ? r1((ocupados / capacidade) * 100) : 0
  return { capacidade, ocupados, livres: Math.max(0, capacidade - ocupados), percentual: pc, status: capacidade > 0 && ocupados > capacidade ? 'SUPERLOTADO' : pc >= 90 ? 'LOTADO' : pc >= 60 ? 'NORMAL' : 'OCIOSO' }
}

export const CHECKLIST_POLO_PADRAO = [
  { chave: 'LAB_INFORMATICA', titulo: 'Laboratório de informática com acesso à internet', obrigatorio: true },
  { chave: 'BIBLIOTECA', titulo: 'Biblioteca / acervo físico ou virtual acessível', obrigatorio: true },
  { chave: 'SALA_TUTORIA', titulo: 'Sala de tutoria presencial', obrigatorio: true },
  { chave: 'SALA_PROVAS', titulo: 'Sala adequada para avaliações presenciais', obrigatorio: true },
  { chave: 'ACESSIBILIDADE', titulo: 'Acessibilidade (rampas, banheiros adaptados, sinalização)', obrigatorio: true },
  { chave: 'SECRETARIA', titulo: 'Secretaria / atendimento ao aluno', obrigatorio: true },
  { chave: 'AVCB', titulo: 'Alvará e AVCB/PPCI vigentes', obrigatorio: true },
  { chave: 'CONECTIVIDADE', titulo: 'Conectividade e rede elétrica estáveis', obrigatorio: false },
  { chave: 'LAB_ESPECIFICO', titulo: 'Laboratórios específicos dos cursos ofertados', obrigatorio: false },
]

export function resumoChecklist(items: Array<{ obrigatorio: boolean; atendido: boolean }>) {
  const obr = items.filter((i) => i.obrigatorio)
  const ok = obr.filter((i) => i.atendido).length
  return { obrigatoriosTotal: obr.length, obrigatoriosAtendidos: ok, percentual: obr.length ? r1((ok / obr.length) * 100) : 0, apto: obr.length > 0 && ok === obr.length }
}
