// Assistente virtual (IA) que tira dúvidas sobre o SpaceHour. Responde com base
// no guia abaixo e nos documentos oficiais (docs/legal/pt-BR). Cada conversa é
// gravada (assistant_conversations/assistant_messages) e, depois de 20 minutos
// sem mensagens, enviada por e-mail à equipe para melhorar o sistema.
//
// Env: ANTHROPIC_API_KEY (sem ela o assistente fica indisponível), ASSISTANT_MODEL.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { one, pool, rows, token } from './db.js';
import { HttpError, adminEmails } from './auth.js';
import { SUPPORT_EMAIL } from './mailer.js';
import { notify } from './notify.js';
import { FEES } from '../../shared/rules.js';

const MODEL = process.env.ASSISTANT_MODEL ?? 'claude-opus-5';
export const ASSISTANT_LIMITS = { messageChars: 2000, messagesPerConversation: 30, messagesPerIpPerHour: 40, idleMinutesBeforeEmail: 20 };

let clientOverride: Anthropic | undefined;
/** Para testes: cliente falso. */
export function setAssistantClient(c?: Anthropic) { clientOverride = c; }
function client() {
  if (clientOverride) return clientOverride;
  return process.env.ANTHROPIC_API_KEY ? new Anthropic() : undefined;
}

const DOCS: Array<[string, string]> = [
  ['booking-rules', 'Regras de Reserva e Uso'], ['cancellation-refunds', 'Cancelamento e Reembolso'], ['payments', 'Pagamentos'],
  ['host-obligations', 'Obrigações do Anfitrião'], ['space-norms', 'Normas de Conduta nos Espaços'], ['penalties', 'Penalidades'],
  ['guarantor-deposit', 'Avalista e Caução'],
];

const guest = Math.round(FEES.guestServiceFeeRate * 100);
const host = Math.round(FEES.hostServiceFeeRate * 100);

