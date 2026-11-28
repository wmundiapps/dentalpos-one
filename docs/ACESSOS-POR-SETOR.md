# Acessos por setor (CompletoDonto)

Regra de 27/11/2026 (decisão do Robson): **Contas a pagar, Folha de pagamento e RH ficam só com o Financeiro** (mais administrador e gestor). Cada setor vê só o que é do seu trabalho.
Quem muda o setor de um usuário: Configurações > Permissões.

| Setor (perfil) | O que vê | Contas a pagar | RH e folha |
|---|---|---|---|
| ADMIN / GESTOR | tudo | sim | sim |
| FINANCEIRO | Financeiro completo, contábil, pacientes (leitura) | **sim** | **sim** |
| CONTADOR | Financeiro e contábil (leitura/edição contábil) | sim | não |
| RH | RH (próprio setor), documentos | não | sim (só o próprio RH) |
| RECEPCAO | Agenda, pacientes, a receber/cobranças, marketing (leitura) | não | não |
| DENTISTA | Agenda (leitura), pacientes, clínico, laboratório | não | não |
| AUXILIAR | Agenda, pacientes, clínico e laboratório (leitura) | não | não |
| LABORATORIO | Laboratório e design | não | não |
| ADMINISTRACAO | Agenda, pacientes, a receber, documentos, configurações (leitura) | não | **não (retirado)** |
| COMPRAS | Loja/estoque | não | não |
| MARKETING / VENDAS / MARKETPLACE / EDUCACIONAL / JURIDICO | cada um o seu módulo | não | não |
| PONTO | só ponto | não | não |

Como funciona no sistema:
- Permissão nova `finance.payables` (contas a pagar). Sem ela, a pessoa não vê despesas na lista nem no painel financeiro e não consegue lançar, baixar, editar ou cancelar despesa; o item "Contas a Pagar" some do menu.
- RH e folha usam as permissões `hr.*` (e o cofre do RH com login próprio).
- SQL para aplicar nos perfis que já existem: `backend/prisma/manual-migrations/20261127_acessos_por_setor.sql`.
