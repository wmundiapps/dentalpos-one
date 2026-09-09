# Chat 6 — Cirurgia, Implantodontia e Prótese

## Escopo entregue
Núcleo clínico especializado isolado, multi-tenant e auditável para cirurgia, implantes e prótese. O bloco foi construído sobre os contratos atuais de `Patient`, `ClinicalEvolution`, `TreatmentItem`, `LaboratoryWork`, autenticação, permissões e auditoria do `main`.

## Segurança e multi-tenant
- `clinicId`, `tenantId` e `createdById` vêm exclusivamente de `req.user`; nunca do payload do navegador.
- Paciente, cirurgia, implante e ordem laboratorial são verificados no mesmo `clinicId + tenantId` antes de criar vínculos.
- Todas as consultas SQL do módulo especializado são filtradas por clínica e tenant.
- Permissões reutilizadas: `clinical.view` e `clinical.edit`. Não foi criado arquivo central de permissões.
- Auditoria reutiliza `writeAudit` com módulo `CLINICAL_SPECIALTY`.

## Cirurgia
`SurgeryCase` guarda tipo, dente/região, diagnóstico, planejamento, técnica, anestesia/anestésico, medicamentos, biomateriais, enxerto, membrana, sutura, lotes, intercorrências, orientações, data, retorno, profissional, status e notas.

`SurgeryFollowUp` registra pós-operatório em série: sintomas, cicatrização, intercorrências, orientações e novo retorno, sem sobrescrever o histórico anterior.

## Implantodontia
`ImplantRecord` guarda marca, linha, conexão, plataforma, diâmetro, comprimento, lote, série, instalação, torque, estabilidade primária, ISQ, enxerto, cicatrizador, componente, mini pilar, altura transmucosa, torque protético, data protética, profissional, ordem laboratorial, radiografias, intercorrências e observações.

Rastreabilidade pronta para evolução: `traceabilityCode`, `barcodeValue`, `qrValue`, `serialNumber`, `traceabilityPayload` e `scanSource`. A API aceita busca por qualquer um desses identificadores; câmera/leitor físico não é dependência do núcleo.

## Prótese
`ProsthesisCase` guarda tipo, dentes/região, material, cor/escala, moldagem, scanner intraoral, referências STL, provisório, prova, estrutura, cerâmica, ajuste, entrega, cimentação, parafuso, torque, garantia, manutenção, status e vínculo com `LaboratoryWork`.

`ProsthesisHistory` preserva cada etapa clínica/laboratorial e manutenção como evento cronológico.

## Integrações já preparadas
- **Prontuário/evolução:** `clinicalEvolutionId` na cirurgia; o histórico especializado pode ser exibido dentro do prontuário sem copiar registros.
- **Plano de tratamento/odontograma:** `treatmentItemId` em cirurgia, implante e prótese. Como `TreatmentItem` já se relaciona ao odontograma, o módulo não cria um odontograma paralelo.
- **Arquivos clínicos:** `radiographRefs` e `stlFileRefs` aceitam IDs/metadados do módulo de arquivos. Chat 8 deve ligar o seletor definitivo ao módulo de Exames/Arquivos do Chat 5.
- **Laboratório:** FK direta para `LaboratoryWork`; não foi criado cadastro paralelo de laboratório.
- **Estoque:** lotes e payload de rastreabilidade já estão estruturados para futura baixa/entrada por evento, sem acoplar Chat 6 ao estoque agora.
- **DentalPos Design:** STL e ordem laboratorial ficam referenciáveis; nenhuma alteração foi feita no Design.

## Rotas do módulo
Quando montado em `/api/specialty-clinical`:
- `GET /patients/:patientId/surgeries`
- `POST /patients/:patientId/surgeries`
- `PUT /surgeries/:id`
- `POST /surgeries/:id/follow-ups`
- `GET /patients/:patientId/implants`
- `POST /patients/:patientId/implants`
- `PUT /implants/:id`
- `GET /implants/traceability/:code`
- `GET /patients/:patientId/prostheses`
- `POST /patients/:patientId/prostheses`
- `PUT /prostheses/:id`
- `POST /prostheses/:id/history`

## Mudanças centrais reservadas para o Chat 8
### backend/src/routes/index.ts
Depois de `authMiddleware` e `tenantMiddleware`, importar e montar:
```ts
import { specialtyClinicalRoutes } from './specialtyClinicalRoutes'
router.use('/specialty-clinical', specialtyClinicalRoutes)
```

