# Escritório de Contabilidade — bloco portátil

Este diretório reúne o **escritório de contabilidade** do EduMaster Pro como um bloco **separado e portátil**, para ser plugado depois em
outros sistemas (CompletoDonto, Cashbacksmart, Studiobeautybarber...). Ele é feito em duas partes que convivem em `modules/contabil/`:

- **Parte 1 (fiscal/financeiro)** — empresas, regime fiscal, notas, guias, contas a pagar/receber, cobrança, conciliação e DRE
  (modelos `Ctb*` em `prisma/edu/contabil-fiscal.prisma`). _A documentação dessa parte fica na sua própria seção, acima/abaixo desta._
- **Parte 2 (esta seção)** — abertura de empresas, RH/Departamento Pessoal, imposto de renda e Assistente Contábil.

<!-- CTB2:BEGIN (seção da parte 2: não apague ao editar a parte 1) -->

## Parte 2 — Societário, RH/DP, Imposto de renda e Assistente Contábil

> **HONESTIDADE:** nada aqui é integrado de verdade com Receita Federal, Junta Comercial, SEFAZ, prefeituras, Corpo de Bombeiros,
> vigilância sanitária ou eSocial. Tudo que "fala" com um órgão público é **SIMULAÇÃO** (protocolos, CNPJ, IE, IM, alvarás, eventos do
> eSocial, recibo de transmissão do IR), marcado como tal na API (`simulado: true`) e na tela. Os cálculos (folha, 13º, férias, rescisão,
> IRPF) são **estimativas a conferir**. Não há valor legal. Cada tela mostra a faixa: _"Este sistema não substitui um contador. Cálculos e
> guias são estimativas/simulações; valide com seu contador antes de enviar ou pagar. Seus dados são tratados conforme a LGPD."_

### Estrutura

| Pasta | Conteúdo |
|---|---|
| `host2.ts` | **Único** ponto de contato com o hospedeiro: autenticação/papéis, Prisma, tenant e usuário, notificação, job, auditoria. Reescreva este arquivo para portar. |
| `util.ts`, `parametros.ts` | Utilitários puros (CPF/CNPJ, datas, mascaramento) e tabelas fiscais **versionadas por vigência** (INSS, IRRF, IRPF anual, salário mínimo, FGTS). |
| `societario/` | CNAEs (~190, com busca e sinalizadores de anexo do Simples, ISS/ICMS, risco, licenças e MEI), regras por tipo societário, viabilidade (simulada), minutas imprimíveis, provedor de registro (simulado) e rotas. |
| `rh-dp/` | Vagas/candidatos/funil, admissão (checklist, ASO, eSocial S-2200 simulado), folha mensal, 13º, férias, afastamentos, rescisão (todos os tipos), holerite e termo imprimíveis, eSocial simulado. |
| `imposto-renda/` | IRPF (completa x simplificada, restituição/pagamento, parcelamento), malha de inconsistências (checagens simples), anexos de comprovantes, transmissão **simulada** com recibo fictício, retificadora, PJ (estimativa) e calendário de obrigações (ECD, ECF, DCTF, EFD, DEFIS, DASN-SIMEI). |
| `assistente/` | Assistente Contábil: base de conhecimento local, motor de regras, contexto da empresa, recusa de pedidos sensíveis, fila de revisão do contador, retenção LGPD e ponto de extensão para LLM externo. |
| `ctb2.routes.ts` | Roteador único montado em `/api/edu/contabil` (`/societario`, `/rh-dp`, `/imposto-renda`, `/assistente`). |

Modelos Prisma: `prisma/edu/contabil-societario.prisma` (prefixos `CtbSoc`, `CtbDp`, `CtbIr`, `CtbAs`, `CtbParam`, `CtbAudit2`; **sem `@relation` para tabelas do EduMaster**,
só `tenantId`/`userId`/`empresaId` como `String`). Migração manual idempotente: bloco `CTB2:BEGIN/END` em
`prisma/manual-migrations/20261004_edumaster_pro.sql` (somente CRIA; 27 tabelas). Frontend: `frontend/src/edu/contabil/{comum2,societario,rh-dp,imposto-renda,assistente}/`
e páginas `pages/edu/EduContabil{Abertura,RhDp,Ir,Assistente}.tsx` (rotas `/edu/contabil/abertura|rh-dp|imposto-renda|assistente`).

### A empresa do cliente (`EmpresaRef`)

Este bloco referencia a empresa do cliente **apenas por um `empresaId` string** (+ "foto" do nome em `empresaNome`). Existe a interface
mínima `EmpresaRef { id, nome, documento?, regime?, municipio?, uf? }` em `host2.ts`. Para integrar ao cadastro de empresas da parte fiscal
(ou de qualquer outro sistema), registre um provedor na inicialização:

```ts
import { registrarEmpresaProvider } from './host2'
registrarEmpresaProvider(async (tenantId, empresaId) => { /* buscar no cadastro real */ return { id: empresaId, nome: '...', documento: '...' } })
```

Sem provedor, o nome vem das "fotos" guardadas neste bloco. `GET /societario/empresas-ref` lista as empresas conhecidas para os seletores.

### Papéis e segurança

- Papéis contábeis iguais aos da parte fiscal (`nucleo/rbac.ts` + `adapter`): **GESTOR** (cargos de gestão do hospedeiro ou designado), **CONTADOR** (`ACCOUNTANT`/`CONTADOR` ou designado), **FINANCEIRO** (`FINANCE`) e **LEITOR**; designação explícita (`CtbMembro`) prevalece sobre o cargo.
  Nesta parte: **leitura** = qualquer papel (CPF mascarado para LEITOR); **escrita** (abrir empresas, DP, IR, conversar e pedir revisão) = GESTOR/CONTADOR/FINANCEIRO; **parecer da revisão, configuração do assistente, artigos e retenção** = só GESTOR/CONTADOR;
  **aluno e professor não têm acesso (403)**, nem se forem designados por engano. Cargos sem papel (ex.: COORDINATOR não designado) recebem 403 com orientação para pedir a designação. `host2.ts` aplica essas regras (`porMetodo`, `soLeitura`, `soEscrita`, `soParecer`).
