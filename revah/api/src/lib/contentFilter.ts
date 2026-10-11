// Filtro de texto das mensagens que o cliente dispara (adaptado do ClubeFaz, wmundiapps/ifaco).
// O REVAH é ferramenta de marketing: telefone, e-mail e link são permitidos. O que se recusa é
// pornografia/sexo pago, xingamento pesado e link para arquivo executável (vetor comum de vírus).
import { HttpError } from './errors'

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[0@4]/g, (m) => ({ '0': 'o', '@': 'a', '4': 'a' })[m]!)
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/[5$]/g, 's')
    .replace(/7/g, 't')
}

// Palavras inteiras (depois de normalizar). Lista curta e objetiva. Fica de fora o que um negócio legítimo
// pode precisar escrever (ex.: "saúde sexual" de uma clínica).
const BLOCKED_WORDS = [
  'porno', 'pornografia', 'pornografico', 'nudes', 'xvideos', 'pornhub', 'xhamster', 'onlyfans',
  'putaria', 'puta', 'putas', 'prostituta', 'prostituicao', 'garota de programa', 'garoto de programa', 'acompanhante sexual',
  'punheta', 'siririca', 'boquete', 'buceta', 'xoxota', 'piroca', 'caralho', 'foder', 'fodase',
  'foda se', 'arrombado', 'arrombada', 'cuzao', 'vagabunda', 'desgracado', 'filho da puta', 'fdp',
]
const WORD_RE = new RegExp(`(^|[^a-z])(${BLOCKED_WORDS.map((w) => w.replace(/ /g, '[^a-z]{0,2}')).join('|')})(?=$|[^a-z])`)

// Link direto para programa/instalador ou script.
const EXECUTABLE_LINK_RE = /https?:\/\/\S+\.(exe|msi|scr|bat|cmd|com|pif|vbs|vbe|js|jse|jar|apk|ps1|hta|lnk|dll)(\?\S*)?(\s|$)/i

export type FilterIssue = 'improprio' | 'executavel'

export function checkText(text: string | null | undefined): FilterIssue | null {
  if (!text) return null
  if (WORD_RE.test(normalize(text))) return 'improprio'
  if (EXECUTABLE_LINK_RE.test(text)) return 'executavel'
  return null
}

export function assertCleanText(fields: Record<string, string | null | undefined>) {
  for (const [label, value] of Object.entries(fields)) {
    const issue = checkText(value)
    if (issue === 'improprio') throw new HttpError(400, `${label}: o texto tem palavra imprópria. O REVAH não envia conteúdo adulto ou ofensivo.`, 'CONTENT_BLOCKED')
    if (issue === 'executavel') throw new HttpError(400, `${label}: não é permitido link para programa ou instalador (.exe, .apk…). Envie o link de uma página.`, 'CONTENT_BLOCKED')
  }
}
