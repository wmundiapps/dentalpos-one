# Integrações do CompletoDonto: como fazer cada uma funcionar

Regras de segurança (valem para todas):
- **Nunca** mande senha, chave de API ou token por chat, e-mail ou WhatsApp. Digite direto na tela indicada.
- Chaves ficam guardadas criptografadas. Sem chave válida, o canal fica desligado ou em modo de teste (nada é enviado de verdade).
- Depois de configurar, **sempre faça o teste indicado** antes de usar com pacientes.

Resumo rápido:

| Integração | Para que serve | Onde configurar | Quem faz |
|---|---|---|---|
| Asaas (Pix, boleto, cartão) | Cobrança online, baixa automática, repasse ao dentista, assinatura do paciente | Financeiro > Recebimentos online | Clínica |
| E-mail | Cobranças, lembretes, retorno de pacientes | Marketing > Canais de Envio | Clínica (ou usa o e-mail da plataforma) |
| WhatsApp oficial (Meta) | Lembretes e mensagens automáticas | Marketing > Canais de Envio | Clínica + WMundi |
| SMS (Comtele) | Lembretes por SMS | Canais de Envio / servidor | WMundi |
| Telegram | Avisos por bot | Canais de Envio / servidor | WMundi |
| Receita Saúde / recibos | Recibos a partir de pagamentos | Administrativo > Automação Fiscal | Clínica + contador |
| Importação (Clinicorp e outros) | Trazer pacientes, financeiro e histórico | Configurações > Importar dados | Clínica |
| Agenda online | Paciente agenda sozinho | Recepção > Agendamento online | Clínica |
| Ponto por rosto | Ponto da equipe | Administrativo > Ponto por rosto | Clínica |
| Arquivos clínicos (nuvem) | Exames e escaneamentos | Servidor | WMundi |
| Tarefas automáticas (cron) | Lembretes, cobrança de atraso, assinaturas | Servidor | WMundi |

---

## 1. Asaas: Pix, boleto e cartão

**Para que serve:** gerar cobrança com um clique, o paciente paga, e o sistema dá a baixa sozinho no Financeiro. Também divide o pagamento com o dentista (split) e cobra as mensalidades da **Assinatura do paciente**.

