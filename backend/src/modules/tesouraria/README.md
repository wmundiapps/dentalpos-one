# Módulo Tesouraria / Financeiro Edu (EduMaster Pro)

Contas bancárias e caixa, recebimentos (boleto, Pix, cartão, dinheiro, transferência e **permuta**), bolsas/descontos na mensalidade, recibos,
notas fiscais, **contas a pagar com conferência e autorização**, remessa de pagamentos (CNAB 240 / Pix em lote), importação de extrato (OFX/CSV)
com conciliação, integração com a folha, fluxo de caixa projetado e DRE. Prefixo de modelos: `Tes` (`prisma/edu/tesouraria.prisma`; SQL aditivo no
bloco `TES:BEGIN/END` de `prisma/manual-migrations/20261004_edumaster_pro.sql`, somente `CREATE`). Rotas: **`/api/edu/tesouraria`**.

O módulo **não altera** as tabelas do financeiro legado (`AccountPayable`, `AccountReceivable`, `PaymentTransaction`, `AccountingEntry`...): ele as
alimenta, de modo que o DRE/fluxo de caixa existentes (`/api/edu/financeiro/reports/*`) continuam válidos. Os dados novos (desconto/bolsa do recebível,
workflow do título, permutas...) ficam em tabelas `Tes*` que referenciam os ids legados por `String` (sem `@relation`).

## Papéis e segregação de funções
| Papel | O que faz |
|---|---|
| `FINANCE` | lança títulos, recebe, concilia, gera/envia remessas, importa extrato/folha, lança notas, emite recibos |
| `COORDINATOR` | **só confere e autoriza** (fila de conferência), aprova permutas, desfaz conciliação; lê painel/relatórios; não cria títulos |
| `ADMIN/OWNER/RECTOR/BOARD` | tudo, inclusive definir alçadas (somente diretoria) |
| demais papéis / alunos | 403 |

Regras (códigos de erro em `code`): `SEGREGACAO` (quem lançou não confere nem autoriza o próprio título; quem registrou a permuta não a aprova),
`ALCADA` (valor acima da faixa do papel), `DUPLA_APROVACAO` (o segundo aprovador deve ser outra pessoa), `TRANSICAO_INVALIDA`, `INTEGRIDADE`,
`2FA_REQUERIDO/2FA_INVALIDO/2FA_NAO_CONFIGURADO`. Toda ação grava `TesTituloEvento` (trilha do título, com usuário e papel) **e** `audit()` global (`EduAuditEvent`, módulo `tesouraria`).

## Contas a pagar: máquina de estados
```
RASCUNHO -> CONFERIDO -> AUTORIZADO -> ENVIADO_BANCO -> PAGO -> CONCILIADO
   |  ^         |  \_ REJEITADO -> (editar) RASCUNHO         (AUTORIZADO -> PAGO: baixa manual/permuta)
   v  |_________|  \_ devolver -> RASCUNHO                    (ENVIADO_BANCO -> AUTORIZADO: rejeitado pelo banco)
CANCELADO
```
- **Rascunho** pode estar incompleto; a **conferência** exige dados de pagamento válidos (CPF/CNPJ, chave Pix, banco/agência/conta, linha digitável) e devolve `422` com a lista `pendencias`.
- **Autorização** (`POST /titulos/:id/autorizar`): faixa por valor (`TesAlcada`; padrão: até R$ 5.000 coordenação/financeiro, até R$ 20.000 financeiro, acima diretoria com 2 aprovações),
  dupla aprovação acima de `limiteDuplaAprovacao` (config, padrão R$ 20.000), segregação. Ao concluir as aprovações o conteúdo é **congelado** (hash `hashAutorizado`: valor, favorecido, conta, chave, vencimento)
  e cria-se a `AccountPayable` correspondente (entra no fluxo de caixa/DRE legados). Qualquer alteração posterior bloqueia a remessa (`INTEGRIDADE`).
- **2FA** (reautenticação): se `exige2faAcima` estiver configurado (ou a faixa marcar `exige2fa`), autorizar/baixar/enviar remessa acima do valor exige `codigo2fa` (TOTP ou código de recuperação) do próprio usuário; sem 2FA ativo o usuário é barrado.
- Lote para a fila do coordenador: `POST /titulos/lote {acao:'conferir'|'autorizar', ids}` (cada item passa pelas mesmas regras).

