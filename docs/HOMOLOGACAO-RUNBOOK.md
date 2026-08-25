# Runbook de Homologação — DentalPos One

## Ordem recomendada

1. Criar banco exclusivo de homologação e nunca reutilizar produção.
2. Configurar `.env` somente no servidor/secret manager.
3. Executar `npx prisma migrate deploy` quando houver migrations aprovadas; durante Alpha local, validar alteração de schema antes de qualquer `db push`.
4. Executar `npm run build` em backend e frontend.
5. Executar `npm run preflight:release` no backend.
6. Subir API e validar `/health` e `/ready`.
7. Abrir **Configurações → Homologação e Segurança**.
8. Testar dois tenants/clínicas distintos para garantir isolamento.
9. Smoke test: login → agenda → paciente → prontuário → orçamento → financeiro → backoffice → RH → REVAH.
10. Testar permissões com Recepção, Dentista, Financeiro, RH, Contador, Gestor e Administrador.
11. Configurar integrações primeiro em sandbox/teste e validar webhooks assinados.
12. Executar backup e restauração em `dentalpos_restore_test`.
13. Registrar a data do teste de restauração no ambiente.
14. Revisar auditoria, erros e request IDs.
15. Liberar apenas para clínica interna/piloto via feature flags.

## Rollback

- não corrigir diretamente em produção;
- desabilitar feature flag afetada quando possível;
- manter o build anterior pronto para redeploy;
- restaurar banco somente quando houver necessidade comprovada e procedimento de incidente;
- preservar logs/auditoria e registrar causa/ação corretiva.
