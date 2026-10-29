# Módulo Presença (EduMaster Pro) — prefixo `Pre`

Chamada por **reconhecimento facial no dispositivo** (com alternativas sem biometria), **controle de entrada/saída de espaços** com ocupação em tempo real e **empréstimos** de livros, materiais e equipamentos. Rotas: `/api/edu/presenca/*`. Modelos: `prisma/edu/presenca.prisma`; SQL aditivo: bloco `PRE:BEGIN/END` em `prisma/manual-migrations/20261004_edumaster_pro.sql`. Compliance: `docs/LGPD-RIPD-biometria.md`.

## Como funciona o reconhecimento
1. O navegador (tablet/celular/portal) roda `@vladmandic/face-api` **localmente** (modelos em `frontend/public/models/face`), detecta o rosto, faz o desafio de liveness (piscar ou virar a cabeça) e calcula o **embedding de 128 dimensões**. Nenhuma imagem sai do aparelho.
2. O servidor recebe só o vetor (`facial.ts`): valida, compara 1:N com os templates **decifrados em memória** de quem tem consentimento ATIVO, por distância euclidiana (`limiarDistancia` 0,5) com margem de ambiguidade (0,04). Falhas contam para o **limite de tentativas** por dispositivo/operador (bloqueio e alerta).
3. Template = vetor **cifrado AES-256-GCM** (`seguranca/cripto.ts`), amarrado a tenant+pessoa. `sintetico.ts` gera embeddings sintéticos determinísticos para testes e demo sem câmera.

## Endpoints (resumo)
Papéis: operadores = TEACHER, COORDINATOR, SECRETARY, STAFF, LIBRARIAN, FACILITIES, SUPPORT; gestão = COORDINATOR, SECRETARY, FACILITIES; ADMIN/OWNER/RECTOR/BOARD sempre. Professor só atua nas próprias turmas.
| Grupo | Rotas |
|---|---|
| Biometria/LGPD | `GET /biometria/termo`, `/desafio`, `/configuracao`; titular: `GET/DELETE /biometria/meu`, `POST /meu/consentimento`, `/meu/cadastro`, `/meu/credencial`; gestão: `/biometria/painel`, `/log`, `/pessoas/:key` (GET, DELETE) `/consentimento` `/cadastro` `/credencial` |
| Regras e quiosques | `GET/PUT /config`, CRUD `/dispositivos` (+ `/:id/desbloquear`), CRUD `/horarios` (por turma/dia: entrada, intervalo, saída, tolerâncias) |
| Chamada | `GET /chamadas/agenda`, `POST /chamadas/abrir`, `GET /chamadas[/:id]`, `POST /chamadas/:id/reconhecer` (face), `/marcar` (QR, CODIGO ou MANUAL com justificativa), `/fechar`, `/conciliar`, `/reabrir` |
| Correção/conciliação | `PATCH /frequencias/:id` (justificativa ≥10, trilha `PreCorrecao`), `GET /frequencias/:id/correcoes`, `GET /divergencias`, `POST /frequencias/:id/resolver` |
| Relatórios | `GET /relatorios/frequencia?classSectionId&de&ate[&formato=csv]`, `/relatorios/aluno/:id`, `/minha-frequencia`, `/relatorios/ocupacao`, `/relatorios/emprestimos` |
| Acesso/ocupação | `GET /espacos`, `PUT /espacos/:id/config` (LIVRE/CREDENCIAL/RESTRITO, capacidade, horário, perfis), `POST /acesso/registrar` (face/QR/código/manual/visitante), `GET /ocupacao[/:spaceId]`, `/acesso/historico`, `/pessoas/:key/historico`, `/espacos/:id/historico`, `/alertas` (+ reconhecer/resolver), `/portaria/painel`, `POST /espacos/:id/esvaziar` |
| Empréstimos | CRUD `/itens`, `POST /itens/de-bem/:bemId` (patrimônio), `GET /itens/lookup/:codigo`, `POST /emprestimos/retirar` e `/devolver` (item **ou livro** pelo mesmo código), `/emprestimos/:id/renovar|perdido`, `/meus/emprestimos`, `/multas`, `/bloqueios`, `/reservas`, `/inventarios` |
| Geral | `GET /painel`, `POST /jobs/executar` |

## Regras de presença
`PRESENTE` até `toleranciaAtrasoMin` (10) após o início; `ATRASO` até `limiteFaltaMin` (40); depois `FALTA`. Saída mais de `toleranciaSaidaMin` (10) antes do fim = `SAIDA_ANTECIPADA`; intervalo excedido é sinalizado. Marcação aceita de `antecedenciaMin` (30) antes do início até 30 min após o fim; repetição em `debounceSegundos` é ignorada. Horário programado (`PreHorario`) por turma/dia sobrepõe início/fim/intervalo/tolerância da aula.
**Conciliação com o diário** (`Attendance`): ao fechar, quem tem resultado diferente do que o professor lançou vira **divergência** (não sobrescreve); o professor resolve a favor do diário ou do reconhecimento, com justificativa. Correção manual → origem `MANUAL`, `PreCorrecao` (de/para/quem) + auditoria; reflete no diário.

## LGPD embutida
Consentimento `BIOMETRIA_FACIAL` (módulo `lgpd`, texto versionado); revogar (portal, secretaria ou Central LGPD) **exclui os templates na hora** (hook em `lgpd/consentimentos.ts`); template sem consentimento ativo é ignorado na comparação; jobs de expurgo (desligamento, desuso, logs); consultas administrativas viram `LgpAcessoSensivel`; catálogo LGPD classifica os modelos `Pre*`.

## Jobs (`/api/cron/edu`)
`presenca:chamadas` (fecha/concilia chamadas esquecidas), `presenca:saida-automatica`, `presenca:emprestimos` (atrasos/alertas, reservas expiradas), `presenca:expurgo-biometria`.

## Testes e seed
`DATABASE_URL=... npx tsx scripts/e2e/presenca.ts` (≈330 verificações, sem câmera: embeddings sintéticos, cifra, comparação, liveness, bloqueio por tentativas, tolerâncias, conciliação, correção, ocupação/alertas, empréstimos/multas/reservas/inventário, revogação/expurgo, isolamento por tenant). Seed: `scripts/seeds/presenca.ts` (`seedPresenca(api, ctx)`).

## Limites
Precisão depende do modelo, da câmera, da luz e da população: exige **teste de campo** e ajuste do limiar. O liveness é do lado do cliente (não resiste a vídeo/máscara). Comparação 1:N linear por tenant (adequada a milhares de templates; para dezenas de milhares usar índice/escopo por turma). Catraca/hardware físico não integrado (há registro `CATRACA`/manual via API e o quiosque web).
