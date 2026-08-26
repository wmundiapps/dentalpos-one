# Bloco 17 — Agenda Inteligente no backend

Este bloco move o núcleo da Agenda Inteligente para PostgreSQL/Prisma e API multi-tenant.

## Princípio obrigatório

O motor pode considerar duração do procedimento, janela clínica, prazo de laboratório, dia habitual do paciente e referências financeiras. O fator financeiro é auxiliar: não bloqueia atendimento e não pode ultrapassar a janela clínica configurada.

## Endpoints

- `GET /api/smart-scheduling/config`
- `POST /api/smart-scheduling/bootstrap`
- `PUT /api/smart-scheduling/policy`
- `PUT /api/smart-scheduling/procedure-rules/:procedureKey`
- `PUT /api/smart-scheduling/laboratory-rules`
- `GET /api/patients/:patientId/scheduling-preference`
- `PUT /api/patients/:patientId/scheduling-preference`
- `POST /api/smart-scheduling/suggest`
- `GET /api/smart-scheduling/decisions`
- `POST /api/smart-scheduling/decisions/:id/accept`
- `POST /api/smart-scheduling/decisions/:id/override`

## Próxima integração

A interface do Bloco 16 pode passar a consumir esta API em vez de depender das regras locais do navegador. A migração deve manter fallback controlado durante homologação.
