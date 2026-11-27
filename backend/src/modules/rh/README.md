# Módulo RH (EduMaster Pro)

RH próprio do EduMaster (o app dental tem outro, em `hrController.ts`; aqui não há dependência dele): colaboradores docentes e técnico-administrativos,
ponto e banco de horas, saúde ocupacional, férias, carreira, disciplina, admissão/desligamento, avaliação de desempenho, folha **simplificada**,
pró-labore e terceiros. Prefixo de modelos `Rhe` (`prisma/edu/rh.prisma`; SQL aditivo no bloco `RHE:BEGIN/END` de
`prisma/manual-migrations/20261004_edumaster_pro.sql`, só CRIA). Rotas: `/api/edu/rh/*`. Jobs (`/api/cron/edu`): `rh:ferias`, `rh:saude`, `rh:banco-horas`.

> **Aviso legal.** Todos os cálculos trabalhistas e tributários (hora extra, DSR, banco de horas, férias, 13º, rescisão, INSS, IRRF, FGTS, encargos)
> são **MODELOS SIMPLIFICADOS E PARAMETRIZÁVEIS a validar por contador/advogado trabalhista**. As tabelas padrão (vigências 2025/2026) são referência,
> ficam marcadas `modeloAValidar` e devem ser conferidas/ajustadas em `/folha/tabelas`. Não substituem eSocial, DCTFWeb, TRCT oficial nem convenção coletiva.

## Papéis e escopo
| Quem | O que pode |
|---|---|
| **ADMIN/OWNER/RECTOR/BOARD** | tudo (incluindo resumo da Reitoria) |
| **HR** (papel novo, `User.role = 'HR'`) | tudo do RH |
| **FINANCE** | lê folha, holerites, lançamentos a pagar, sócios (sem valores), terceiros, dados bancários (com log); baixa pagamento de terceiros |
| **COORDINATOR** (gestor) | só a **equipe** (`gestorId` ou departamento que chefia): espelho de ponto, aprova ajustes/férias/licenças, propõe bonificação, registra orientação a escrita, avalia. Não vê salário, CID, resultado de ASO nem CPF |
| **Qualquer colaborador** (usuário vinculado por `RheColaborador.userId`) | `/ponto/marcar`, espelho, banco, férias, holerites fechados, ciência de advertência, autoavaliação, atestados/licenças próprios |
| **STUDENT** e usuários sem vínculo | 403 |
Segregação de funções: ninguém aprova ajuste/férias/licença/bonificação sobre si mesmo; quem conferiu o acerto da rescisão não paga; quem aprovou o pagamento de terceiro não dá baixa.

## Dados sensíveis (LGPD)
- **CPF, conta, PIX, CID, CRM, restrições do ASO**: cifrados em repouso (AES-256-GCM, `seguranca/cripto`); CPF também por HMAC (`cpfHash`, unicidade sem expor). Listagens trazem só `***.***.***-NN`. CPF completo: `GET /colaboradores/:id/cpf?motivo=...` (RH, com log).
- **Log de acesso** (`LgpAcessoSensivel` via `registrarAcessoSensivel`): atestados, licenças médicas, exames/ASO, admissão/desligamento (SAUDE), holerites/folha/movimentações/dados bancários (REMUNERACAO), advertências (DISCIPLINAR), CPF (IDENTIFICACAO), avaliações (AVALIACAO).
- Gestor e financeiro nunca recebem CID, médico, anexos nem resultado de ASO (o gestor vê só a situação `EM_DIA/A_VENCER/VENCIDO`).
- Auditoria (`audit`) sem CPF/CID (a redação de logs do módulo LGPD é aplicada).
- Desligamento concluído **desativa o usuário** vinculado (`User.isActive = false`).
- Eliminação/anonimização a pedido do titular continua no módulo LGPD; dados trabalhistas têm guarda obrigatória (ver RIPD).

