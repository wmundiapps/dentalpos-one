# EduMaster Pro — gerenciador educacional (DentalPos One)

Plataforma única para IES presenciais, semipresenciais, EaD e pós-graduação (lato e stricto sensu),
construída dentro do backend/frontend do DentalPos One (mesmo login, multi-tenant, RBAC e deploy).

- API autenticada: `/api/edu/<modulo>` · rotas públicas: `/api/public/edu/<modulo>` · cron: `/api/cron/edu`
- Interface: menu **EduMaster** (Reitoria · Acadêmico · Operação) — rotas `/edu/...`
- 16 módulos + núcleo transversal · 382 tabelas novas · ~750 rotas de consulta · 21 telas
- Fluxogramas das jornadas (vestibular → egresso, por persona): `docs/EDUMASTER-JORNADAS.md`
- README de cada módulo (endpoints, papéis, jobs): `backend/src/modules/<modulo>/README.md`
- Convenções para novos módulos: `backend/src/modules/README-EDU.md`

## Mapa: pedido → módulo

| Necessidade | Onde está |
|---|---|
| Reitoria, painel executivo, metas/OKR, central de pendências, assistente IA | `reitoria` (`/edu`, `/edu/minha-mesa`) |
| Administração, contas a pagar/receber, mensalidades, DRE, fiscal | `financeiro` |
| Coordenação de curso, matriz, turmas, matrículas, frequência | `academico` |
| PDI, CPA, NDE, CIPA, colegiados/atas, plano de carreira | `governanca` |
| Reconhecimento/autorização MEC, checklists, prazos e alertas D-180…D-7, análise de documentos por IA, simulador CPC/CC | `regulatorio` |
| Secretaria, protocolo/requerimentos, documentos, análise de documentos, certificados, diplomas, arquivo | `secretaria` |
| Cronogramas cruzando períodos/séries × salas/laboratórios, calendário acadêmico, provas, prazos de notas | `calendario` (gerador automático com backtracking) |
| Lançamento de notas, diário, boletim/histórico, portal do aluno | `notas` |
| Presencial / semipresencial / EaD, polos, tutoria, engajamento AVA, pós lato e stricto | `modalidades` |
| ENADE, OAB, ENAMED/residência: banco de questões, simulados, atividades dos professores, trilhas | `desempenho` (+ `provas-ia`) |
| Produção científica, revista/periódico (revisão por pares), IC, TCC, bancas | `pesquisa` |
| Insumos, compras, estoque, vendas | `suprimentos` |
| Infraestrutura, patrimônio, manutenção, melhorias, estacionamento, pátio, iluminação | `infraestrutura` |
| Apoio docente/discente, ouvidoria, egressos, risco de evasão | `apoio` |
| Vestibular, campanhas de graduação/pós, funil, rematrícula, bolsas, marketing/ROI | `admissoes` |
| Chatbot (WhatsApp/Telegram/e-mail/SMS/voz), redes sociais, régua de cobrança, campanhas | `comunicacao` |
| Biblioteca física e virtual, repositório institucional | `biblioteca` (+ `conteudo`) |
| Fluxogramas de jornadas + lembretes para nada cair no esquecimento | `jornadas` + `core` (EduReminder/cron) |
| Logomarcas e identidade visual | `core` + tela **Identidade e logomarcas** (`/edu/identidade`) |
| 2FA, bloqueio de login, varredura de uploads (anti-malware/pornografia), barreira de origem, log de segurança | `seguranca` (`/api/security`) — ver `docs/SEGURANCA.md` |

## Logomarcas
11 tipos de ativo (principal, horizontal, fundo escuro, monocromática, brasão, selo de certificado, marca d'água,
favicon, assinatura, cabeçalho e rodapé de documentos), por instituição ou por campus. Aparecem no cabeçalho do
sistema, na faixa de cada tela, no portal do aluno e em todo documento impresso (certificados, históricos,
atas, relatórios). Sem logo enviada, é exibida uma área reservada tracejada que leva ao upload.

