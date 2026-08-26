# Bloco 20 — Homologação local da Agenda Inteligente

Este bloco adiciona um smoke test de integração HTTP real para os Blocos 17, 18 e 19.

## Cobertura

O teste utiliza a aplicação Express real, middleware JWT, contexto de clínica/tenant, permissões de administrador, Prisma e PostgreSQL.

Ele valida:

- `GET /smart-scheduling/config`
- `POST /smart-scheduling/bootstrap`, quando necessário
- `PUT /smart-scheduling/policy`
- `PUT /smart-scheduling/procedure-rules/:procedureKey`
- `PUT /smart-scheduling/laboratory-rules`
- `POST /patients`
- `POST /smart-scheduling/suggest`
- `POST /smart-scheduling/decisions/:id/accept`

A sugestão precisa registrar `CLINICAL_FIRST` e considerar uma regra laboratorial ativa.

## Segurança

O script não pede nem imprime senha. Ele usa um administrador ativo do banco e emite um JWT temporário de curta duração com a `JWT_SECRET` já configurada no ambiente local.

## Dados de teste

É criado um paciente temporário somente durante a homologação. Ao final, decisões e preferências associadas são removidas e o paciente é excluído. Se a exclusão integral falhar, o paciente é inativado como fallback.

## Limite do teste

Este smoke test valida backend, banco, autenticação e contratos HTTP. A validação visual final do frontend será feita separadamente no navegador antes da homologação online.
