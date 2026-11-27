import { normalizeText } from '../comunicacao/pure'

// ============================================================
// Funções puras do Mensageiro interno (sem banco): horário de atendimento, detecção de "falar com uma pessoa",
// menções, conversa direta, vínculo com contexto do sistema, trecho de busca. Testadas em scripts/e2e/mensagens.ts.
// ============================================================

export const TIPOS_CANAL = ['DEPARTAMENTO', 'GRUPO', 'DIRETA'] as const
export const TIPOS_CONTEXTO = ['PROTOCOLO', 'ATENDIMENTO', 'ALUNO', 'DOCUMENTO', 'TITULO'] as const
export type TipoContexto = (typeof TIPOS_CONTEXTO)[number]
export const MAX_TEXTO = 4000
export const MAX_ANEXOS = 5

/** Horário de Brasília (UTC-3, sem horário de verão desde 2019). */
const OFFSET_BRT_MIN = -180

export interface HorarioAuto { diasSemana: number[]; horarioInicio: string; horarioFim: string }

export function minutosDoDia(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim())
  if (!m) return null
  const h = Number(m[1]), mi = Number(m[2])
  if (h > 23 || mi > 59) return null
  return h * 60 + mi
}

export function horarioValido(h: HorarioAuto): string | null {
  if (minutosDoDia(h.horarioInicio) === null || minutosDoDia(h.horarioFim) === null) return 'Horário inválido (use HH:MM).'
  if (!h.diasSemana.length || h.diasSemana.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return 'Dias da semana inválidos (0=domingo a 6=sábado).'
  return null
}

/** Dia da semana (0-6) e minutos desde 00:00 no horário de Brasília. */
export function relogioBrasilia(now: Date) {
  const local = new Date(now.getTime() + OFFSET_BRT_MIN * 60_000)
  return { dow: local.getUTCDay(), min: local.getUTCHours() * 60 + local.getUTCMinutes() }
}

/** O departamento está em horário de atendimento? Início > fim é tratado como turno que atravessa a meia-noite. */
export function dentroDoHorario(h: HorarioAuto, now = new Date()): boolean {
  const ini = minutosDoDia(h.horarioInicio), fim = minutosDoDia(h.horarioFim)
  if (ini === null || fim === null) return true
  const { dow, min } = relogioBrasilia(now)
  if (ini === fim) return h.diasSemana.includes(dow)
  if (ini < fim) return h.diasSemana.includes(dow) && min >= ini && min < fim
  // atravessa a meia-noite: depois do início vale o dia atual; antes do fim vale o dia anterior
  if (min >= ini) return h.diasSemana.includes(dow)
  return h.diasSemana.includes((dow + 6) % 7) && min < fim
}

export const ROT_DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export function descreverHorario(h: HorarioAuto): string {
  const dias = [...new Set(h.diasSemana)].sort((a, b) => a - b)
  let txt: string
  const seq = dias.every((d, i) => i === 0 || d === dias[i - 1] + 1)
  if (dias.length === 7) txt = 'todos os dias'
  else if (seq && dias.length > 2) txt = `${ROT_DIAS[dias[0]]} a ${ROT_DIAS[dias[dias.length - 1]]}`
  else txt = dias.map((d) => ROT_DIAS[d]).join(', ')
  return `${txt}, das ${h.horarioInicio} às ${h.horarioFim}`
}

// ------------------------------------------------------------ "falar com uma pessoa"
const PEDE_PESSOA = [
  /\b(falar|conversar|chamar|passa|passar|transferir|encaminhar)\b.{0,24}\b(pessoa|humano|atendente|alguem|responsavel|gente)\b/,
  /\b(atendente|atendimento)\s+humano\b/,
  /\b(quero|preciso|prefiro|gostaria)\b.{0,20}\b(uma\s+pessoa|um\s+humano|um\s+atendente|alguem\s+de\s+verdade|um\s+responsavel)\b/,
  /\bpessoa\s+de\s+verdade\b/,
  /\bnao\s+(quero|preciso)\b.{0,16}\b(robo|bot|automatic[oa])\b/,
  /\b(chama|chame)\s+(alguem|um\s+responsavel|o\s+responsavel|a\s+chefia|o\s+chefe)\b/,
]
export function pedePessoa(texto: string): boolean {
  const n = normalizeText(texto)
  if (!n) return false
  if (n === '0' || n === 'humano' || n === 'atendente') return true
  return PEDE_PESSOA.some((r) => r.test(n))
}

// ------------------------------------------------------------ menções
export interface SetorMencionavel { id: string; codigo: string; nome: string }
const slug = (s: string) => normalizeText(s).replace(/[^a-z0-9]+/g, '')

/** Departamentos citados como @codigo / @nomedepartamento no texto (sem acento, sem espaços). */
export function mencoesDeSetores(texto: string, setores: SetorMencionavel[]): string[] {
  const ids = new Set<string>()
  const re = /@([\p{L}\p{N}_-]{2,40})/gu
  let m: RegExpExecArray | null
  const alvos = setores.map((s) => ({ id: s.id, chaves: new Set([slug(s.codigo), slug(s.nome), slug(s.nome.split(/\s+/)[0] ?? '')]) }))
  while ((m = re.exec(texto))) {
    const k = slug(m[1])
    if (!k) continue
    for (const a of alvos) if (a.chaves.has(k)) ids.add(a.id)
  }
  return [...ids]
}

/** Texto limpo: tira caracteres de controle, aparas e limita o tamanho. */
export function limparTexto(t: unknown, max = MAX_TEXTO): string {
  return String(t ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n/g, '\n').trim().slice(0, max)
}

// ------------------------------------------------------------ conversa direta / contexto
export function chaveDireta(a: string, b: string): string { return a < b ? `${a}:${b}` : `${b}:${a}` }

export interface ContextoRef { tipo: TipoContexto; id: string }
/** Link interno (rota do frontend) para o registro vinculado. Só caminhos relativos conhecidos: nunca URL externa. */
export function linkContexto(tipo: TipoContexto, id: string): string {
  const q = encodeURIComponent(id)
  switch (tipo) {
    case 'PROTOCOLO': return `/edu/atendimento?secao=protocolos&id=${q}`
    case 'ATENDIMENTO': return `/edu/atendimento?secao=central&id=${q}`
    case 'DOCUMENTO': return `/edu/atendimento?secao=emissao&id=${q}`
    case 'ALUNO': return `/edu/academico/alunos?id=${q}`
    case 'TITULO': return `/edu/financeiro?secao=receber&titulo=${q}`
  }
}
export const ROTULO_CONTEXTO: Record<TipoContexto, string> = { PROTOCOLO: 'Protocolo', ATENDIMENTO: 'Atendimento', ALUNO: 'Aluno', DOCUMENTO: 'Documento emitido', TITULO: 'Título financeiro' }

// ------------------------------------------------------------ busca / notificações
/** Trecho com o termo em destaque (sem HTML): a interface realça. */
export function trecho(texto: string, termo: string, largura = 140): string {
  const t = texto.replace(/\s+/g, ' ')
  const i = normalizeText(t).indexOf(normalizeText(termo))
  if (i < 0 || t.length <= largura) return t.slice(0, largura)
  const ini = Math.max(0, i - Math.floor(largura / 3))
  return (ini ? '…' : '') + t.slice(ini, ini + largura) + (ini + largura < t.length ? '…' : '')
}

/** Texto das notificações: NUNCA leva o conteúdo da mensagem nem nome de conversa direta (minimização, LGPD). */
export function textoNotificacao(tipo: 'MENCAO' | 'MENCAO_DEPARTAMENTO' | 'PEDIDO_PESSOA' | 'LEMBRETE_PEDIDO' | 'NOVA_DIRETA' | 'ENCAMINHAMENTO' | 'FORA_HORARIO', canalTipo: string, canalNome: string) {
  const onde = canalTipo === 'DEPARTAMENTO' ? `no canal do departamento ${canalNome}` : canalTipo === 'GRUPO' ? `no grupo ${canalNome}` : 'em uma conversa direta'
  switch (tipo) {
    case 'MENCAO': return { assunto: 'Mensageiro: você foi mencionado', mensagem: `Você foi mencionado ${onde}. Abra o Mensageiro para ler.` }
    case 'MENCAO_DEPARTAMENTO': return { assunto: 'Mensageiro: seu departamento foi mencionado', mensagem: `Seu departamento foi mencionado ${onde}. Abra o Mensageiro para ler.` }
    case 'NOVA_DIRETA': return { assunto: 'Mensageiro: nova conversa', mensagem: 'Você recebeu uma nova conversa direta. Abra o Mensageiro para ler.' }
    case 'PEDIDO_PESSOA': return { assunto: 'Mensageiro: alguém precisa de uma pessoa', mensagem: `Há um pedido para falar com uma pessoa ${onde}. Abra o Mensageiro para atender.` }
    case 'LEMBRETE_PEDIDO': return { assunto: 'Mensageiro: pedido ainda sem atendimento', mensagem: `Um pedido para falar com uma pessoa ${onde} continua sem atendimento.` }
    case 'ENCAMINHAMENTO': return { assunto: 'Mensageiro: atendimento encaminhado', mensagem: `Um atendimento foi encaminhado ${onde}. Abra o Mensageiro para ver.` }
    case 'FORA_HORARIO': return { assunto: 'Mensageiro: mensagem fora do horário', mensagem: `Chegou uma mensagem ${onde} fora do horário de atendimento. Veja ao iniciar o expediente.` }
  }
}

/** Mensagem de ausência padrão quando o departamento não escreveu uma. */
export function ausenciaPadrao(nome: string, h: HorarioAuto): string {
  return `O departamento ${nome} está fora do horário de atendimento (${descreverHorario(h)}). Sua mensagem foi registrada e será respondida assim que a equipe voltar.`
}

/** Próxima abertura do departamento a partir de `now` (para o lembrete de mensagens recebidas fora do horário). */
export function proximaAbertura(h: HorarioAuto, now = new Date()): Date {
  const ini = minutosDoDia(h.horarioInicio) ?? 480
  if (dentroDoHorario(h, now)) return now
  for (let d = 0; d <= 8; d++) {
    const base = new Date(now.getTime() + OFFSET_BRT_MIN * 60_000 + d * 86_400_000)
    const dia = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 0, 0, 0) + ini * 60_000 - OFFSET_BRT_MIN * 60_000)
    if (dia.getTime() > now.getTime() && h.diasSemana.includes(base.getUTCDay())) return dia
  }
  return new Date(now.getTime() + 86_400_000)
}

/** Agradecimentos curtos não disparam resposta automática nem pedido de atendimento. */
export function soAgradecimento(texto: string): boolean {
  if (/^(👍|🙏)$/.test(texto.trim())) return true
  const t = normalizeText(texto).split(' ').filter(Boolean)
  const OK = new Set(['ok', 'okay', 'certo', 'combinado', 'entendi', 'beleza', 'show', 'valeu', 'obrigado', 'obrigada', 'obrigados', 'obrigadas', 'muito', 'grato', 'grata', 'perfeito', 'blz', 'tmj', 'otimo', 'legal', 'tudo', 'bem', 'brigado', 'brigada', 'agradeco', 'por', 'favor', 'ate', 'mais', 'tchau'])
  return t.length > 0 && t.length <= 5 && t.every((w) => OK.has(w))
}

export function formatarTamanho(bytes?: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