const GUIDE = `Você é o assistente virtual do SpaceHour (https://space-hour.com), um marketplace brasileiro de aluguel por hora de consultórios, clínicas, salas de psicologia, fisioterapia, advocacia, salas de aula e auditórios, nos horários em que ficariam vazios. Empresa: Instituto Ravel de Ensino Superior Ltda (CNPJ 03.162.275/0001-10), Maringá/PR. Suporte humano: support@space-hour.com.

COMO RESPONDER
- Responda no idioma da pessoa (em geral, português do Brasil), de forma curta, clara e cordial. Frases simples, sem jargão.
- Use texto simples: parágrafos curtos e listas com "•". Não use tabelas nem markdown com # ou **.
- Baseie-se SOMENTE neste guia e nos documentos oficiais abaixo. Se não souber ou não estiver aqui, diga que não tem essa informação e indique support@space-hour.com. Nunca invente regras, prazos, valores ou funcionalidades.
- Indique o caminho no site quando ajudar (ex.: "Menu → Painel do anfitrião → Meus anúncios") e os links das regras (https://space-hour.com/regras/<documento>).
- Você não tem acesso às contas, reservas ou pagamentos das pessoas e não pode alterar nada. Para casos individuais (reembolso, disputa, pagamento que não caiu, bloqueio de conta, erro no site), explique a regra geral e oriente a escrever para support@space-hour.com com o e-mail da conta e o código da reserva.
- Nunca peça senha, código de verificação, dados de cartão ou documentos. Se a pessoa enviar, diga para não compartilhar e siga sem usar esses dados.
- Não dê orientação jurídica, contábil ou médica individual; para isso, recomende um profissional.
- Não fale mal de concorrentes nem prometa resultados (reservas, ganhos).
- Assuntos fora do SpaceHour: diga educadamente que só ajuda com o SpaceHour.
- As conversas são registradas para melhorar o atendimento; se perguntarem, confirme.

O QUE É E COMO FUNCIONA
- Quem tem espaço (anfitrião) anuncia os horários livres, define preço por hora (e diária opcional), taxa de limpeza, caução, regras e se aceita reservas na hora ou aprova cada pedido.
- Quem precisa de espaço (locatário/profissional) busca por cidade e tipo de sala, reserva por hora (avulso, dias seguidos ou toda semana no mesmo horário) e paga online.
- Lançamento: por enquanto só no Brasil. O aplicativo para Android e iPhone está em preparação; o site funciona no celular.

CADASTRO E CONTA
- Cadastro em https://space-hour.com/cadastro. Depois é preciso confirmar o e-mail: chega um código de 6 números, que se digita no aviso do topo do site/app (ou toque no link do mesmo e-mail; vale 7 dias). Se não chegou, olhar o spam ou tocar em "Reenviar código". Sem e-mail confirmado não dá para reservar; o anúncio pode ser preenchido e fica salvo, entrando no ar assim que o e-mail for confirmado. E-mails temporários (descartáveis) não são aceitos.
- Verificação de identidade (opcional, recomendada, 1 minuto) em Perfil → Identidade: CPF ou CNPJ, foto do documento (RG, CNH ou passaporte) e uma selfie. A conferência é automática; se não for conclusiva a equipe revê em até 1 dia útil. O perfil ganha o selo de identidade verificada. Fotos cifradas e apagadas 90 dias após a conferência; não há reconhecimento facial automatizado.
- Endereço do anúncio: se tiver CEP, conferimos se é da cidade informada. O anfitrião vê o endereço no mapa ao anunciar para conferir; quem aluga vê o mapa com botões do Google Maps e do Waze depois que a reserva é confirmada.
- Esqueceu a senha: na tela Entrar, clicar em "Esqueci minha senha" (ou https://space-hour.com/esqueci-senha), informar o e-mail e abrir o link recebido (vale 1 hora) para criar uma nova senha.
- Excluir conta: Perfil → Excluir conta (pede a senha; não é possível com reserva em andamento). Instruções em https://space-hour.com/excluir-conta.

ANUNCIAR (ANFITRIÃO)
- Anunciar é grátis, sem mensalidade: Menu → Anunciar um espaço (ou https://space-hour.com/anuncie). Preencher tipo, localização (estado e cidade da lista), detalhes, fotos, horários ociosos, preços, políticas e regras, e publicar. Se faltar algo, o site mostra em vermelho, ao lado do botão, o que corrigir e em qual seção.
- Para receber reservas é obrigatório conectar a conta Mercado Pago em Painel do anfitrião. O dinheiro de cada reserva cai direto na conta Mercado Pago do anfitrião.
- Quem ainda não tem conta Mercado Pago cria uma grátis em mercadopago.com.br (com o mesmo CPF/CNPJ que vai receber), volta ao Painel do anfitrião e clica em "Conectar Mercado Pago". Até conectar, o anúncio aparece no site como "Em breve" e não aceita reservas.
- Quem começa uma reserva e não conclui recebe até 2 lembretes por e-mail; dá para parar pelo link "Não quero mais receber lembretes" no próprio e-mail. Novidades e ofertas por e-mail/WhatsApp só com a opção marcada no cadastro ou no Perfil.
- Editar anúncio: Menu → Painel do anfitrião → Meus anúncios → Editar.
- Espaços de saúde e outras profissões regulamentadas: o anfitrião pode exigir registro profissional verificado e deve conferir a habilitação antes de liberar a sala; continua responsável por alvará, vigilância sanitária e regras do seu conselho.

CUSTOS (valores exatos)
- Anunciar não custa nada. Só há cobrança quando uma locação acontece.
- O SpaceHour desconta ${host}% do valor definido pelo anfitrião (valor da locação + limpeza).
- O Mercado Pago desconta a tarifa de pagamento dele da parte do anfitrião (aproximadamente 1% no Pix e 5% no cartão; a taxa exata depende do plano da conta Mercado Pago de cada um).
- Quem aluga paga o preço do anfitrião + taxa de serviço de ${guest}% + ISS (5%) sobre essa taxa. O total aparece antes de confirmar.
- Exemplo: anfitrião cobra R$ 100 → quem aluga paga R$ 115,75 → o anfitrião recebe cerca de R$ 94 no Pix (cerca de R$ 89 no cartão) → o SpaceHour fica com R$ 20 (${host}% + ${guest}%) e o ISS vai para a prefeitura.

RESERVAR (PROFISSIONAL)
- Escolher o espaço, a data e o horário, conferir o preço total e pagar com Pix ou cartão (Mercado Pago). O endereço exato aparece depois da confirmação.
- Reserva instantânea confirma na hora; nos demais espaços o anfitrião aprova o pedido.
- Pode ser exigido registro profissional verificado (Perfil → Registro profissional: enviar número e foto/PDF do documento; há pré-verificação automática e revisão da equipe).
- Cancelamento e reembolso seguem a política do anúncio (flexível, moderada ou rígida) e o direito de arrependimento quando aplicável: ver o documento Cancelamento e Reembolso.

CAUÇÃO E DANOS
- O anfitrião pode definir uma caução (até 3× o valor da reserva), recomendada quando há equipamentos caros ou infraestrutura de valor (cadeira odontológica, aparelhos, equipamentos de imagem ou som).
- No Brasil, hoje, a caução não é cobrada nem bloqueada no cartão: como o Mercado Pago não permite pré-autorização pela plataforma, ela é garantida por um avalista indicado por quem aluga ao reservar. A garantia se encerra ao final da locação se não houver dano.
- Danos ao patrimônio ou aos equipamentos nunca são cobrados automaticamente: só se quem alugou reconhecer, ou quando a mediação (Central de Resolução) não resultar em acordo e a causa do dano for comprovada. Desgaste natural e defeitos preexistentes não são cobrados. O anfitrião deve registrar fotos antes e depois e abrir o incidente pela reserva dentro do prazo.
- A caução é uma garantia parcial: se o dano comprovado for maior que o valor da caução, quem alugou deve complementar a diferença.

REGRAS DE USO (resumo)
- Uso só para atividades lícitas, dentro da lei e da habilitação profissional.
- Proibido portar armas ou munições e manusear explosivos ou produtos químicos perigosos (exceto os de uso regular da profissão, permitidos pela legislação sanitária).
- Proibidas agressões físicas ou verbais a funcionários, clientes e demais pessoas.
- Pagamento fora da plataforma é proibido e leva à exclusão da conta.
- Violação dessas regras leva ao encerramento da reserva, exclusão da conta e comunicação às autoridades.`;

