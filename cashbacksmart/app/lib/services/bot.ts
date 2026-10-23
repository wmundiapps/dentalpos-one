/**
 * Robô de atendimento (app e WhatsApp). Responde com dados reais da conta.
 * Com ANTHROPIC_API_KEY: IA com ferramentas. Sem chave: respostas por intenção (palavras-chave).
 * Nada vai para humano: perguntas que o robô não resolve ficam registradas para melhorar as respostas.
 */
import { one, q } from '../db';
import { config, premiumPriceCents } from '../config';
import { brl, dateBR, pct } from '../format';
import { llmCall, LlmMessage, LlmTool } from '../llm';
import { getUser, setEmailOptin, businessesForUser } from './accounts';
import { walletSummary, rulesFor } from './cashback';
import { describeSubscription, invoicesOf, subscriptionOf, cancelSubscription } from './billing';
import { businessesIn, businessDashboard } from './catalog';
import { emailCredits, localCampaignsThisMonth } from './campaigns';

type Ctx = { userId: string; role: 'consumer' | 'business' | 'admin'; businessId?: string };
export type BotReply = { text: string; resolved: boolean };

// ---------- Ferramentas (executam no servidor, sempre com o usuário da sessão) ----------
const consumerTools: LlmTool[] = [
  { name: 'ver_saldo', description: 'Saldo de cashback do cliente por loja, com valores pendentes e vencimento.', input_schema: { type: 'object', properties: {} } },
  { name: 'ver_assinatura_e_faturas', description: 'Situação da assinatura e últimas faturas (valor, vencimento, link de pagamento).', input_schema: { type: 'object', properties: {} } },
  { name: 'lojas_na_cidade', description: 'Lojas participantes na cidade do cliente, com a melhor oferta. Pode filtrar por termo.', input_schema: { type: 'object', properties: { termo: { type: 'string' } } } },
  { name: 'meu_codigo', description: 'Código de membro e código de indicação do cliente.', input_schema: { type: 'object', properties: {} } },
  { name: 'parar_emails', description: 'Desliga o envio de ofertas por e-mail (o app continua mostrando ofertas).', input_schema: { type: 'object', properties: {} } },
  { name: 'cancelar_assinatura', description: 'Cancela a assinatura. Só use depois que o cliente confirmar explicitamente que quer cancelar.', input_schema: { type: 'object', properties: { confirmado: { type: 'boolean' } }, required: ['confirmado'] } },
];
const businessTools: LlmTool[] = [
  { name: 'resumo_loja', description: 'Vendas, cashback concedido e usado, clientes e taxa a faturar da loja no mês.', input_schema: { type: 'object', properties: {} } },
  { name: 'regras_cashback', description: 'Regras de cashback da loja.', input_schema: { type: 'object', properties: {} } },
  { name: 'ver_assinatura_e_faturas', description: 'Situação da assinatura da loja e últimas faturas.', input_schema: { type: 'object', properties: {} } },
  { name: 'campanhas_disponiveis', description: 'Quantas campanhas locais inclusas restam no mês e saldo de e-mails nacionais.', input_schema: { type: 'object', properties: {} } },
];