## Papéis
`ADMIN/OWNER/RECTOR/BOARD` (acesso total), `COORDINATOR, TEACHER, STUDENT, FINANCE, SECRETARY, LIBRARIAN,
FACILITIES, SUPPLIES, MARKETING, ADMISSIONS, SUPPORT, STAFF`. O papel vem de `User.role` (JWT). Aluno: `Student.userId`.

## Instalação / operação
1. **Banco**: aplicar `backend/prisma/manual-migrations/20261004_edumaster_pro.sql` (somente CRIA tabelas; não altera
   as existentes). Fazer backup e testar em staging antes de produção. Alternativa em dev: `prisma db push`.
2. **Schema**: a fonte são `backend/prisma/edu/*.prisma`; `node scripts/merge-edu-schema.js` regenera o bloco
   EduMaster em `schema.prisma` (rodar após editar um fragmento).
3. **Cron**: agendar `GET/POST /api/cron/edu` com `Authorization: Bearer $CRON_SECRET` (recomendado a cada 15–60 min).
   Ele processa lembretes (com escalonamento) e todos os jobs dos módulos (cobrança, prazos MEC, SLA, estoque, etc.).
4. **Variáveis**: `JWT_SECRET`, `DATABASE_URL`, `CRON_SECRET` (já existentes). IA (opcional): `ANTHROPIC_API_KEY` ou
   `OPENAI_API_KEY`. Canais (opcional, por instituição, cifrados no banco): WhatsApp Cloud, Twilio, Telegram, Resend.
5. **Primeiro uso**: com usuário ADMIN, chamar `POST /api/edu/<modulo>/bootstrap` de cada módulo (carrega
   checklists MEC, modelos, jornadas, catálogos ENADE/OAB, etc.; idempotente) e enviar as logomarcas.
6. **Teste**: `DATABASE_URL=... npx tsx scripts/edu-smoke.ts` (fumaça) e `scripts/e2e/*.ts` (fluxos de negócio).

## LGPD e comunicação (decisão: fazer sempre o que for legal)
- **Marketing/divulgação exige opt-in explícito** (padrão do sistema). Sem consentimento registrado, a mensagem é
  bloqueada (`BLOQUEADO_OPTOUT`), inclusive para contatos não identificados.
- O consentimento nasce de um **aceite separado e opcional** (nunca pré-marcado) nos formulários públicos
  (`aceitaComunicacoes`), do cadastro interno (`consentimentoMarketing`), do atendente ou da resposta "QUERO/VOLTAR".
  O aceite do termo LGPD (tratamento de dados) é obrigatório e **não** vale como consentimento de marketing.
- **Opt-out sempre respeitado**, por qualquer canal (resposta "SAIR/PARAR/STOP", atendente ou formulário).
- Mensagens **operacionais, acadêmicas e de cobrança** (execução de contrato/obrigação) seguem sem opt-in, mas
  respeitam um opt-out "TODAS" explícito. Consentimentos e opt-outs ficam registrados com origem e data (auditoria).
- Teste: `scripts/e2e/lgpd-optin.ts`.

## Limitações conhecidas (transparência)
- Os adaptadores de canais (WhatsApp, SMS, Telegram, e-mail, voz, Graph API) foram testados com respostas simuladas,
  **nunca contra as APIs reais**; sem credenciais o envio falha de forma explícita (não finge envio).
- Fórmulas de CPC/CC, janelas de reconhecimento e prazos de guarda documental são **parametrizáveis e devem ser
  conferidos com a norma vigente** antes de uso oficial. Não há integração automática com o e-MEC (entrada manual).
- Funcionalidades de IA exigem chave configurada; sem ela há fallback manual/heurístico.
- Uploads são por URL ou data URL (sem storage de arquivos dedicado); QR Code de certificados é gerado no navegador.
- Docentes são identificados por `User` (não há model de professor separado).
- Telas validadas por compilação/build; não houve teste visual em navegador nesta entrega.
