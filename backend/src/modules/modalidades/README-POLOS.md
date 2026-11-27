# Polos EAD (submódulo de `modalidades`)

Gestão da rede de polos de educação semipresencial/EAD, **separada por polo**. Montado em `/api/edu/modalidades/polos-ead`
(arquivos `polos-rede.ts` e `polos-logic.ts`; o cadastro de polos, checklist, credenciamento e vínculo de alunos continuam em `polos.ts`).
Tela: **Polos EAD** no menu (rota `/edu/polos-ead`, `frontend/src/pages/edu/EduPolosEad.tsx` e `frontend/src/edu/modalidades/polos/*`).

## O que já existia (reaproveitado, não duplicado)
`ModPolo` (cidade/UF, responsável, status de credenciamento, capacidade), `ModPoloOferta` (curso x vagas), `ModPoloAluno` (vínculo), checklist de estrutura,
`ModEstagio`, `ApoEgresso` (módulo apoio), `AdmRematriculaCampanha/AdmRematricula` (módulo admissoes), `AccountReceivable` (financeiro), LGPD (`LgpConsentimento`).

## O que foi acrescentado
- Colunas: `ModPolo.latitude/longitude` (mapa), `ModPoloOferta.turnos` (MANHA, TARDE, NOITE, SABADO).
- Modelos (prefixo `Pol`, `prisma/edu/polos.prisma`): `PolRepasseConfig`, `PolRepasse`, `PolProva`, `PolProvaAviso`, `PolRematriculaCampanha`, `PolEnadeParticipacao`, `PolOfertaPolitica`, `PolOferta`.
- Migration: bloco `POL:BEGIN/END` em `prisma/manual-migrations/20261004_edumaster_pro.sql` (idempotente).

## Endpoints (prefixo `/api/edu/modalidades/polos-ead`)
Papéis: **F** = ADMIN/OWNER/RECTOR/BOARD + COORDINATOR/SECRETARY/FINANCE; **T** = F sem FINANCE + TEACHER; **M** = gestão (COORDINATOR/SECRETARY).
| Área | Endpoints |
|---|---|
| Painéis | `GET /rede` (F), `GET /mapa` (T), `GET /polo/:id/painel` (F), `GET /polo/:id/cursos` (T) |
| Alunos/matrículas/estágios | `GET /polo/:id/alunos`, `/matriculas`, `/estagios` |
| Cobrança | `GET /polo/:id/cobranca?situacao=VENCIDAS\|PAGAS\|A_VENCER` (F), `POST /polo/:id/cobranca/boletos` (boletos **simulados**), `POST /polo/:id/cobranca/lembrar` |
| Repasse | `GET\|PUT /polo/:id/repasse-config`, `POST /polo/:id/repasses/apurar {competencia: AAAA-MM}`, `GET /polo/:id/repasses`, `POST /repasses/:rid/aprovar\|pagar`, `GET /repasses-rede` |
| Provas presenciais | CRUD `/provas` (filtro `poloId`), `POST /provas/:pid/cancelar\|realizar\|avisos`, `GET /provas/:pid/avisos`, `POST /provas/avisos/processar`, `GET /minhas-provas` (aluno) |
| Rematrícula | `POST /polo/:id/rematricula/campanhas`, `GET /polo/:id/rematricula`, `POST /polo/:id/rematricula/itens/:iid/confirmar\|recalcular\|nao-renovou`, `POST /polo/:id/rematricula/campanhas/:cid/lembrar` |
| ENADE | `GET /polo/:id/enade?ano=`, `POST /polo/:id/enade/gerar`, `PUT /polo/:id/enade/:studentId`, `GET /enade-rede` |
| Egressos | `GET /polo/:id/egressos`, `POST /polo/:id/egressos/sincronizar` |
| Ofertas automáticas | CRUD `/ofertas-auto/politicas`, `POST /ofertas-auto/politicas/:pid/executar {dryRun?, limite?}`, `GET /ofertas-auto`, `GET /ofertas-auto/funil`, `POST /ofertas-auto/:oid/aceitar\|recusar\|matricular` |

## Regras importantes
- **Aviso de prova**: marco `D1` quando faltam até 24 h; `D7` quando faltam mais de 24 h e até 7 dias. Um aviso por (prova, aluno, marco) — reprocessar nunca duplica. Convocados = alunos ATIVOS com vínculo ativo no polo (e do curso, se a prova tiver curso). Job `polos.avisos-provas` (via `runEduJobs`) e botão/rota `provas/avisos/processar`.
- **Repasse** = `% sobre o recebido da competência` + `valor fixo × alunos ativos`. Fluxo CALCULADO → APROVADO → PAGO; repasse pago não é recalculado.
- **Rematrícula por polo**: cria uma `AdmRematriculaCampanha` e a vincula ao polo (`PolRematriculaCampanha`); itens só dos alunos do polo; usa `avaliarAluno`/`confirmarRematricula` do módulo admissoes (inadimplente é bloqueado e a pendência aparece).
- **ENADE**: este módulo guarda só participação/preparatório por polo e devolve `links` para o módulo de Exames (`/edu/exames`); não depende do código dele.
- **Ofertas automáticas (LGPD)**: só recebe quem tem consentimento `COMUNICACAO_MARKETING` ativo (Central LGPD) **e** não está em opt-out no módulo de comunicação **e** (egresso) `consenteContato`. A exigência não pode ser desligada na política. Janela de horário: fora dela, `notify()` é agendado para o próximo início de janela. Limite de contatos por pessoa e intervalo mínimo de 3 dias entre reforços. Curso-alvo por área afim (mapa da política ou tabela padrão em `polos-logic.ts`); nunca o mesmo curso de origem. A auditoria registra apenas contagens.
- Mensagens saem por `notify()` (fila `EduNotification`); os provedores de e-mail/WhatsApp/SMS são simulados até serem configurados. Boletos emitidos aqui são **simulados** (`gatewayId = SIM-BOL-...`).

## Demonstração
`backend/scripts/seeds/polos.ts` exporta `seedPolos(api, ctx)`: 6 polos (Maringá e Londrina/PR, Campinas e Ribeirão Preto/SP, Campo Grande/MS, Cuiabá/MT), ~60 alunos fictícios, mensalidades com inadimplência distinta por polo, provas com avisos, estágios, repasses, rematrícula, ENADE, egressos com consentimento e funil de ofertas. Rode depois das etapas `academico` e `bootstrap` do `edu-demo-seed` (a integração no seed principal é feita à parte).

## Testes
`DATABASE_URL=postgresql://<usuario>:<senha>@127.0.0.1:5432/<banco_local> npx tsx scripts/e2e/polos.ts` (≥ 280 verificações: regras puras, seed, API, permissões, isolamento por tenant, LGPD).
