# Módulo Jurídico (EduMaster Pro)

Acervo documental, contratos, imóveis e aluguéis, contratos de polos EAD, processos judiciais/administrativos, inteligência de
processos sofridos (recorrência, causa raiz, prevenção), riscos e seguros, painel e integrações leves com Reitoria e Financeiro.
Prefixo de modelos: `Jur` (`prisma/edu/juridico.prisma`; SQL aditivo, só CREATE, no bloco `JUR:BEGIN/END` de
`prisma/manual-migrations/20261004_edumaster_pro.sql`). Rotas autenticadas em `/api/edu/juridico/*`. Frontend: `/edu/juridico?secao=...` (menu "EduMaster · Jurídico").

> **Aviso**: textos (minuta de contrato de polo), catálogo de causas/recomendações, prazos e regras contábeis (CPC 25) são **modelos de apoio**.
> Devem ser validados por advogado/contador antes de qualquer uso formal. O módulo não substitui assessoria jurídica nem consulta tribunais.

## Quem acessa
| Papel | Leitura | Escrita | Sigilo |
|---|---|---|---|
| `ADMIN/OWNER/RECTOR/BOARD` | tudo | tudo | acesso total |
| `LEGAL` (equipe jurídica; papel do usuário) | tudo | tudo | acesso total |
| `FINANCE`, `SECRETARY` | tudo **exceto** sigilo | — (403) | não vê documentos `confidencial`, processos `CRIMINAL`/`segredoJustica`; CPF/CNPJ das partes mascarado |
| demais (aluno, professor, coordenador...) | 403 | 403 | — |

Todo registro tem `tenantId`; leitura/alteração de outro tenant devolve 404. Referências cruzadas (polo, imóvel, advogado, seguro, documento) são conferidas no tenant (400).
O acesso a processos e partes grava `LgpAcessoSensivel` (categoria `DADO_JUDICIAL` / `ANTECEDENTES_PENAIS`). `audit()` registra criações/alterações/ações.

## Endpoints
| Área | Rotas |
|---|---|
| Painel | `GET /painel`, `GET /alertas?dias=90&tipo=&faixa=`, `GET /meta` |
| Acervo | CRUD `/documentos` (`?categoria&status&q&tags&vencimento=30\|60\|90\|vencido&confidencial`), `GET/POST /documentos/:id/versoes`, `POST /documentos/:id/encerrar` |
| Anexos | `GET /anexos?refType&refId`, `POST /anexos` (`arquivoNome`+`mime`+`arquivoUrl` https **ou** `dataUrl` ≤ 2 MB), `GET /anexos/:id/download`, `DELETE /anexos/:id` |
| Contratos | CRUD `/contratos`, `POST /contratos/:id/{ativar,encerrar,rescindir,renovar}`, `GET /contratos/:id/aditivos` |
| Imóveis | CRUD `/imoveis`, `GET /imoveis-resumo`; CRUD `/locacoes` + `POST /locacoes/:id/{ativar,encerrar,rescindir,renovar,reajustar,parcelas/gerar}`; `GET /parcelas`, `POST /parcelas/:id/{pagar,cancelar}` |
| Polos EAD | CRUD `/contratos-polo` + `{ativar,encerrar,rescindir,renovar}`, `GET /contratos-polo/:id/minuta` (HTML, modelo), `GET /polos/situacao`, `GET /polos/:poloId/situacao` |
| Processos | CRUD `/processos`, `POST /processos/:id/{risco,encerrar,reabrir}`; `/processos/:id/{partes,andamentos,prazos,audiencias}` + `/{partes,andamentos,prazos,audiencias}/:subId`; `GET /prazos`, `GET /audiencias` (agenda), `POST /prazos/:id/{cumprir,perdido,cancelar}`, `POST /audiencias/:id/{realizar,adiar,cancelar}`; `/escritorios`, `/advogados` |
| Inteligência | `GET /inteligencia/{resumo,cruzamento,recomendacoes,indicadores,catalogo}`; CRUD `/planos-prevencao` + `{iniciar,concluir,cancelar}`, `POST /planos-prevencao/:id/acoes`, `POST /planos-acoes/:id/status`, `GET /planos-prevencao/:id/efetividade` |
| Riscos e seguros | CRUD `/riscos`, `GET /riscos-matriz[?residual=true]`, `GET /riscos-sem-cobertura`; CRUD `/seguros` + `POST /seguros/:id/{renovar,cancelar}`; `POST /seguros/:id/sinistros`, `GET /sinistros`, `POST /sinistros/:id/status` |
| Integrações | `GET /reitoria/resumo` (indicadores com nível ok/atenção/crítico), `GET /financeiro/provisoes`, `GET /financeiro/obrigacoes?dias=` |

A situação (`status`) de contratos, locações, contratos de polo e seguros **não muda pelo PUT** (422): use as ações dedicadas.

