# AlignSystem — rede de ortodontia digital com alinhadores

Aplicação independente (marca própria, sem menção à Dental Pós) com:

| Parte | Endereço | O que faz |
|---|---|---|
| Landing do paciente | `/` | Captação; formulário leva direto ao envio das fotos |
| Landing do dentista | `/parceiros` | Captação de parceiros (CRO, cidade, experiência) |
| Portal do paciente | `/minha-avaliacao?t=…` | Link pessoal: envio das 7 fotos, parecer, teleorientação por vídeo, contrato e pagamentos |
| Contratos | `/contrato?t=…` | Contrato do paciente e Termo de Adesão do parceiro com aceite eletrônico (nome, CPF/CNPJ, IP, data/hora, hash SHA-256) |
| Painel | `/painel` | Equipe (admin): pacientes, parecer, fotos, agenda, plano, contrato, cobranças com split, parceiros, equipe. Dentista: seus casos, fotos, agenda, registro de atendimentos com fotos |
| Guia de fotos | `/guia-fotos` | Guia imprimível das 7 fotos (substitui o PDF antigo, que falava em "gratuita" e citava valor) |
| Privacidade | `/privacidade` | Política LGPD |

Stack: HTML/CSS/JS puro em `public/` + uma função serverless Node (`api/index.js` → `lib/app.js`) + Postgres (schema `alignsystem`).
Fotos ficam no banco (comprimidas no navegador para 1600 px). Teleorientação usa salas Jitsi Meet (sem conta, abre no navegador).

## Ética / CRO

Nenhuma página pública cita preço, "grátis", "gratuito", "sem custo", "sem taxa" ou condições de pagamento
(Código de Ética Odontológica, art. 44). No lugar: *"Quer saber o preço? Entre em contato. Aqui não conseguimos passar
preços por questões éticas e pelas normas do Conselho Regional de Odontologia."* O teste `test/api.test.js` falha se
algum desses termos voltar às páginas. O rodapé mostra o responsável técnico (nome + CRO), exigido em toda divulgação —
preencha `PUBLIC_RESPONSAVEL_TECNICO`.

Script de WhatsApp revisado: `docs/Script_Atendimento_WhatsApp.md`. Minutas originais: `docs/contratos-originais/`.

## Fluxos

**Paciente:** formulário → link pessoal → 7 fotos → equipe publica parecer no painel → teleorientação (vídeo) e/ou
documentação → plano (marca, valores) → "Gerar contrato" → paciente aceita online → cobranças no Asaas (entrada
parcelada no cartão até 18x, mensalidades recorrentes, Pix/boleto) → dentista registra atendimentos com fotos → equipe valida.

**Dentista:** formulário → equipe confere CRO e clica "Aprovar" (define coparticipação, % por marco, multa etc.) →
dentista recebe o Termo de Adesão e o link para criar senha → aceita o termo (status vira *ativo*) → equipe cria a
subconta Asaas dele (botão no painel) ou informa o walletId → repasses caem direto na conta dele via split.

## Configuração (variáveis na Vercel, projeto `alignsystem`)

| Variável | Situação | Para quê |
|---|---|---|
| `NEON_DATABASE_URL` | ✅ criada pela integração Neon | Banco `alignsystem-db` (gru1) |
| `SESSION_SECRET`, `ASAAS_WEBHOOK_TOKEN` | ✅ geradas | Sessão do painel; token do webhook |
| `APP_URL` | ✅ `https://alignsystem.vercel.app` | Trocar para `https://alignsystem.com.br` quando o domínio apontar |
| `PUBLIC_WHATSAPP` | ⏳ | Número real, só dígitos: `55` + DDD + número |
| `PUBLIC_RESPONSAVEL_TECNICO` | ⏳ | Ex.: `Dr(a). Fulano · CRO-PR 12345` |
| `PUBLIC_RAZAO_SOCIAL`, `COMPANY_NAME`, `COMPANY_CNPJ`, `COMPANY_ADDRESS`, `COMPANY_REPRESENTATIVE` | ⏳ | Rodapé e contratos |
| `ASAAS_API_KEY` | ⏳ | Chave da conta Asaas (ver abaixo) |
| `ASAAS_ENV` | ✅ `sandbox` | Mudar para `production` com a conta real aprovada |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (ou `RESEND_API_KEY`) | ⏳ | Envio de e-mails automáticos |
| `META_PIXEL_ID`, `GOOGLE_TAG_ID` | ⏳ | Anúncios (carregados automaticamente) |
| `CONTRACTS_REVIEWED` | ⏳ | `true` depois da revisão jurídica — remove o aviso "minuta em revisão" |