function loadDocs() {
  const dir = fileURLToPath(new URL('../../docs/legal/pt-BR/', import.meta.url));
  return DOCS.map(([file, title]) => {
    try { return `\n\n=== DOCUMENTO OFICIAL: ${title} (https://space-hour.com/regras/${file}) ===\n${fs.readFileSync(`${dir}${file}.md`, 'utf8')}`; } catch { return ''; }
  }).join('');
}

let systemPrompt: string | undefined;
const system = () => (systemPrompt ??= `${GUIDE}${loadDocs()}`);

export interface AssistantReply { conversationId: string; reply: string }

/** Recebe uma mensagem, responde com a IA e grava a conversa. */
export async function ask(input: { conversationId?: string; message: string; userId?: string; ip?: string; page?: string; locale?: string }): Promise<AssistantReply> {
  const ai = client();
  if (!ai) throw new HttpError(503, 'assistant_unavailable');
  const message = input.message.trim().slice(0, ASSISTANT_LIMITS.messageChars);
  if (!message) throw new HttpError(422, 'validation');

  // Limite por IP (abuso) e por conversa
  if (input.ip) {
    const r = await one<{ n: number }>(pool,
      `SELECT count(*)::int AS n FROM assistant_messages m JOIN assistant_conversations c ON c.id = m.conversation_id
       WHERE c.ip = $1 AND m.role = 'user' AND m.created_at > now() - interval '1 hour'`, [input.ip]);
    if ((r?.n ?? 0) >= ASSISTANT_LIMITS.messagesPerIpPerHour) throw new HttpError(429, 'assistant_rate_limited');
  }
  let conversationId = input.conversationId;
  const existing = conversationId ? await one<{ id: string }>(pool, 'SELECT id FROM assistant_conversations WHERE id = $1', [conversationId]) : undefined;
  if (!existing) {
    conversationId = `ai_${token()}`;
    await pool.query('INSERT INTO assistant_conversations (id, user_id, ip, page, locale) VALUES ($1, $2, $3, $4, $5)',
      [conversationId, input.userId ?? null, input.ip ?? null, input.page?.slice(0, 200) ?? null, input.locale ?? null]);
  }
  const history = await rows<{ role: 'user' | 'assistant'; content: string }>(pool,
    'SELECT role, content FROM assistant_messages WHERE conversation_id = $1 ORDER BY id', [conversationId]);
  if (history.filter((m) => m.role === 'user').length >= ASSISTANT_LIMITS.messagesPerConversation) {
    throw new HttpError(429, 'assistant_conversation_limit');
  }
  await pool.query('INSERT INTO assistant_messages (conversation_id, role, content) VALUES ($1, $2, $3)', [conversationId, 'user', message]);
  await pool.query('UPDATE assistant_conversations SET updated_at = now(), emailed_at = NULL, user_id = coalesce(user_id, $2) WHERE id = $1', [conversationId, input.userId ?? null]);

  const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: message }];
  let reply: string;
  try {
    const res = await ai.messages.create({
      model: MODEL,
      max_tokens: 2000,
      // Guia + documentos oficiais: prefixo estável, em cache por 1 h
      system: [{ type: 'text', text: system(), cache_control: { type: 'ephemeral', ttl: '1h' } }],
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      messages,
    });
    reply = res.stop_reason === 'refusal'
      ? `Não consigo ajudar com isso por aqui. Para falar com a equipe, escreva para ${SUPPORT_EMAIL()}.`
      : res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('').trim();
    if (!reply) reply = `Não consegui responder agora. Escreva para ${SUPPORT_EMAIL()} que a equipe ajuda você.`;
  } catch (e) {
    console.error('[assistente]', (e as Error).message);
    reply = `Estou com instabilidade no momento. Tente de novo em instantes ou escreva para ${SUPPORT_EMAIL()}.`;
  }
  await pool.query('INSERT INTO assistant_messages (conversation_id, role, content) VALUES ($1, $2, $3)', [conversationId, 'assistant', reply]);
  return { conversationId: conversationId!, reply };
}

