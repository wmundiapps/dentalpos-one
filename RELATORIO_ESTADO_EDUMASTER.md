# Relatório de Estado — EduMaster Pro

Data: 2026-09-22
Branch: `claude/universidade-gerenciador-hxbike`
Repositório auditado: `wmundiapps/dentalpos-one` (backend Express/TypeScript/Prisma/PostgreSQL)

## 1. Resultado da auditoria (passo 0)

O briefing lista 4 módulos como "já entregues" (Núcleo Acadêmico, Financeiro/Contábil/Fiscal, Conteúdo e Biblioteca, Provas com IA), cada um supostamente com schema Prisma, validadores Zod, rotas, controllers e regras de negócio.

**Nenhum dos 4 existia no repositório antes desta tarefa.** Confirmação:

- `prisma/schema.prisma` (96 models antes desta tarefa) cobre 100% o domínio odontológico do DentalPos One (Patient, Doctor, Appointment, Odontogram, TreatmentPlan, LaboratoryWork, RevahContact, HR, Financeiro clínico, Fiscal clínico, etc.). Não existia nenhuma tabela de programas, disciplinas, matrícula, turma, frequência, flashcard, biblioteca ou prova.
- Busca por `edumaster`, `aluno`, `matricula`, `disciplina`, `turma`, `flashcard`, `biblioteca`, `enade`, `vestibular` em todo `backend/src` e `frontend/src`: zero ocorrências reais (os poucos matches eram falsos-positivos — variável `cursor`, ação disciplinar de RH, linha contábil "Receitas de cursos").
- `frontend/src/types/education.ts` e `EducationService.ts` existem, mas são do módulo **DentalPos Sales/Educação** (marketplace de cursos de odontologia para dentistas, item 11 do roadmap em `STATUS.md`) — sem relação com o EduMaster (gestão de instituição de ensino).
- Nenhuma migration, controller ou rota com prefixo `edu*` existia.

**Conclusão:** os 4 módulos descritos na Seção 3 do briefing foram discutidos em conversas anteriores, mas nunca chegaram a ser commitados neste repositório. O briefing já alertava para essa possibilidade e pedia a confirmação — está confirmada.

## 2. Decisão sobre a ordem de construção

A Seção 6 do briefing lista como próximo passo o módulo **"Desempenho, ENADE/ENAMED e Residência"**, por depender de dados do Núcleo Acadêmico e das Provas. Como nenhum dos dois existe, comecei pelo **Núcleo Acadêmico**, que é pré-requisito técnico de todo o resto (matrícula, turma e frequência são a base de Desempenho, Protocolo/Certificados, Captação etc.). Essa é a única ordem que compila e funciona de verdade — os módulos seguintes continuam na mesma sequência do briefing a partir daqui.

## 3. O que foi entregue nesta tarefa

**Módulo: Núcleo Acadêmico** (extensão isolada do backend do DentalPos One, tabelas com prefixo `Edu`/`edu_*`, reaproveitando Clinic/User/JWT/RBAC compartilhados).

- `backend/prisma/schema.prisma`: 12 models novos — `EduProgram`, `EduSubject`, `EduCurriculum`, `EduCurriculumSubject`, `EduTerm`, `EduStudent`, `EduEnrollment`, `EduClass`, `EduClassEnrollment`, `EduSession`, `EduSessionBooking`, `EduAttendance`.
- `backend/prisma/migrations/20260922030000_edu_nucleo_academico/migration.sql`: migration isolada e aditiva (só `CREATE TABLE`/índices/FKs novos; nada alterado nas tabelas existentes).
- `backend/src/validators/eduAcademicValidator.ts`: schemas Zod.
- `backend/src/controllers/eduAcademicController.ts`: CRUD + regras de negócio.
- `backend/src/routes/eduRoutes.ts`: rotas em `/api/edu/*`, montadas em `routes/index.ts` com uma linha (`router.use(eduRoutes)`).
- `backend/src/services/permissionService.ts`: 5 códigos de permissão novos adicionados ao catálogo RBAC compartilhado (`edu.academic.view/manage`, `edu.enrollment.view/manage`, `edu.attendance.manage`). ADMIN e GESTOR já os recebem automaticamente pelas regras existentes.

Cobre da Seção 4.1 do briefing: programas, disciplinas, matriz curricular, períodos letivos, matrícula do aluno no programa, turmas, sessões teóricas e práticas com limite de vagas por horário, agendamento pelo próprio aluno (portal self-service em `/api/edu/me/*`) e frequência com atualização automática do status da sessão (`AGENDADA` → `REALIZADA` ao lançar presença).

Fora do escopo desta entrega (fica para os próximos módulos, conforme a ordem do briefing): calendário acadêmico visual, convocação via REVAH, equivalência de disciplinas (Equivalia), cadastro de documentos do aluno, ambiente de aprendizagem (vídeos/PDFs/fóruns) e provas online.

## 4. Validação feita

- `npx prisma validate` e `npx prisma format`: OK.
- `npm run build` (`prisma generate && tsc`): compila sem erros.
- Banco Postgres local (cluster do próprio ambiente do Code, não Supabase): migration aplicada limpa sobre o schema existente, sem conflito com nenhuma tabela do DentalPos/REVAH.
- Smoke test funcional ponta a ponta via API real (login → programa → disciplina → matriz → período → turma → aluno → matrícula → matrícula na turma → sessão prática → agendamento de vaga → lançamento de frequência → status da sessão vira `REALIZADA`).
- Regras de vaga testadas e confirmadas: reserva de sessão lotada devolve 409; matrícula em turma lotada devolve 409.

## 5. Pendências e próximos passos

1. Aplicar a migration em produção (Supabase) — não foi tocado nada de produção nesta tarefa, só o repositório.
2. Seguir a ordem do briefing a partir daqui: Desempenho/ENADE/ENAMED/Residência → Protocolo e Certificados → Facilities → Suprimentos → Governança e Regulatório → Captação (REVAH) → Pesquisa e Extensão → Jurídico → motor de formulários.
3. Os outros 3 módulos "dados como prontos" em conversa (Financeiro/Contábil/Fiscal educacional, Conteúdo e Biblioteca, Provas com IA) também precisam ser construídos do zero — não existem no código.
