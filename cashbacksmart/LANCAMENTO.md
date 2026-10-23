# Cashbacksmart: suas tarefas para colocar no ar

Tudo o que dava para construir sozinho já está pronto e testado (67 testes de regras, 24 de ponta a ponta, build e tipos limpos).
O que sobra abaixo só você pode fazer: contas, senhas, pagamentos e decisões. **Nunca cole senha, chave ou token no chat.** Digite direto na tela de destino.

Faça na ordem. Cada passo é curto. Marque aqui o que já fez.

## Fase 1: decisões (hoje, 10 minutos)

- [ ] **1. Taxa de 20%.** Com 20% de taxa, uma loja que dá 20% de cashback paga 4% da venda (não 8%). O de 30% na primeira compra fica em 6%. Se quiser outro percentual, é só trocar `CASHBACK_FEE_BPS` (2000 = 20%). Responda: mantém 20%?
- [ ] **2. Abrir o PR.** Peça "abre o PR do Cashbacksmart" e revise. Ele mexe em banco (migração 008) e cobrança, então fica com você decidir.
- [ ] **3. Dra. Roberta.** Mandar `docs/legal/CONTRATO-LOJA-CASHBACKSMART.md` (os 7 pontos no fim do arquivo) e o texto da página `/termos`.

## Fase 2: contas (uma por vez; anote o login em um cofre de senhas)

- [ ] **4. Supabase.** Crie um projeto **novo** chamado `Cashbacksmart` (não use o DentalPos One). Região: South America (São Paulo).
- [ ] **5. Vercel.** Importe o repositório `wmundiapps/dentalpos-one`. Crie um projeto novo chamado `cashbacksmart` e, em **Root Directory**, escreva `cashbacksmart/app`.
- [ ] **6. Resend** (e-mails). Adicione o domínio `cashbacksmart.com.br` e coloque na Registro.br os registros DNS que ele mostrar (SPF e DKIM).
- [ ] **7. Asaas** (cobrança Pix, boleto, cartão). Crie a conta e gere a chave da API.
- [ ] **8. Cloudflare Turnstile** (captcha). Crie um site para `cashbacksmart.com.br` e guarde as duas chaves.
- [ ] **9. Twilio** (SMS do celular). Compre um número com SMS e guarde SID, token e o número.
- [ ] **10. Meta Business** (WhatsApp oficial). Cadastre o número, crie e mande aprovar o modelo de aviso (1 variável no corpo).
- [ ] **11. Anthropic** (robô de atendimento). Gere uma chave da API. Sem ela o robô responde só por regras.
- [ ] **12. E-mails do domínio.** Crie `ofertas@`, `privacidade@` e `alertas@` em `cashbacksmart.com.br` (o robô de monitoramento avisa por aqui).
- [ ] **13. Meta Ads e TikTok Ads.** Crie os pixels e guarde os dois IDs (só números/letras; não são secretos).
- [ ] **14. INPI.** Registrar a marca Cashbacksmart (classes 35, 36 e 42).

## Fase 3: banco

- [ ] **15.** No Supabase do projeto **Cashbacksmart** (confira o nome no canto da tela!), abra **SQL Editor > New query**, cole **todo** o conteúdo do arquivo abaixo e clique **Run**:

```
cashbacksmart/app/db/cashbacksmart-banco-completo.sql
```

Ele cria as 31 tabelas com RLS ligado e registra as migrações. Se der erro, nada fica pela metade.

## Fase 4: site

- [ ] **16. Variáveis na Vercel** (Project > Settings > Environment Variables). Sem as chaves opcionais o sistema roda em modo de teste. Lista completa em `cashbacksmart/app/.env.example`. As obrigatórias:

```
DATABASE_URL        (Supabase > Project Settings > Database > Connection string > Transaction pooler)
AUTH_SECRET         (32+ caracteres aleatórios)
APP_URL             https://cashbacksmart.com.br
CRON_SECRET         (outro texto aleatório)
RESEND_API_KEY
MAIL_FROM           Cashbacksmart <ofertas@cashbacksmart.com.br>
```

As recomendadas: `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `WHATSAPP_*`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_TIKTOK_PIXEL_ID`.

- [ ] **17. Domínio.** Na Vercel, adicione `cashbacksmart.com.br` ao projeto e aponte o DNS na Registro.br como ele mostrar.
- [ ] **18. Deploy.** Clique em Deploy e espere ficar verde.
- [ ] **19. Administrador.** No PowerShell, na pasta `cashbacksmart\app`, um comando por vez (o terminal pede a senha; ela nunca vai para o chat):

```
$env:DATABASE_URL = Read-Host "DATABASE_URL"
$env:ADMIN_EMAIL = "contato@dentalpos.com.br"
$env:ADMIN_PASSWORD = Read-Host "Senha do admin"
npm run seed
```

No primeiro acesso a `/admin` o sistema obriga a ativar a verificação em duas etapas.

- [ ] **20. Teste de fumaça.** Ainda na pasta `cashbacksmart\app`:

```
npm run smoke -- https://cashbacksmart.com.br
```

Tudo precisa dar `ok`. Se algo falhar, me mande a linha que falhou.