- Módulo de acesso por cargo: `contabil` (catálogo em `modules/acesso/catalogo.ts`; menu e `frontend/src/edu/acesso/modulos.ts`).
- Isolamento por tenant em **toda** consulta (`tenantId` do token); outro tenant recebe 404.
- Validação de entrada com `zod`; CPF/CNPJ com dígito verificador; uploads (comprovantes do IR) passam pelo **uploadGuard global** (varredura de tipo real/malware) e têm limite de tamanho/tipo.
- Auditoria própria (`CtbAudit2`) sem dados pessoais nos detalhes; notificações aos contadores são **genéricas** (sem texto da pergunta nem PII).
- Nenhum segredo no código: o LLM externo só funciona com variáveis de ambiente.

### Provedores (interfaces para integração real futura)

- `societario/provedor.ts` — `ProvedorRegistro { abrir(), avancar() }`. Hoje só existe o `SIMULADO`. Para integrar de verdade, implemente a interface e chame
  `registrarProvedorRegistro(meuProvedor)`; as credenciais devem vir de variáveis de ambiente (`CONTABIL_PROVEDOR_REGISTRO` seleciona o nome).
- `assistente/llm.ts` — `ProvedorLlm`. Variáveis: `CONTABIL_LLM_URL` (endpoint compatível com _chat completions_), `CONTABIL_LLM_API_KEY`, `CONTABIL_LLM_MODEL`, `CONTABIL_LLM_TIMEOUT_MS` (opcional).
  Só é usado se configurado **e** ativado pelo tenant; pedidos sensíveis nunca vão ao modelo; o texto enviado é minimizado (CPF/CNPJ/e-mail/telefone mascarados). Também é possível `registrarProvedorLlm()` por código.
- `imposto-renda/` — a "transmissão" é um recibo fictício. Uma integração real exigiria o programa oficial da Receita e certificado digital; **não é feita aqui**.

### Tabelas fiscais parametrizadas e versionadas

`parametros.ts` traz as vigências padrão (INSS 2025 e 2026, IRRF 2024/2025/2026 com o redutor da Lei 15.270, IRPF anual, salário mínimo, FGTS) como **referência que pode estar desatualizada**.
O escritório cadastra a vigência oficial em `POST /api/edu/contabil/rh-dp/parametros` (ou na aba "Tabelas fiscais"): o cálculo escolhe a versão cuja vigência começou antes da data de referência
e cada folha/rescisão guarda as vigências usadas.

### Assistente Contábil

- Funciona **sem chave externa**: base local (`conhecimento.ts`, ~24 artigos: regimes, guias, prazos, MEI, abertura, folha, férias, rescisão, IR, malha, LGPD...) + regras + dados da empresa selecionada
  (alvarás, funcionários, folha, obrigações, abertura, declarações). A instituição pode acrescentar artigos próprios.
- **Toda** resposta (inclusive vazia, saudação e recusa) termina com o aviso fixo _"Sou um assistente automatizado, não sou contador e esta resposta não substitui orientação profissional; valide com seu contador antes de decidir ou enviar qualquer coisa"_ e o aviso de LGPD; a tela do chat os exibe o tempo todo.
- Pedidos de sonegação/fraude são detectados e **recusados com educação** (com caminhos lícitos); a auditoria guarda só hash e indicadores.
- "Solicitar revisão do contador" cria uma solicitação `PENDENTE`; o contador decide `APROVADO` ou `AJUSTAR` com parecer escrito (humano). CPF/e-mail/telefone digitados são mascarados no registro.
- Retenção configurável por tenant (7 a 3650 dias) com limpeza automática (job `contabil.assistente-retencao` no cron `/api/cron/edu`).

### Como plugar em outro sistema

1. Copie `backend/src/modules/contabil/` (as subpastas desta parte + `host2.ts`, `util.ts`, `parametros.ts`, `ctb2.routes.ts`), `backend/prisma/edu/contabil-societario.prisma`, o bloco `CTB2` da migração e `frontend/src/edu/contabil/` + as 4 páginas.
2. Reescreva `host2.ts` (auth/papéis, `prisma`, tenant/usuário, `notify`, `registerEduJob`) e `frontend/src/edu/contabil/comum2/kit.tsx` (`host` = cliente HTTP e prefixo de rotas).
3. Monte `ctb2.routes.ts` em `/contabil` (autenticado), registre o módulo no controle de acesso do sistema e adicione o submenu "Contabilidade".
4. Registre, se existir, o provedor de empresas (`registrarEmpresaProvider`) apontando para o cadastro de empresas do novo sistema.

### Seed e testes

- Seed idempotente: `backend/scripts/seeds/contabil-societario.ts` → `seedContabilSocietario(api, ctx)` (abertura LTDA em andamento e MEI concluído, alvarás vigente/a vencer/vencido, vagas/candidatos, 5 funcionários, folhas, rescisões, IR PF e PJ em rascunho, calendário de obrigações, conversas e 1 revisão pendente). Não altera `edu-demo-seed.ts`.
- e2e: `backend/scripts/e2e/contabil-societario.ts` (`DATABASE_URL=postgresql://... npx tsx scripts/e2e/contabil-societario.ts`; ~270 verificações: RBAC, tenant, cálculos com casos conhecidos, simulações, assistente e revisão).

<!-- CTB2:END -->
