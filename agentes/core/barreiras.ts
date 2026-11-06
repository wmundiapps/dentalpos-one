// Barreiras de segurança: regras fixas, sem IA, que valem para TODOS os agentes.
// "O robô propõe, o humano aprova": o que é sensível nunca sai direto.

import type { AgenteDef, PerfilNegocio } from './types.ts'

const OPT_OUT: RegExp[] = [
  /^\s*(sair|parar|pare|stop|cancelar|descadastrar|remover|unsubscribe)\s*[.!]*\s*$/i,
  /n[aã]o\s+(quero|desejo|gostaria\s+de)\s+(mais\s+)?(receber|ser\s+contactad[oa]|ser\s+contatad[oa]|mensage|liga[cç])/i,
  /(para|pare|parem)\s+de\s+(me\s+)?(mandar|enviar|ligar|mensage)/i,
  /(me\s+)?(tir[ae]|remov[ae]|exclu[ai])\s+(meu\s+(n[uú]mero|contato|e-?mail)|da\s+(sua\s+)?lista)/i,
  /n[aã]o\s+me\s+(ligu?e|ligue\s+mais|mande\s+mais|envie\s+mais|perturbe)/i,
]

const PEDIDO_HUMANO = /(falar|conversar|chama[r]?|passa[r]?)\s+(com\s+)?(um\s+|uma\s+)?(humano|pessoa|atendente|gerente|respons[aá]vel|dono|dentista|doutor|doutora)|quero\s+(um\s+)?(humano|atendente|pessoa)/i

const PERGUNTA_ROBO = /voc[êe]\s+[ée]\s+(um\s+|uma\s+)?(rob[oô]|bot|ia|intelig[êe]ncia\s+artificial|humano|pessoa|gente\s+de\s+verdade)/i

const URGENCIA_SAUDE = /\b(dor\s+(forte|intensa|insuport[aá]vel)|muita\s+dor|sangr\w+|inchad\w+|incha[cç]o|febre|desmai\w+|trauma|quebrou|caiu\s+o\s+dente|emerg[êe]ncia|urg[êe]ncia|n[aã]o\s+consigo\s+respirar)\b/i

const GRAVE =
  /(vou\s+(te\s+|lhe\s+)?(processar|denunciar)|procon|advogad[oa]|justi[cç]a|polícia|policia|golpe|fraude|reclame\s*aqui|ouvidoria|vou\s+cancelar\s+tudo)/i

export function detectarOptOut(texto: string): boolean {
  const t = String(texto || '').trim()
  if (!t || t.length > 280) return false
  return OPT_OUT.some((re) => re.test(t))
}
export const pediuHumano = (t: string) => PEDIDO_HUMANO.test(t || '')
export const perguntouSeERobo = (t: string) => PERGUNTA_ROBO.test(t || '')
export const urgenciaDeSaude = (t: string) => URGENCIA_SAUDE.test(t || '')
export const reclamacaoGrave = (t: string) => GRAVE.test(t || '')

/** Mensagens proativas só entre 8h e 21h (horário de Brasília). */
export function dentroDaJanela(agora: Date): boolean {
  const horaBr = Number(
    new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(agora),
  )
  return horaBr >= 8 && horaBr < 21
}

/** Oculta CPF, telefone e e-mail antes de gravar no registro de auditoria. */
export function mascarar(texto: string): string {
  return String(texto || '')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf]')
    .replace(/(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g, '[telefone]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[e-mail]')
    .slice(0, 200)
}

export type ResultadoSaida = { ok: true } | { ok: false; regra: string }

const REGRAS_SAIDA: { regra: string; re: RegExp; so?: (a: AgenteDef) => boolean }[] = [
  {
    regra: 'diagnostico',
    re: /(voc[êe]\s+tem|isso\s+[ée]|trata-se\s+de|seu\s+problema\s+[ée]|diagn[óo]stic\w+)\s+(uma?\s+)?(c[aá]rie|gengivite|periodontite|c[âa]ncer|infec[cç][aã]o|tumor|doen[cç]a|abscesso|fratura)/i,
  },
  { regra: 'promessa', re: /(garanto|garantimos|resultado\s+garantido|100\s?%\s*(de\s+)?(garantia|certeza|sucesso|resultado)|sem\s+risco|cura\s+garantida)/i },
  { regra: 'documento-pessoal', re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/ },
  {
    regra: 'ameaca-cobranca',
    re: /(negativ\w+|spc|serasa|protest\w+|cart[óo]rio|vamos\s+te\s+expor|vergonha|processo\s+judicial|advogad[oa])/i,
    so: (a) => a.id === 'cobranca-atraso',
  },
  {
    regra: 'desconto-sem-aprovacao',
    re: /(desconto|abatimento|sem\s+juros|parcel(ar|amos|amento)|condi[cç][aã]o\s+especial)/i,
    so: (a) => a.id === 'cobranca-atraso',
  },
]

const VALOR = /R\$\s?\d[\d.]*(,\d{1,2})?|\b\d[\d.]*(,\d{1,2})?\s*reais\b/gi

const normaliza = (v: string) => v.replace(/\s/g, '').replace(/reais/i, '').replace(/^R\$/i, '').toLowerCase()

/**
 * Confere a resposta ANTES de enviar ao cliente.
 * `valoresPermitidos`: valores que vieram do sistema (ex.: dívida real do cliente) ou do cadastro de preços.
 */
export function verificarSaida(
  texto: string,
  agente: AgenteDef,
  perfil: PerfilNegocio,
  valoresPermitidos: string[] = [],
): ResultadoSaida {
  for (const r of REGRAS_SAIDA) {
    if (r.so && !r.so(agente)) continue
    if (r.re.test(texto)) return { ok: false, regra: r.regra }
  }
  const liberados = new Set(
    [...Object.values(perfil.precosPermitidos || {}), ...valoresPermitidos].map((v) => normaliza(String(v))),
  )
  const achados = texto.match(VALOR) || []
  for (const a of achados) {
    if (!liberados.has(normaliza(a))) return { ok: false, regra: 'valor-inventado' }
  }
  return { ok: true }
}

export const RESPOSTAS_SEGURAS = {
  optOut: 'Tudo bem, não enviaremos mais mensagens. Se mudar de ideia, é só nos chamar.',
  humano: 'Claro! Já chamei uma pessoa da nossa equipe. Ela responde assim que possível e a conversa fica registrada.',
  urgenciaSaude:
    'Sinto muito por isso. Pelo que você descreve, o melhor é ser avaliado com urgência. Avisei a equipe agora para falar com você. Se piorar ou houver dificuldade para respirar, procure um pronto atendimento.',
  grave: 'Entendo a sua preocupação e quero resolver isso do jeito certo. Vou passar a conversa agora para uma pessoa da nossa equipe, que fala com você com prioridade.',
  naoSei: 'Para não responder errado, vou passar a sua pergunta para a nossa equipe. Retornamos assim que possível.',
  saidaBloqueada: 'Para garantir que você receba a informação correta, vou passar a conversa para uma pessoa da nossa equipe.',
  eRobo: (nome: string) =>
    `Sou o assistente virtual de ${nome}, um atendimento automatizado. Se preferir, chamo uma pessoa da equipe.`,
} as const
