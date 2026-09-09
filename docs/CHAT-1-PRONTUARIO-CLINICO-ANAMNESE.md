# Chat 1 — Prontuário clínico e anamnese

## Implementado

- Ficha clínica estruturada e vinculada ao `Patient` real.
- Anamnese médica e odontológica, hábitos, gestação, sinais vitais, riscos, alertas, exames, diagnóstico e plano inicial.
- Revisões imutáveis com snapshot integral, campos alterados, motivo, autor e data/hora automática.
- Concorrência otimista por `expectedRevision`; uma edição desatualizada recebe HTTP 409 e não sobrescreve a revisão atual.
- Isolamento obrigatório por `clinicId` e `tenantId` em todas as consultas.
- Auditoria adicional em `AuditLog`, sem substituir o histórico clínico próprio.
- Campos configuráveis por clínica, com marcação de sensibilidade para evolução LGPD.
- Frontend conectado exclusivamente ao backend para esta ficha, sem mocks ou localStorage como fonte definitiva.
- Adaptador de assinatura preparado; nenhuma integração externa foi acionada.

## Integração central a cargo do Chat 8

Em `backend/src/routes/index.ts`, importar `clinicalRecordRoutes` e montar o router **depois** de `router.use(authMiddleware)` e `router.use(tenantMiddleware)`:

```ts
import clinicalRecordRoutes from './clinicalRecordRoutes'
// após os middlewares autenticado e tenant:
router.use(clinicalRecordRoutes)
```

Não é necessária alteração em `AppRoutes.tsx` ou `Sidebar.tsx`: a rota `/prontuario` já existe e a lista real de pacientes já navega com `patientId`.

## Banco

O `schema.prisma` recebeu apenas três modelos aditivos e duas relações aditivas em `Patient`. A migration SQL segura está em `backend/prisma/migrations/20260902090000_add_versioned_clinical_record/migration.sql`. Ela foi preparada, mas não executada.

## Permissões

- Leitura: `clinical.view` (existente).
- Edição/versionamento: `clinical.edit` (existente).
- Configuração de campos da clínica: `settings.edit` (existente).

## LGPD e assinatura

Os dados permanecem segregados por clínica/tenant, os campos personalizados declaram sensibilidade, e toda mutação gera revisão e auditoria. Políticas de retenção, base legal, anonimização/exportação e controle de acesso a campos sensíveis devem ser consolidados na política LGPD global. `ClinicalSignatureAdapter` define o contrato; `SignatureProviderNotConfigured` falha explicitamente até um provedor ser escolhido.
