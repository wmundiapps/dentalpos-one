# Contabilidade · Carteira de clientes (`/api/edu/contabil/carteira`)

Banco de clientes e gestão da carteira de um **escritório de contabilidade** (multi-cliente, multi-contador). Bloco **portátil**: depende do sistema hospedeiro só por `host.ts` (tenant, usuário, auditoria, login do portal) e, no front, por `frontend/src/edu/contabil/carteira/host.ts`. Modelos `Ctb*` em `backend/prisma/edu/contabil-carteira.prisma` (sem `@relation`, só `tenantId` e ids em texto); migração idempotente no bloco `CTB3:BEGIN/END` de `manual-migrations/20261004_edumaster_pro.sql`. Telas: `/edu/contabil/carteira` (equipe) e `/edu/contabil/portal` (cliente final). Menu: **EduMaster · Contabilidade > Carteira de clientes**.

> **Este sistema não substitui um contador. Cálculos e guias são estimativas/simulações; valide com seu contador antes de enviar ou pagar. Seus dados são tratados conforme a LGPD.** (faixa fixa em todas as telas)

## O que existe
| Área | Rotas (resumo) |
|---|---|
| Clientes PF/PJ | `GET/POST /clientes`, `GET/PUT /clientes/:id`, `PATCH /clientes/:id/status`, `DELETE` (só prospecto sem movimento), `/contatos`, `/socios`, `/anexos` (+ download), `GET /clientes/opcoes` |
| Importar/exportar | `POST /clientes/importar/previa` (nada é gravado), `POST /clientes/importar` (cria os válidos e devolve relatório de erros em CSV), `GET /clientes/modelo.csv`, `GET /clientes/exportar` |
| Funil comercial | `GET /funil` (kanban + conversão), `/leads` (`PATCH /:id/etapa`, `POST /:id/converter`), `/propostas` (+ `/imprimir`, `/gerar-contrato`), `/contratos` (+ `/enviar-assinatura`, `/assinar`, `/encerrar`, `/imprimir`) |
| Honorários | `GET /honorarios`, `POST /honorarios/gerar` (mensal, idempotente), `/baixar`, `/cancelar`, `/resumo`, `/inadimplencia`; `GET /rentabilidade`; `/apontamentos` (horas) |
| Tarefas e rotinas | `/tarefa-modelos` (+ `/padrao`), `POST /tarefas/gerar`, `/tarefas` (kanban/lista, checklist, `PATCH /:id/status`), `GET /calendario?mes=`, `GET /alertas` |
| Carteira por responsável | `GET /carteira/distribuicao`, `PUT /carteira/capacidade`, `POST /carteira/reatribuir` (lote), `GET /carteira/saude`, `GET /clientes/:id/saude`, `GET/POST/DELETE /clientes/:id/vinculo-fiscal` |
| Comunicação | `/clientes/:id/interacoes`, `/modelos-msg` (variáveis `{{cliente}}`, `{{valor_honorario}}`…), `POST /clientes/:id/enviar` (**SIMULADO**), `POST /clientes/:id/nps`, `GET /nps/resumo` |
| Relatórios | `GET /relatorios` e `/relatorios/:chave?format=json|csv|html` (carteira por regime/segmento/responsável, receita recorrente, inadimplência, funil, produtividade, clientes em risco, rentabilidade) |
| Painel | `GET /dashboard` (clientes ativos, MRR, inadimplência, tarefas atrasadas, guias na semana, leads, em risco, churn, NPS) |
| Portal do cliente | `/portal/resumo|guias|honorarios|documentos|pendencias|mensagens|nps|meus-dados`; lado do escritório: `/clientes/:id/portal/acesso`, `/caixa-documentos`, `/clientes/:id/mensagens-portal`, `/clientes/:id/guias` |
| LGPD | `/clientes/:id/lgpd` (base legal/consentimento), `/lgpd/acessos`, `/clientes/:id/lgpd/exportar|anonimizar|excluir`, `/lgpd/retencao` |
| Config | `GET/PUT /config`, `GET /meta` |

## Papéis e isolamento
* **Sócios/gestão**: `ADMIN, OWNER, RECTOR, BOARD, GESTOR_CONTABIL` — tudo, inclusive reatribuição, LGPD (exportar/anonimizar/excluir) e configuração.
* **Contador** (`CONTADOR`; `ACCOUNTANT` do bloco fiscal é tratado como o mesmo papel) e **analista** (`ANALISTA_CONTABIL`): enxergam **somente a própria carteira** (cliente em que são responsável ou analista); o analista não cria cliente, não muda status/responsável e não vê honorários. **Financeiro** (`FINANCE`): lê a carteira e opera honorários.
* **`CLIENTE_CONTABIL`** (cliente final): só `/portal/*`. O cliente vem **sempre** do vínculo `CtbPortalAcesso` do usuário logado (nenhum id de cliente é aceito na entrada). Além disso `bloqueioClienteContabil` (em `routes/index.ts`) responde **403 a toda a API fora do portal** (mínimo para o shell: `acesso/meus-modulos` e `core/branding`). Revogar o acesso vale na hora (o token continua válido, o vínculo não).
* `STUDENT`, `TEACHER` e demais cargos: 403. Tudo filtrado por `tenantId`; recurso de outro tenant/carteira responde 404.
* Catálogo de acesso por cargo: módulo `contabil` e cargos `GESTOR_CONTABIL, CONTADOR, ANALISTA_CONTABIL, CLIENTE_CONTABIL` em `acesso/catalogo.ts`.

