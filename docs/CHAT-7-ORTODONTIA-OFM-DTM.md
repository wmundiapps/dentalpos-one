# Chat 7 — Ortodontia, Ortopedia Funcional e DTM/Dor Orofacial

## Base e escopo

- Base: `main` no commit `6fb4e9f8bb9bc415fa04dd5dfb3ed8153f047bba`.
- Branch: `feat/chat7-orthodontics-functional-orthopedics-tmd`.
- Persistência PostgreSQL/Prisma; não há mocks nem `localStorage` para dados clínicos.
- `localStorage` no client é usado somente pelo padrão existente para token e identificação da clínica.
- Permissões reutilizadas: `clinical.view` e `clinical.edit`.
- Todas as consultas e mutações clínicas validam `clinicId + tenantId + patientId` a partir da sessão autenticada.
- Todas as mutações registram auditoria.

## Entregue

### Ortodontia

Queixa, diagnóstico, hipótese, plano, classificação de Angle, relação canina, sobremordida, sobressaliência, mordida cruzada/aberta, linha média, apinhamento, diastemas, padrão facial, hábitos, aparelho, técnica, prescrição, bráquetes, tubos, bandas, fios, arcos, elásticos, acessórios, ancoragem, mini-implantes, ativações, evolução mensal, intercorrências, contenção, finalização, abandono e alta.

Há campo e categoria de arquivo para análise cefalométrica, fotografias, modelos, radiografias, DICOM e escaneamentos. Não foi criado motor cefalométrico.

### Ortopedia Funcional

Diagnóstico funcional, aparelho, indicação, protocolo de uso, ativações, evolução e cooperação do paciente.

### DTM e Dor Orofacial

Queixa, localização/lado, duração, frequência, intensidade, escala 0–10, agravantes/alívio, limitação e amplitude de abertura, desvio, deflexão, estalido, crepitação, travamento, luxação, palpação muscular/articular, parafunções, bruxismo, apertamento, sono, cefaleia, diagnóstico/hipótese, placa, medicação, fisioterapia, fonoaudiologia, encaminhamentos, acompanhamento e evolução.

### Evoluções e arquivos

- Episódios clínicos independentes por especialidade.
- Evoluções cronológicas com profissional, data, conduta e dados específicos.
- Vínculo não destrutivo de arquivos por `clinicalFileId` ou chave de storage existente.
- Arquivamento lógico do vínculo; o arquivo original não é excluído.

## Rotas próprias

O arquivo `backend/src/routes/specializedClinicalRoutes.ts` define:

- `GET /patients/:patientId/specialized-clinical`
- `POST /patients/:patientId/specialized-clinical`
- `PUT /patients/:patientId/specialized-clinical/:recordId`
- `POST /patients/:patientId/specialized-clinical/:recordId/evolutions`
- `POST /patients/:patientId/specialized-clinical/:recordId/attachments`
- `PATCH /patients/:patientId/specialized-clinical/:recordId/attachments/:attachmentId/archive`

## Alteração central já existente neste branch

O `backend/prisma/schema.prisma` já havia sido alterado neste chat antes da solicitação final. A alteração foi preservada e contém apenas:

- três relações aditivas em `Clinic`;
- três relações aditivas em `Patient`;
- `SpecializedClinicalRecord`;
- `SpecializedClinicalEvolution`;
- `SpecializedClinicalAttachment`.

O mesmo conteúdo está documentado em `backend/prisma/chat7-schema-additions.prisma` para facilitar revisão/consolidação pelo Chat 8.

## Alterações centrais reservadas ao Chat 8

### Backend — `backend/src/routes/index.ts`

Depois de `router.use(authMiddleware)` e `router.use(tenantMiddleware)`, adicionar:

```ts
import specializedClinicalRoutes from './specializedClinicalRoutes'

router.use(specializedClinicalRoutes)
```

Não montar antes dos middlewares de autenticação e tenant.

### Frontend — `frontend/src/routes/AppRoutes.tsx`

Adicionar:

```tsx
import SpecializedClinical from '../pages/SpecializedClinical'

<Route path="/clinico-especializado" element={<SpecializedClinical />} />
```

### Prontuário — `frontend/src/pages/ClinicalRecord.tsx`

Adicionar botão ou aba contextual sem substituir o prontuário existente:

```ts
navigate(`/clinico-especializado?patientId=${encodeURIComponent(patientId)}`)
```

### Navegação

Adicionar “Ortodontia / OFM / DTM” na Sala de Atendimento somente durante a consolidação, preservando o padrão existente do menu e as regras do demo comercial.

### Prisma/migration

- Conferir o schema já alterado neste branch contra os demais chats.
- Consolidar as migrations clínicas em uma única migration SQL aditiva, conforme orientação do Chat 8.
- Não executar migration até aprovação da integração.

## Migration preparada

`backend/prisma/migrations/20260902193000_add_specialized_clinical_core/migration.sql`

A migration cria somente as três tabelas, índices e chaves estrangeiras do módulo. Não remove, renomeia, converte nem sobrescreve estruturas existentes. Ela não foi executada.

## Dependências externas pendentes

- Módulo definitivo de exames/arquivos do Chat 5, para resolver `clinicalFileId`, upload, preview e download.
- Provedor de storage já configurado pela clínica; o Chat 7 não cria storage paralelo.
- Nenhuma biblioteca npm nova.
- Nenhum motor/serviço cefalométrico externo foi incluído.

## Checklist para o Chat 8

1. Rebasear/mesclar esta branch na branch de integração, nunca diretamente no `main` sem revisão.
2. Resolver possíveis colisões de modelos/migrations com os Chats 1–6.
3. Montar router e página nos arquivos centrais.
4. Ligar a navegação contextual do prontuário.
5. Integrar o seletor definitivo do módulo de arquivos.
6. Validar permissões `clinical.view`/`clinical.edit` e isolamento entre duas clínicas/tenants.
7. Testar criação, atualização, evolução, vínculo e arquivamento de documento nas três especialidades.
8. Não fazer deploy nem executar migration antes da aprovação final.