async function runTool(ctx: Ctx, name: string, input: any): Promise<string> {
  const u = await getUser(ctx.userId);
  if (!u) return 'Usuário não encontrado.';
  switch (name) {
    case 'ver_saldo': {
      const w = await walletSummary(ctx.userId);
      if (!w.length) return 'Sem saldo de cashback no momento.';
      return w.map((x) => `${x.name}: ${brl(x.available)} disponível${Number(x.pending) ? `, ${brl(x.pending)} pendente` : ''}${x.next_expiry ? `, vence ${dateBR(x.next_expiry)}` : ''}`).join('\n');
    }
    case 'ver_assinatura_e_faturas': {
      const where = ctx.role === 'business' ? { businessId: ctx.businessId } : { userId: ctx.userId };
      const s = await subscriptionOf(where);
      const inv = (await invoicesOf(where)).slice(0, 3);
      const prem = ctx.role === 'consumer' ? await one<{ premium_until: Date | null }>('select premium_until from users where id=$1', [ctx.userId]) : null;
      const price =
        ctx.role === 'business'
          ? `${Math.round(config.businessTrialDays / 30)} meses sem mensalidade, depois ${brl(config.businessMonthlyCents)}/mês + ${config.cashbackFeeBps / 100}% do cashback que o cliente usar`
          : `conta grátis. Premium (saldo que nunca vence): ${brl(config.premiumMonthlyCents)}/mês, cobrado por ano (${brl(premiumPriceCents())})${prem?.premium_until && new Date(prem.premium_until) > new Date() ? `; seu Premium vale até ${dateBR(prem.premium_until)}` : ''}`;
      const lines = inv.map((i: any) => `Fatura ${brl(i.amount_cents)} — ${i.status === 'paid' ? `paga em ${dateBR(i.paid_at)}` : i.status === 'pending' ? `vence ${dateBR(i.due_date)}${i.payment_url ? ` — pagar: ${i.payment_url}` : ''}` : 'cancelada'}`);
      return [`Assinatura: ${describeSubscription(s)}. Preço: ${price}.`, ...(lines.length ? lines : ['Nenhuma fatura emitida ainda.'])].join('\n');
    }
    case 'lojas_na_cidade': {
      const list = await businessesIn(u.state, u.city, { search: input?.termo || undefined, limit: 8 });
      if (!list.length) return `Nenhuma loja encontrada em ${u.city}${input?.termo ? ` para "${input.termo}"` : ''}.`;
      return list.map((b: any) => `${b.name} (${b.category}${b.neighborhood ? `, ${b.neighborhood}` : ''}): ${b.best_rule ? (b.best_rule.kind === 'percent' ? pct(b.best_rule.value) : brl(b.best_rule.value)) : 'sem oferta ativa'}`).join('\n');
    }
    case 'meu_codigo':
      return `Código de membro: ${u.member_code}. Código de indicação: ${u.referral_code} (quem você indicar ganha ${config.referralBonusDays} dias de Premium e você também).`;
    case 'parar_emails':
      await setEmailOptin(ctx.userId, false);
      return 'E-mails de ofertas desligados.';
    case 'cancelar_assinatura':
      if (!input?.confirmado) return 'Cancelamento não confirmado.';
      await cancelSubscription({ userId: ctx.userId });
      return `Assinatura cancelada. O acesso continua até o fim do período já pago.`;
    case 'resumo_loja': {
      const d = await businessDashboard(ctx.businessId!);
      return `No mês: ${Number(d.purchases_month)} compras, vendas ${brl(d.sales_month)}, cashback concedido ${brl(d.cashback_month)}, saldo resgatado ${brl(d.redeemed_month)}. Clientes: ${d.customers} (${d.returning_customers} voltaram). Taxa a faturar: ${brl(d.fee_open)}.`;
    }
    case 'regras_cashback': {
      const r = await rulesFor(ctx.businessId!);
      return r.length ? r.map((x) => `${x.title}: ${x.kind === 'percent' ? pct(x.value) : brl(x.value)}${x.active ? '' : ' (pausada)'}`).join('\n') : 'Nenhuma regra criada.';
    }
    case 'campanhas_disponiveis': {
      const used = await localCampaignsThisMonth(ctx.businessId!);
      return `Campanhas locais inclusas restantes no mês: ${Math.max(0, config.localCampaignsPerMonth - used)} de ${config.localCampaignsPerMonth}. E-mails nacionais disponíveis: ${(await emailCredits(ctx.businessId!)).toLocaleString('pt-BR')}.`;
    }
  }
  return 'Ferramenta desconhecida.';
}

