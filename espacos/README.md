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
- Trocar os pagamentos simulados por adquirentes reais (roteamento em `server/src/payments.ts`); verificação de identidade/registro profissional por provedor de KYC e consulta aos conselhos; envio real de e-mails (`server/src/notify.ts`); definir `JWT_SECRET`.
