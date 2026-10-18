// Respostas livres do robô via API da Anthropic (opcional). Sem chave, o robô usa só regras.
import { cfg } from '../config.js';

export const aiEnabled = () => !!cfg.ai.apiKey;

// Devolve texto curto ou null (quando deve passar para atendente humano).
export async function aiReply({ salon, services, hoursText, history, userText }) {
  if (!aiEnabled()) return null;
  const system = [
    `Você é a recepcionista virtual do salão "${salon.name}" (${salon.city || 'Brasil'}). Responda em português do Brasil, em no máximo 3 frases curtas, tom cordial e elegante.`,
    'Use SOMENTE as informações abaixo. Se não souber, diga que vai chamar uma pessoa da equipe e responda exatamente: [HUMANO]',
    'Nunca invente preços, horários, promoções ou resultados. Nunca dê conselho médico/dermatológico. Nunca peça senha, CPF, dados de cartão ou códigos.',
    'Não repita nem recomende links recebidos do cliente. Para agendar, peça para o cliente digitar "agendar".',
    `Serviços e preços: ${services.map((s) => `${s.name} (R$ ${(s.price_cents / 100).toFixed(2).replace('.', ',')}, ${s.duration_min} min)`).join('; ') || 'não cadastrados'}`,
    `Horário de funcionamento: ${hoursText}`,
    `Endereço: ${salon.address || 'não informado'}`,
  ].join('\n');
  const messages = [...history.slice(-8).map((m) => ({ role: m.direction === 'in' ? 'user' : 'assistant', content: m.body })), { role: 'user', content: userText }];
  // a API exige alternância user/assistant começando por user
  const cleaned = [];
  for (const m of messages) {
    if (cleaned.length === 0 && m.role !== 'user') continue;
    if (cleaned.length && cleaned[cleaned.length - 1].role === m.role) cleaned[cleaned.length - 1].content += '\n' + m.content;
    else cleaned.push(m);
  }
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': cfg.ai.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.ai.model, max_tokens: 300, system, messages: cleaned }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const text = (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (!text || text.includes('[HUMANO]')) return null;
    return text.slice(0, 700);
  } catch { return null; }
}
