// Regras puras (sem banco) do módulo Polos EAD: avisos de prova, janela de horário, curso afim, repasse e coordenadas.

export const DIA_MS = 86_400_000
export const HORA_MS = 3_600_000

/** Remove acentos/caixa para comparar nomes de cursos. */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * Marco de aviso de uma prova presencial: 'D1' quando faltam até 24h, 'D7' quando faltam mais de 24h e até 7 dias,
 * null caso contrário (prova passada ou distante). Cada marco é enviado uma única vez por aluno.
 */
export function marcoAviso(dataHora: Date, agora = new Date()): 'D7' | 'D1' | null {
  const falta = dataHora.getTime() - agora.getTime()
  if (falta <= 0) return null
  if (falta <= DIA_MS) return 'D1'
  if (falta <= 7 * DIA_MS) return 'D7'
  return null
}

/** Hora e minuto no fuso de Brasília (UTC-3, sem horário de verão desde 2019). */
export function minutosDoDiaBrasilia(d: Date): number {
  const x = new Date(d.getTime() - 3 * HORA_MS)
  return x.getUTCHours() * 60 + x.getUTCMinutes()
}
export function hhmmParaMin(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (!m) return NaN
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * Janela de horário permitida para contato. Dentro da janela, devolve `agora`; fora dela, o próximo início de janela
 * (hoje se ainda não abriu, amanhã se já fechou). Janela que atravessa a meia-noite (ex.: 22:00-06:00) é suportada.
 */
export function proximaJanela(agora: Date, inicio: string, fim: string): { dentro: boolean; quando: Date } {
  const ini = hhmmParaMin(inicio), fi = hhmmParaMin(fim)
  if (Number.isNaN(ini) || Number.isNaN(fi)) return { dentro: true, quando: agora }
  const cur = minutosDoDiaBrasilia(agora)
  const dentro = ini <= fi ? cur >= ini && cur < fi : cur >= ini || cur < fi
  if (dentro) return { dentro: true, quando: agora }
  const inicioHoje = new Date(agora.getTime() - cur * 60_000 + ini * 60_000 - (agora.getTime() % 60_000))
  const alvo = cur < ini ? inicioHoje : new Date(inicioHoje.getTime() + DIA_MS)
  return { dentro: false, quando: alvo }
}

/** Áreas afins padrão: palavra do curso de origem -> palavras do curso-alvo. Pode ser substituída pela política. */
export const AREAS_AFINS_PADRAO: Record<string, string[]> = {
  administracao: ['gestao', 'contabeis', 'logistica', 'marketing', 'recursos humanos', 'financ'],
  contabeis: ['administracao', 'gestao financeira', 'controladoria', 'auditoria', 'financ'],
  pedagogia: ['psicopedagogia', 'educacao', 'neuropsicopedagogia', 'gestao escolar', 'letras'],
  letras: ['pedagogia', 'educacao', 'linguistica'],
  sistemas: ['ciencia de dados', 'seguranca da informacao', 'engenharia de software', 'gestao de ti', 'computacao'],
  computacao: ['ciencia de dados', 'seguranca da informacao', 'engenharia de software', 'gestao de ti', 'sistemas'],
  enfermagem: ['saude', 'gestao hospitalar', 'urgencia', 'obstetricia', 'auditoria em saude'],
  odontologia: ['implantodontia', 'ortodontia', 'harmonizacao', 'endodontia', 'saude'],
  direito: ['direito', 'processual', 'tributario', 'gestao publica'],
  'educacao fisica': ['fisiologia', 'nutricao', 'treinamento', 'saude'],
}

export interface AlvoCandidato { id: string; nome: string }

/**
 * Escolhe o curso-alvo afim ao curso de origem.
 * `mapa` (da política) tem prioridade sobre o padrão; chave = trecho do nome do curso de origem; valor = trechos do curso-alvo.
 * Nunca devolve o próprio curso de origem (segunda graduação em curso diferente).
 */
export function escolherAlvoAfim<T extends AlvoCandidato>(origemNome: string | null | undefined, candidatos: T[], mapa?: Record<string, string[]> | null): T | null {
  if (!origemNome) return null
  const o = normalizar(origemNome)
  const tabela: Record<string, string[]> = mapa && Object.keys(mapa).length ? mapa : AREAS_AFINS_PADRAO
  for (const [chave, palavras] of Object.entries(tabela)) {
    if (!o.includes(normalizar(chave))) continue
    for (const p of palavras) {
      const np = normalizar(p)
      const hit = candidatos.find((c) => normalizar(c.nome).includes(np) && normalizar(c.nome) !== o)
      if (hit) return hit
    }
  }
  return null
}

export function pct(parte: number, total: number, casas = 1): number {
  if (!total) return 0
  const f = 10 ** casas
  return Math.round((parte / total) * 100 * f) / f
}
export const r2 = (n: number) => Math.round(n * 100) / 100

/** Repasse = percentual sobre o recebido + valor fixo por aluno ativo. */
export function calcularRepasse(recebido: number, alunosAtivos: number, percentual: number, valorFixoAluno: number) {
  const variavel = r2((recebido * percentual) / 100)
  const fixo = r2(alunosAtivos * valorFixoAluno)
  return { variavel, fixo, total: r2(variavel + fixo) }
}

export function competenciaValida(c: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(c)
}
export function intervaloCompetencia(c: string): { ini: Date; fim: Date } {
  const [a, m] = c.split('-').map(Number)
  return { ini: new Date(Date.UTC(a, m - 1, 1, 3)), fim: new Date(Date.UTC(a, m, 1, 3)) }
}

/** Coordenadas aproximadas de cidades usadas na demonstração (fallback quando o polo não tem latitude/longitude). */
export const CIDADES_COORD: Record<string, [number, number]> = {
  'maringa/PR': [-23.4205, -51.9331], 'londrina/PR': [-23.3045, -51.1696], 'cascavel/PR': [-24.9558, -53.4552], 'ponta grossa/PR': [-25.0916, -50.1668],
  'campinas/SP': [-22.9099, -47.0626], 'ribeirao preto/SP': [-21.1775, -47.8103], 'sao jose do rio preto/SP': [-20.8113, -49.3758], 'presidente prudente/SP': [-22.1256, -51.3889],
  'campo grande/MS': [-20.4697, -54.6201], 'dourados/MS': [-22.2231, -54.8120], 'tres lagoas/MS': [-20.7849, -51.7007],
  'cuiaba/MT': [-15.601, -56.0974], 'rondonopolis/MT': [-16.4673, -54.6372], 'sinop/MT': [-11.8604, -55.5091],
}
export function coordenadaCidade(cidade?: string | null, uf?: string | null): [number, number] | null {
  if (!cidade || !uf) return null
  return CIDADES_COORD[`${normalizar(cidade)}/${uf.toUpperCase()}`] ?? null
}

/** Semáforo do polo a partir dos indicadores. */
export function nivelPolo(i: { inadimplenciaPct: number; evasaoPct: number; rematriculaPct: number | null }): 'ok' | 'atencao' | 'critico' {
  if (i.inadimplenciaPct >= 25 || i.evasaoPct >= 20 || (i.rematriculaPct != null && i.rematriculaPct < 40)) return 'critico'
  if (i.inadimplenciaPct >= 12 || i.evasaoPct >= 10 || (i.rematriculaPct != null && i.rematriculaPct < 65)) return 'atencao'
  return 'ok'
}