## Regras principais
- **Alertas de vencimento 30/60/90 dias** (documentos, contratos, locações, contratos de polo, seguros): `EduReminder` com `dedupeKey` (`jur:<tipo>:<id>:<limite>:<data>`), agendados ao salvar e reavaliados pelos jobs `juridico.vencimentos` e `juridico.prazos` (cron `/api/cron/edu`). Se o limite já foi cruzado, gera 1 lembrete imediato; vencido = lembrete CRÍTICO. Prazos processuais: 7/3/1 dias; audiências 7/1; planos de prevenção 30/7; parcelas de aluguel pago 5/1.
- **Documentos**: nova versão torna a anterior `SUBSTITUIDA` (vigência encerrada na véspera) e o documento herda a vigência. Código automático `JUR-DOC-AAAA-NNNN` (idem `CTR`, `LOC`, `POL`, `RSK`).
- **Locações**: parcelas mensais geradas da vigência (idempotente, último dia do mês quando o dia não existe); atrasada = aberta vencida. **Reajuste**: o índice acumulado (IGP-M/IPCA...) é **informado pelo usuário** (sem consulta externa); recalcula as parcelas em aberto e bloqueia novo reajuste em < 12 meses.
- **Polos**: `poloId` refere `ModPolo` (modalidades/polos.ts). Ativar exige direitos/deveres das partes, condições de rescisão e comissionamento; não permite dois contratos vigentes sobrepostos no mesmo polo. `GET /polos/situacao` cruza polos × contrato vigente × alunos ativos (`ModPoloAluno`), estima a comissão (fixo/por aluno) e avisa de polo credenciado sem contrato ou contrato com polo suspenso. Patrimônio cedido aceita `bemId` de `InfBem` (validado no tenant).
- **Processos**: número CNJ validado (20 dígitos + dígito verificador mod 97) e normalizado; único por tenant. `sofrido` = instituição ré/investigada. **Provisão só para risco PROVÁVEL** (CPC 25): possível = passivo contingente (divulgação), remoto = nada; mudar o risco reverte a provisão e grava `JurProvisaoHist`. Encerrar baixa a provisão e cancela prazos/audiências abertos; processo encerrado não é editado (reabrir exige motivo).
- **Inteligência**: considera processos sofridos (`?sofridos=false` inclui os demais). Recorrente = ≥ 3 em 12 meses **ou** ≥ 2 nos últimos 90 dias; tendência alta/estável/queda/nova versus os 12 meses anteriores; ranking por volume, valor, recorrência e tendência; cruzamento de duas dimensões; causas prováveis e recomendações vêm de `CATALOGO_CAUSAS` (regras, não IA). Plano de prevenção exige responsável, guarda as ocorrências-base e só conclui com todas as ações concluídas/canceladas; `efetividade` compara antes × depois.
- **Riscos**: score = probabilidade × impacto (1–25): ≤ 4 baixo, 5–9 médio, 10–15 alto, ≥ 16 crítico; alto/crítico exigem responsável; risco residual não pode superar o inerente; mitigado/aceito exigem controles ou plano. **Seguros**: sinistro só dentro da vigência; indenização ≤ limite da apólice; renovar cria nova apólice, marca a antiga `RENOVADO` e reaponta os riscos.
- **Uploads**: o corpo passa pelo `uploadGuard` global (executáveis/scripts recusados com 422, URLs só https sem rede interna). O arquivo em `dataUrl` fica em `JurAnexo.dataUrl` (listagens nunca o devolvem; download com `attachment` + `nosniff`).

## Seed e testes
- Seed: `scripts/seeds/juridico.ts` → `seedJuridico(api, ctx)` (estilo do `edu-demo-seed.ts`, que **não** foi alterado). Pode ser chamado de dentro do seed principal (`await seedJuridico(c.api, c)`) ou isolado: `DATABASE_URL=... API_URL=http://localhost:3000/api npx tsx scripts/seeds/juridico.ts`. Dados fictícios (números CNJ com dígito válido, mas inexistentes). Cria usuário `juridico@suainstituicao.edu.br` (papel `LEGAL`, senha `Demo@2026`).
- E2E: `DATABASE_URL=postgresql://USUARIO:SENHA@127.0.0.1:5432/jur npx tsx scripts/e2e/juridico.ts` (banco local próprio com `prisma db push`; 333 verificações: funções puras, permissões, sigilo, isolamento por tenant, upload guard, ciclos, processos, inteligência, riscos/seguros, painel, jobs, seed).
- Validação de tipos: `bash scripts/edu-check.sh juridico`.

## Limites
Não consulta tribunais (CNJ/PJe), índices econômicos nem seguradoras; não envia e-mail próprio (lembretes ficam no `EduReminder`/Minha mesa); não gera peças processuais nem substitui a assinatura eletrônica; a "inteligência" é estatística/regra simples sobre o que foi cadastrado (qualidade depende da classificação da causa raiz).
