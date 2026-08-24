# Checklist de release DentalPos One
1. Backup do PostgreSQL de produção.
2. Build e testes em development.
3. `prisma migrate deploy` em staging.
4. Smoke test: login, paciente, prontuário, agenda, laboratório, orçamento, baixa financeira, RH e REVAH simulado.
5. Habilitar feature flag somente para clínica interna/piloto.
6. Observar logs/auditoria e erros.
7. Promover a mesma imagem/build para production.
8. Liberar flags por coorte de clínicas; rollback da flag se necessário.
9. Nunca copiar secrets de staging para produção.