## Endpoints (resumo)
| Área | Rotas |
|---|---|
| Painel | `GET /painel` (RH), `GET /meu/resumo`, `GET /reitoria/resumo` |
| Cadastro | `/departamentos`, `/cargos`, `/jornadas`, `/feriados` (CRUD), `/config`, `POST /bootstrap`, `/colaboradores` (+`/meu`, `/:id`, `/:id/cpf`, `/:id/carreira`) |
| Ponto | `POST /ponto/marcar`, `GET /ponto/hoje`, `/ponto/marcacoes`, `POST /ponto/importar`, `GET /ponto/espelho`, `/ponto/ajustes` (+`/:id/decidir`), `POST /ponto/fechamento` (+`/reabrir`), `GET /ponto/fechamentos` |
| Banco de horas | `GET /banco-horas/saldo|saldos|vencimentos`, `POST /banco-horas/lancamentos` |
| Saúde | `/atestados` (+`/:id/validar`, `/estatisticas`), `/licencas` (+`/:id/decidir|cancelar`), `/exames` (+`/:id/resultado`, `/vencimentos`) |
| Férias | `POST /ferias/periodos/gerar`, `GET /ferias/periodos`, `/ferias/programacoes` (+`/:id/decidir|cancelar|concluir`), `/ferias/alertas`, `/ferias/simular` |
| Carreira | `/planos-carreira` (+`/:id/niveis`), `/movimentacoes`, `/bonificacoes` (+`/:id/decidir`) |
| Disciplina | `/advertencias` (+`/sugestao`, `/:id/ciencia|recusa|cancelar`) |
| Ciclo de vida | `/admissao/:colaboradorId` (+`/iniciar|concluir`), `/checklist/:itemId`, `/desligamentos` (+`/:id/exame|itens|rescisao|acerto|concluir|cancelar`) |
| Avaliação | `/ciclos` (+`/:id/criterios|abrir|encerrar`), `/avaliacoes` (+`/minhas`, `/:id/autoavaliacao|avaliacao-gestor`, `/:id/plano-acao`), `/avaliacoes/resumo-reitoria` |
| Folha | `/folha/tabelas`, `/folha/eventos`, `/folha/lancamentos`, `POST /folha/calcular`, `/folha`, `/folha/:id/holerites|fechar|reabrir`, `/folha/holerite/:id`, `/meus/holerites`, `/folha/:competencia/lancamentos`, `/dados-bancarios/:id` |
| Sócios/terceiros | `/socios`, `/pro-labore` (+`/simular`), `/terceiros`, `/terceiros/pagamentos` (+`/:id/aprovar|cancelar|pago`) |

## Regras de cálculo (modelo)
- **Fuso** America/Sao_Paulo fixo (UTC-3). Marcações pareadas ENTRADA→SAIDA_INTERVALO / RETORNO→SAIDA; turnos que viram a meia-noite pertencem ao dia da entrada.
- **Tolerância** (CLT art. 58 §1º): variação até 10 min/dia é desprezada; acima, conta integralmente. **Intervalo**: com 2 marcações e jornada > 6 h o intervalo é pré-assinalado; intervalo curto gera alerta.
- **Hora extra**: dia útil 50% até 2 h, excedente 100% (alerta); domingo/feriado 100%; sábado/folga 50%; escala 12x36 ignora domingo/feriado. **Noturno** 22h–5h (+20%, hora reduzida de 52min30s). Valor-hora = salário/220. **DSR** sobre variáveis = (valor/dias úteis) x dias de DSR.
- **Banco de horas**: crédito dos extras (100% creditado em dobro), validade 6 meses (máx. 12), razão derivado por **FIFO** (compensação/pagamento/débito consomem os créditos de vencimento mais próximo; compensação não consome crédito vencido). Crédito vencido é pago como HE 50% na folha (baixa por `PAGAMENTO`). Reabertura do ponto desfaz o que o fechamento lançou.
- **Férias**: período aquisitivo de 12 meses + concessivo de 12; direito 30/24/18/12/0 dias por faltas injustificadas; até 3 parcelas (uma >= 14 dias, demais >= 5), venda de até 1/3, início não pode ocorrer nos 2 dias antes de feriado/DSR; vencido = pagamento em dobro (alerta crítico). Valor = (salário + média das variáveis)/30 x dias + 1/3.
- **Folha** (mês de 30 dias): proventos/descontos por evento com flags INSS/IRRF/FGTS; faltas + DSR perdido; suspensão, licença sem vencimento, afastamento a partir do 16º dia e férias reduzem os dias pagos; 13º (1ª parcela 50% sem encargos; 2ª com INSS/IRRF e desconto do adiantamento); PJ/estagiário sem encargos; horista com DSR de 1/6.
- **INSS** progressivo por faixas com teto; **IRRF** pela menor base entre deduções legais e desconto simplificado + redutor (Lei 15.270/2025, tabela 2026); **FGTS** 8%; patronal estimado (20% + RAT + terceiros). Tabelas por vigência em `RheTabelaFiscal`.
- **Pró-labore**: INSS 11% limitado ao teto + IRRF; **RPA**: INSS 11% (teto acumulado na competência), IRRF, ISS informado; **PJ** exige nota fiscal.
- **Rescisão**: simulação (saldo, aviso proporcional 30+3/ano até 90, 13º e férias proporcionais + 1/3, férias vencidas/dobra, multa FGTS 40%/20% fora do líquido). Nunca substitui o TRCT.

