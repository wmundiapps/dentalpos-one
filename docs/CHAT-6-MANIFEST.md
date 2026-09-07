# Manifesto de arquivos — Chat 6

## Arquivos novos
- `backend/prisma/manual-migrations/20260902_chat6_surgery_implant_prosthesis.sql`
- `backend/src/controllers/specialtyClinicalController.ts`
- `backend/src/routes/specialtyClinicalRoutes.ts`
- `backend/src/types/specialtyClinical.ts`
- `backend/src/validation/specialtyClinicalValidation.ts`
- `frontend/src/pages/SurgeryImplantProsthesis.tsx`
- `frontend/src/services/SpecialtyClinicalApi.ts`
- `frontend/src/types/specialtyClinical.ts`
- `docs/CHAT-6-CIRURGIA-IMPLANTES-PROTESE.md`
- `docs/CHAT-6-MANIFEST.md`

## Arquivos alterados
Nenhum arquivo existente foi alterado neste pacote, deliberadamente, para evitar conflito com os demais chats.

## Arquivos centrais que o Chat 8 deverá integrar
- `backend/src/routes/index.ts`
- `frontend/src/AppRoutes.tsx`
- componente contextual do prontuário/paciente usado para navegação
- opcionalmente `backend/prisma/schema.prisma` para espelhamento tipado dos modelos após a migration coordenada

## Homologação 5787

Acréscimo concluído sem expansão de escopo:

### PONTOS DE FOTO DO PACIENTE
- Cabeçalho da página Cirurgia / Implantodontia / Prótese.
- Cabeçalho dos modais de cirurgia, implante, prótese, pós-operatório e histórico protético.
- Fallback por iniciais quando a foto global do `Patient` não existir ou não puder ser carregada.
- Nenhuma duplicação de foto e nenhum storage próprio criado.

### AJUSTES MOBILE REALIZADOS
- Layout responsivo para celular/tablet.
- Botões com alvos de toque maiores e largura integral no celular quando adequado.
- Abas roláveis horizontalmente.
- Formulários em uma coluna nas telas estreitas.
- Modais full-screen no celular.
- Cards e ações sem dependência de hover/mouse.

### CAPACIDADES NATIVAS NECESSÁRIAS
- câmera;
- galeria/seleção de arquivo;
- upload privado central;
- QR/barcode para rastreabilidade;
- compartilhamento/impressão futuros via shell central;
- biometria e notificações somente se fornecidas pelo shell central.

### INTEGRAÇÕES PARA O CHAT 8
- identidade global do `Patient` em `GET /patients/:id`;
- referência única de foto no `Patient` (reusar existente; se inexistente, alteração aditiva central preferencial `photoFileId String?`);
- URL autenticada/assinada temporária para visualização (`photoUrl`), quando aplicável;
- captura/upload pelo fluxo global de Patient e storage privado central;
- integração das capacidades nativas pelo shell Android/iOS central;
- nenhuma autenticação, banco, permissão ou backend duplicado.

## Homologação 5787 — resolução de alertas e pendências
Arquivos adicionados:
- backend/src/types/laboratoryAlertResolution.ts
- backend/src/validation/laboratoryAlertResolutionValidation.ts
- backend/src/services/laboratoryAlertResolutionService.ts
- backend/src/controllers/laboratoryAlertResolutionController.ts
- frontend/src/components/LaboratoryResolutionPanel.tsx

Arquivos alterados:
- backend/src/routes/specialtyClinicalRoutes.ts
- frontend/src/types/specialtyClinical.ts
- frontend/src/services/SpecialtyClinicalApi.ts
- frontend/src/pages/SurgeryImplantProsthesis.tsx
- docs/CHAT-6-CIRURGIA-IMPLANTES-PROTESE.md

Nenhuma migration nova foi criada para este acréscimo: a rastreabilidade usa `LaboratoryWorkHistory.metadata` já existente.
