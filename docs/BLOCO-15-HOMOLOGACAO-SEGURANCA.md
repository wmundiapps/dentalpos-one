# Bloco 15 — Homologação, Segurança e Preparação para Produção

## Objetivo

Transformar a versão integrada do DentalPos One em um ambiente que possa ser testado de forma controlada antes do piloto público. Este bloco não substitui homologação com credenciais reais nem auditoria jurídica/LGPD; ele cria travas técnicas e visibilidade para evitar publicar o sistema com configurações inseguras.

## Alterações aplicadas

### 1. Pré-flight de ambiente

O backend passa a avaliar requisitos críticos sem revelar valores secretos:

- `JWT_SECRET` forte;
- `TENANT_SECRET_MASTER_KEY` configurada;
- CORS restrito;
- cadastro público desabilitado;
- URL pública HTTPS;
- banco configurado e acessível;
- política de backup habilitada;
- restauração de backup já testada.

Em `NODE_ENV=production`, requisitos críticos de configuração impedem a API de iniciar. Em desenvolvimento/homologação, são exibidos como pendências para permitir correção gradual.

Endpoint autenticado: `GET /api/platform/readiness`.

Comando local/servidor: `npm run preflight:release` dentro de `backend`.

### 2. Segurança de autenticação

- Hash de senha não é mais retornado nas respostas de login/cadastro.
- Token padrão reduzido de 7 dias para 8 horas e configurável por `JWT_EXPIRES_IN`.
- Login passa a registrar auditoria de sucesso.
- Rate limit de autenticação separado do limite geral da API.
- Frontend valida `/auth/me` antes de abrir uma sessão armazenada.
- Sessão inválida é removida; API indisponível não é confundida com sessão válida.
- Logout explícito foi adicionado ao cabeçalho.
- Redirecionamento pós-login/logout respeita `/dentalposone/`.

### 3. Isolamento multi-tenant

Foram endurecidos os fluxos que ainda aceitavam consultas globais:

- profissionais são filtrados por `clinicId` e `tenantId`;
- criação/edição de profissional não pode trocar clínica/tenant pelo corpo da requisição;
- dados do usuário relacionado ao profissional não expõem senha;
- avaliações são filtradas por clínica/tenant e validam paciente + atendimento da mesma clínica;
- pacientes, profissionais e avaliações agora possuem permissões explícitas nas rotas;
- CRO passa a ser único por clínica (`clinicId + cro`) em vez de global.

### 4. Webhooks

- Asaas não aceita webhook se `ASAAS_WEBHOOK_TOKEN` não estiver configurado.
- Comparação do token usa comparação segura.
- Stripe exige `STRIPE_WEBHOOK_SECRET` e valida a assinatura `stripe-signature` por HMAC SHA-256, com tolerância de tempo configurável.
- O corpo bruto é preservado durante o parsing JSON exclusivamente para validação de assinatura.
- Idempotência já existente continua baseada no identificador externo do evento.

### 5. Segurança HTTP e observabilidade

- `X-Powered-By` desabilitado.
- Helmet/HSTS em produção.
- CORS com lista explícita de origens.
- limite de tamanho do corpo da requisição.
- `Cache-Control: no-store` nas APIs.
- request ID em todas as requisições e erros.
- `/health` para vida do processo.
- `/ready` para prontidão do PostgreSQL.
- shutdown gracioso de HTTP + Prisma.

### 6. Backup

A tela antiga exibia backups fictícios. Isso foi removido. O sistema agora diferencia claramente interface de política e execução real.

Scripts incluídos:

- `scripts/backup-postgres.ps1`: gera dump PostgreSQL em formato custom e SHA-256;
- `scripts/restore-postgres.ps1`: restaura apenas em uma base separada de teste por padrão e exige `-ConfirmRestore`.

O ambiente só deve receber `BACKUP_ENABLED=true` depois que existir um job real de backup. `BACKUP_LAST_RESTORE_TEST_AT` só deve ser preenchido depois de uma restauração validada.

## Itens que continuam pendentes de homologação real

- Asaas com conta/credenciais reais e webhook público HTTPS.
- Stripe com segredo real e evento assinado de teste/produção.
- bancos/Open Finance e conciliação real.
- Z-API, Comtele, Resend, Telegram e Twilio com credenciais de cada clínica.
- storage externo e política de retenção de documentos clínicos.
- teste de backup fora do servidor principal e recuperação completa.
- testes de carga e monitoramento/alertas externos.
- revisão jurídica de LGPD, termos, consentimentos, contratos com operadores e política de retenção.

## Observação sobre token no navegador

A Alpha/Piloto continua usando token no `localStorage` por compatibilidade com o código atual. A validade foi reduzida e a sessão agora é validada contra a API. Para expansão ampla em produção, recomenda-se migrar a autenticação para cookie `HttpOnly + Secure + SameSite` ou adotar proteção equivalente com CSP rigorosa e rotação/revogação de sessão.

## Critério para promoção

Não promover apenas porque frontend/backend compilam. Para cada ambiente: executar build, `prisma migrate deploy`/migração aprovada, preflight, smoke test funcional, teste de permissões entre perfis, teste de isolamento entre duas clínicas, teste de webhook, backup + restauração e revisão dos logs de auditoria.