### frontend/src/AppRoutes.tsx
Adicionar a página de paciente sem substituir rotas existentes:
```tsx
import SurgeryImplantProsthesis from './pages/SurgeryImplantProsthesis'
<Route path="/patients/:patientId/specialty-clinical" element={<SurgeryImplantProsthesis />} />
```

### Navegação/prontuário
Preferir entrada contextual dentro do paciente/prontuário (“Cirurgia / Implantes / Prótese”) em vez de criar item global duplicado no Sidebar.

### backend/prisma/schema.prisma
Este Chat 6 **não alterou o schema central** para evitar conflito. A migration SQL cria as tabelas de forma aditiva e o controller usa `$queryRaw` parametrizado, portanto o bloco não depende de regeneração do Prisma Client. Na consolidação, o Chat 8 pode espelhar esses modelos no `schema.prisma` de forma aditiva, mantendo os mesmos nomes/tipos/FKs, se desejar acesso tipado pelo Prisma.

## Migration
Arquivo: `backend/prisma/manual-migrations/20260902_chat6_surgery_implant_prosthesis.sql`.
- apenas `CREATE TABLE IF NOT EXISTS`/`CREATE INDEX IF NOT EXISTS`;
- não apaga, renomeia ou transforma estruturas existentes;
- não foi executada;
- não usa `prisma migrate dev`.

## Dependências externas pendentes
Nenhuma biblioteca npm adicional é necessária para o núcleo.
Pendências de integração, não de código-base:
1. aplicação da migration pelo processo controlado de release/Chat 8;
2. montagem das rotas e página nos arquivos centrais;
3. seletor definitivo de arquivos/radiografias/STL quando o módulo de Exames/Arquivos for integrado;
4. câmera/leitor de código de barras/QR é evolução futura opcional;
5. integração transacional com estoque é evolução futura, já preparada pelos campos de lote/rastreabilidade.

## Observação de entrega
A conexão GitHub disponível nesta sessão retornou HTTP 403 em operações de escrita. Por isso os arquivos foram produzidos como patch completo baseado no HEAD `6fb4e9f8bb9bc415fa04dd5dfb3ed8153f047bba` do `main`, sem afirmar alterações remotas que não ocorreram.

---

# HOMOLOGAÇÃO 5787 — FOTO GLOBAL DO PACIENTE E PREPARAÇÃO MOBILE

Este acréscimo mantém integralmente o escopo do Chat 6. Não cria aplicativo separado, backend paralelo, autenticação adicional, banco adicional, permissões adicionais ou storage próprio.

## PONTOS DE FOTO DO PACIENTE

A tela `SurgeryImplantProsthesis` foi preparada para reutilizar a identidade global do `Patient` em dois pontos:

1. **Cabeçalho do núcleo especializado** — avatar/foto ao lado do nome do paciente e, quando disponível, número do prontuário.
2. **Cabeçalho dos modais clínicos** — avatar/foto e nome permanecem visíveis durante cadastro de cirurgia, implante, prótese, acompanhamento pós-operatório e histórico protético. Isso é especialmente importante no celular, onde o modal passa a ocupar a tela inteira.

Comportamento de fallback:
- se não houver foto, são exibidas as iniciais do paciente;
- se a URL temporária da foto falhar, a interface volta automaticamente para as iniciais;
- nenhuma foto é gravada em `localStorage`;
- o Chat 6 não cria tabela, bucket, pasta ou sistema de arquivos próprio para foto.

### Contrato global recomendado para o Patient — responsabilidade do Chat 8

Antes de criar qualquer novo campo, o Chat 8 deve verificar se o `Patient` já possui uma referência compatível para foto de perfil. **Se já existir, reutilizar a existente.**

Se não existir, acrescentar de forma aditiva ao modelo central `Patient` uma única referência, preferencialmente:

```prisma
photoFileId String?
```

A referência deve apontar para o storage privado central já adotado pelo DentalPos One. Não armazenar binário/base64 no `Patient` e não criar storage específico deste módulo.

A API existente de paciente (`GET /patients/:id`) deve expor a identidade para as telas clínicas em formato compatível com:

```ts
{
  id: string
  name: string
  recordNumber?: string | null
  photoFileId?: string | null
  photoUrl?: string | null // URL autenticada/assinada temporária, quando aplicável
}
```

