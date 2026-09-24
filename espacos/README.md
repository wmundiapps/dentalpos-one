# SpaceHour — espaços de trabalho prontos, por hora

Marketplace no estilo Airbnb para alugar **por hora, nos horários ociosos**, espaços profissionais prontos:
consultórios odontológicos, clínicas médicas, salas de psicologia, advocacia, salas de aula, auditórios,
salas de reunião, estúdios etc. É um app independente, sem ligação com o DentalPos.

## Como rodar

Requer Node 22+ e PostgreSQL 14+.

```bash
cd espacos
docker compose up -d   # PostgreSQL local (bancos spacehour e spacehour_test) — ou use um Postgres seu
npm install            # instala server e web (workspaces)
npm run dev            # aplica as migrações, cria dados demo se o banco estiver vazio; API :4000, web :5173
npm test               # testes das regras e de integração (banco spacehour_test)
npm run db:reset --workspace server   # apaga e recria o banco de desenvolvimento com dados demo
```

Configuração em `server/.env` (modelo em `server/.env.example`): `DATABASE_URL`, `TEST_DATABASE_URL`, `DATABASE_SSL`, `JWT_SECRET`, `SEED_DEMO`…

Contas de demonstração (senha `demo12345`): `locatario@spacehour.demo` (dentista com CRO verificado),
`anfitriao@spacehour.demo` (clínica em São Paulo), `admin@spacehour.demo` (mediação). Há anúncios em 28 países.

## Lançamento

Operação aberta **só no Brasil** (`LAUNCH_COUNTRY_CODES` em `shared/countries.ts`; no servidor, `LAUNCH_COUNTRIES=BR,PT` ou `all` sobrescreve). Os demais países continuam configurados para a expansão. Pagamentos no Brasil: Mercado Pago (Stripe fica pronto para os mercados internacionais).

## O que tem

| Área | Funcionalidades |
|---|---|
| Busca | Botão de **país / cidade** (7 regiões, 31 países) e **idioma** (11 idiomas, árabe e hebraico da direita para a esquerda), categorias, data/horário, filtros de preço, comodidades, reserva instantânea, “sem avalista” |
| Anúncio | Horários ociosos por dia da semana, linha do tempo do dia, equipamentos, normas do espaço e do condomínio, política de cancelamento, avaliações |
| Reserva | Um dia, dias seguidos (até 5) ou recorrência semanal (até 12 semanas); reserva instantânea ou por solicitação (anfitrião responde em 24 h) |
| Pagamento | Métodos locais por país (Pix, boleto, OXXO, SPEI, Interac, ACH, SEPA, MB WAY, Multibanco, Bizum, Satispay, Alipay, WeChat Pay, Konbini, PayPay, UPI, Bit, PayID, BPAY…), taxas, tributo local, caução pré-autorizada, repasse 24 h após o início |
| Avalista | Anfitrião pode exigir avalista (sempre, opcional ou acima de um valor); avalista aceita por link, com responsabilidade limitada a 3× o total |
| Cancelamento | Flexível / Moderada / Rígida, janela de cortesia, direito de arrependimento por país, cancelamento pelo anfitrião com multa e advertência |
| Penalidades | Atraso na saída (automático no check-out), danos, limpeza, descumprimento de normas, excesso de pessoas, sublocação etc.; 48 h para contestar; mediação; advertências → suspensão → exclusão |
| Avaliações | Anfitrião avalia o locatário, locatário avalia espaço/anfitrião (duplo-cego, 14 dias) e, **opcionalmente, o locatário gera links para os próprios clientes avaliarem o espaço** |
| Pagamento real | **Mercado Pago** (Checkout Pro) na América Latina — BR, AR, CL, CO, MX, PE, UY — e **Stripe** (Checkout) no resto do mundo. O horário fica reservado 30 min enquanto o locatário paga; a confirmação chega por webhook assinado. Stripe: cartão pré-autorizado, caução e cobranças posteriores no meio salvo. Mercado Pago: sem caução (vira avalista) e penalidades por link de pagamento |
| Registro profissional | Locatário envia número + foto/PDF da carteira; **agente de IA (Claude)** confere documento, nome, número, conselho e busca o cadastro público; só aprova sozinho com alta confiança, o resto vai para a equipe (`/admin`). O **anfitrião é o responsável final**: aprova a reserva declarando que conferiu o registro, ou marca no anúncio que assume essa conferência |
| Fotos | Upload da galeria/câmera do celular ou do computador (arrastar e soltar), JPG/PNG/WEBP/HEIC até 10 MB, capa; Vercel Blob ou banco |
| E-mail | Fila no banco enviada por SMTP (GoDaddy): `no-reply@space-hour.com`, respostas para `support@space-hour.com` |
| Avaliação do app | Botão “Avaliar o app” em todas as telas: nota, sugestões de melhoria e relato de erros; painel na equipe e aviso por e-mail |
| Regras | 12 documentos legais completos (termos, reserva, cancelamento, penalidades, normas, avalista, avaliações, pagamentos, anfitrião, disputas, privacidade, regras por país) em 11 idiomas — `docs/legal/` |

