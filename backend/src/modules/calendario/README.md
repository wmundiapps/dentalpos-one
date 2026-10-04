# Módulo `calendario` (prefixo Cal)

Calendário acadêmico, reservas de espaços, grade horária, **gerador automático de cronograma**, calendário de provas e prazos de lançamento de notas. Montado em `/api/edu/calendario` (público: `/api/public/edu/calendario`). Horários em minutos desde 00:00; dia da semana 1=seg…7=dom; fuso fixo UTC-3.

## Modelos (17)
CalCategoria, CalEvento, CalHorario, CalDisponibilidade, CalProfessorPerfil, CalDisciplinaConfig, CalTurmaConfig, CalSlot, CalGeracao, CalReserva, CalExame, CalExameFiscal, CalPrazoNotas, CalPrazoExcecao, CalPrazoConclusao, CalConflito, CalFeed.
"Grupo" (CalTurmaConfig.grupo ou programa:período:turno) = coorte; turmas de disciplinas distintas do mesmo grupo não podem ter aulas simultâneas.

## Endpoints (papéis; ADMIN/OWNER/RECTOR/BOARD sempre)
GESTAO = COORDINATOR, SECRETARY. "Auth" = qualquer usuário logado (conteúdo filtrado por papel).
- Bootstrap: `POST /bootstrap` (GESTAO) categorias, malha de horários, feriados nacionais.
- Calendário: CRUD `/categorias` (leitura Auth, escrita GESTAO); `GET /eventos?de&ate&termId&campusId&programId&tipo` (Auth, expande recorrência, filtra por público); `POST/PATCH/PUT/DELETE /eventos` (GESTAO); `GET /feriados/nacionais?ano` (Auth); `POST /feriados/importar` (GESTAO); `GET /periodos/:termId/dias-letivos` (Auth); `POST /periodos/:termId/gerar-calendario` (GESTAO, modelo padrão + prazos).
- Reservas: `POST /reservas` (TEACHER, GESTAO, FACILITIES, STAFF e demais não-alunos; pontual ou série); `GET /reservas`, `/reservas/minhas`, `/reservas/:id`, `PATCH /reservas/:id`; `GET /reservas/fila`, `POST /reservas/:id/aprovar|rejeitar` (FACILITIES, GESTAO); `POST /reservas/:id/cancelar`; `POST /bloqueios`, `DELETE /bloqueios/:id` (FACILITIES, COORDINATOR); `GET /espacos/livres`, `/espacos/:id/disponibilidade`, `/espacos/:id/agenda` (Auth); `POST /conflitos/verificar`.
- Grade: CRUD `/horarios`; `GET|PUT /professores/:userId/disponibilidade` (próprio professor ou GESTAO); `GET|PUT|DELETE /config/disciplinas`, `GET|PUT /config/turmas` (GESTAO); `GET /grade`, `/grade/slots`, `/grade/ics`, `/grade/cobertura`, `/grade/conflitos`; `POST|PATCH|PUT|DELETE /grade/slots` (GESTAO, valida choques; `forcar` registra o choque); `POST /grade/validar`; `POST /grade/conflitos/:id/ignorar`.
- Gerador: `POST /gerador/diagnostico|simular|aplicar`, `GET /gerador/execucoes[/:id]`, `POST /gerador/execucoes/:id/descartar|desfazer` (GESTAO).
- Provas: `GET /provas[/:id]` (aluno vê só as suas, professor as dele/fiscalizações), `POST /provas`, `PATCH /provas/:id`, `POST /provas/:id/status|fiscais|segunda-chamada` (TEACHER nas próprias turmas, GESTAO), `DELETE /provas/:id/fiscais/:userId` (GESTAO), `POST /provas/:id/fiscais/confirmar`, `GET /provas/conflitos` (GESTAO).
- Prazos: `GET /prazos`, `/prazos/vigente`, `/prazos/:id` (Auth); `GET /prazos/meus` (TEACHER); `GET /prazos/:id/pendencias`, `POST|PATCH|DELETE /prazos`, `POST /prazos/:id/prorrogar` (GESTAO); `POST /prazos/:id/concluir` (TEACHER/GESTAO).
- Agenda: `GET /meu-calendario[.ics]` (aluno: turmas/provas/eventos; professor: aulas/provas/fiscalizações/prazos/reservas); `POST|GET|DELETE /feeds`; público `GET /feeds/:token.ics`.
- Relatórios: `GET /relatorios/ocupacao|conflitos|reservas|resumo` (GESTAO, FACILITIES); `GET /relatorios/grade.html|calendario.html` (com cabeçalho de marca/logomarca).

## Jobs (`/api/cron/edu`)
`calendario.eventos-lembretes`, `calendario.prazos-notas` (D-7/D-3/D-1 aos professores; escalonamento à coordenação no vencimento e à reitoria após 3 dias), `calendario.reservas` (expira pendentes), `calendario.provas-lembretes` (alunos D-7/D-1), `calendario.varredura-conflitos` (grade, capacidade/tipo, alunos, provas; marca choques resolvidos).

## Exportado para outros módulos (`import ... from '../calendario/routes'`)
- `getGradeDeadline(tenantId, termId, { tipo?, etapa?, programId?, campusId?, professorUserId? })` -> prazo efetivo/situação (aberto, diasRestantes, prorrogado, concluido) ou null.
- `registrarLancamentoConcluido(tenantId, { termId, professorUserId, tipo?, etapa?, origem? })` encerra os lembretes do professor.
- `gerarCronograma` (puro, `scheduler.ts`), `secoesDoAluno`, `secoesDoProfessor`, `diasLetivosDoPeriodo`, `carregarOcupacaoEspaco`.

## Selftest
`npx tsx src/modules/calendario/__selftest__.ts`
