# DentalPos One — Bloco 2 Clínico

Checkpoint do módulo clínico integrado.

## Fluxos implementados

- Cadastro persistente de pacientes no frontend Alpha.
- Cadastro/edição de dados clínicos básicos do paciente.
- Acesso direto Paciente → Prontuário → Agenda → Orçamento.
- Odontograma FDI 32 dentes com 5 faces clicáveis.
- Vermelho claro = achado/procedimento pendente.
- Azul = procedimento realizado.
- Marcadores por dente: cárie, restauração, implante, endodontia, coroa, núcleo, ausente, incluso, aumento de coroa, raspagem, enxerto, tracionamento, periodontal, prótese, faceta, alteração e outros.
- Odontograma alimenta automaticamente o plano de tratamento.
- Nova evolução clínica exige:
  - procedimento realizado;
  - anotação/evolução;
  - próximo procedimento obrigatório;
  - pelo menos uma marcação odontológica vinculada.
- Ao salvar a evolução, as marcações selecionadas são concluídas e mudam para azul.
- Snapshot do odontograma é preservado na evolução.
- Próximo procedimento pode gerar agendamento imediatamente.
- Plano clínico pode ser importado para Orçamentos/Tratamentos, mantendo valores manuais nesta fase.
- Backend Prisma preparado com ClinicalEvolution, OdontogramMark e TreatmentItem.
- Endpoints clínicos multi-tenant preparados.
- Auditoria para criação/alteração de odontograma e evoluções.
- PatientController endurecido para clinicId/tenantId e exclusão substituída por inativação auditada.

## Validação

O ambiente deste checkpoint não contém node_modules e o registry externo está indisponível, por isso o build completo deve ser executado no Windows no checkpoint final/piloto. A estrutura foi revisada e o frontend anterior já usava React/MUI/Vite compatíveis com os componentes mantidos.
