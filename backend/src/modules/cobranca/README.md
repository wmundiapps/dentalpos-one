# Módulo Cobrança (EduMaster Pro)

Inadimplência e cobrança do contas a receber do Edu: planilha de devedores com aging, política configurável, régua com
**recorrência até a resolução**, acordos/negociações, promessas, histórico de contatos com conformidade (CDC art. 42 / LGPD),
recebimentos e escalonamento (notificação extrajudicial, negativação/protesto **simulados** e solicitação de execução ao Jurídico).

- Schema: `prisma/edu/cobranca.prisma` (prefixo `Cob`; só tabelas novas). SQL aditivo no bloco `COB:BEGIN/COB:END` de `prisma/manual-migrations/20261004_edumaster_pro.sql`.
- Rotas: `/api/edu/cobranca/*` (papel `FINANCE` + ADMIN/OWNER/RECTOR/BOARD; `COORDINATOR` só lê painel e ranking). Sem rotas públicas.
- Frontend: menu "EduMaster · Cobrança" (`/edu/cobranca?aba=...`): Painel, Inadimplentes, Acordos e Negociações, Régua e Políticas, Histórico de Contatos, Recebimentos.
- Job: `cobranca.motor` (cron `/api/cron/edu`): quebra/expiração de acordos, promessas vencidas, motor da régua e despacho.
- Seed: `scripts/seeds/cobranca.ts` (`seedCobranca(api, ctx)`). E2E: `scripts/e2e/cobranca.ts` (318 verificações).

## Cálculo (`calculo.ts`, funções puras)
- Dias de atraso em calendário de Brasília. Tolerância: até N dias sem encargo; passada a tolerância, os encargos contam desde o vencimento.
- Correção = valor x % a.a. x dias/365. Base de multa e juros = valor + correção. Multa única (máx. 2%, CDC art. 52 §1º). Juros mensais (pro rata `dias/30`) ou diários, simples ou compostos. Arredondamento a centavos por componente.
- Saldo do título = principal restante + encargos devidos, descontados pagamentos parciais (encargos primeiro), descontos e créditos (`CobAlocacao`).
- Aging: A vencer, 1-30, 31-60, 61-90, 90+. Quitação à vista: desconto sobre encargos e/ou principal limitado pela alçada; sem desconto no principal para bolsista (configurável).
- Parcelamento: entrada + N parcelas mensais (Price se houver juros de parcelamento); a última parcela absorve o arredondamento.

## Integração com o contas a receber
O `AccountReceivable` continua a fonte da verdade. A Cobrança lê os títulos em aberto e calcula tudo "ao vivo".
- `POST /pagamentos` baixa o título (parcial ou total, com ou sem desconto de quitação): claim atômico, `PaymentTransaction` + lançamento contábil, `CobRecebimento`, promessa cumprida, caso encerrado.
- Baixas feitas pelo financeiro (`/financeiro/receivables/:id/receive` e webhook do gateway) chamam `aoReceberTitulo` (`integracao.ts`): fecha caso/promessa e registra o recebimento.
- Acordo ativo cobre os títulos (saem do saldo vencido; não podem ser baixados direto). Quitado o acordo, os títulos viram `PAGO` (`gatewayStatus=QUITADO_POR_ACORDO`). Quebra: o que já foi pago vira crédito (`CREDITO_QUEBRA`) e o débito original reabre; reabrir desfaz o crédito.
- Pagamentos de parcela de acordo geram `PaymentTransaction` sem vínculo a título (o dinheiro entrou; o título só fecha na quitação). Encargos recebidos ficam no `CobRecebimento`.

## Régua com recorrência (`motor.ts`)
Por caso (aluno), usa o **maior atraso**. Etapas `MENSAGEM` disparam no gatilho e repetem a cada `repetirACadaDias` até quitar/acordo
(`maxRepeticoes` limita; a recorrência cessa quando a etapa seguinte entra em vigor, salvo `continuaAposProxima`). No máximo uma mensagem por caso por execução;
etapas anteriores atrasadas além da tolerância ficam `SUPERADA`. Canais: SMS, WhatsApp, Telegram, e-mail, VOZ IA, com canal alternativo.
Escalonamento (uma vez por ciclo): `NOTIFICACAO_EXTRAJUDICIAL`, `NEGATIVACAO`, `PROTESTO`, `JURIDICO`, com aprovação humana opcional e pré-requisitos (aviso prévio de N dias **após a entrega** da notificação, valor mínimo).
**Pausa automática**: acordo ativo, promessa vigente, pausa manual, caso no jurídico; pagamento total encerra o caso. Quebra de acordo abre novo ciclo.
A régua antiga `comunicacao/regua.ts` (lembretes por título, uma vez por etapa) continua funcionando; os contatos dela contam no limite diário/semanal e são suprimidos se o aluno entra em acordo.

