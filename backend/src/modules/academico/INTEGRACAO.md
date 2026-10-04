# Núcleo Acadêmico — Guia de Integração

Módulo completo (schema + rotas + regras de negócio) pronto para colar em
`wmundiapps/dentalpos-one/backend`.

## 1. Onde colocar os arquivos

```
backend/
  prisma/
    schema.prisma          <- cole o conteúdo de schema-academico.prisma no final
  src/
    modules/
      academico/
        middleware.ts
        validators.ts
        curriculum.ts
        student.ts
        classSection.ts
        session.ts
        routes.ts
```

## 2. Os 2 ajustes obrigatórios (é só isso)

1. **Caminho do Prisma Client** — todos os arquivos importam:
   ```ts
   import { prisma } from '../../lib/prisma';
   ```
   Troque `../../lib/prisma` pelo caminho real de onde seu backend exporta o
   `PrismaClient` (provavelmente já existe algo assim para o módulo financeiro).

2. **Formato do `req.user`** — o módulo assume que seu middleware de auth atual
   já popula `req.user = { id, tenantId, role, studentId? }`. Se os nomes dos
   campos no seu JWT forem diferentes (ex: `institutionId` em vez de
   `tenantId`), ajuste só a interface em `middleware.ts` — nada mais no módulo
   depende disso.

## 3. Rodar a migração

```powershell
npx prisma migrate dev --name nucleo_academico
npx prisma generate
```

## 4. Montar as rotas

Em `src/app.ts` (depois do seu middleware de auth global):

```ts
import academicoRouter from './modules/academico/routes';
app.use('/api/academico', academicoRouter);
```

## 5. Fluxo completo de exemplo (o que o coordenador e o aluno fazem)

```bash
# Coordenador cria o curso
POST /api/academico/programs
{ "nome": "Farmácia", "modalidade": "EAD", "cargaHorariaTotal": 4000 }

# Coordenador cria a disciplina
POST /api/academico/disciplines
{ "nome": "Farmacologia Clínica", "cargaHoraria": 80 }

# Vincula a disciplina ao curso, no 5º período
POST /api/academico/curriculum-links
{ "programId": "...", "disciplineId": "...", "periodo": 5 }

# Cria o período letivo
POST /api/academico/terms
{ "codigo": "2026/2", "dataInicio": "2026-08-01", "dataFim": "2026-12-15" }

# Coordenador cria a turma, define o professor
POST /api/academico/class-sections
{ "disciplineId": "...", "termId": "...", "professorUserId": "...", "nome": "FARM2026 S5 M1", "vagas": 40 }

# Aluno é matriculado no curso/período
POST /api/academico/enrollments
{ "studentId": "...", "programId": "...", "termId": "..." }

# Aluno é matriculado na turma
POST /api/academico/enrollments/class-sections
{ "enrollmentId": "...", "classSectionId": "..." }

# Professor abre um horário de aula PRÁTICA com vagas limitadas
POST /api/academico/class-sessions
{
  "classSectionId": "...",
  "tipo": "PRATICA",
  "titulo": "Prática de manipulação — Turma A",
  "dataHoraInicio": "2026-09-20T14:00:00-03:00",
  "dataHoraFim": "2026-09-20T16:00:00-03:00",
  "local": "Laboratório 2",
  "vagasPratica": 12
}

# Aluno vê os horários disponíveis dessa turma
GET /api/academico/class-sections/{classSectionId}/sessions?apenasDisponiveis=true

# Aluno escolhe e confirma o horário
POST /api/academico/class-sessions/{sessionId}/bookings
{}   <- vazio: usa req.user.studentId automaticamente

# No dia da aula, professor lança a frequência de todos que agendaram
POST /api/academico/class-sessions/{sessionId}/attendance
{
  "registros": [
    { "studentId": "...", "presente": true },
    { "studentId": "...", "presente": false, "justificativa": "atestado médico" }
  ]
}
```

## 6. O que este módulo já resolve das suas regras de negócio

- Aluno só agenda para si mesmo (staff pode agendar em nome dele).
- Turma prática respeita limite de vagas por horário (`vagasPratica`).
- Impede agendamento duplicado e agendamento de aula já iniciada.
- Impede matrícula em turma sem vaga.
- Professor só vê/gerencia as próprias turmas; coordenação/admin vê tudo.
- Lançar frequência marca a sessão como `REALIZADA` e sincroniza o status do
  agendamento do aluno (`PRESENTE`/`FALTOU`) automaticamente.

## 7. Próximo módulo na fila

Conforme o roteiro em `ARQUITETURA-EDUMASTER-PRO.md`: depois do Núcleo
Acadêmico, o próximo é **Financeiro/Contábil/Fiscal** (estende o que já
existe no DentalPos One) ou **Conteúdo + Biblioteca** — me diga qual seguir
quando quiser continuar.
