# Módulo notas (prefixo Nt)

Diário de classe, lançamento/correção de notas, boletim, histórico, revisão de nota e Portal do Aluno.
Montado em `/api/edu/notas`. Cálculos puros em `calc.ts` (selftest: `npx tsx src/modules/notas/__selftest__.ts`).

## Modelos (prisma/edu/notas.prisma)
NtRegraAvaliacao (tenant/curso/turma), NtComponente, NtLancamento, NtLancamentoHistorico (trilha), NtDiario, NtResultado (cache), NtRevisao.

## Endpoints (ADMIN/OWNER/RECTOR/BOARD sempre permitidos)
Regras: GET/POST/PUT/PATCH/DELETE `/regras` (leitura COORDINATOR/SECRETARY/TEACHER; escrita COORDINATOR) · GET `/regras/resolver/:classSectionId` · POST `/bootstrap` (COORDINATOR).
Diário (TEACHER dono da turma, COORDINATOR, SECRETARY):
- GET `/turmas` · GET `/turmas/:id/diario` · GET `/turmas/:id/estatisticas` · GET `/turmas/:id/frequencia` · GET `/turmas/:id/trilha` · GET `/turmas/:id/ata.html`
- POST `/turmas/:id/componentes/aplicar-regra` · POST `/turmas/:id/componentes` · PATCH/DELETE `/turmas/:id/componentes/:cid`
- PUT `/turmas/:id/notas` (lote) · POST `/turmas/:id/notas/importar` (JSON/CSV, `simular`) · POST `/turmas/:id/componentes/:cid/importar-prova` (AssessmentAttempt)
- POST `/turmas/:id/notas/corrigir` (COORDINATOR/SECRETARY, justificativa obrigatória; funciona com diário fechado)
- POST `/turmas/:id/recalcular` · POST `/turmas/:id/fechar` · POST `/turmas/:id/reabrir` (ADMIN/COORDINATOR, justificativa) · PATCH `/turmas/:id/prazo` (COORDINATOR/SECRETARY)
Aluno: GET `/meu/boletim`, `/meu/historico` (STUDENT) · GET `/alunos/:id/boletim|historico|historico.html` (aluno só o próprio; professor só suas turmas; gestão tudo).
Revisão: GET `/revisoes`, `/revisoes/:id` · POST `/revisoes` (STUDENT) · POST `/revisoes/:id/parecer` (TEACHER/COORDINATOR) · POST `/revisoes/:id/decisao` (COORDINATOR) · POST `/revisoes/:id/cancelar`.
Gestão (COORDINATOR/SECRETARY; risco e pendências também TEACHER nas suas turmas): GET `/gestao/cursos/:programId/visao`, `/gestao/ranking`, `/gestao/risco`, `/gestao/pendencias`.
Portal: GET `/portal/meu-painel` (STUDENT; gestão com `?studentId=`).

## Jobs (registerEduJob)
`notas:pendencias-professores`, `notas:alunos-em-risco` (recalcula resultados + avisa alunos), `notas:revisoes-atrasadas`.

## Integrações tolerantes
CalPrazoNotas (prazo de lançamento), CalSlot/CalExame (portal), SecProtocolo (requerimentos), AccountReceivable, Assessment/AssessmentAttempt, Attendance/ClassSession.

## Exportado para outros módulos (`import {...} from '../notas/routes'`)
resolverRegra, recalcularTurma, calcularTurma, getBoletimAluno, getHistoricoAluno, calcularCRAluno, frequenciaTurma, gravarNota, getPrazoLancamento, calcResultado, calcCR, calcFrequencia, estatisticas, avaliarRisco, notaNecessaria.