// ---------- Base de conhecimento (usada pela IA e pelo modo sem IA) ----------
export function knowledge() {
  return `${config.appName}: rede de cashback do comércio local. Cliente: conta grátis. Premium opcional: ${brl(config.premiumMonthlyCents)}/mês cobrado uma vez por ano (${brl(premiumPriceCents())}), e o saldo nunca vence.
Empresa: ${Math.round(config.businessTrialDays / 30)} meses sem mensalidade, depois ${brl(config.businessMonthlyCents)}/mês; taxa de ${config.cashbackFeeBps / 100}% só sobre o cashback que o cliente usar, em fatura mensal; ${config.localCampaignsPerMonth} campanhas de e-mail por mês para clientes da própria cidade inclusas; pacotes nacionais pagos à parte.
Como ganhar: no caixa, o cliente mostra o código de membro (aba Meu código) ou informa CPF/celular; a loja lança o valor e o cashback cai na carteira.
Como usar o saldo: na página da loja no app, tocar "Usar meu saldo nesta loja", gerar o código de 6 números (vale ${config.redemptionCodeMinutes} minutos) e informar no caixa. O saldo de cada loja só vale nela. Não pode ser sacado.
Cashback pode ser valor fixo ou percentual; lojas podem dar promoção maior para clientes novos (primeira compra ou primeiros dias); o saldo vale no mínimo ${config.minExpiresDays} dias.
Se a loja esquecer de lançar: no app, toque em "Enviar nota fiscal", leia o QR do cupom e informe o valor. A loja confirma em até ${config.claimAutoApproveHours} horas. Cada nota só vale uma vez.
Cancelamento: aba Conta (pessoa física) ou Empresa > Assinatura e faturas. Acesso continua até o fim do período pago. Arrependimento em 7 dias da primeira cobrança com reembolso integral.
Pagamento: Pix, boleto ou cartão pelo link da fatura. Inadimplência: cliente continua comprando mas sem cashback; loja fica com lançamentos e campanhas pausados até pagar.
Loja: lança compras em "Lançar compra" (código, CPF, celular ou e-mail do cliente + valor); pode cancelar compras dos últimos ${config.cancelWindowDays} dias; cria regras em "Cashback"; cadastra operadores de caixa e outras lojas em "Empresa".
Indicação: quem chega indicado ganha ${config.referralBonusDays} dias de Premium e quem indicou ganha mais ${config.referralBonusDays} dias de Premium (até ${config.referralMaxPerYear} por ano).
Privacidade: dados não são vendidos; pedidos LGPD em privacidade@cashbacksmart.com.br.`;
}

function systemPrompt(ctx: Ctx, name: string) {
  return `Você é o atendente virtual do Cashbacksmart e atende ${ctx.role === 'business' ? 'lojistas' : 'clientes'} pelo app e pelo WhatsApp. Não existe atendimento humano: resolva você mesmo.
Fale português do Brasil, frases curtas, tom simpático e direto, sem emojis em excesso. Chame a pessoa de ${name.split(' ')[0]}.
Use as ferramentas para dados da conta; nunca invente valores. Para cancelar assinatura, peça confirmação explícita antes de usar a ferramenta.
Não altere regras, não cancele compras e não dê reembolsos manuais: explique onde a pessoa faz isso no app. Se não souber, diga que registrou a dúvida para melhorar o atendimento e indique o caminho mais próximo no app.
Base de conhecimento:
${knowledge()}`;
}

