// Triagem automática de anúncios e mensagens. Não substitui a moderação humana: decide o que vai
// direto ao ar, o que espera revisão e o que é recusado de imediato.
export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const BLOCK: [RegExp, string][] = [
  [/\b(arma de fogo|pistola|revolver|fuzil|municao|muni[cç]ao|espingarda|silenciador)\b/, 'arma_ou_municao'],
  [/\b(cocaina|maconha|crack|lsd|ecstasy|haxixe|skunk|lanca perfume|loló|lolo)\b/, 'droga'],
  [/\b(roubado|furtado|receptado|clonado|chassi adulterado|remarcado|sem procedencia|origem duvidosa|sem origem)\b/, 'origem_ilicita'],
  [/\b(documento falso|cnh falsa|nota fria|nota falsa|cpf falso|rg falso|dinheiro falso)\b/, 'documento_falso'],
  [/\b(orgao humano|rim a venda|vendo rim|animal silvestre|tr[aá]fico de animais)\b/, 'proibido_por_lei'],
  [/\b(contrabando|descaminho|sem nota e sem origem|produto pirata)\b/, 'contrabando'],
];
const SOFT: [RegExp, number, string][] = [
  [/\bsem nota\b/, 10, 'sem_nota'],
  [/\b(replica|imitacao|primeira linha|ap[oó]crifo|1a linha|espelhado)\b/, 25, 'possivel_falsificacao'],
  [/\b(pix antecipado|pagamento antecipado|sinal antecipado|deposito antecipado|pague antes)\b/, 30, 'pagamento_antecipado'],
  [/\b(motoboy|transportadora|correios) (leva|entrega|busca)[^.]{0,40}(apos|depois|so se|somente).{0,20}(pagamento|pix|deposito)/, 25, 'entrega_apos_pagamento'],
  [/\b(estou|moro|me mudei).{0,25}(fora do pais|exterior|portugal|eua|europa)\b/, 30, 'vendedor_no_exterior'],
  [/\b(urgente|urgentissimo|preciso vender hoje|queima total)\b/, 8, 'urgencia'],
  [/\b(heranca|leilao|apreendido|repasse de consorcio|cota de consorcio)\b/, 10, 'origem_a_confirmar'],
  [/\b(whats?app|zap|telegram|insta(gram)?|@[a-z0-9_.]{3,})\b/, 20, 'contato_fora_da_plataforma'],
  [/(https?:\/\/|www\.|\.com\b|\.net\b|bit\.ly)/, 20, 'link_externo'],
  [/\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/, 20, 'telefone_na_descricao'],
  [/[a-z0-9._-]+@[a-z0-9-]+\.[a-z.]+/, 20, 'email_na_descricao'],
  [/\b(sem garantia e sem devolucao|nao aceito visita|nao posso mostrar pessoalmente|so por transferencia)\b/, 20, 'evita_encontro_presencial'],
];

export interface RiskInput { title: string; description: string; priceCents: number; category: string; operation: string; condition: string }
export interface RiskResult { score: number; flags: string[]; blocked: boolean; blockReasons: string[] }

export function evaluateListing(i: RiskInput, extraFlags: { code: string; score: number }[] = []): RiskResult {
  const text = norm(`${i.title}\n${i.description}`);
  const blockReasons: string[] = [];
  for (const [re, code] of BLOCK) if (re.test(text)) blockReasons.push(code);
  let score = 0;
  const flags: string[] = [];
  for (const [re, pts, code] of SOFT) if (re.test(text)) { score += pts; flags.push(code); }
  // Preço fora da realidade costuma ser isca de golpe
  const price = i.priceCents / 100;
  if (i.operation === 'venda' && i.category === 'automoveis' && i.condition === 'usado' && price < 5000) { score += 30; flags.push('preco_muito_baixo'); }
  if (i.operation === 'venda' && i.category === 'imoveis' && price < 20000) { score += 30; flags.push('preco_muito_baixo'); }
  if (i.operation === 'locacao' && i.category === 'imoveis' && price < 150) { score += 25; flags.push('preco_muito_baixo'); }
  if (i.operation === 'locacao' && i.category === 'automoveis' && price < 40) { score += 25; flags.push('preco_muito_baixo'); }
  for (const f of extraFlags) { score += f.score; flags.push(f.code); }
  if (i.title.length > 20 && i.title === i.title.toUpperCase()) { score += 5; flags.push('titulo_em_caixa_alta'); }
  return { score: Math.min(score, 100), flags: [...new Set(flags)], blocked: blockReasons.length > 0, blockReasons };
}

const MSG: [RegExp, string][] = [
  [/\b(pix antecipado|pagamento antecipado|sinal|reserva|pague antes|deposita antes|adiantad)/, 'Pedido de pagamento antecipado: não pague nada antes de ver o produto.'],
  [/\b(codigo|c[oó]digo).{0,30}(sms|whats|recebeu|celular|confirmacao)/, 'Pedido de código: golpistas usam códigos de SMS/WhatsApp para invadir contas. Nunca informe.'],
  [/(https?:\/\/|www\.|bit\.ly)/, 'Link externo: não clique em links desconhecidos nem informe dados de pagamento por link.'],
  [/\b(motoboy|transportadora|frete).{0,40}(pagu|pix|deposit)/, 'Frete/entrega com pagamento adiantado é um golpe comum.'],
  [/\b(comprovante|print do pix).{0,30}(enviei|mandei|fiz)/, 'Comprovante enviado não é pagamento: confirme o dinheiro na sua conta antes de entregar.'],
  [/\b(whats?app|zap|telegram|me chama no)\b/, 'Conversa fora do Vendeu: você perde a proteção do registro e as orientações anti-golpe.'],
];
export function scanMessage(body: string): { flagged: boolean; reasons: string[] } {
  const t = norm(body);
  const reasons = MSG.filter(([re]) => re.test(t)).map(([, m]) => m);
  return { flagged: reasons.length > 0, reasons };
}