## Remessa e provedor bancário
`POST /remessas {contaId, tipo: CNAB240|PIX_LOTE, tituloIds?, dataPagamento?}` reserva os títulos AUTORIZADOS da conta e **gera o arquivo**:
- **CNAB 240** (Febraban Pagamentos, v10.x): header de arquivo/lote, segmento A (+B com chave Pix), segmento J (boletos, aceita linha digitável de 47 dígitos), trailers; um lote por forma (Pix=45, TED=03, crédito em conta=01, boleto=31).
- **Pix em lote**: CSV genérico (`idPagamento;tipoChave;chave;favorecido;documento;valor;...`).
- `POST /remessas/:id/enviar` usa o **provedor** da conta (`provedor`): interface `ProvedorBancario` em `provedor.ts`. **Só existe a implementação `SIMULADO`** (sem rede, sem credenciais; rejeita item cuja conta termina em `0000` ou chave contém `rejeitar`).
  Provedor desconhecido => `424 PROVEDOR_NAO_CONFIGURADO`. Para um banco real, implemente a interface e registre com `registrarProvedor`.
- Retorno: `POST /remessas/:id/consultar-retorno` (provedor) ou `POST /remessas/:id/retorno {conteudo}` (arquivo CNAB 240 de retorno ou CSV `idPagamento;status;motivo`). Pagos viram `PAGO` (baixa, lançamento contábil, saída no banco); rejeitados voltam a `AUTORIZADO` com o motivo.
- Cancelar remessa `GERADA` libera os títulos. Remessa `ENVIADA` só termina com retorno.

> **Limite honesto:** os layouts CNAB variam por banco (convênio, versão, finalidade de TED, câmara). O arquivo é um **modelo Febraban** que precisa de homologação com o banco antes do uso real.

## Recebimentos, bolsas e recibos
- `GET /recebiveis` traz aluno, **ajuste** (bolsa/desconto), `valorDevido` (líquido) e encargos sugeridos (multa 2% + juros 1% a.m. pro rata, modelo).
- **Bolsas automáticas**: ao gerar mensalidades (`POST /recebiveis/gerar-mensalidades`) ou criar recebível (`POST /recebiveis`), aplica-se a bolsa das `ApoConcessaoBolsa` vigentes na data de vencimento (percentual + valor fixo, limitado ao valor). `POST /recebiveis/aplicar-bolsas` reprocessa os em aberto. `GET /bolsas/conferencia` confronta o aplicado com as concessões (divergências: bolsa ausente, bolsa sem concessão, valor diferente). Desconto manual: `PUT /recebiveis/:id/desconto` (exige motivo).
- `POST /recebiveis/:id/receber {forma, contaId, data?, desconto?, juros?, multa?, aplicarEncargos?, permutaId?, emitirRecibo?}`: baixa o recebível (claim atômico), lança receita (valor líquido) + dedução de bolsas/descontos (`3.9.1`), entrada na conta e recibo numerado.
- **Permuta**: `POST /permutas` (documento obrigatório: contrato/nota/termo), aprovação por outra pessoa, e liquidação ao quitar um recebível (`forma: PERMUTA`) ou título (`/titulos/:id/baixa {permutaId}`) com **valor equivalente exato**.
  Contrapartida contábil: RECEBER = D `1.2.9` Bens/serviços em permuta / C `3.1.1` Receita; PAGAR = D despesa / C `3.1.9` Receitas de permuta. Não movimenta caixa.
- **Recibos**: numeração `série-000001` sem lacunas silenciosas (`GET /recibos/gestao` lista lacunas), 2ª via (`/segunda-via`, contador e log), cancelamento com motivo (não estorna o recebimento), documento imprimível (`documento.html`), valor por extenso.

## Extrato e conciliação
- `POST /extratos/importar {contaId, conteudo | conteudoBase64, formato?, autoConciliar?}`: OFX 1.x (SGML) e 2.x (XML) ou CSV (cabeçalho em qualquer linha; `;`/`,`/tab; `Valor` ou `Crédito/Débito`; números `1.234,56`). Deduplica arquivo (hash) e linhas (FITID ou data+valor+histórico+ordinal).
- `GET /extratos/itens/:id/sugestoes`: candidatos pontuados (valor igual 0,5 + proximidade de data até 0,3 + semelhança do nome 0,2 + número do título): títulos pagos/enviados, recebimentos, movimentos internos e **mensalidades em aberto** (sugere baixar e conciliar).
- `POST /conciliacao/automatica`: concilia sozinho só quando há **um candidato claramente melhor** (score >= 0,8 e folga de 0,1 sobre o segundo); mensalidades nunca são baixadas automaticamente. Manual: `/extratos/itens/:id/conciliar {tipo: TITULO|RECEBIMENTO|MOVIMENTO|RECEBIVEL|NOVO_MOVIMENTO}`; `/ignorar`, `/desfazer`.
- Conciliar um título `ENVIADO_BANCO` confirma o pagamento (baixa) e o leva a `CONCILIADO`.