## Estrutura

- `shared/` — regras de negócio (limites, taxas, cancelamento, penalidades) e catálogo de países. Única fonte usada pela API e pela web.
- `server/` — API Express 5 + TypeScript sobre **PostgreSQL**:
  - `migrations/*.sql` — esquema versionado, aplicado automaticamente ao iniciar (`schema_migrations` registra o que já rodou);
  - `src/db.ts` — pool de conexões, transações e travas; `src/repo.ts` — leitura/gravação de cada entidade;
  - cada operação (reservar, aprovar, cancelar, check-in/out, incidentes, rotina periódica) roda numa transação; a agenda de cada espaço é travada durante a reserva, então dois pedidos simultâneos para o mesmo horário nunca passam juntos, mesmo com várias instâncias do servidor;
  - movimentos financeiros ficam numa trilha de auditoria (`payment_events`, `payment_charges`).
- `web/` — React + Vite. Traduções em `web/src/i18n/locales/` (o português é a fonte).
- `docs/legal/<idioma>/` — documentos legais exibidos em `/regras`.

## Antes de produção

- **Revisão jurídica e tributária em cada país** (os textos e alíquotas são base de referência).
- Preencher as variáveis de `server/.env.example` (tokens Mercado Pago por país, chaves Stripe, `ANTHROPIC_API_KEY`, SMTP, `JWT_SECRET`, `CRON_SECRET`).
- Webhooks: Stripe → `https://space-hour.com/api/webhooks/stripe` (eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`); Mercado Pago → `https://space-hour.com/api/webhooks/mercadopago` (tópico *Pagamentos*).
- Repasse aos anfitriões ainda é manual (próximo passo: Stripe Connect / split do Mercado Pago).
- Verificação de identidade (KYC com selfie) ainda é declaratória.

## Segurança e LGPD

- Controlador: Instituto Ravel de Ensino Superior Ltda. (CNPJ 03.162.275/0001-10). Encarregado: Robson Ravel de Oliveira — info@wmundi.com.
- Documentos de registro profissional cifrados no banco (AES-256-GCM, chave `DOCUMENT_ENCRYPTION_KEY`), cada acesso registrado (`document_access_log`) e arquivo apagado 90 dias após a decisão.
- Roteiro de resposta a incidentes: `docs/operacao/RESPOSTA-A-INCIDENTES.md`.

## Colocar no ar (Vercel)

1. Criar o projeto na Vercel apontando para a pasta `espacos/` deste repositório (o `vercel.json` já define build, rotas da API e o cron).
2. Criar um Postgres gerenciado (Neon ou Supabase pela Vercel Marketplace) e definir `DATABASE_URL`, `DATABASE_SSL=true`, `DATABASE_POOL_SIZE=3`. As migrações rodam no build.
3. Definir as demais variáveis de ambiente (acima) e `APP_URL=https://space-hour.com`, `PUBLIC_API_URL=https://space-hour.com`, `NODE_ENV=production`, `SEED_DEMO=false`.
4. Blob: criar um Vercel Blob Store (gera `BLOB_READ_WRITE_TOKEN`).
5. Domínios: adicionar `space-hour.com` (GoDaddy) e `spacehour.com.br` (Registro.br) no projeto e criar os registros DNS indicados pela Vercel (A `76.76.21.21` / CNAME `cname.vercel-dns.com`). **Não alterar os registros MX** do e-mail da GoDaddy.
6. O cron a cada 5 min exige plano Pro; no Hobby, mude para diário em `vercel.json`.
