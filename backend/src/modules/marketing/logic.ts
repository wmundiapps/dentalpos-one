// Funções puras do módulo Marketing (testáveis sem banco).
import { brtParts } from '../comunicacao/pure'

// ---------------------------------------------------------------- lead scoring
export const REGRAS_PADRAO: Record<string, number> = {
  CAPTURA: 10, OPT_IN_MARKETING: 5, TEM_TELEFONE: 5, CURSO_INFORMADO: 5,
  ORIGEM_INDICACAO: 20, ORIGEM_EVENTO: 15, ORIGEM_CONVENIO: 15, ORIGEM_GOOGLE_ADS: 8, ORIGEM_SITE: 6, ORIGEM_REDES: 3, ORIGEM_OFFLINE: 4,
  EMAIL_ABERTO: 2, EMAIL_CLIQUE: 5, RESPONDEU: 15, VISITOU_CURSO: 5, SIMULOU_MENSALIDADE: 12, SOLICITOU_CONTATO: 15, PARTICIPOU_EVENTO: 20,
  INSCRITO: 30, SEM_INTERACAO_30D: -10, DESCADASTRO: -50,
}
export function eventoDeOrigem(origem: string): string | null {
  if (origem === 'INDICACAO') return 'ORIGEM_INDICACAO'
  if (origem === 'EVENTO') return 'ORIGEM_EVENTO'
  if (origem.startsWith('CONVENIO')) return 'ORIGEM_CONVENIO'
  if (origem === 'GOOGLE_ADS') return 'ORIGEM_GOOGLE_ADS'
  if (origem === 'SITE') return 'ORIGEM_SITE'
  if (['INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TIKTOK', 'THREADS'].includes(origem)) return 'ORIGEM_REDES'
  if (['RADIO', 'TV', 'OUTDOOR', 'PANFLETAGEM'].includes(origem)) return 'ORIGEM_OFFLINE'
  return null
}
export const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
export const temperatura = (score: number) => (score >= 60 ? 'QUENTE' : score >= 30 ? 'MORNO' : 'FRIO')

// ---------------------------------------------------------------- UTM / atribuição
export interface Toque { origem: string; utmSource?: string | null; utmMedium?: string | null; utmCampaign?: string | null; em: Date }
export function parseUtm(q: Record<string, any>) {
  const g = (k: string) => { const v = Array.isArray(q?.[k]) ? q[k][0] : q?.[k]; return v ? String(v).slice(0, 150) : undefined }
  return { utmSource: g('utm_source') ?? g('utmSource'), utmMedium: g('utm_medium') ?? g('utmMedium'), utmCampaign: g('utm_campaign') ?? g('utmCampaign'), utmContent: g('utm_content') ?? g('utmContent'), utmTerm: g('utm_term') ?? g('utmTerm') }
}
/** Deduz a origem do lead a partir de utm_source/utm_medium (quando o formulário não informa). */
export function origemPorUtm(src?: string | null, med?: string | null): string | null {
  const s = String(src ?? '').toLowerCase()
  const m = String(med ?? '').toLowerCase()
  if (!s) return null
  if (/google/.test(s)) return 'GOOGLE_ADS'
  if (/insta/.test(s)) return 'INSTAGRAM'
  if (/(facebook|fb|meta)/.test(s)) return 'FACEBOOK'
  if (/linkedin/.test(s)) return 'LINKEDIN'
  if (/tiktok/.test(s)) return 'TIKTOK'
  if (/threads/.test(s)) return 'THREADS'
  if (/whats/.test(s)) return 'WHATSAPP'
  if (/(mail|newsletter)/.test(s) || m === 'email') return 'EMAIL'
  if (/(radio|rádio)/.test(s)) return 'RADIO'
  if (/(tv)/.test(s)) return 'TV'
  if (/(indic|referral)/.test(s)) return 'INDICACAO'
  return null
}
export const primeiroToque = (t: Toque[]) => [...t].sort((a, b) => a.em.getTime() - b.em.getTime())[0] ?? null
export const ultimoToque = (t: Toque[]) => [...t].sort((a, b) => b.em.getTime() - a.em.getTime())[0] ?? null

