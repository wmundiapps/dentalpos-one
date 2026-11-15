# Escritório de Contabilidade — bloco portátil

Este diretório reúne o **escritório de contabilidade** do EduMaster Pro como um bloco **separado e portátil**, para ser plugado depois em
outros sistemas (CompletoDonto, Cashbacksmart, Studiobeautybarber...). Ele é feito em duas partes que convivem em `modules/contabil/`:

- **Parte 1 (fiscal/financeiro)** — empresas, regime fiscal, notas, guias, contas a pagar/receber, cobrança, conciliação e DRE
  (modelos `Ctb*` em `prisma/edu/contabil-fiscal.prisma`). _A documentação dessa parte está na seção "Parte 1" logo abaixo._
- **Parte 2 (esta seção)** — abertura de empresas, RH/Departamento Pessoal, imposto de renda e Assistente Contábil.

<!-- CTB1:BEGIN (seção da parte 1: não apague ao editar a parte 2) -->

## Parte 1 — Fiscal, financeiro e contabilidade (empresas, regime, notas, guias, contas, conciliação, DRE)

> **HONESTIDADE:** nada aqui é integrado de verdade com Receita Federal, SEFAZ, prefeituras, Ambiente Nacional da NFS-e, bancos ou
> Simples Nacional/PGDAS. A emissão de notas, as guias (DARF, DAS, GPS/INSS, FGTS Digital, ISS) e o envio de cobranças são **SIMULAÇÕES**,
> marcadas como tal na API (`simulacao: true`), nos documentos imprimíveis (marca d'água) e nas telas. Os cálculos são **estimativas**, as
> alíquotas e limites são parâmetros de referência (`regime/tabelas.ts`) que **precisam ser conferidos por um contador**, e nada tem valor
> fiscal. Cada tela mostra a faixa fixa: _"Este sistema não substitui um contador. Cálculos e guias são estimativas/simulações; valide com
> seu contador antes de enviar ou pagar. Seus dados são tratados conforme a LGPD."_
>
> Nota de vocabulário: "corona", no pedido original, é **COFINS** (Contribuição para o Financiamento da Seguridade Social). Ela aparece como COFINS nas guias, no calendário e nas telas.

### O que existe

| Pasta | Conteúdo |
|---|---|
| `adapter/` | **Interface única com o hospedeiro** (`ContabilAdapter`): contexto (tenant/usuário/cargo), cargo → papel contábil, nomes de usuários, nome da instituição e (opcional) lista de entidades para importar como empresas. `edumaster.ts` é a implementação do EduMaster e o **único** arquivo que lê tabelas do hospedeiro (`User`, `Clinic`). |
| `nucleo/` | `db.ts` (re-exporta o `prisma` do hospedeiro: segundo e último ponto de acoplamento), `http.ts` (erros, validação, paginação, handler de erros), `rbac.ts` (papéis e permissões), `auditoria.ts` (trilha própria `CtbAuditoria`), `sequencia.ts` (numeração atômica), `util.ts`, `html.ts` (documentos imprimíveis), `extenso.ts` (valor por extenso). |
| `empresas/` | Cadastro multi-empresa (CNPJ/CPF com dígito verificador, regime atual, CNAE, UF/município, ISS), importação de entidades do hospedeiro, papéis (`/membros`) e auditoria (`/auditoria`). |
| `regime/` | **Recomendador de regime**: `tabelas.ts` (alíquotas versionadas por vigência), `cnae.ts` (CNAE → atividade), `calculo.ts` (funções puras: MEI, Simples anexos I–V com fator R, Presumido, Real, alertas de limite e memória de cálculo), `routes.ts`. |
| `notas/` | NF-e/NFS-e/NFC-e de entrada e saída, emissão **simulada** com numeração, cancelamento, importação local de XML, espelho imprimível, recibos numerados com valor por extenso, vínculo com contas a pagar/receber. `provedor.ts` = ponto de extensão para emissão real. |
| `guias/` | Cálculo real a partir dos lançamentos (`calculo.ts`), guias SIMULADAS (código de barras fictício marcado "SIMULAÇÃO"), calendário de vencimentos com avisos, relatório imprimível. |
| `financeiro/` | Contas a pagar/receber (com lançamento contábil automático), régua de cobrança (`cobranca.ts`, simulada, com `ProvedorCobranca`), segunda via, contas bancárias, importação de extrato OFX/CSV e conciliação com sugestão automática (`conciliacao.ts`). |
| `contabilidade/` | Plano de contas padrão, lançamentos em partidas dobradas (com estorno), balancete, DRE mensal/período/comparativa, exportação CSV e HTML imprimível. |
| `dashboard/` | Indicadores do escritório, série de 12 meses, próximos vencimentos e alertas. |
| `routes.ts` | Roteador da parte 1, montado em `/api/edu/contabil` (junto com `ctb2.routes.ts`). Registra o adapter e aplica o papel contábil em todas as rotas. |

Modelos Prisma: `prisma/edu/contabil-fiscal.prisma` (16 modelos `Ctb*`, **sem `@relation` para tabelas do hospedeiro**: só `tenantId`,
`userId` e ids como `String`). Migração manual idempotente (somente CRIA): bloco `CTB:BEGIN/END` em
`prisma/manual-migrations/20261004_edumaster_pro.sql`. Frontend: `frontend/src/edu/contabil/*Tab.tsx` + `abas.tsx` (registro das abas) +
`kit.tsx` (único acoplamento: cliente HTTP e token) e a página `pages/edu/EduContabil.tsx` (rota `/edu/contabil?aba=`).

### Como plugar em outro sistema (CompletoDonto, Cashbacksmart, Studiobeautybarber...)

1. **Banco**: copie `prisma/edu/contabil-fiscal.prisma` (e o da parte 2) para o schema do sistema e rode a migração (`CTB:BEGIN/END` do SQL manual, ou `prisma migrate`). Não há chave estrangeira para tabelas do hospedeiro.
2. **Código**: copie `backend/src/modules/contabil/` e ajuste só estes pontos:
   - `nucleo/db.ts` → exporte o `prisma` (e o namespace `Prisma`) do seu sistema;
   - `adapter/<seu-sistema>.ts` → implemente `ContabilAdapter` (veja `adapter/tipos.ts`):
     `contexto(req)` devolve `{ tenantId, userId, cargo }`; `mapearCargo(cargo)` devolve `'GESTOR' | 'CONTADOR' | 'FINANCEIRO' | 'LEITOR' | 'NEGAR' | null`;
     `nomesUsuarios`, `nomeInstituicao` e, opcionalmente, `listarEntidades/obterEntidade` (para importar clientes/fornecedores do sistema como empresas);
   - `routes.ts` → troque `definirAdapter(adapterEduMaster)` pelo seu adapter e monte o router (`app.use('/api/contabil', router)`) **depois** do seu middleware de autenticação (que preenche `req.user`/equivalente conforme o adapter);
   - parte 2: `host2.ts` (ver seção abaixo).
3. **Frontend**: copie `frontend/src/edu/contabil/` e `pages/edu/EduContabil.tsx`; reescreva `kit.tsx` (constante `C`, cliente `api` e leitura do token) e adicione a rota e o item de menu "Contabilidade". As telas usam MUI; troque `EduShell` por seu cabeçalho de página, se necessário.
4. **Acesso**: registre o módulo `contabil` na matriz de acesso do seu sistema, se houver. Aluno/professor (ou equivalentes) devem mapear para `'NEGAR'`.
5. **Dados de demonstração**: `backend/scripts/seeds/contabil-fiscal.ts` → `seedContabilFiscal(api, ctx)` usa só a API HTTP.

### Papéis e segurança

- **GESTOR**: tudo (cargos de gestão do hospedeiro) e designa papéis; **CONTADOR**: tudo, exceto designar papéis; **FINANCEIRO**: contas a pagar/receber, cobrança, conciliação, emissão de notas e recibos e baixa de guias — não gera guias, não lança manualmente, não cancela notas, não troca regime; **LEITOR**: só consulta.
  Aluno e professor **nunca** acessam (mesmo se designados). Cargos sem papel recebem 403 com orientação. Designação explícita (`CtbMembro`) prevalece sobre o cargo, exceto para gestores do hospedeiro.
- Isolamento por tenant em toda consulta; recursos de outro tenant respondem 404 (inclusive `empresaId` de outro tenant em qualquer rota).
- Validação com `zod` (valores, datas, CNPJ/CPF, competência, tamanho de arquivos); XML com `DOCTYPE`/entidades é recusado; limites de tamanho em XML (1,5 MB) e extratos (2,5 MB / 5.000 linhas).
- **Auditoria** (`CtbAuditoria`, sem XML nem conteúdo bruto): emitir/cancelar/importar nota, gerar/pagar/cancelar guia, conciliar/ajustar/ignorar extrato, lançar/estornar, trocar regime, simular, alterar histórico, designar papéis, cobranças.
- Nenhum segredo no código. Certificado digital, credenciais bancárias ou de provedores **não existem aqui** (ver pontos de extensão).

### Recomendador de regime (resumo)

Entrada: histórico de 12 meses (informado manualmente em `CtbHistoricoMensal`, ou derivado dos lançamentos contábeis, ou das notas de saída) + atividade (CNAE).
Saída: para MEI, Simples Nacional (anexos I–V, **fator R** de 28%), Lucro Presumido e Lucro Real: elegibilidade, tributos linha a linha, total anual, % da receita, **memória de cálculo** e
alertas (MEI R$ 81 mil e tolerância de 20%, Simples R$ 4,8 milhões e sublimite de R$ 3,6 milhões, fator R próximo do limite, histórico incompleto/anualizado).
Sempre acompanha a ressalva de que é **estimativa** e a versão/situação das tabelas usadas. Não considera créditos específicos, benefícios, prejuízos fiscais, vedações por CNAE nem particularidades do município.

### Tabelas fiscais (parametrizadas e versionadas)

`regime/tabelas.ts` (`TABELAS_VERSOES`): cada versão tem `vigenteDesde`, `situacao` (**"REFERÊNCIA — NÃO CONFERIDA POR CONTADOR"**) e as fontes legais para conferência
(LC 123/2006, Leis 9.249/95 e 9.430/96, PIS/COFINS, LC 116/2003, Lei 8.212/91, FGTS, tabela do IRPF). `tabelasVigentes(data)` escolhe a versão da competência calculada; cada guia e cada simulação guardam a `versaoTabelas`.
Para atualizar: acrescente uma nova versão (mantenha as antigas). Os códigos de receita das guias (ex.: PIS 8109/6912, COFINS 2172/5856, IRPJ 2089/0220, CSLL 2372/6012, IRRF 0561, carnê-leão 0190) também são **referência a conferir**.

### Pontos de extensão para integração real (hoje só existem implementações SIMULADAS)

- `notas/provedor.ts` — `ProvedorFiscal { emitir(), cancelar() }` + `definirProvedorFiscal()`. Uma integração real exige **certificado digital A1**, assinatura do XML, webservices da SEFAZ/prefeitura/Ambiente Nacional, contingência e eventos. O certificado e a senha **nunca** devem ir para o código ou para o banco em texto puro (use cofre/variáveis de ambiente).
- `financeiro/cobranca.ts` — `ProvedorCobranca { enviar() }` + `definirProvedorCobranca()` (SMTP, API do WhatsApp Business...). Hoje a mensagem é só registrada (`status: SIMULADO`).
- Guias: não há emissão oficial. Para integrar PGDAS-D/DARF/GPS/FGTS Digital seria necessário certificado digital e os serviços oficiais; o código de barras gerado é fictício (começa com `0`, DV propositalmente inválido, rótulo "SIMULAÇÃO").
- Conciliação: importação por **arquivo** (OFX/CSV). Open Finance/API bancária não existe aqui.

### Seed e testes

- `backend/scripts/seeds/contabil-fiscal.ts` — `seedContabilFiscal(api, ctx)`: 4 empresas fictícias (Simples serviços de saúde, Simples com fator R baixo, Lucro Presumido comércio, MEI perto do limite), 12 meses de contas a pagar/receber (que geram lançamentos, balancete e DRE), notas, recibos, guias (algumas pagas, uma atrasada), extratos OFX/CSV para conciliar e régua de cobrança. Idempotente. Precisa de uma `api(method, path, body?)` autenticada como GESTOR/CONTADOR (ADMIN serve); `ctx.apiAs('FINANCE')` é opcional (cobrança e conciliação passam a ser feitas pelo financeiro). Cerca de 600 chamadas HTTP: se a API tiver limite de requisições (`API_RATE_LIMIT_MAX`), execute o seed de forma isolada.
- `backend/scripts/e2e/contabil-fiscal.ts` — RBAC, isolamento de tenant, validações, casos de teste de cálculo (MEI, Simples I–V, fator R, Presumido, carnê-leão), guias, notas, régua, conciliação OFX/CSV, plano/lançamentos, DRE, dashboard, auditoria e o seed. Uso: `DATABASE_URL=postgresql://postgres:pg@127.0.0.1:5432/contabil_e2e npx tsx scripts/e2e/contabil-fiscal.ts` (Postgres local com `prisma db push`).

<!-- CTB1:END -->

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