## Notas fiscais e espelho contábil
- `POST /notas`: NFS-e/NF-e de **entrada e saída** (número, série, chave de 44 dígitos com DV módulo 11 e conferência do CNPJ da chave, ISS, retenções IRRF/PIS/COFINS/CSLL/INSS, líquido). Duplicidade por (direção, modelo, série, número, participante) e por chave.
- Vínculo: nota de entrada ⇄ título a pagar (`/notas/:id/gerar-titulo` cria o rascunho já com retenções), nota de saída ⇄ conta a receber. **Conciliação fiscal** (`OK/DIVERGENTE/PENDENTE`) compara o valor; `GET /notas/conciliacao` lista notas sem vínculo, divergentes, títulos pagos sem nota e recebimentos sem nota de saída.
- `GET /contabil/exportar?conjunto=lancamentos|plano|centros|notas&de&ate` (JSON com `conteudo` CSV `;` com BOM; `&download=1` baixa o arquivo): layout genérico para o sistema contábil; `GET /contabil/plano` devolve plano de contas, centros de custo, regime e layout. O **regime tributário** (`IMUNE_ISENTA`, `SIMPLES`, `LUCRO_PRESUMIDO`, `LUCRO_REAL`) fica em `/config`.

## Folha, pró-labore e terceiros
Contrato (também em `GET /folha/contrato`): o RH expõe `gerarLancamentosFolha(tenantId, competencia:'AAAA-MM'): Promise<LancamentoFolha[] | {lancamentos}>` em `backend/src/modules/rh` (`rh/folha`, `rh/index` ou `rh/lancamentos`).
`POST /folha/gerar {competencia}` chama esse módulo se existir (senão `424 RH_INDISPONIVEL`); `POST /folha/importar {competencia, lancamentos[]}` recebe os mesmos lançamentos por API. Cada lançamento vira um **título em RASCUNHO** pronto para conferência
(origem `FOLHA`, `PROLABORE` ou `TERCEIRO`), idempotente por competência+tipo+funcionário/documento+referência; lotes idênticos são recusados. Retenções: as informadas pelo RH prevalecem; para RPA/PJ/pró-labore sem retenção usa-se o **cálculo-modelo**
(INSS 11% até o teto, IRRF progressivo, ISS, PJ 1,5% + 4,65%) com parâmetros em `/config`. `GET /folha/resumo?competencia` acompanha o fluxo; `GET /retencoes/a-recolher` soma os tributos retidos já descontados (vencimento estimado dia 20 do mês seguinte).

## Relatórios
`GET /painel` (saldos, vencidos, fila, remessas, conciliação, notas, bolsas, permutas, alertas), `GET /relatorios/fluxo?de&ate&agrupar=dia|semana|mes` (realizado + previsto: recebíveis líquidos de bolsa, títulos por origem — folha, pró-labore, terceiros, compras, notas —, contas a pagar legadas,
tributos retidos a recolher; permutas aprovadas aparecem **fora do caixa**), `GET /relatorios/dre?de&ate` (regime de caixa: receita bruta, bolsas/descontos como dedução, permutas, despesas por origem, retenções informativas).

## Variáveis e limites
Sem variáveis de ambiente próprias (usa `SECURITY_ENC_KEY`/`JWT_SECRET` do módulo de Segurança para o 2FA). **Integrações bancárias e fiscais reais exigem credenciais, certificados e homologação**: aqui só há o provedor simulado e arquivos-modelo.
Cálculos fiscais (retenções, encargos, vencimentos de guias) são **modelos a validar por contador**; tabelas e alíquotas são configuráveis em `/config`.

## Testes e seed
`DATABASE_URL=postgresql://postgres:pg@127.0.0.1:5432/tes npx tsx scripts/e2e/tesouraria.ts` (350 verificações: funções puras, CNAB/OFX/CSV, máquina de estados, alçadas, dupla aprovação, segregação, 2FA, remessa e provedor simulado, conciliação, permuta, bolsas, notas, folha, fluxo/DRE, isolamento por tenant, seed).
Seed: `seedTesouraria(api, ctx)` em `scripts/seeds/tesouraria.ts` (não edita `edu-demo-seed.ts`; `ctx.apiAs` fornece o coordenador/reitor para conferir e autorizar).
