# Chat 3 — Plano de Tratamento e Orçamento Clínico (reconstrução pelo Chat 8)

O artefato original do Chat 3 foi perdido. Este bloco foi reconstruído sobre o mesmo `main` usado pelos demais módulos, sem criar estruturas financeiras paralelas.

- Reutiliza `TreatmentItem`, `Budget`, `Payment`, `FinancialEntry`, `Appointment`, `LaboratoryWork` e catálogo CBHPO existente.
- Acrescenta `planningData` ao `TreatmentItem` para fase, prioridade, alternativa terapêutica, especialidade/profissional, duração, laboratório, exames, cirurgia, sequência, dependências e valor unitário.
- Acrescenta `TreatmentPlanRevision` para snapshots versionados do plano.
- Importa pendências do odontograma sem duplicar itens já vinculados.
- Mantém aprovação financeira no controller de orçamento existente, que gera contas a receber.
- Multi-tenant por `clinicId + tenantId`; auditoria em alterações clínicas.
- Migration aditiva preparada e não executada.