**O que você precisa:** uma conta Asaas da clínica (https://www.asaas.com), já aprovada.

**Passo a passo**
1. No Asaas, gere a **chave de API** (Integrações > Chave de API). Guarde sem mostrar a ninguém.
2. No CompletoDonto, abra **Financeiro > Recebimentos online**.
3. Escolha o **Ambiente**: *Sandbox* para testar, *Produção* para valer.
4. Cole a chave de API no campo indicado e conecte. O sistema tenta cadastrar sozinho o **aviso automático de pagamentos (webhook)**.
5. Se aparecer o aviso "não foi possível cadastrar o webhook", faça à mão: no Asaas vá em **Integrações > Webhooks > Novo webhook**, informe a **URL do webhook** e o **Token de autenticação do webhook** que aparecem na tela do CompletoDonto e marque os eventos de cobrança.
6. Para dividir com o dentista: cadastre o **Wallet ID do Asaas** de cada dentista (campo "Dentista" + "Wallet ID") na mesma tela.

**Como testar:** em Sandbox, gere uma cobrança de R$ 5 em Financeiro > Contas a Receber > "Gerar cobrança", pague pelo simulador do Asaas e veja o lançamento virar **Pago** sozinho.

**Problemas comuns**
- "Conecte a conta Asaas antes de gerar cobranças": a chave não foi salva ou a conta está inativa.
- Pagou e o lançamento não baixou: webhook não cadastrado ou token diferente. Refaça o passo 5.
- Cliente sem CPF: preencha CPF e e-mail do paciente na cobrança (o sistema guarda para as próximas).

---

## 2. E-mail

**Para que serve:** enviar cobrança (com Pix), lembretes, retorno de pacientes ausentes e avisos.

**Opção A, e-mail da plataforma (mais simples):** já sai pelo remetente do CompletoDonto, sem configurar nada.

**Opção B, e-mail da clínica (melhor para o paciente reconhecer):**
1. Abra **Marketing > Canais de Envio**.
2. Adicione um remetente de **E-mail**, informe o endereço e as credenciais do seu provedor de e-mail transacional.
3. Marque como **padrão**.

**Como testar:** em Contas a Receber, gere uma cobrança para um paciente com o seu próprio e-mail cadastrado e confira se chegou (olhe também o spam).

**Dica:** para não cair no spam, peça ao seu provedor para configurar os registros SPF e DKIM do domínio.

---

## 3. WhatsApp oficial (Meta)

**Para que serve:** lembretes e mensagens automáticas. **Atenção:** a Meta só permite mensagem automática fora da janela de 24 horas com **modelo (template) aprovado**.

**O que você precisa**
- Conta do Meta Business e um número de WhatsApp Business dedicado.
- No painel da Meta (WhatsApp Cloud API): o **ID do número** e o **token de acesso**.
- Um **modelo de mensagem aprovado** com uma variável de texto.

**Passo a passo**
1. Em **Marketing > Canais de Envio**, adicione um remetente de **WhatsApp**.
2. Informe o ID do número, o token e o nome do modelo (e idioma, normalmente `pt_BR`).
3. Marque como padrão.

**Como testar:** envie um lembrete para o seu próprio número.

**Sem integração (alternativa que funciona hoje):** as telas **Campanha de final de ano**, **Assinatura do paciente > Enviar Pix** e outras abrem o WhatsApp do atendente com a mensagem pronta. Você só toca em enviar. É o jeito mais seguro e não exige modelo aprovado.

---

## 4. SMS e Telegram

- **SMS (Comtele):** a WMundi cadastra a chave do provedor no servidor. A clínica só liga o canal em Canais de Envio.
- **Telegram:** a WMundi cria o bot e cadastra o token. A clínica liga o canal.
- Teste sempre enviando para o seu próprio número ou conta.

---

## 5. Receita Saúde e recibos (Automação Fiscal)

1. Abra **Administrativo > Automação Fiscal**.
2. Confira os dados do emissor (nome, CPF/CNPJ) e o dia do mês seguinte para os recibos pendentes (padrão 5; **confirme com o contador**).
3. Pagamentos confirmados geram o recibo pendente automaticamente; lançamentos importados de outro sistema **não** geram recibo sozinhos.
4. O contador acessa o portal contábil com o perfil **CONTADOR**.

---

## 6. Importar dados de outro sistema (Clinicorp e outros)

1. Abra **Configurações > Importar dados** (pacientes: **Importar pacientes**).
2. Baixe o modelo da planilha, ou envie a planilha exportada do sistema antigo (`.xlsx` ou `.csv`).
3. Importe **pacientes, financeiro e histórico**: tudo deve ser importado.
4. Parcelas importadas aparecem como **"para conferir"** (o pagamento chegou pelo banco do sistema antigo): confira e dê a baixa em Financeiro.
5. Confira alguns pacientes por amostragem antes de seguir.

---

## 7. Agenda online (o paciente agenda sozinho)

1. Em **Recepção > Agendamento online**, copie o link da clínica (`/agendamento-online?clinicId=...`).
2. Em **Agenda > Mais opções > Jornada / bloqueios**, confira os dias e horários de cada dentista. Só aparecem horários livres.
3. Coloque o link no Instagram, no Google Meu Negócio, no WhatsApp e em mensagens de retorno.
4. **Teste:** abra o link numa janela anônima e faça um agendamento de teste (depois cancele).

---

## 8. Ponto por rosto

1. Em **Administrativo > Ponto por rosto**, cadastre o aparelho da clínica (tablet) e a localização.
2. Cada colaborador cadastra o rosto uma vez, com consentimento.
3. O colaborador vê o próprio ponto em **Meu ponto**. RH e Financeiro veem de todos (conforme os acessos).

---

## 9. Pelo lado da WMundi (servidor): variáveis e tarefas automáticas

Só a WMundi mexe nisto, na Vercel (projeto `dentalpos-one`) e no banco (Supabase, projeto DentalPos One). **Nunca** escreva os valores em documentos.

| Variável | Para que serve |
|---|---|
| `DATABASE_URL`, `JWT_SECRET`, `TENANT_SECRET_MASTER_KEY` | banco e segurança da sessão e dos segredos |
| `PUBLIC_APP_URL`, `PUBLIC_API_URL` | endereços do app e da API (links nas mensagens) |
| `ASAAS_API_KEY`, `ASAAS_ENV`, `ASAAS_WEBHOOK_TOKEN` | cobrança da própria mensalidade do sistema |
| `RESEND_API_KEY` | e-mail da plataforma |
| `COMTELE_API_KEY` | SMS |
| `META_PHONE_NUMBER_ID`, `META_ACCESS_TOKEN`, `META_VERIFY_TOKEN`, `META_APP_SECRET` | WhatsApp oficial da WMundi |
| `TELEGRAM_BOT_TOKEN` | Telegram |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | inteligência artificial (assistentes e atendimento) |
| `CLINICAL_STORAGE_*` | armazenamento dos arquivos clínicos (exames, escaneamentos) |
| `CRON_SECRET` | protege a rotina automática |
| `SUBSCRIPTION_PROMO_UNTIL` | data limite da promoção de assinatura |
| `STAFF_REQUIRE_2FA`, `WMUNDI_STAFF_EMAILS` | segurança da equipe WMundi |

**Rotina automática (cron):** o endereço `/api/cron/reminders` precisa ser chamado **de hora em hora** por um agendador (Vercel Cron ou serviço externo), com o segredo `CRON_SECRET`. É ele que dispara: lembretes de consulta, cobrança de atraso, retorno de pacientes ausentes, lembretes de vencimento, assinaturas e a cobrança mensal da **Assinatura do paciente**. Se parar de rodar, nada disso sai. **Teste:** chame uma vez e confira `{ "ok": true }`.

**Depois de mudar qualquer variável na Vercel:** faça um novo deploy (Redeploy) para valer.

**Banco (Supabase):** SQL novo entra pelo editor SQL do projeto **DentalPos One** (`lfeqfzvmasqnnmqvkjyg`). Confira o nome do projeto no canto da tela antes de rodar. Tabela nova nasce com RLS ligado e sem acesso para `anon`/`authenticated`.