Depois de alterar variáveis, faça um *Redeploy* na Vercel.

### Asaas (cobranças com split)

A abertura da conta exige CNPJ/CPF, documentos e selfie do titular — tem que ser feita pelo responsável:
1. Criar conta em asaas.com (conta PJ da AlignSystem). Para testar antes, crie também uma conta no sandbox (sandbox.asaas.com).
2. *Integrações → Chave de API* → copiar para `ASAAS_API_KEY`.
3. *Integrações → Webhooks* → URL `https://<domínio>/api/webhooks/asaas`, token = valor de `ASAAS_WEBHOOK_TOKEN`, eventos de cobrança (PAYMENT_*).
4. Pedir ao gerente Asaas a liberação de **subcontas** (white label) para o botão "Criar subconta no Asaas" do painel.
   Sem essa liberação, cada dentista pode abrir a própria conta Asaas e você cola o *walletId* dele no painel.

Mercado Pago não foi usado: o split dele exige que cada dentista autorize a aplicação via OAuth e o repasse por
parcela é mais limitado; o Asaas faz split por walletId, inclusive em parcelamento no cartão e assinaturas.

### E-mails (contato@, suporte@)

Os endereços já aparecem nas páginas e são usados pelo sistema, mas as caixas precisam ser criadas no provedor de e-mail
do domínio (exige acesso ao registro de `alignsystem.com.br`):
1. Registrar/confirmar `alignsystem.com.br` no Registro.br.
2. Criar as caixas `contato@` e `suporte@` (Google Workspace, Zoho Mail ou o mesmo provedor usado no SpaceHour) e
   publicar no DNS os registros MX, SPF e DKIM que o provedor indicar.
3. Colocar as credenciais SMTP de `contato@` nas variáveis `SMTP_*`.

### Domínio

Na Vercel: projeto `alignsystem` → *Settings → Domains* → adicionar `alignsystem.com.br` e `www.alignsystem.com.br`
e criar no DNS os registros indicados. Depois, trocar `APP_URL`.

## Primeiro acesso ao painel

```bash
cd alignsystem
NEON_DATABASE_URL=... APP_URL=https://alignsystem.vercel.app node scripts/create-admin.js voce@email.com "Seu nome"
```
Imprime um link (72 h) para criar a senha. Outros administradores são adicionados em *Painel → Equipe*.

## Desenvolvimento

```bash
cd alignsystem && npm install
DATABASE_URL=postgres://... SESSION_SECRET=uma-string-longa-qualquer-1234 npm run dev   # http://localhost:3000
TEST_DATABASE_URL=postgres://... npm test   # fluxo ponta a ponta com Asaas simulado
```

## Limites conhecidos

- Banco Neon no plano gratuito (0,5 GB). Cada caso ocupa ~2 MB de fotos; acima de ~200 casos, subir o plano do Neon
  ou mover as fotos para um storage de objetos.
- A pré-avaliação por fotos e a teleorientação são orientativas (o texto das páginas e dos contratos diz isso);
  diagnóstico e plano dependem de exame presencial.
- Contratos são minutas: revisar com a advogada antes de usar com pacientes reais.
