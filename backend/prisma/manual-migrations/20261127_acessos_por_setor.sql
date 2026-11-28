-- Acessos por setor: Contas a pagar, Folha de pagamento e RH só para o Financeiro (e administrador/gestor).
-- Rodar no editor SQL do projeto DentalPos One (lfeqfzvmasqnnmqvkjyg). Não apaga perfis nem usuários: só acrescenta a permissão nova
-- e retira o acesso dos setores que não devem ver essas telas.

-- 1) Permissão nova: contas a pagar (despesas).
INSERT INTO "Permission" ("id","code","module","action","createdAt")
SELECT 'perm_finance_payables','finance.payables','finance','payables', now()
WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "code"='finance.payables');

-- 2) Quem pode ver contas a pagar: Financeiro, Gestor, Contador e Administrador.
INSERT INTO "AccessProfilePermission" ("profileId","permissionId","createdAt")
SELECT p."id", perm."id", now()
FROM "AccessProfile" p CROSS JOIN "Permission" perm
WHERE perm."code"='finance.payables' AND p."code" IN ('FINANCEIRO','GESTOR','CONTADOR','ADMIN')
ON CONFLICT DO NOTHING;

-- 3) Financeiro também enxerga RH e folha (hr.*).
INSERT INTO "AccessProfilePermission" ("profileId","permissionId","createdAt")
SELECT p."id", perm."id", now()
FROM "AccessProfile" p CROSS JOIN "Permission" perm
WHERE perm."code" IN ('hr.view','hr.create','hr.edit','hr.sensitive') AND p."code"='FINANCEIRO'
ON CONFLICT DO NOTHING;

-- 4) Retira RH e folha da Administração e o financeiro do RH e das Compras (cada setor no seu).
DELETE FROM "AccessProfilePermission" ap
USING "AccessProfile" p, "Permission" perm
WHERE ap."profileId"=p."id" AND ap."permissionId"=perm."id"
  AND ((p."code"='ADMINISTRACAO' AND perm."code" IN ('hr.view','hr.create','hr.edit','hr.sensitive'))
    OR (p."code" IN ('RH','COMPRAS') AND perm."code"='finance.view'));

-- Conferência: quem tem contas a pagar e quem tem RH/folha, por perfil.
SELECT p."code" AS perfil,
  bool_or(perm."code"='finance.payables') AS contas_a_pagar,
  bool_or(perm."code"='hr.view') AS rh_folha,
  bool_or(perm."code"='finance.view') AS financeiro_receber
FROM "AccessProfile" p
LEFT JOIN "AccessProfilePermission" ap ON ap."profileId"=p."id"
LEFT JOIN "Permission" perm ON perm."id"=ap."permissionId"
GROUP BY p."code" ORDER BY 1;