`photoUrl` é somente uma forma de visualização temporária; a referência persistente continua sendo única no `Patient`/storage central.

O fluxo futuro de troca/captura da foto deve pertencer ao cadastro global do paciente, obedecendo autenticação, `tenantId`, `clinicId`, autorização, LGPD, auditoria e storage privado. O módulo Chat 6 apenas consome essa identidade.

## AJUSTES MOBILE REALIZADOS

A tela especializada foi revisada para celular e tablet:

- espaçamento externo reduzido em telas estreitas;
- cabeçalho responsivo com identificação do paciente;
- botões principais empilham no celular e passam a ocupar a largura disponível;
- alvos de toque dos botões principais, pós-operatório, histórico, salvar e cancelar receberam altura mínima adequada para toque;
- abas de Cirurgia, Implantes e Próteses passaram a ser roláveis horizontalmente em telas estreitas;
- cards mudam de linha/coluna conforme largura, evitando depender de hover;
- campos que antes dividiam uma linha estreita passam a ocupar 100% no celular e voltam a múltiplas colunas em `sm/md`;
- modais passam a `fullScreen` em celular, preservando formulário utilizável e sem compressão lateral;
- ações dos modais empilham no celular;
- nenhuma ação essencial depende exclusivamente de mouse, cursor ou hover;
- toda persistência continua usando a mesma API/backend já existente.

## CAPACIDADES NATIVAS NECESSÁRIAS

O Chat 6 não implementa APIs nativas, mas identifica as seguintes capacidades para o shell mobile central do Chat 8:

- **Câmera**: captura futura da foto global do paciente e, por integração com o módulo de arquivos clínicos, fotografias clínicas.
- **Galeria/seleção de arquivo**: envio da foto global do paciente e seleção de radiografias, STL e demais anexos pelo módulo central de arquivos.
- **Leitura de código de barras/QR**: rastreabilidade futura de implantes, lotes e componentes utilizando os campos `barcodeValue`, `qrValue` e `traceabilityCode` já preparados.
- **Upload de arquivos**: sempre via serviço/storage privado central, nunca por armazenamento local definitivo do app.
- **Compartilhamento e impressão**: úteis futuramente para documentos/relatórios clínicos, devendo usar o mecanismo central do app quando implementado.
- **Biometria**: não é requisito específico do Chat 6; se adotada, deve atuar somente no shell/autenticação central, sem autenticação paralela neste módulo.
- **Notificações**: poderão ser usadas futuramente para retornos/pós-operatório, mas devem vir da infraestrutura central de agenda/notificações, não de um serviço criado por este módulo.

## INTEGRAÇÕES PARA O CHAT 8

Além das integrações centrais já descritas anteriormente neste documento, o Chat 8 deve:

1. Montar a rota da tela `SurgeryImplantProsthesis` no roteamento central.
2. Montar `specialtyClinicalRoutes` sob `/specialty-clinical` após autenticação e tenant middleware.
3. Garantir que `GET /patients/:id` devolva a identidade do paciente usada pelo módulo, incluindo a referência única de foto e URL temporária quando houver.
4. Se o `Patient` ainda não tiver referência de foto, fazer somente a mudança aditiva central necessária e preparar migration SQL segura; não criar campo de foto nas tabelas de cirurgia, implante ou prótese.
5. Conectar captura/upload de foto ao fluxo global de Patient, com storage privado, autenticação, auditoria, `tenantId`, `clinicId` e LGPD.
6. Conectar seletores reais de radiografias/arquivos clínicos e STL vindos do módulo de exames/arquivos, substituindo entrada manual de IDs quando a integração estiver disponível.
7. No shell Android/iOS, expor câmera, galeria e scanner de QR/barcode por uma camada central reutilizável; o Chat 6 deve apenas consumir essas capacidades.
8. Preservar a API, banco, autenticação, permissões e auditoria existentes; não criar versões mobile paralelas desses serviços.

### Arquivos alterados por esta homologação dentro do pacote do Chat 6

- `frontend/src/pages/SurgeryImplantProsthesis.tsx`
- `frontend/src/services/SpecialtyClinicalApi.ts`
- `frontend/src/types/specialtyClinical.ts`
- `docs/CHAT-6-CIRURGIA-IMPLANTES-PROTESE.md`
- `docs/CHAT-6-MANIFEST.md`