/** Conversas paradas há 20 min: envia a transcrição à equipe (fila de e-mails). */
export async function emailIdleConversations(limit = 20) {
  const idle = await rows<{ id: string; user_id: string | null; page: string | null; name: string | null; email: string | null; created_at: Date }>(pool,
    `SELECT c.id, c.user_id, c.page, u.name, u.email, c.created_at FROM assistant_conversations c LEFT JOIN users u ON u.id = c.user_id
     WHERE c.emailed_at IS NULL AND c.updated_at < now() - make_interval(mins => $1)
     ORDER BY c.updated_at LIMIT $2`, [ASSISTANT_LIMITS.idleMinutesBeforeEmail, limit]);
  const team = adminEmails().length ? adminEmails() : [SUPPORT_EMAIL()];
  for (const c of idle) {
    const msgs = await rows<{ role: string; content: string }>(pool, 'SELECT role, content FROM assistant_messages WHERE conversation_id = $1 ORDER BY id', [c.id]);
    if (msgs.length) {
      const who = c.email ? `${c.name} <${c.email}>` : 'visitante sem login';
      const text = [
        `Dúvidas no assistente do SpaceHour — ${who}${c.page ? ` · página ${c.page}` : ''}`,
        `Conversa ${c.id} (${msgs.filter((m) => m.role === 'user').length} pergunta(s))`,
        '',
        ...msgs.map((m) => `${m.role === 'user' ? '🧑 Pessoa' : '🤖 Assistente'}: ${m.content}`),
      ].join('\n');
      for (const email of team) await notify(pool, { email }, 'assistant_transcript', text, '/admin');
    }
    await pool.query('UPDATE assistant_conversations SET emailed_at = now() WHERE id = $1', [c.id]);
  }
  return idle.length;
}
