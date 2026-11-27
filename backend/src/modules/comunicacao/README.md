# Módulo comunicacao (prefixo Com)

Omnichannel: WhatsApp, Telegram, e-mail, SMS, voz, Instagram/Facebook, chat do site, chatbot, campanhas, régua de cobrança, redes sociais.
Autenticado: `/api/edu/comunicacao`. Público: `/api/public/edu/comunicacao`. Selftest: `npx tsx src/modules/comunicacao/__selftest__.ts`.

## Modelos (21)
ComCanal, ComConfig, ComContato, ComPreferencia, ComTemplate, ComConversa, ComMensagem, ComCampanha, ComCampanhaDestinatario, ComRegua, ComReguaEtapa, ComReguaExecucao, ComBotFluxo, ComFaq, ComSocialConta, ComSocialPost, ComSocialMetrica, ComSocialInteracao, ComChamada, ComWebhookLog (+ enums).

## Papéis
ATENDE = SUPPORT, SECRETARY, ADMISSIONS, FINANCE, MARKETING, COORDINATOR, STAFF (+ super). GESTAO = SUPPORT, MARKETING. Credenciais/contas sociais/URA de canal: só ADMIN/OWNER/RECTOR/BOARD.

## Endpoints autenticados
- POST /bootstrap (GESTAO); GET /painel (ATENDE)
- Canais: GET /canais/provedores; GET|POST /canais; PATCH|DELETE /canais/:id (admin); POST /canais/:id/testar (GESTAO); POST /canais/:id/telegram/webhook (admin); GET /canais/:id/webhook-info (admin); GET /revah/status
- Caixa de saída: POST /despacho/executar; GET /outbox, /outbox/resumo; POST /outbox (enfileira, `enviarAgora`); POST /outbox/:id/reenviar|cancelar
- Config: GET /config; PUT /config (GESTAO)
- Contatos: CRUD /contatos; POST /contatos/sincronizar (ALUNOS|EGRESSOS|CANDIDATOS); GET|PUT /contatos/:id/preferencias; GET /contatos/:id/historico
- Templates: CRUD /templates; POST /templates/preview
- Inbox: GET /conversas, /conversas/metricas, /conversas/:id; POST /conversas; POST /conversas/:id/{lida,mensagens(nota),assumir,atribuir,status,etiquetas}; PATCH /conversas/:id
- Campanhas: GET|POST /campanhas; GET|PATCH /campanhas/:id; POST /campanhas/:id/{previa,agendar,disparar,cancelar}; GET /campanhas/:id/destinatarios
- Régua (FINANCE escreve): GET|POST /reguas; GET|PATCH|DELETE /reguas/:id; POST /reguas/:id/etapas; PATCH|DELETE /reguas/etapas/:etapaId; POST /reguas/simular (dry-run), /reguas/executar; GET /reguas/:id/execucoes
- Chatbot: CRUD /bot/fluxos, /bot/faq; POST /bot/validar, /bot/simular
- Social: contas (GET|POST|PATCH|DELETE /social/contas, POST .../:id/sincronizar); posts (GET|POST|PATCH /social/posts; POST /:id/{enviar-aprovacao,aprovar,rejeitar,devolver-rascunho,cancelar,publicar,marcar-publicado}); GET /social/calendario; GET|POST /social/metricas; GET|POST /social/interacoes; POST /social/interacoes/:id/moderar
- Voz: GET|PUT /voz/ura; POST|GET /voz/chamadas; PATCH /voz/chamadas/:id; POST /voz/chamadas/registrar

## Endpoints públicos (assinatura obrigatória)
GET|POST /webhook/:canalId (Telegram secret_token, Meta X-Hub-Signature-256, Twilio X-Twilio-Signature, Resend/Svix); POST /webhook/:canalId/status (Twilio); POST /webhook/:canalId/voz/{ura,digito,status}; POST|GET /sitechat/:canalId[/mensagens] (header x-chat-key).

## Jobs (registerEduJob)
comunicacao.regua-cobranca, comunicacao.campanhas-agendadas, comunicacao.posts-agendados, comunicacao.despachante (nessa ordem).

## Regras-chave
- Credenciais cifradas (secretVault); nunca retornadas. Canal sem credencial => notificação FALHA explicativa (nada é fingido).
- Despachante: claim otimista, janela comercial (WhatsApp/SMS/VOZ), limites/hora e /dia, retentativas com backoff, opt-out LGPD (CANCELADA), cobrança suprimida se título pago. Respostas de conversa (refType ComConversa) são imediatas.
- Régua: unique (etapa, título) impede duplicidade; tolerância para recuperar etapas perdidas.
- Opt-out por mensagem: SAIR/PARAR/STOP => MARKETING bloqueado; VOLTAR reativa.
- REVAH: `delegarRevah` no canal faz o despachante não enviar por ele (mensagens ficam PENDENTES).

## Exportado para outros módulos
Use `notify()` do core para enfileirar. Daqui: `despacharPendentes`, `despacharPorId` (dispatcher.ts), `executarReguas` (regua.ts), `resolverSegmento`/`executarCampanha` (campanhas.ts), `processarInbound`/`enviarNaConversa` (inbox.ts), `renderTemplate`/`normalizePhone` (pure.ts), `bootstrapComunicacao`.