// ---------------------------------------------------------------- métricas / ROI
export const razao = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 10000) / 100 : 0)
export const dividir = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) / 100 : null)
export function roi(receita: number, custo: number): number | null {
  if (custo <= 0) return null
  return Math.round(((receita - custo) / custo) * 10000) / 100
}

// ---------------------------------------------------------------- simulador de mensalidade
export function simularMensalidade(p: { valor: number; parcelas: number; descontoPct?: number; bolsaPct?: number; pontualidadePct?: number }) {
  const clamp = (n: number | undefined, max: number) => Math.max(0, Math.min(max, Number(n) || 0))
  const desc = clamp(p.descontoPct, 100); const bolsa = clamp(p.bolsaPct, 100); const pont = clamp(p.pontualidadePct, 50)
  const base = Math.max(0, Number(p.valor) || 0)
  const parcelas = Math.max(1, Math.min(120, Math.round(p.parcelas || 1)))
  const comBolsa = base * (1 - bolsa / 100) * (1 - desc / 100)
  const r = (n: number) => Math.round(n * 100) / 100
  const comPontualidade = comBolsa * (1 - pont / 100)
  return { mensalidadeCheia: r(base), mensalidade: r(comBolsa), mensalidadeComPontualidade: r(comPontualidade), parcelas, totalCurso: r(comBolsa * parcelas), totalComPontualidade: r(comPontualidade * parcelas), economiaTotal: r((base - comPontualidade) * parcelas) }
}

// ---------------------------------------------------------------- janela de horário e frequência
const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return (h || 0) * 60 + (m || 0) }
export interface Janela { janelaInicio: string; janelaFim: string; diasPermitidos: number[] }
export function dentroDaJanela(d: Date, j: Janela): boolean {
  const p = brtParts(d)
  if (!j.diasPermitidos.includes(p.dow)) return false
  const min = p.h * 60 + p.min
  return min >= hm(j.janelaInicio) && min < hm(j.janelaFim)
}
/** Próximo instante (>= d) dentro da janela, em passos de 15 min (limite 8 dias). */
export function proximaJanela(d: Date, j: Janela): Date {
  let t = new Date(d.getTime())
  for (let i = 0; i < 8 * 96; i++) {
    if (dentroDaJanela(t, j)) return t
    t = new Date(t.getTime() + 15 * 60_000)
  }
  return t
}
export function excedeFrequencia(enviosDia: number, enviosSemana: number, limDia: number, limSemana: number): string | null {
  if (limDia > 0 && enviosDia >= limDia) return `Limite de frequência diário atingido (${limDia}).`
  if (limSemana > 0 && enviosSemana >= limSemana) return `Limite de frequência semanal atingido (${limSemana}).`
  return null
}

// ---------------------------------------------------------------- texto / opt-out por palavra
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9 ]+/g, '')
const SAIR = new Set(['sair', 'parar', 'stop', 'pare', 'cancelar', 'descadastrar', 'remover', 'nao quero receber', 'nao quero mais receber', 'unsubscribe', 'cancelar inscricao'])
export const ehPedidoDeSaida = (t: string) => SAIR.has(norm(t))
export const rodapeDescadastro = (canal: string, url: string) =>
  canal === 'EMAIL' ? `\n\n--\nVocê recebe esta mensagem porque consentiu em receber comunicações. Para não receber mais, descadastre-se com 1 clique: ${url}`
    : canal === 'VOZ' ? '\nPara não receber mais ligações, tecle 9.'
      : `\nPara não receber mais, responda SAIR ou acesse ${url}`

/** Valida href/URL de bloco de página (bloqueia javascript:, data: etc.). */
export function urlSegura(u: unknown): boolean {
  const s = String(u ?? '').trim()
  if (!s) return true
  return /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(s)
}
export function blocosSeguros(blocos: any[]): string | null {
  const visit = (o: any): string | null => {
    if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) {
        if (/(url|href|link|src)$/i.test(k) && !urlSegura(v)) return `URL não permitida no campo ${k}.`
        const r = visit(v); if (r) return r
      }
    }
    return null
  }
  return visit(blocos)
}

