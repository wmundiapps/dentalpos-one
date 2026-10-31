# Autorização de contato — padrão para todos os sistemas da WMundi

> **Estado:** texto PROVISÓRIO (versão `v1-2026-10-provisorio`). Só vale como comercial depois da aprovação do Robson e da revisão da Dra. Roberta, inclusive para os EUA (TCPA, CAN-SPAM, leis estaduais).

## Regras que todo sistema segue
1. **Opcional e separado.** A autorização de marketing nunca vem pré-marcada nem é condição para usar o serviço.
2. **Por canal.** O cliente marca cada canal: WhatsApp, SMS, e-mail, telefone (Telegram só depois que a pessoa abrir a conversa com o robô; anúncios em redes sociais só com lista de e-mails e telefones autorizados).
3. **Prova guardada.** Para cada autorização: nome, telefone/e-mail, canais, texto mostrado, versão, idioma, IP, navegador, data e origem.
4. **Retirada fácil.** Pelo mesmo canal ("PARAR"/"STOP") ou por e-mail; vira "revogada" e sai das planilhas.
5. **Cada empresa na sua aba.** A base central fica no painel do Studio Beauty Barber (salão comercial), na tela *Contatos autorizados*, uma aba por empresa.

## Texto padrão (provisório)
- **PT:** Autorizo a WMundi Technologies e seus sistemas (Studio Beauty Barber e demais) a entrar em contato comigo pelos canais marcados abaixo, com ofertas, novidades e avisos. Posso retirar a autorização quando quiser, pelo mesmo canal ou pelo e-mail contato@studiobeautybarber.com.
- **EN:** I authorize WMundi Technologies and its systems to contact me through the channels checked below with offers, news and notices, including by automated text message or call. Consent is not a condition of any purchase. I can withdraw it at any time by replying STOP or emailing contato@studiobeautybarber.com.

## Como outro sistema envia as autorizações para a base central
`POST https://app.studiobeautybarber.com/api/ingest/consent` com o cabeçalho `Authorization: Bearer <chave da empresa>`.
A chave é criada em *Contatos autorizados > Conectar outros sistemas* (aparece uma única vez, na tela do dono) e guardada como segredo do sistema que envia. A empresa vem da chave, nunca do corpo.

```json
{ "name": "Ana Souza", "phone": "(44) 99911-2233", "email": "ana@exemplo.com",
  "channels": { "whatsapp": true, "sms": false, "email": true, "phone": false },
  "source": "cadastro", "text_version": "v1-2026-10-provisorio", "text_shown": "<texto exibido>",
  "lang": "pt", "ip": "200.0.0.1", "consent_at": "2026-10-31T12:00:00Z" }
```

## Dados de clientes de salões parceiros
Cadastros captados dentro da página de um salão pertencem ao salão. A WMundi só usa esses cadastros se o contrato com o salão disser isso (cláusula a redigir pela Dra. Roberta).