Envio: cria `EduNotification` (refType `CobContato`) e o **dispatcher da Comunicação** envia (gancho `cobrancaSuprimida` + finalidade `COBRANCA`). Sem canal configurado a notificação falha de forma honesta e o histórico reflete (`sincronizarTentativas`).

## Conformidade (`contato.ts`, único ponto de saída)
Ordem: "não contatar" -> janela (dias/horário/feriados nacionais; padrão 08-20h seg-sex, política limitada a 07-21h) -> limite diário e semanal -> destino -> opt-out (`ComPreferencia`, finalidade `COBRANCA`, canal ou `*`; usa o canal alternativo se permitido) -> texto (`validarMensagemCobranca`: sem ofensa, ameaça, "devedor/inadimplente", exposição a terceiros; protesto/negativação só na notificação extrajudicial).
Contato automático fora da janela/limite é **adiado** sem registro; contato manual bloqueado é **registrado** (`BLOQUEADO_*`). Cada tentativa grava em `CobContato`: canal, resultado, base legal (LGPD), destino mascarado, usuário/automático. Só o contato do próprio aluno é usado (nunca terceiros). Exportações CSV são auditadas e neutralizam injeção de fórmula.

## Voz IA (`voz-ia.ts`)
`escolherProvedor`: provedor externo registrado (`registrarProvedorVozIA`) > canal de voz da Comunicação (Twilio TTS, via caixa de saída) > **simulação** (nenhuma ligação; `CobContato.resultado=SIMULADO`).
Ponto de integração: implemente `ProvedorVozIA { disponivel, iniciar }`; o provedor devolve o desfecho em `POST /voz-ia/resultado` (atendeu, promessa com data, opt-out, transcrição).

## Contrato com o Jurídico
O módulo Jurídico não é importado. Duas formas de consumir a `SolicitacaoExecucaoV1` (`escalonamento.ts`):
1. HTTP: `GET /juridico/contrato`, `GET /juridico/solicitacoes?status=ENVIADO`, `POST /juridico/solicitacoes/:id/retorno {status: ACEITO|DEVOLVIDO|CONCLUIDO, protocolo?, motivo?}` (papéis FINANCE, `JURIDICO` e gestão).
2. Em processo: `registrarHandlerJuridico(async (s) => ({ protocolo }))` é chamado quando a solicitação é aprovada/enviada.
Conteúdo: versão, origem (casoId, encaminhamentoId), devedor (nome, RA, CPF, curso), débito (principal, encargos, total, política usada, títulos com multa/juros/saldo), histórico (contatos, acordos quebrados, promessas quebradas, notificação extrajudicial), base legal `EXERCICIO_REGULAR_DIREITOS`.
Fluxo: `AGUARDANDO_APROVACAO -> ENVIADO -> ACEITO|DEVOLVIDO -> CONCLUIDO`. Enviado, o caso fica `JURIDICO` (a régua para); devolvido/concluído volta a `EM_COBRANCA`.

## Principais endpoints
`GET /painel`, `/inadimplentes[?formato=csv]`, `/inadimplentes/:studentId`, `/ranking?dimensao=curso|turma|polo|segmento`, `/recebimentos`; `POST /pagamentos`, `GET /pagamentos/calcular`;
`/politicas`, `/reguas`, `/reguas/:id/etapas`, `/etapas/:id`, `/reguas/validar-mensagem`, `/motor/simular|executar`, `/execucoes`, `/bootstrap`;
`/acordos` (`/simular`, `/:id/{contraproposta,ajustar,aprovar-contraproposta,aceitar,parcelas/:pid/pagar,quebrar,reabrir,renegociar,cancelar,termo}`), `/promessas`;
`/contatos`, `/contatos/registrar|enviar`, `/casos/:id/{optout,optin,pausar,retomar}`, `/casos/atribuir`; `/encaminhamentos`, `/juridico/*`.

## Limites honestos
- Negativação e protesto são **simulados** (sem integração com Serasa/SPC/cartório). WhatsApp/SMS/e-mail só saem se o canal estiver configurado em Comunicação; senão a falha fica registrada.
- Voz IA é simulada sem provedor; o provedor real precisa ser plugado.
- Aceite do aluno é registrado por atendente (canal, nome, CPF mascarado, IP, hash SHA-256 dos termos); não há portal de aceite nem assinatura digital qualificada.
- Pagamento parcial de parcela de acordo não é aceito. Correção monetária usa % anual informado (sem busca automática de IPCA/IGP-M).
- Textos, prazos e limites são modelos de apoio e precisam de validação jurídica.
