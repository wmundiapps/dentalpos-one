# Chat 2 — Odontograma e Periodontograma

## Escopo entregue
- Odontograma adulto e infantil com numeração FDI.
- Faces M, D, O, V e L.
- Achados padrão: hígido, cárie, restauração, provisório, coroa, implante, pôntico, endodontia, extração indicada/realizada, prótese, lesão, ausente.
- Achados customizáveis por clínica.
- Estados: atual, planejado e concluído.
- Integração com TreatmentItem para estados planejado/concluído.
- Evolução clínica opcional quando uma conclusão é salva com evolutionNotes.
- Periodontograma em 6 sítios: MB, B, DB, ML, L, DL.
- Profundidade de sondagem, recessão, NIC/CAL, sangramento, placa, mobilidade, furca, supuração e observações.
- Histórico longitudinal por data e endpoint de comparação.
- Persistência PostgreSQL real.
- Multi-tenant: toda leitura/escrita é filtrada por clinicId + tenantId + patientId.
- Auditoria usando writeAudit.
- Permissões clinical.view / clinical.edit.
- Migration SQL aditiva, não executada.
- Nenhum deploy realizado.

## Integração
O arquivo `backend/src/app.ts` desta entrega registra `dentalChartRoutes` antes do roteador principal.
O arquivo `frontend/src/routes/AppRoutes.tsx` adiciona `/odontograma-periodontograma`.

A tela aceita:
`/odontograma-periodontograma?patientId=<ID>&patient=<NOME>`

## Endpoints
GET    /api/patients/:patientId/dental-chart
PUT    /api/patients/:patientId/dental-chart/entries
DELETE /api/patients/:patientId/dental-chart/entries/:id
GET    /api/dental-findings
POST   /api/dental-findings
GET    /api/patients/:patientId/periodontal-exams
POST   /api/patients/:patientId/periodontal-exams
GET    /api/patients/:patientId/periodontal-comparison?examA=...&examB=...

## Banco
A migration cria apenas novas tabelas e índices:
- DentalChartEntry
- DentalFindingDefinition
- PeriodontalExam
- PeriodontalSiteRecord

Não há DROP, TRUNCATE, ALTER destrutivo nem execução automática.

## Dependências externas pendentes
Nenhuma biblioteca npm nova foi adicionada.
A única pendência operacional é o Chat 8 integrar os arquivos e executar a migration no fluxo seguro de produção/homologação já adotado pelo projeto.

## GitHub
Tentativa de criar `chat-2-odontograma-periodontograma` em 2026-09-03 foi recusada pela integração do GitHub com HTTP 403 `Resource not accessible by integration`.
Por isso a entrega foi produzida em ZIP preservando a estrutura.
