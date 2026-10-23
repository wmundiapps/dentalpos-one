/**
 * Robô moderador de campanhas. Regras fixas sempre; checagem por IA quando ANTHROPIC_API_KEY existe.
 */
import { llmText } from './llm';

export type Verdict = { ok: boolean; reason?: string; by: 'rules' | 'ai' };

const BLOCK: { re: RegExp; reason: string }[] = [
  { re: /\b(bit\.ly|tinyurl|cutt\.ly|encurtador|t\.co\/|is\.gd|rebrand\.ly)\b/i, reason: 'Links encurtados não são permitidos. Use o endereço completo da sua loja.' },
  { re: /\b(senha|c[oó]digo de seguran[cç]a|cvv|dados do cart[aã]o|token do banco)\b/i, reason: 'Campanhas não podem pedir senha, dados de cartão ou códigos de segurança.' },
  { re: /\b(fa[cç]a um pix para|pix para liberar|deposite|transfira para)\b/i, reason: 'Campanhas não podem pedir pagamento por Pix ou transferência fora do caixa.' },
  { re: /\b(aposta|bet\b|cassino|jogo do bicho|tigrinho|roleta)\b/i, reason: 'Apostas e jogos de azar não são permitidos.' },
  { re: /\b(maconha|coca[ií]na|droga|arma de fogo|muni[cç][aã]o)\b/i, reason: 'Produtos ilegais ou controlados não são permitidos.' },
  { re: /\b(sexo|nudes|er[oó]tico|xxx|porn)/i, reason: 'Conteúdo adulto não é permitido.' },
  { re: /\b(ganhe dinheiro f[aá]cil|renda extra garantida|pir[aâ]mide|lucro garantido)\b/i, reason: 'Promessas de dinheiro fácil não são permitidas.' },
  { re: /\b(rem[eé]dio que cura|cura garantida|emagre[cç]a \d+ ?kg)\b/i, reason: 'Promessas de saúde sem comprovação não são permitidas.' },
];

export function moderateRules(subject: string, body: string): Verdict {
  const text = `${subject}\n${body}`;
  for (const b of BLOCK) if (b.re.test(text)) return { ok: false, reason: b.reason, by: 'rules' };
  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const upper = letters.replace(/[^A-ZÀ-Þ]/g, '');
  if (letters.length > 30 && upper.length / letters.length > 0.6) return { ok: false, reason: 'Evite escrever tudo em maiúsculas: os provedores de e-mail tratam como spam.', by: 'rules' };
  if (/[!?]{4,}/.test(text)) return { ok: false, reason: 'Evite sequências de "!!!!": os provedores de e-mail tratam como spam.', by: 'rules' };
  const links = text.match(/https?:\/\//g) || [];
  if (links.length > 3) return { ok: false, reason: 'Use no máximo 3 links por campanha.', by: 'rules' };
  return { ok: true, by: 'rules' };
}

export async function moderateCampaign(subject: string, body: string): Promise<Verdict> {
  const r = moderateRules(subject, body);
  if (!r.ok) return r;
  const out = await llmText(
    'Você é o moderador de campanhas de e-mail do Cashbacksmart, rede de cashback do comércio local brasileiro. Responda só "OK" se a campanha for uma oferta comercial legítima e legal no Brasil. Caso contrário responda "BLOQUEAR: <motivo curto em português, dirigido ao lojista>". Bloqueie: golpe, pedido de dados pessoais ou pagamento fora do caixa, conteúdo ilegal, adulto, discriminatório, apostas, promessas enganosas ou de saúde, e qualquer coisa que viole o Código de Defesa do Consumidor.',
    `Assunto: ${subject}\n\nMensagem:\n${body}`,
    120,
  ).catch(() => null);
  if (out && /^BLOQUEAR/i.test(out.trim())) return { ok: false, reason: out.replace(/^BLOQUEAR:?\s*/i, '').trim() || 'Conteúdo não permitido.', by: 'ai' };
  return { ok: true, by: out ? 'ai' : 'rules' };
}
