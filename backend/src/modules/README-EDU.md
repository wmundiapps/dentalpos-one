# EduMaster Pro — convenções dos módulos

Gerenciador educacional dentro do backend do DentalPos One. Tudo em `/api/edu/<modulo>`
(autenticado) e `/api/public/edu/<modulo>` (público, opcional).

## Estrutura de um módulo
```
prisma/edu/<modulo>.prisma        <- fragmento do schema (fonte da verdade)
src/modules/<modulo>/routes.ts    <- default export Router (+ `export const publicRouter`)
src/modules/<modulo>/*.ts         <- rotas/serviços/validators
```
`src/modules/edu.routes.ts` já monta todos os módulos — NÃO edite.
`prisma/schema.prisma` NÃO se edita à mão: é gerado por `scripts/merge-edu-schema.js`.

## Regras do schema
- **Prefixo obrigatório** em models e enums do módulo (evita colisão com os ~140 models do DentalPos
  e com outros módulos): admissoes=`Adm`, secretaria=`Sec`, calendario=`Cal`, notas=`Nt`,
  infraestrutura=`Inf`, suprimentos=`Sup`, regulatorio=`Reg`, governanca=`Gov`, desempenho=`Des`,
  pesquisa=`Pes`, apoio=`Apo`, comunicacao=`Com`, biblioteca=`Bib`, jornadas=`Jor`,
  modalidades=`Mod`, reitoria=`Rei`. (O delegate do Prisma vira camelCase: `AdmCandidato` -> `prisma.admCandidato`.)
- Todo model tem `tenantId String` + `@@index([tenantId...])`, `id String @id @default(uuid())`, `createdAt`/`updatedAt`.
- Referências a models de OUTROS módulos (Student, Enrollment, AcademicProgram, Discipline, ClassSection,
  AcademicTerm, Campus, EduSpace, User...) são **String ids simples, SEM `@relation`** (para não exigir
  back-relation em fragmento alheio). Relações `@relation` só entre models do próprio fragmento.
  Valide a existência do registro referenciado no código (`findFirst({where:{id,tenantId}})`).
- Nomes de campos em português (como o resto do Núcleo Acadêmico). Enums em MAIÚSCULAS.
- Valores monetários: `Decimal @db.Decimal(12,2)` ou Float, seguindo o financeiro.

## Regras de código (TypeScript, Express 5 types, Prisma 5)
- Importar `prisma` de `../../lib/prisma`. Middleware/roles: `../academico/middleware`
  (`asyncHandler`, `requireRole`, `getTenantId`, `getUserId`, `AuthenticatedRequest`, `academicErrorHandler`).
- Papéis (`req.user.role`): ADMIN/OWNER/RECTOR/BOARD têm acesso total automático em `requireRole`;
  demais: COORDINATOR, TEACHER, STUDENT, FINANCE, SECRETARY, LIBRARIAN, FACILITIES, SUPPLIES,
  MARKETING, ADMISSIONS, SUPPORT, STAFF. Aluno logado: `req.user.studentId`.
- **Sempre** filtrar por `tenantId` (vem da sessão, nunca do body). Validar entrada com zod (`parseBody`).
- `req.params.x` / `req.query.x` são `string | string[]` nos tipos: use `String(req.params.id)` e `qs(req.query.x)`.
- Reutilize `modules/core/crud.ts` (`mountCrud`) para tabelas simples; escreva rotas à mão só para
  fluxos com regra de negócio (workflow, cálculo, alocação...).
- Lembretes: `scheduleReminder()` de `modules/core/reminders.ts` para TODO prazo (nada pode cair no
  esquecimento) e `completeReminders()` ao concluir. Mensagens: `notify()` de `modules/core/notify.ts`.
  Auditoria: `audit()`. Jobs periódicos: `registerEduJob(name, fn)` de `modules/core/jobs.ts`
  (executados por `/api/cron/edu`). Marca/logo em documentos: `getBranding()` + `brandHeaderHtml()` de
  `modules/core/branding.ts` (SEMPRE reservar espaço de destaque para a logomarca da instituição).
- IA: somente via `services-ai/client.ts` (`callAIForJSON`, `callAIForText`, `AiUnavailableError`).
  Passe `ctx: { clinicId: req.user.clinicId, tenantId, actorId }`. Sem IA configurada, devolva
  fallback manual/heurístico — nunca quebre o fluxo.
- Notificação ao usuário final (WhatsApp/e-mail/SMS...) = `notify()` (caixa de saída); o módulo
  `comunicacao` despacha. Não implemente envio próprio.
- Seed/demonstração: se útil, ofereça `POST /<modulo>/bootstrap` idempotente que cria catálogos
  padrão (ex.: checklists, modelos, categorias) para o tenant.
- Sem testes de integração com banco real disponíveis: coloque a lógica de negócio complexa
  (algoritmos, cálculos, máquinas de estado) em funções PURAS exportadas e teste-as com um script
  `tsx` simples em `src/modules/<modulo>/__selftest__.ts` (assert do Node; rode com `npx tsx`).

## Validar
`bash scripts/edu-check.sh <modulo>` — mescla schemas (com lock), gera o Prisma client e mostra os
erros de tipo do seu módulo. Deve terminar sem erros. Não rode `prisma migrate`/`db push` (sem banco).

## Migração SQL
Após todos os módulos prontos, a migração será gerada de uma vez (`prisma migrate diff`).