// ---------------------------------------------------------------- imagens (SVG com a marca)
const xml = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
export const FORMATOS: Record<string, [number, number]> = { FEED_1080: [1080, 1080], STORY_1080x1920: [1080, 1920], BANNER_1200x628: [1200, 628] }
function quebra(texto: string, max: number, linhas: number): string[] {
  const out: string[] = []; let cur = ''
  for (const w of texto.split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > max) { if (cur) out.push(cur); cur = w } else cur = (cur + ' ' + w).trim()
  }
  if (cur) out.push(cur)
  if (out.length > linhas) { out.length = linhas; out[linhas - 1] = out[linhas - 1].replace(/.{0,2}$/, '…') }
  return out
}
export function gerarSvg(p: { formato: string; titulo: string; subtitulo?: string; cta?: string; marca: { nome: string; corPrimaria: string; corSecundaria: string; corDestaque: string; slogan?: string | null } }): string {
  const [w, h] = FORMATOS[p.formato] ?? FORMATOS.FEED_1080
  const cor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#0F5FDB')
  const c1 = cor(p.marca.corPrimaria); const c2 = cor(p.marca.corSecundaria); const c3 = cor(p.marca.corDestaque)
  const f = Math.round(Math.min(w, h) * (h > w ? 0.075 : 0.07))
  const tl = quebra(p.titulo, h > w ? 20 : 26, 4)
  const sl = quebra(p.subtitulo ?? '', h > w ? 34 : 44, 3)
  const y0 = Math.round(h * (h > w ? 0.3 : 0.28))
  let y = y0
  const t = tl.map((l) => { const s = `<text x="${Math.round(w * 0.08)}" y="${y}" font-size="${f}" font-weight="800" fill="#fff">${xml(l)}</text>`; y += Math.round(f * 1.2); return s }).join('')
  y += Math.round(f * 0.3)
  const s2 = sl.map((l) => { const s = `<text x="${Math.round(w * 0.08)}" y="${y}" font-size="${Math.round(f * 0.5)}" fill="#e8eefc">${xml(l)}</text>`; y += Math.round(f * 0.7); return s }).join('')
  const bw = Math.round(w * 0.5); const bh = Math.round(f * 1.5); const by = Math.round(h * 0.82) - bh
  const cta = p.cta ? `<rect x="${Math.round(w * 0.08)}" y="${by}" width="${bw}" height="${bh}" rx="${Math.round(bh / 2)}" fill="${c3}"/><text x="${Math.round(w * 0.08 + bw / 2)}" y="${by + Math.round(bh * 0.64)}" font-size="${Math.round(f * 0.55)}" font-weight="800" text-anchor="middle" fill="${c2}">${xml(p.cta)}</text>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${xml(p.titulo)}" font-family="Arial, Helvetica, sans-serif"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="${c1}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${Math.round(w * 0.88)}" cy="${Math.round(h * 0.18)}" r="${Math.round(Math.min(w, h) * 0.22)}" fill="${c3}" opacity="0.25"/><circle cx="${Math.round(w * 0.95)}" cy="${Math.round(h * 0.62)}" r="${Math.round(Math.min(w, h) * 0.12)}" fill="#fff" opacity="0.1"/><text x="${Math.round(w * 0.08)}" y="${Math.round(h * 0.1)}" font-size="${Math.round(f * 0.6)}" font-weight="700" fill="#fff" letter-spacing="2">${xml(p.marca.nome.toUpperCase())}</text>${t}${s2}${cta}<text x="${Math.round(w * 0.08)}" y="${Math.round(h * 0.94)}" font-size="${Math.round(f * 0.4)}" fill="#cfe0ff">${xml(p.marca.slogan || p.marca.nome)} · Imagem ilustrativa gerada por provedor simulado</text></svg>`
}
