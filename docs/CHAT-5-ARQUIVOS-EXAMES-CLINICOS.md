# Chat 5 — Arquivos e Exames Clínicos

## Escopo entregue

Módulo clínico multi-tenant para arquivos e exames do paciente, cobrindo:

- fotografias;
- radiografias genéricas;
- panorâmicas;
- periapicais;
- tomografias;
- DICOM;
- PDF;
- exames laboratoriais;
- STL, PLY e OBJ;
- documentos e anexos diversos;
- categorias customizáveis;
- data do exame, origem, profissional solicitante, descrição e tags;
- dente/região;
- vínculo opcional a `TreatmentItem` e `ClinicalEvolution`;
- auditoria de criação, upload, edição, arquivamento e categorias;
- exclusão lógica (`deletedAt`) para preservar rastreabilidade;
- storage segregado por `tenantId/clinicId/patientId`;
- URLs temporárias assinadas para S3 compatível;
- handoff controlado de STL/PLY/OBJ ao DentalPos Design sem alterar o motor CAD.

## Multi-tenant

Todas as consultas e mutações do backend filtram simultaneamente `clinicId` e `tenantId` derivados da sessão autenticada. O `patientId` é validado no mesmo tenant/clínica. Vínculos com evolução e tratamento também são validados contra paciente + tenant + clínica.

A chave de storage segue:

`tenants/{tenantId}/clinics/{clinicId}/patients/{patientId}/clinical-files/{YYYY-MM-DD}/{fileId}-{nome}`

O `rootPrefix` existente em `TenantStorageConfig` é aplicado antes dessa chave.

## Storage

Foi reaproveitado `TenantStorageConfig`; não foi criado um segundo cadastro de storage.

O adapter `clinicalStorageService.ts` usa apenas `node:crypto`, sem dependência npm adicional, para gerar URLs AWS Signature V4 para providers `S3_COMPATIBLE`.

Configuração por clínica já existente:
- `provider`;
- `bucket`;
- `rootPrefix`;
- `region`;
- `endpoint`;
- `isActive`.

Credenciais de runtime pendentes:
- `CLINICAL_STORAGE_ACCESS_KEY_ID`;
- `CLINICAL_STORAGE_SECRET_ACCESS_KEY`;
- opcional `CLINICAL_STORAGE_SESSION_TOKEN`;
- opcionais `CLINICAL_STORAGE_REGION` e `CLINICAL_STORAGE_ENDPOINT` como fallback.

Sem credenciais/configuração, a API cria o registro com `AWAITING_STORAGE_CONFIGURATION` e não finge que o binário foi salvo.

## Fluxo de upload

1. Frontend solicita `POST /patients/:patientId/clinical-files/upload-intent`.
2. Backend valida paciente, categoria, evolução/tratamento e metadados.
3. Backend cria `ClinicalFile` e chave tenant-scoped.
4. Backend retorna URL PUT temporária quando storage está configurado.
5. Browser envia o binário diretamente ao storage.
6. Frontend chama `POST /clinical-files/:id/complete`.
7. Backend muda o estado para `AVAILABLE` e grava auditoria.

O binário não atravessa o Express, evitando limites inadequados para DICOM/tomografia/3D.

## Preview

- imagens: tipo `IMAGE`;
- PDF: `PDF`;
- STL/PLY/OBJ: `DENTAL_3D`;
- DICOM: `DICOM`;
- demais: `DOWNLOAD`.

A primeira versão usa acesso temporário externo para visualização/abertura. Não foi embutido visualizador DICOM no CAD.

## DentalPos Design

`GET /clinical-files/:id/design-handoff` aceita somente STL/PLY/OBJ e retorna:
- caminho `/design?clinicalFileId=...`;
- URL temporária do arquivo;
- patientId;
- nome/extensão;
- dente/região.

O frontend persiste o payload em `sessionStorage` sob `dentalpos.design.clinicalFile.{id}` antes de navegar.

**O motor CAD não foi alterado.** O Chat 8 pode conectar esse payload à rotina de importação já existente em `meshLoader`/Design, sem duplicar parser.

## Permissões

Foram reutilizadas permissões existentes:
- leitura/listagem/acesso: `clinical.view`;
- criação/edição/arquivamento: `clinical.edit`;
- handoff para CAD: `design.view`.

Admin continua respeitando o bypass já previsto no middleware.

## Prisma

Mudanças somente aditivas:
- `ClinicalFileCategory`;
- `ClinicalFile`.

A migration SQL foi gerada em `backend/prisma/migrations/20260903_chat5_clinical_files/migration.sql`.

**Não foi executada. Não foi usado `prisma migrate dev`.**

## Integração no main

O conector GitHub desta sessão permitiu leitura do repositório, porém recusou `create_branch` com HTTP 403. Por isso nenhum arquivo da `main` foi alterado.

Arquivos novos completos estão neste pacote. Mudanças pequenas em arquivos centrais estão em:
- `PATCHES/backend-routes.patch`;
- `PATCHES/frontend-routes.patch`;
- `PATCHES/frontend-navigation.patch`;
- `PATCHES/prisma-schema-additions.patch`;
- `CHAT5_INTEGRATION.patch` (consolidado).

## Pendências externas

1. Credenciais reais do storage S3 compatível.
2. Endpoint/bucket/region por clínica em `TenantStorageConfig`.
3. No Chat 8: consumir o handoff em `DentalPos Design` usando a importação 3D existente. Isso é integração, não mudança do motor CAD.
4. Se for desejado viewer DICOM diagnóstico completo (window/level, séries, MPR etc.), selecionar biblioteca/serviço DICOM apropriado; este Chat 5 preserva o DICOM e disponibiliza o arquivo com segurança, sem prometer recurso clínico não implementado.
