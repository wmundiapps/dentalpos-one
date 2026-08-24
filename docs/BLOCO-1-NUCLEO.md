# Bloco 1 — Núcleo do DentalPos One

## Implementado
- Estrutura versão-mãe `frontend/` + `backend/`.
- PostgreSQL + Prisma preservados como base persistente.
- Multi-clínica/multi-tenant reforçado: tenant/clínica do token não pode ser trocado por header.
- Identidade da clínica no banco: nome de exibição, logo, cores principal/secundária/destaque, tema e fuso horário.
- Catálogo normalizado de permissões por módulo/ação.
- Perfis de acesso por clínica: Admin, Gestor, Recepção, Dentista, Laboratório, Financeiro e RH.
- Vínculo usuário ↔ perfis.
- Middleware `requirePermission()` para autorização fina por funcionalidade.
- Auditoria persistente com ator, módulo, ação, entidade, antes/depois, IP, user-agent e metadados.
- Endpoint de sessão `/api/auth/me` com identidade da clínica.
- Endpoints de configurações, perfis, permissões e auditoria.
- Rate limit inicial nas rotas de autenticação.
- Modelos de RefreshToken e PasswordResetToken preparados para sessão/recuperação de senha.

## Integrações preparadas para os próximos blocos
Cada novo módulo pode declarar permissões e gravar `AuditLog`, mantendo uma única origem de usuário/clínica/tenant.

## Regras de segurança do núcleo
- Segredos continuam exclusivamente em variáveis de ambiente.
- O frontend não deve receber chaves de Asaas, Stripe, Z-API, Resend ou bancos.
- Ações sensíveis serão protegidas por permissão no backend, não apenas escondidas no menu.