## Honestidade: o que é simulado
* **Assinatura de contrato**: provedor `SIMULADO` (`ProvedorAssinatura`) — gera hash e marca `simulada: true`; **sem valor jurídico**. O contrato impresso é um modelo genérico a revisar com assessoria jurídica.
* **E-mail/WhatsApp**: `ProvedorMensagem` padrão **SIMULADO** — registra o envio no histórico (`simulada: true`) e não envia nada. Interações (ligação, reunião…) são registros manuais.
* **Guias**: lançadas à mão (`CtbCarGuia`) ou lidas do módulo fiscal (guias já marcadas como simulação lá). Valores são estimativas.
* **Prazos dos modelos de rotina** são ilustrativos: confirmar o calendário oficial com o contador.
* **Retenção**: padrão de 5 anos após o encerramento (configurável). Não é parecer jurídico: ajuste ao que seu escritório precisa guardar.
* Integrações reais entram implementando `FiscalProvider`, `ProvedorMensagem` e `ProvedorAssinatura` (`provedores.ts`) e chamando `registrar*()` na inicialização.

## Módulo fiscal (adapter)
`provedores.ts` define `FiscalProvider` (guias e pendências por cliente, localizar empresa por CNPJ). Padrão = camada **LOCAL** (`CtbCarGuia`). `integracaoFiscal.ts` (registrado em `edu.routes.ts`) liga a carteira ao módulo fiscal do escritório: `CtbCliente.empresaId` → `CtbEmpresa.id`; clientes vinculados passam a ler `CtbGuia`. Sem o módulo fiscal (ou se ele falhar) a carteira **degrada** para a camada local e a API informa `degradado: true`. O vínculo é feito na ficha do cliente (busca pelo CNPJ/CPF) ou por `POST /clientes/:id/vinculo-fiscal`. Em outro produto: não registre a integração, ou escreva outra.

## Regras de negócio que valem saber
* **CPF/CNPJ** validados pelos dígitos (inclui o **CNPJ alfanumérico** de 2026); documento único por tenant; some na anonimização.
* **Funil**: lead → (converter exige CPF/CNPJ válido) cliente *prospecto* → proposta (rascunho → enviada → aceita) → contrato (rascunho → aguardando assinatura → **vigente** só com as duas assinaturas simuladas) → cliente *ativo* e lead *ativo*. Ativar lead sem contrato vigente é recusado (409). Um cliente só tem um contrato vigente.
* **Honorários**: gerar a competência cria uma cobrança por contrato vigente de cliente ativo (chave contrato+competência: não duplica); valor com **reajuste anual composto** (`reajusteMes` + `reajustePercentual`); “atrasado” é derivado. **MRR** = contratos vigentes de clientes ativos. **Rentabilidade** = honorário − horas apontadas × custo-hora (configurável).
* **Saúde do cliente** (0–100): tarefas atrasadas, guias vencidas/a vencer, documentos do mês anterior faltando, honorário em atraso, tempo sem contato, NPS baixo e pendências do módulo fiscal. RISCO < 55, ATENÇÃO 55–79.
* **Portal**: o cliente envia documentos (tipo/competência) para a caixa de entrada; a checagem de pendências compara com os `documentosEsperados` da configuração. Limite de 60 envios/dia e 3 MB; tipos permitidos por lista, e o `uploadGuard` global varre o corpo (tipo real, malware).
* **LGPD**: acessos a dados pessoais registrados (`CtbLgpdAcesso`, visualização repetida em 10 min vira um registro); exportação do titular em JSON (sem os arquivos); **anonimização** (confirmação + motivo) remove nome, documento, contatos, sócios, anexos, interações, mensagens e documentos do portal e mantém contratos/honorários/guias (obrigação legal) sem identificar o titular; **exclusão** definitiva só após a retenção (ou prospecto sem movimento), senão 409 `RETENCAO_ATIVA`.
* Auditoria (`EduAuditEvent`, módulo `contabil-carteira`) de ações sensíveis: importação, reatribuição, baixa/cancelamento, contratos, acesso ao portal, LGPD. Logs não guardam senhas nem texto de mensagens.

## Seed e testes
* Seed idempotente `backend/scripts/seeds/contabil-carteira.ts` → `seedContabilCarteira(api, ctx)` (~25 clientes, funil, contratos assinados em modo simulado, honorários de 3 meses com pagos e atrasados, guias, tarefas, horas, interações, modelos, NPS e o cliente-portal de demonstração). `criarEquipeContabilDemo(prisma, …)` cria os logins da equipe. Não altera o `edu-demo-seed.ts` (ver o relatório de entrega para integrar).
* e2e `backend/scripts/e2e/contabil-carteira.ts` (303 verificações: CPF/CNPJ, RBAC, escopo por responsável, tenant, CSV, funil/contratos, honorários/MRR/reajuste, tarefas, adapter fiscal, portal, LGPD, relatórios, seed).

  ```
  DATABASE_URL=postgresql://postgres:pg@127.0.0.1:5432/ctb_e2e npx prisma db push
  DATABASE_URL=… npx tsx scripts/e2e/contabil-carteira.ts
  ```

## Limites conhecidos
Sem envio real de e-mail/WhatsApp, sem assinatura eletrônica real, sem importação de guias de órgãos oficiais; arquivos do portal/anexos ficam no banco (data URL, 3 MB cada) — para volume grande, troque por armazenamento de objetos. A geração mensal de honorários/rotinas é acionada por botão/endpoint (não há agendador automático nesta entrega).
