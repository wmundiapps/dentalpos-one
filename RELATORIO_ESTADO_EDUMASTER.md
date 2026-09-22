# Relatório de Estado — EduMaster Pro

Última atualização: 2026-09-22
Branch: `claude/universidade-gerenciador-hxbike`
Repositório: `wmundiapps/dentalpos-one` (backend Express/TypeScript/Prisma/PostgreSQL)

## 1. Resultado da auditoria (passo 0)

O briefing listava 4 módulos como "já entregues" (Núcleo Acadêmico, Financeiro/Contábil/Fiscal, Conteúdo e Biblioteca, Provas com IA). **Nenhum existia no repositório** — só em conversas anteriores. Confirmação, busca e evidências completas ficaram registradas no histórico deste arquivo (commit `55966ed`). Todos os 4 foram então construídos do zero nesta branch, junto com os 9 módulos seguintes da Seção 6 do briefing.

## 2. Módulos entregues (13/13 da ordem de construção do briefing)

Todos isolados do domínio odontológico via prefixo `Edu`/`edu_*`, reaproveitando Clinic/User/JWT/RBAC e, onde fazia sentido, os motores já existentes (Financeiro, REVAH) em vez de duplicá-los.

| # | Módulo | Commit | Principais tabelas novas |
|---|---|---|---|
| 1 | Núcleo Acadêmico | `55966ed` | EduProgram, EduSubject, EduCurriculum(Subject), EduTerm, EduStudent, EduEnrollment, EduClass(Enrollment), EduSession(Booking), EduAttendance |
| 2 | Provas com IA | `9c08be9` | EduQuestion(Option), EduExam(Question), EduExamAttempt, EduExamAnswer |
| 3 | Conteúdo e Biblioteca | `21bdcde` | EduContentItem/Progress, EduFlashcardDeck/Card/Review (SM-2), EduForum/Topic/Reply, EduLibrarySubscription |
| 4 | Financeiro (mensalidade) | `bd3478b` | campos em EduEnrollment; reaproveita RecurringBill/FinancialEntry |
| 5 | Desempenho, ENADE/ENAMED e Reforço | `b133a03` | EduReinforcementPlan/Action; extensões em EduExam/EduQuestion |
| 6 | Protocolo e Certificados (Secretaria) | `d4f2886` | EduDocumentUpload/Request, EduCertificate (verificação pública) |
| 7 | Facilities (Infraestrutura) | `2529eb1` | EduAsset, EduMaintenanceOrder, EduParkingSpot, EduExpiringItem |
| 8 | Suprimentos (compras/estoque/vendas) | `1492dde` | EduSupplyItem/Movement, EduPurchaseOrder(Item), EduSale(Item) |
| 9 | Governança e Regulatório | `93c8545` | EduCommittee(Member), EduPdiGoal/Evidence, EduRegulatoryWatch |
| 10 | Captação e Ingresso (REVAH) | `28b881c` | EduAdmissionExam, EduApplication |
| 11 | Pesquisa e Extensão | `3a56864` | EduFundingAgency, EduFundingCall, EduResearchProject(Member) |
| 12 | Jurídico | `7bba873` | EduLegalCase, EduLegalHearing, EduLegalDocument |
| 13 | Motor de Formulários e Fluxos | `99c23ee` | EduFormTemplate, EduFormSubmission |

**Total:** 13 migrations isoladas e aditivas (`backend/prisma/migrations/202609220*`), ~70 tabelas novas, todas com `clinicId`/`tenantId` (multi-tenant) e índices. Nenhuma tabela existente do DentalPos foi alterada — só 3 edições cirúrgicas em arquivos compartilhados: `services/permissionService.ts` (catálogo RBAC, +26 códigos `edu.*`), `services/aiService.ts` (+3 tarefas de IA), `routes/index.ts` (montagem dos routers + 2 rotas públicas).

Pós-graduação lato/stricto sensu **não ganhou tabela própria**: reaproveita `EduProgram.level` (`POS_LATO`/`POS_STRICTO`) do Núcleo Acadêmico, com projetos de Pesquisa e Extensão linkáveis a esses programas.

## 3. Validação

Todo módulo passou pelo mesmo processo antes do commit:
1. `npx prisma validate` + `format`.
2. `npm run build` (`prisma generate && tsc`) — compila sem erros.
3. Migration gerada por diff real contra Postgres local e aplicada.
4. **Smoke test funcional ponta a ponta** com o servidor rodando de verdade (login, fluxo completo via HTTP, incluindo regras de negócio críticas: limite de vaga, correção automática, geração de conta a pagar/receber, classificação de vestibular, encerramento automático de audiência, validação de formulário).