## Integração com o Financeiro (contas a pagar) — contrato simples
O RH **não depende** do módulo `tesouraria` (nem o edita). A Tesouraria consome um contrato:

```ts
import { gerarLancamentosFolha, registrarConsumidorFolha } from '../rh/integracao'   // ou '../rh/routes'

const lancs = await gerarLancamentosFolha(tenantId, '2026-10')   // exige folha FECHADA (409 caso contrário)
// ou, em processo, ao fechar a folha:
const cancelar = registrarConsumidorFolha(async ({ tenantId, competencia, lancamentos }) => { /* criar contas a pagar */ })
// ou por HTTP (RH/Financeiro):  GET /api/edu/rh/folha/2026-10/lancamentos
```
Cada `LancamentoFolha` traz: `chaveIdempotencia` **estável** (o re-fechamento gera as mesmas chaves: use-a para não duplicar), `tipo` (`SALARIO`, `DECIMO_TERCEIRO`, `PRO_LABORE`, `TERCEIRO_RPA`, `TERCEIRO_PJ`, `COLABORADOR_PJ`, `INSS`, `IRRF`, `FGTS`),
`beneficiario {tipo, nome, documentoMascarado, refId}`, `vencimento`, `valor` (> 0), `centroCusto`, `categoriaSugerida`, `meioPagamentoSugerido`, `refType/refId`,
`status: 'PARA_CONFERENCIA'` e `exigeAutorizacao: true` (o Financeiro confere e autoriza). Dados bancários **não** vão no lançamento: consulte `GET /api/edu/rh/dados-bancarios/:colaboradorId` (RH/Financeiro, com log).
Falha de um consumidor não impede o fechamento. **Ponto de integração a ligar pelo agente de tesouraria:** chamar `registrarConsumidorFolha` na inicialização do módulo (ou a função sob demanda) e mapear `categoriaSugerida`/`tipo` para o plano de contas. Reabrir a folha (`/folha/:id/reabrir`) não cancela nada no Financeiro: cancele lá pela chave.

## Resumo para a Reitoria
`GET /api/edu/rh/reitoria/resumo` (ou `resumoRhParaReitoria(tenantId)`): quadro, rotatividade 12m, absenteísmo, exames/férias/banco em risco, última folha (totais) e avaliação por departamento.
**Sem nomes, CPF, salários individuais, CID ou notas individuais**; grupos com menos de 3 pessoas/avaliações são suprimidos (k-anonimato). Detalhe de avaliação: `GET /avaliacoes/resumo-reitoria`.

## Seed e testes
- Seed: `scripts/seeds/rh.ts` (`seedRh(api, ctx)`; também executável isolado). Dados fictícios.
- e2e: `DATABASE_URL=postgresql://postgres:pg@127.0.0.1:5432/rhe npx tsx scripts/e2e/rh.ts` (448 verificações: apuração de ponto, HE/noturno/DSR, banco FIFO, férias, INSS/IRRF/FGTS, 13º, rescisão, fluxos, permissões, isolamento por tenant, LGPD, integração). Requer Postgres próprio com `prisma db push`.

## Limites conhecidos
Sem integração com relógio de ponto/AFD real (há importação simplificada); sem eSocial/SEFIP; sem cálculo de salário-família, vale-transporte automático, pensão, adicionais de insalubridade/periculosidade ou regras de CCT (use eventos manuais);
encargos patronais isentos/diferenciados de filantrópicas devem ser ajustados em `ENCARGOS`; menores aprendizes e regras de estabilidade são apenas alertadas; férias em dobro e rescisão são estimativas.
