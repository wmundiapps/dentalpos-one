# Módulo LGPD (EduMaster Pro / DentalPos One)

Consentimentos versionados, direitos do titular (art. 18), inventário de tratamento (ROPA, art. 37), retenção com expurgo,
incidentes (art. 48), encarregado (DPO), dados sensíveis/menores e mascaramento/redação de logs. Prefixo de modelos: `Lgp`
(`prisma/edu/lgpd.prisma`; SQL aditivo no bloco `LGPD:BEGIN/END` de `prisma/manual-migrations/20261004_edumaster_pro.sql`).
Documentos de apoio (modelos a validar por advogado): `docs/LGPD-*.md`.

## Quem acessa
Rotas internas `/api/edu/lgpd/*`: **ADMIN/OWNER/RECTOR/BOARD** ou o usuário designado como **encarregado ativo** (`LgpDpo.userId`). Aluno e demais papéis: 403.
Rotas públicas (Portal do Titular) `/api/public/edu/lgpd/:instituicao/*` (id do tenant ou sigla), com limite por IP e honeypot.

## Exceção do art. 16 (o que NUNCA é apagado a pedido)
Histórico escolar, matrículas, notas, frequência, diplomas/certificados/documentos emitidos, mensalidades/notas fiscais (5 anos), termos de estágio,
ocorrências disciplinares e inscrições de bolsa são **MANTIDOS** (aparecem no pacote e no plano como "MANTIDO (art. 16)" com o fundamento).
O cadastro do aluno só é anonimizado se ele **não tem** matrícula, notas, certificados nem cobranças. Ver `catalogo.ts` (ação por tabela) e `anonimizar.ts`.
Tabelas com `studentId/candidatoId/egressoId` fora do catálogo são descobertas pelo schema (DMMF), **exportadas** e tratadas como MANTER "não classificado".

## Endpoints principais (internos)
| Rota | O quê |
|---|---|
| `GET /fila`, `GET/POST /solicitacoes`, `GET /solicitacoes/:id` | fila do DPO (semáforo de prazo), lista, registro presencial, detalhe com trilha |
| `POST /solicitacoes/:id/{atribuir,vincular,verificar-identidade,status,prorrogar,responder,cancelar}` | tramitação; **verificar identidade é obrigatório** antes de pacote/execução/correção |
| `GET /solicitacoes/:id/pacote` | pacote JSON do titular (acesso/portabilidade); `GET /titulares/:tipo/:id/pacote?motivo=` exportação direta com motivo |
| `POST /solicitacoes/:id/executar` | anonimização/eliminação/revogação — **dry-run por padrão**; real exige `{dryRun:false, confirmar:true}` |
| `POST /solicitacoes/:id/corrigir` | correção em campos permitidos (aluno, candidato, egresso, contato, usuário) |
| `GET/POST /consentimentos`, `/consentimentos/:id/revogar`, `/textos-consentimento` | consentimentos e textos versionados (imutáveis) |
| `GET/POST/PUT/DELETE /ropa`, `/ropa/seed`, `/ropa?formato=csv` | inventário (pré-populado; DELETE só descontinua) |
| `GET /retencao/{alvos,politicas,execucoes}`, `PUT /retencao/politicas/:id`, `POST /retencao/executar` | retenção (dry-run por padrão) |
| `/incidentes` (+ `/eventos`, `/checklist/:codigo`, `/comunicar-anpd`, `/comunicar-titulares`, `/encerrar`) | incidentes e prazo de 3 dias úteis |
| `/dpo`, `/campos-sensiveis`, `/acessos-sensiveis`, `/menores/pendencias`, `/painel`, `/trilha`, `/bootstrap` | encarregado, dados sensíveis, quem viu o quê, painel |

Públicas: `GET /:t/textos`, `POST /:t/consentimentos`, `POST /:t/consentimentos/revogar` (recibo ou `titularRef` do navegador), `POST /:t/solicitacoes`,
`POST /:t/solicitacoes/{consulta,responder}` (protocolo + código; bloqueio após 5 erros), `GET /:t/dpo`, `GET /:t/politica`.

## Prazos
Solicitação do titular: 15 dias corridos (1 prorrogação de +15 com justificativa pública). Incidente: 3 dias úteis da ciência (sáb/dom e feriados **nacionais**; locais não entram).
Jobs (`/api/cron/edu`): `lgpd:prazos-solicitacoes`, `lgpd:prazos-incidentes`, `lgpd:retencao`.

## Retenção
Alvos em `retencao.ts` (candidatos não matriculados, contatos inativos, mensagens, eventos de segurança, acessos sensíveis, risco de evasão, manifestações, atendimentos de apoio, solicitações LGPD).
Prazo por instituição, respeitando um **mínimo** por alvo. O job roda em **dry-run**; para executar de verdade: `LGPD_RETENCAO_EXECUTAR=true`.
Cada rotina grava `LgpRetencaoExecucao` (só contagens e ids amostrados, nunca dado pessoal).

## Dados sensíveis, menores e logs
- Campos sensíveis: `sensiveis.ts` (padrão + `LgpCampoSensivel`). Middleware `acessoSensivelLog` (montado em `edu.routes.ts`) grava `LgpAcessoSensivel` (quem, papel, recurso, titular) nas rotas de apoio/atendimentos, AEE, ocorrências e inscrições de bolsa; leitura do próprio aluno (`/meus`) não gera log.
- Menores (< 18 anos): consentimento exige responsável legal (declaração) para finalidades marcadas; `GET /menores/pendencias` lista alunos < 18 sem responsável.
- `mascara.ts`: `mascararCpf/Email/Telefone/Nome`, `redigirLog`, `redigirTexto`, `sanitizarUrl`. `src/app.ts` instala `instalarLogSeguro()` (console.*) e sanitiza a URL no log HTTP (morgan); `audit()` e `SegEvento` passam por redação.

## Variáveis de ambiente
| Variável | Efeito |
|---|---|
| `LGPD_HASH_KEY` | chave do HMAC de IP/UA/CPF (cai para `SECURITY_ENC_KEY`/`JWT_SECRET`). **Mudá-la invalida a correspondência por hash** de CPF/IP já gravados |
| `LGPD_RETENCAO_EXECUTAR` | `true` faz o job de retenção executar (padrão: dry-run) |

## Limites
Não há envio de e-mail próprio: avisos ao titular entram na fila de `EduNotification` (canal EMAIL) sem dado pessoal no corpo; a entrega depende do módulo de Comunicação configurado.
A localização do titular usa vínculos existentes (aluno/candidato/egresso/conta/contato) — texto livre e anexos não são varridos. A verificação de identidade é registrada, não automatizada.
Textos, prazos de guarda e bases legais são **modelos**: validar com advogado.

## Testes
`DATABASE_URL=postgresql://... npx tsx scripts/e2e/lgpd.ts` (168 verificações: consentimentos, menores, cookies, solicitações, pacote, anonimização com exceção do art. 16, ROPA, retenção dry-run/execução, incidentes, DPO, acessos sensíveis, redação de logs).