// ---------- Modo sem IA: intenções por palavra-chave ----------
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
async function ruleBased(ctx: Ctx, text: string): Promise<BotReply> {
  const t = norm(text);
  const has = (...w: string[]) => w.some((x) => t.includes(x));
  if (ctx.role === 'business') {
    if (has('fatura', 'boleto', 'pagar', 'pagamento', 'assinatura', 'mensalidade', 'taxa')) return { text: await runTool(ctx, 'ver_assinatura_e_faturas', {}), resolved: true };
    if (has('venda', 'resumo', 'relatorio', 'quanto vendi', 'clientes')) return { text: await runTool(ctx, 'resumo_loja', {}), resolved: true };
    if (has('regra', 'percentual', 'porcentagem', 'valor fixo')) return { text: (await runTool(ctx, 'regras_cashback', {})) + '\nPara criar ou pausar regras, vá em Cashback no menu.', resolved: true };
    if (has('campanha', 'email', 'e-mail', 'disparo', 'pacote')) return { text: (await runTool(ctx, 'campanhas_disponiveis', {})) + '\nPara enviar, vá em Campanhas.', resolved: true };
    if (has('lancar', 'registrar', 'compra')) return { text: 'Em "Lançar compra", digite o código, CPF, celular ou e-mail do cliente e o valor. Se ele quiser usar saldo, marque "Cliente quer usar o saldo" e digite o código de 6 números que aparece no app dele.', resolved: true };
    if (has('cancelar compra', 'estornar', 'estorno')) return { text: `No Painel, na lista de últimas compras, toque em "Cancelar" (vale para compras dos últimos ${config.cancelWindowDays} dias). O cashback não usado é estornado do cliente.`, resolved: true };
    if (has('caixa', 'funcionario', 'operador')) return { text: 'Em Empresa > Equipe, cadastre o operador com nome, e-mail e senha. Ele lança compras, mas não vê faturas nem muda regras.', resolved: true };
  } else {
    if (has('saldo', 'quanto tenho', 'carteira', 'extrato')) return { text: await runTool(ctx, 'ver_saldo', {}), resolved: true };
    if (has('cancelar assinatura', 'cancelar minha', 'quero cancelar', 'cancelamento')) return { text: 'Posso cancelar para você. O acesso continua até o fim do período pago. Para confirmar, vá em Conta > Cancelar assinatura.', resolved: true };
    if (has('fatura', 'boleto', 'pagar', 'pagamento', 'assinatura', 'mensalidade', 'cobranca', 'quanto custa', 'preco')) return { text: await runTool(ctx, 'ver_assinatura_e_faturas', {}), resolved: true };
    if (has('usar o saldo', 'usar saldo', 'resgatar', 'resgate', 'desconto')) return { text: `Abra a loja no app, toque em "Usar meu saldo nesta loja" e informe no caixa o código de 6 números (vale ${config.redemptionCodeMinutes} minutos). O saldo de cada loja só vale nela.`, resolved: true };
    if (has('codigo', 'qr', 'indicar', 'indicacao')) return { text: await runTool(ctx, 'meu_codigo', {}), resolved: true };
    if (has('loja', 'onde', 'padaria', 'farmacia', 'mercado', 'salao')) return { text: await runTool(ctx, 'lojas_na_cidade', {}), resolved: true };
    if (has('parar', 'nao quero', 'spam', 'descadastr') && has('email', 'e-mail')) return { text: await runTool(ctx, 'parar_emails', {}), resolved: true };
    if (has('nao caiu', 'nao recebi', 'nao apareceu', 'esqueceu', 'nota fiscal', 'cupom')) return { text: 'Se a loja esqueceu de lançar, toque em "Enviar nota fiscal" no app, leia o QR do cupom e informe o valor. A loja confirma em até 48 horas. Algumas lojas têm carência: nesse caso o cashback aparece como "liberando" na Carteira.', resolved: true };
    if (has('premium', 'vencer', 'vence', 'expira')) return { text: `O saldo vale pelo prazo de cada loja (mínimo ${config.minExpiresDays} dias). No Premium (${brl(config.premiumMonthlyCents)}/mês, cobrado por ano) o saldo nunca vence. Assine em Conta.`, resolved: true };
  }
  if (has('oi', 'ola', 'bom dia', 'boa tarde', 'boa noite')) return { text: 'Olá! Posso ver seu saldo, faturas, lojas participantes e tirar dúvidas sobre o Cashbacksmart. O que você precisa?', resolved: true };
  if (has('como funciona', 'o que e')) return { text: knowledge().split('\n').slice(0, 4).join('\n'), resolved: true };
  return { text: 'Não entendi bem. Posso ajudar com saldo, faturas, como usar o saldo, lojas participantes, cancelamento e e-mails. Registrei sua mensagem para melhorar o atendimento.', resolved: false };
}

