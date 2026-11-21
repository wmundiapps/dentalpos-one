# Carrossel de ofertas (WhatsApp + Telegram)

O contato recebe vários cards deslizáveis (curso, tratamento, produto), escolhe um e toca em **"Quero saber mais"**.
O clique vira conversa atribuída a um atendente (rodízio), etiqueta no contato, nota no CRM, evento de automação
`carousel.click` e aviso ao sistema integrado (`revah.carousel_click` para o DentalPos/EduMaster).

| Canal | Como aparece | Exige |
|---|---|---|
| WhatsApp | Carrossel nativo (template de marketing da Meta, 2 a 10 cards, imagem + texto + botões) | Modelo aprovado pela Meta e opt-in do contato |
| Telegram | Um card com setas ◀ ▶ (a mensagem é editada a cada toque) | Contato que já iniciou conversa com o bot |

## Onde fica no painel
- **Campanhas → Nova campanha → Mensagem**: "Enviar como carrossel de ofertas". O texto da mensagem vira a abertura.
  No WhatsApp, só `{{primeiro_nome}}` ou `{{nome}}` são aceitos como variável.
- **Importar do catálogo**: cursos do EduMaster e tratamentos do DentalPos (sincronizados) ou itens enviados por `POST /v1/catalog`.
- **WhatsApp**: o botão final vira "Salvar e enviar para aprovação". Na campanha, o quadro "Aprovação na Meta" mostra o status
  (o webhook `message_template_status_update` atualiza sozinho; "Consultar" pergunta à Meta). O disparo só libera com **Aprovado**.
- **Torre de Controle** (na campanha): enviadas, entregues, lidas, interessados, saídas, falhas, cliques por card e conversas por atendente.

## Regras
- Botão **"Não quero receber"** em cada card (padrão). Com botão de link, ele sai do card no WhatsApp (a Meta aceita 2 botões por card)
  e a pessoa ainda pode responder SAIR.
- Todos os cards precisam ter os mesmos botões (link em todos ou em nenhum).
- Imagens JPG ou PNG, até 5 MB, link público. Ao enviar para aprovação o REVAH baixa cada imagem e sobe para a Meta.
- Mudou cards ou texto de abertura de um carrossel já enviado: volta para rascunho de aprovação (novo modelo).
- **Qualidade do número**: a cada 6 h (no cron `/cron/tick`) o REVAH lê a qualidade na Meta. Se cair para baixa (RED),
  as campanhas de WhatsApp da empresa são **pausadas** automaticamente.

## Conexão do número (cada cliente valida o próprio)
O cliente usa **Canais → Conectar WhatsApp** (Cadastro Incorporado da Meta). O guia "Como conectar" está na mesma tela.
O REVAH troca o código por um token da empresa, assina o webhook na conta do WhatsApp Business do cliente, registra o número
(PIN guardado cifrado) e cria o canal. Depois o cliente cadastra o cartão no Gerenciador do WhatsApp e envia os documentos para a verificação da empresa.

### O que a WMundi faz uma vez só (digitando direto nas telas, nada passa pelo chat)
1. Em developers.facebook.com, no app da WMundi, adicionar o produto **WhatsApp** e o **Login do Facebook para Empresas**.
2. Verificar o portfólio empresarial da WMundi na Central de Segurança da Meta.
3. Pedir a análise do app para `whatsapp_business_management` e `whatsapp_business_messaging` (provedor de tecnologia).
4. Em Login do Facebook para Empresas → Configurações, criar a configuração do **Cadastro Incorporado do WhatsApp** e anotar o ID.
5. No webhook do app (URL `https://api.revah.com.br/webhooks/meta`), assinar os campos `messages` e `message_template_status_update`.
6. Na Vercel, projeto `revah-api` (Production): `META_APP_ID`, `META_APP_SECRET`, `META_EMBEDDED_SIGNUP_CONFIG_ID`
   (e os que já existem: `META_VERIFY_TOKEN`). Depois, redeploy.
7. No domínio do app na Meta, liberar `app.revah.com.br` (e os domínios do DentalPos, se o painel for aberto embutido).

## Integrações
- DentalPos: `syncClinicWithRevah` manda, uma vez por dia, as especialidades dos dentistas e os tratamentos mais feitos nos últimos 12 meses.
- EduMaster: envia as ofertas ativas do processo seletivo (curso, turno, modalidade, polo).
- API: `POST /integrations/dentalpos/catalog/sync` (chave da clínica) ou `POST /v1/catalog` com `{ items: [{ externalRef, kind, title, subtitle?, imageUrl?, url? }] }`.
