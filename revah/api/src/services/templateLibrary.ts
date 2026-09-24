// Biblioteca de modelos prontos (mesmos segmentos exibidos em revah.com.br).
// Variáveis: {{nome}}, {{primeiro_nome}}, {{empresa}}, {{data}}, {{hora}}, {{valor}}, {{link}}.
export interface LibraryTemplate {
  key: string
  segment: string
  name: string
  body: string
}

export const TEMPLATE_LIBRARY: LibraryTemplate[] = [
  { key: 'saude-confirmacao', segment: 'Saúde & Clínicas', name: 'Confirmação de consulta', body: 'Olá, {{primeiro_nome}}! Sua consulta está marcada para {{data}} às {{hora}}. Responda CONFIRMO para confirmar ou nos diga se precisa remarcar.' },
  { key: 'saude-lembrete-24h', segment: 'Saúde & Clínicas', name: 'Lembrete 24h antes', body: 'Olá, {{primeiro_nome}}! Passando para lembrar da sua consulta amanhã, {{data}}, às {{hora}}. Qualquer imprevisto, é só responder esta mensagem.' },
  { key: 'saude-retorno', segment: 'Saúde & Clínicas', name: 'Retorno de paciente', body: 'Olá, {{primeiro_nome}}! Já faz um tempo desde a sua última visita. Que tal agendar seu retorno? Responda com o melhor dia e horário para você.' },
  { key: 'vendas-followup', segment: 'Vendas & Comercial', name: 'Follow-up de lead', body: 'Olá, {{primeiro_nome}}! Aqui é da {{empresa}}. Vi que você se interessou pelos nossos serviços. Posso te ajudar com alguma dúvida?' },
  { key: 'vendas-promocao', segment: 'Vendas & Comercial', name: 'Promoção especial', body: 'Olá, {{primeiro_nome}}! Preparamos uma condição especial para você, válida até {{data}}. Quer saber os detalhes?' },
  { key: 'cobranca-lembrete', segment: 'Cobrança', name: 'Lembrete de pagamento', body: 'Olá, {{primeiro_nome}}. Lembramos que há um pagamento de {{valor}} com vencimento em {{data}}. {{link}} Se já pagou, desconsidere esta mensagem.' },
  { key: 'cobranca-confirmacao', segment: 'Cobrança', name: 'Confirmação de pagamento', body: 'Olá, {{primeiro_nome}}! Confirmamos o recebimento do seu pagamento de {{valor}}. Obrigado!' },
  { key: 'ecommerce-pedido', segment: 'E-commerce', name: 'Pedido confirmado', body: 'Olá, {{primeiro_nome}}! Seu pedido foi confirmado e já está sendo preparado. Avisaremos por aqui quando for enviado.' },
  { key: 'educacao-aula', segment: 'Educação', name: 'Lembrete de aula', body: 'Olá, {{primeiro_nome}}! Lembrete: sua aula é em {{data}} às {{hora}}. Até lá!' },
  { key: 'educacao-rematricula', segment: 'Educação', name: 'Rematrícula', body: 'Olá, {{primeiro_nome}}! As rematrículas estão abertas até {{data}}. Quer garantir sua vaga? Responda esta mensagem.' },
  { key: 'geral-boas-vindas', segment: 'Geral', name: 'Boas-vindas', body: 'Olá, {{primeiro_nome}}! Seja bem-vindo(a) à {{empresa}}. Estamos por aqui para o que precisar.' },
  { key: 'geral-pesquisa', segment: 'Geral', name: 'Pesquisa de satisfação', body: 'Olá, {{primeiro_nome}}! De 0 a 10, quanto você recomendaria a {{empresa}} para um amigo? Sua opinião nos ajuda a melhorar.' },
]