Dois bugs reais foram encontrados pelos próprios smoke tests (resposta de API desatualizada após update em cascata) e corrigidos antes do commit — descritos nos commits `21bdcde` e `28b881c`.

## 4. O que é reaproveitado (não duplicado)

- **Financeiro**: mensalidade, compra, venda e assinatura de biblioteca geram `FinancialEntry`/`RecurringBill` do motor já existente do DentalPos.
- **REVAH**: candidato de vestibular e aluno egresso viram `RevahContact` automaticamente, para os funis de captação e recall.
- **IA**: geração de questões, correção de dissertativa e triagem regulatória usam `services/aiService.ts` (créditos/franquia existentes), não um cliente de IA novo.
- **Vencimentos**: Facilities e Jurídico compartilham a mesma tabela `EduExpiringItem` e a mesma regra de antecedência (vencimento − preparo − margem).

## 5. Fora do escopo desta entrega (avisado, não esquecido)

- **Diploma digital com assinatura ICP-Brasil**: o briefing pede confirmar a norma do MEC vigente antes de implementar. O modelo `EduCertificate` já tem `signatureStatus` para plugar essa etapa depois, sem quebrar nada.
- **Leitura automática de diários oficiais**: não há scraping/integração real com DOU/DOE (exigiria credencial/API por estado). O que existe é o cadastro manual do excerto + triagem por IA (classifica relevância e resume). Uma integração de coleta automática é um passo separado, quando houver a fonte de dados definida.
- **Calendário acadêmico visual, equivalência de disciplinas (Equivalia)**: os dados para isso já existem em `EduTerm`/`EduSession`, mas a tela e a lógica de equivalência específica não foram feitas — não estavam na ordem de construção do briefing.

## 6. Instruções para colocar em produção

1. **Aplicar as migrations no Supabase de produção.** Elas foram geradas e testadas contra um Postgres local (ambiente da sessão), não contra produção. Rodar, na ordem, os 13 arquivos `.sql` em `backend/prisma/migrations/202609220{3..5}0000_edu_*` — ou, se preferir, `npx prisma migrate deploy` a partir de um ambiente com `DATABASE_URL` apontando para o Supabase (o deploy do Vercel provavelmente já faz isso a cada push, conforme `DEPLOY-WMUNDIAPPS-DENTALPOSONE.md`; só confirme que o passo de migration está no pipeline antes do primeiro deploy desta branch).
2. **Seed do catálogo de permissões.** Depois da migration, rode `npm run seed:core` (ou o equivalente em produção) para que os ~26 códigos `edu.*` novos entrem na tabela `Permission` e nos perfis ADMIN/GESTOR de cada clínica existente — sem isso, ninguém enxerga os módulos novos mesmo com o código no ar.
3. **Nenhuma variável de ambiente nova é necessária.** Tudo reaproveita `DATABASE_URL`, `JWT_SECRET` e `OPENAI_API_KEY` já configurados. Se `OPENAI_API_KEY` não estiver setada, os 3 recursos de IA (geração de questões, correção de dissertativa, triagem regulatória) falham de forma graciosa (HTTP 422, `IA_NAO_CONFIGURADA`) sem travar o resto do fluxo — já testado.
4. **Revisar e abrir o Pull Request.** Não abri PR (a instrução original era trabalhar em branch; me avise se quiser que eu abra agora). A branch está com 13 commits, cada um autocontido e revisável separadamente.
5. **Cadastro inicial por instituição**, na ordem que o próprio sistema exige: Programa → Matriz Curricular (+ disciplinas) → Período Letivo → Turma → (Aluno ou Vestibular) → Matrícula. Cada módulo depende dos anteriores — é a mesma ordem em que foram construídos.
6. **Frontend ainda não existe.** Este trabalho foi inteiramente de backend/API (`/api/edu/*`, documentado nas rotas de cada módulo). Todas as telas ficam para uma etapa seguinte — se quiser, posso planejar isso a partir daqui.
7. **Papel de aluno**: o portal self-service (`/api/edu/me/*`) espera um `User` com `role: "STUDENT"` vinculado ao `EduStudent` via `userId`. Hoje esse vínculo só é feito manualmente (não existe fluxo de "ativar acesso do aluno" ainda) — é a próxima peça óbvia a construir do lado da Secretaria/Captação.

## 7. Pendências conhecidas para revisão futura

- Diploma com assinatura ICP-Brasil (item 5.1 acima).
- Scraping/integração real de diários oficiais.
- Fluxo de ativação de acesso do aluno (criar `User` + vincular `EduStudent` automaticamente na efetivação da matrícula).
- Telas de frontend para todos os 13 módulos.
- Aplicar as migrations em produção e rodar o seed de permissões (itens 6.1 e 6.2).
