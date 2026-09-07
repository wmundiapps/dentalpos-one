# CHAT 8 — Integração 5787 — 07/09/2026

Integrado neste snapshot:
- menu compacto e sem duplicações;
- relatórios gerenciais com endpoint real e exportação CSV;
- REVAH como núcleo do CRM/relacionamento;
- DentalPos Sales com loja/desconto e fornecedores afiliados;
- estoque alimentável com estoque mínimo e alerta de reposição;
- acesso visível ao REVAH RH/ponto desktop-only;
- modelos Prisma aditivos para origem/loja/afiliados.

Nenhuma migration destrutiva foi executada.
`prisma migrate dev` não foi usado.
Nenhum deploy foi feito.

A tentativa de criar branch GitHub `revah-rh-integracao-5787` retornou 403
(`Resource not accessible by integration`). O ZIP é a integração consolidada
fora do `main`, pronta para aplicação quando a permissão de escrita for liberada.