// ---------- Entrada principal ----------
export async function botReply(ctx: Ctx, text: string, channel: 'app' | 'whatsapp' = 'app'): Promise<BotReply> {
  const msg = String(text || '').trim().slice(0, 1500);
  if (!msg) return { text: 'Escreva sua dúvida.', resolved: true };
  if (ctx.role === 'business' && !ctx.businessId) ctx.businessId = (await businessesForUser(ctx.userId))[0]?.id;
  const user = await getUser(ctx.userId);
  await q(`insert into bot_messages (user_id, channel, role, content) values ($1,$2,'user',$3)`, [ctx.userId, channel, msg]);

  let reply: BotReply | null = null;
  try {
    const hist = await q<{ role: 'user' | 'assistant'; content: string }>(
      `select role, content from (select role, content, id from bot_messages where user_id=$1 order by id desc limit 10) t order by id`,
      [ctx.userId],
    );
    const messages: LlmMessage[] = [];
    for (const h of hist) {
      if (!messages.length && h.role !== 'user') continue; // a conversa começa pelo usuário
      const last = messages[messages.length - 1];
      if (last && last.role === h.role) last.content += '\n' + h.content;
      else messages.push({ role: h.role, content: h.content });
    }
    const tools = ctx.role === 'business' ? businessTools : consumerTools;
    for (let i = 0; i < 4; i++) {
      const r = await llmCall(systemPrompt(ctx, user?.name || ''), messages, tools);
      if (!r) break; // sem chave: modo por regras
      const uses = r.content.filter((c) => c.type === 'tool_use');
      if (!uses.length) {
        const out = r.content.filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
        reply = { text: out || 'Pode repetir?', resolved: !/registrei (a|sua) d[uú]vida/i.test(out) };
        break;
      }
      messages.push({ role: 'assistant', content: r.content });
      const results = [];
      for (const u of uses) results.push({ type: 'tool_result', tool_use_id: u.id, content: await runTool(ctx, u.name, u.input) });
      messages.push({ role: 'user', content: results });
    }
  } catch (e) {
    console.error('bot ia', (e as Error).message);
  }
  if (!reply) reply = await ruleBased(ctx, msg);
  await q(`insert into bot_messages (user_id, channel, role, content, resolved) values ($1,$2,'assistant',$3,$4)`, [ctx.userId, channel, reply.text, reply.resolved]);
  return reply;
}

export async function botHistory(userId: string, limit = 30) {
  return q<{ role: string; content: string; created_at: Date }>(
    `select role, content, created_at from (select * from bot_messages where user_id=$1 order by id desc limit $2) t order by id`,
    [userId, limit],
  );
}

/** Perguntas que o robô não resolveu (para melhorar a base) */
export async function unresolvedQuestions(limit = 50) {
  return q<any>(
    `select a.created_at, u.name, u.role, (select content from bot_messages q where q.user_id=a.user_id and q.id < a.id and q.role='user' order by q.id desc limit 1) question
     from bot_messages a join users u on u.id=a.user_id where a.resolved = false order by a.id desc limit $1`,
    [limit],
  );
}

export async function userByPhone(phone: string) {
  const digits = phone.replace(/\D/g, '').replace(/^55/, '');
  // WhatsApp às vezes manda celular sem o 9 depois do DDD
  const alt = digits.length === 10 ? digits.slice(0, 2) + '9' + digits.slice(2) : digits;
  return one<{ id: string; role: 'consumer' | 'business' | 'admin' }>(`select id, role from users where phone = any($1) order by created_at limit 1`, [[digits, alt]]);
}