## Fase 5: robôs e cobrança

- [ ] **21. GitHub** (repositório > Settings > Secrets and variables > Actions). Em **Secrets**:

```
CASHBACKSMART_APP_URL          https://cashbacksmart.com.br
CASHBACKSMART_CRON_SECRET      (o mesmo CRON_SECRET da Vercel)
CASHBACKSMART_RESEND_API_KEY
CASHBACKSMART_ALERT_EMAIL      (seu e-mail)
```

Em **Variables**, crie `CASHBACKSMART_ATIVO` com o valor `true`. É isso que liga os robôs (cobrança, antifraude, avisos). Antes disso eles ficam desligados de propósito.

- [ ] **22. Webhooks.** Asaas: `https://cashbacksmart.com.br/api/webhooks/asaas` com o token de `ASAAS_WEBHOOK_TOKEN`. WhatsApp (Meta): `https://cashbacksmart.com.br/api/whatsapp` com o `WHATSAPP_VERIFY_TOKEN`.
- [ ] **23. Teste de ponta a ponta com dinheiro de verdade**: cadastre uma loja sua, lance uma compra, gere e pague uma fatura de R$ 5 por Pix.

## Fase 6: apps

- [ ] **24. Google Play** (US$ 25, uma vez). Crie a conta de desenvolvedor, gere a chave de assinatura e cadastre os segredos `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Rode o workflow **Cashbacksmart Android** e envie o arquivo gerado. Textos prontos em `cashbacksmart/mobile/LOJAS.md`.
- [ ] **25. Apple Developer** (US$ 99/ano). Crie o app `br.com.cashbacksmart.app`, os certificados e os segredos `IOS_CERT_P12_BASE64`, `IOS_CERT_PASSWORD`, `IOS_PROVISION_PROFILE_BASE64`, `APPLE_TEAM_ID`. Rode o workflow **Cashbacksmart iOS**.
- [ ] **26. Firebase** (notificações). Crie o projeto, baixe a conta de serviço e coloque em `FIREBASE_SERVICE_ACCOUNT` na Vercel. Coloque `google-services.json` (Android) e `GoogleService-Info.plist` (iPhone) nos projetos do `mobile/`.
- [ ] **27. Links das lojas.** Depois de publicados, preencha `APP_STORE_URL`, `PLAY_STORE_URL`, `APP_MIN_VERSION` e `APP_LATEST_VERSION` na Vercel.

## Fase 7: lançamento

- [ ] **28. Piloto em Maringá** com 20 a 30 lojas conhecidas, antes de abrir a verba cheia (plano v1, "Estratégia de escala").
- [ ] **29. Anúncios.** Os 27 cards e os textos estão em `cashbacksmart/ads/`. Suba na Meta e no TikTok com orçamento pequeno e confira no Gerenciador se o evento de cadastro (CompleteRegistration / Lead) está chegando.
- [ ] **30. Abrir a verba.**

---

### O que mudou nesta rodada (23/10/2026)

- **Corrigido**: erro que derrubava a tela de Ajuda do cliente ao enviar uma mensagem.
- **Novo**: Conta > Seus dados, com baixar cópia dos dados e excluir a conta (a Apple exige isso para aprovar o app; também é direito do cliente na LGPD).
- **Novo**: migração 008 liga RLS em todas as tabelas (fecha a API pública do Supabase) e há um teste que impede esquecer isso em tabelas futuras.
- **Novo**: aviso de cookies e medição de anúncios (Meta e TikTok), que só liga quando você configurar os IDs e a pessoa aceitar. Nunca roda dentro dos apps.
- **Novo**: robots.txt, sitemap.xml, `/privacidade` e a imagem de compartilhamento (`og.png`) que faltava.
- **Novo**: `npm run check-env` (confere as variáveis), `npm run smoke` (confere o site no ar) e `npm run bundle-sql` (gera o SQL do banco).
- **Ajustado**: os robôs, os testes e a análise de segurança estavam numa pasta onde o GitHub não executa. Foram para a raiz com prefixo `cashbacksmart-`, usam segredos `CASHBACKSMART_*` (para não misturar com o DentalPos) e ficam desligados até a variável `CASHBACKSMART_ATIVO=true`. A assinatura do Android também tinha um erro que impedia a chave de ser gravada.
- **Ajustado**: o Premium fica escondido dentro do app do iPhone (regra 3.1.1 da Apple). No site e no Android continua igual.
- **Contrato da loja** em minuta, pronto para a Dra. Roberta: `docs/legal/CONTRATO-LOJA-CASHBACKSMART.md`.

### Riscos que continuam abertos

- **Apple e o Premium.** O texto de `mobile/LOJAS.md` e o plano v1 dizem que o app se encaixa na regra 3.1.3(e). O Premium (saldo que nunca vence) é um recurso digital, então a Apple pode exigir o pagamento deles (15% a 30%). O código já esconde a oferta no iPhone; vale decidir com a Dra. Roberta antes de enviar o app.
- **Saldo de cashback.** Validar com advogado que não vira conta de pagamento regulada pelo Banco Central.
- **Nada disso foi publicado.** Nenhum recurso pago foi criado e nenhuma chave foi usada.