Nenhuma migration foi executada. Nenhum arquivo central foi alterado. Nenhum deploy foi realizado. A `main` não foi alterada.

## INTEGRAÇÃO DE RESOLUÇÃO DE ALERTAS PARA O CHAT 8

### O que este bloco entrega
O Chat 6 não cria uma Central de Alertas. Ele resolve a causa da pendência laboratorial no próprio domínio do `LaboratoryWork` e devolve estado padronizado para a Central do Chat 8.

Persistência: usa `LaboratoryWorkHistory.metadata` já existente. Não há nova tabela, novo banco ou alteração de `schema.prisma`.

Ações suportadas:
- `RECEIVED` — Recebido;
- `DELIVERED` — Entregue;
- `COMPLETED` — Concluído;
- `CANCELLED` — Cancelado, com motivo obrigatório;
- `RENEGOTIATED` — Prazo renegociado, com motivo e nova data obrigatórios;
- `IMPROPER_ALERT` — Alerta improcedente, com motivo obrigatório;
- `DEMO_DATA` — Dado demonstrativo, com motivo obrigatório.

Estados padronizados:
- `ACTIVE` — pendência ativa;
- `IN_TREATMENT` — em tratamento;
- `RESOLVED` — resolvida;
- `DISMISSED` — dispensada/improcedente.

Retorno inclui: `resolutionDate`, `responsibleUserId`, `reason`, `solution`, `entity`, `alertKind`, `alertKey`, `dueDate`, `originalDueDate`, `newDueDate`, `resolutionAction` e `protocolSeed`.

### Endpoints próprios do módulo
Sob `/api/specialty-clinical`:
- `GET /laboratory-works/:id/pending-state?kind=LABORATORY_OVERDUE|LABORATORY_AT_RISK`
- `POST /laboratory-works/:id/pending-treatment`
- `POST /laboratory-works/:id/resolve-pending`

Permissões reaproveitadas: `clinical.view` e `clinical.edit`.

### Regra crítica de renegociação
A data vencida original nunca é apagada do histórico. A entrada `ALERT_RENEGOTIATED` guarda `originalDueDate`, `newDueDate`, usuário, horário, motivo e solução. O `LaboratoryWork.dueDate` passa então a apontar para o novo prazo. O `alertKey` inclui a data de vencimento; portanto um eventual atraso futuro da data renegociada constitui um novo episódio e não é mascarado pela resolução antiga.

### Resolução automática pelo fluxo normal
O arquivo `backend/src/services/laboratoryAlertResolutionService.ts` exporta `syncLaboratoryAlertFromWorkState(...)`.

O Chat 8 deve chamá-lo depois de uma alteração normal de status do `LaboratoryWork`, fornecendo o status anterior e o usuário autenticado. Se o trabalho passar para `DELIVERED`, `COMPLETED` ou `CANCELLED`, o serviço cria a resolução automaticamente com responsável/data/hora e evita que o usuário tenha de executar a mesma ação duas vezes.

**Não** inferir protocolo definitivo apenas pelo status sem chamar esse sincronizador; o endpoint de estado consegue reconhecer status terminal como resolvido, mas sinaliza que o responsável fica ausente até o fluxo central registrar a resolução auditável.

### Integração no OperationsHub/Dashboard
Não alterar a origem central de alertas neste Chat 6. O Chat 8 deve:
1. quando montar um alerta de atraso/risco de `LaboratoryWork`, consultar o endpoint `pending-state`;
2. exibir o alerta apenas se `active === true`;
3. tratar `IN_TREATMENT` visualmente como pendência em tratamento, sem excluí-la;
4. retirar o alerta ativo quando `RESOLVED` ou `DISMISSED`;
5. usar `protocolSeed` + dados retornados para formar o protocolo central de resolução;
6. manter a entidade de origem como `{ type: "LaboratoryWork", id, trackingCode }`;
7. ao mudar status no fluxo normal do laboratório, chamar `syncLaboratoryAlertFromWorkState` para resolução automática.

### Cirurgia, implante e prótese
Implantes e próteses vinculados a `laboratoryWorkId` exibem o componente `LaboratoryResolutionPanel`, permitindo tratar e resolver a pendência diretamente no contexto clínico, sem botão X/excluir. Cirurgia continua vinculada aos fluxos clínicos próprios; quando gerar ordem laboratorial, a resolução deve sempre apontar para o `LaboratoryWork` real, preservando uma única entidade de origem.
