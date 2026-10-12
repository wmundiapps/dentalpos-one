# Pagamentos

Versão 2026-10-12 · Vigência a partir de 12/10/2026

## 1. Objeto e processadores

1.1. Este documento integra os Termos de Uso (anexo "g") e descreve como funcionam a cobrança, o recebimento pelo Anfitrião, os estornos e as cobranças adicionais relativas às Reservas, conforme os meios de pagamento efetivamente disponíveis na Plataforma.

1.2. **Processadores.** Os pagamentos são processados por instituições de pagamento parceiras, em ambiente próprio delas (*checkout* hospedado):
- (a) **Mercado Pago**, por meio do *Checkout Pro*; e
- (b) **Asaas**, por meio de cobrança com página de pagamento própria, que não exige do Locatário conta no Asaas, mas exige o CPF ou CNPJ de quem paga.

1.3. **Conta do Anfitrião.** Para receber Reservas, o Anfitrião deve conectar à Plataforma uma conta Mercado Pago ou uma carteira Asaas de sua titularidade (ou da pessoa jurídica titular do Anúncio) e mantê-la ativa. Enquanto nenhuma conta estiver conectada, o Anúncio não recebe Reservas. O Anfitrião aceita os termos do processador escolhido e fornece a ele os dados de identificação e bancários exigidos pela regulação aplicável. Quando o Anfitrião tiver as duas contas conectadas, o Locatário escolhe por qual processador pagar.

1.4. **Moeda.** Todos os preços e pagamentos são em reais (BRL).

1.5. **Dados de cartão.** Os dados de cartão são digitados diretamente no ambiente do Mercado Pago ou do Asaas e **nunca transitam nem são armazenados nos servidores da Plataforma**. A Plataforma recebe apenas referências da transação (identificador, situação e valor).

## 2. Composição do preço

2.1. O total pago pelo Locatário é composto por:

| Componente | Cálculo |
|---|---|
| Valor Base | Soma, por Ocorrência, de horas × preço por hora, ou preço de diária para Ocorrências de 6 horas ou mais quando mais vantajoso; deduzido o desconto de pacote, quando houver (Regras de Reserva e Uso, cláusula 2.3) |
| Taxa de Limpeza | Valor fixo por Ocorrência, definido pelo Anfitrião, limitado a 30% do Valor Base |
| **Taxa de Serviço SpaceHour** | **15%** sobre (Valor Base + Taxa de Limpeza), **tributos incluídos** |
| **Total** | Soma dos itens acima |

2.2. Nenhum tributo é acrescentado à parte sobre a Taxa de Serviço SpaceHour: os tributos incidentes sobre a remuneração da Operadora estão incluídos no percentual de 15%.

2.3. O valor destinado ao Anfitrião é:

| Componente | Cálculo |
|---|---|
| Valor Base + Taxa de Limpeza | Integral |
| (–) Taxa de Serviço do Anfitrião | **5%** sobre (Valor Base + Taxa de Limpeza) |
| **Valor do Anfitrião** | Resultado, antes das tarifas do processador (cláusula 5) |

2.4. **Exemplo.** Reserva de 4 horas a R$ 80,00/hora, Taxa de Limpeza de R$ 30,00. Valor Base: R$ 320,00. Taxa de Serviço SpaceHour: 15% × R$ 350,00 = R$ 52,50. **Total pago pelo Locatário: R$ 402,50.** Taxa de Serviço do Anfitrião: 5% × R$ 350,00 = R$ 17,50. **Valor do Anfitrião: R$ 332,50**, antes das tarifas do processador. Remuneração da Operadora: R$ 70,00 (R$ 52,50 + R$ 17,50).

2.5. O detalhamento completo é exibido antes da confirmação. Não há cobranças ocultas.

## 3. Meios de pagamento e momento da cobrança

3.1. **Meios aceitos:** cartão de crédito, Pix e boleto bancário (Mercado Pago e Asaas) e saldo ou conta Mercado Pago (somente Mercado Pago). "Cartão" abrange as bandeiras aceitas pelo processador.

3.2. **Aguardando pagamento.** Ao solicitar a Reserva, o Locatário é direcionado ao ambiente do processador. A Reserva fica com o status **"aguardando pagamento"** e o horário fica guardado pelo prazo do meio escolhido, nunca depois do início da primeira Ocorrência. Nesse estado, **nada foi debitado** do Locatário. Se o pagamento não for aprovado no prazo, a Reserva expira, o horário é liberado e a cobrança pendente é cancelada.

3.3. **Regras por meio de pagamento:**

| | Cartão de crédito | Pix | Boleto bancário |
|---|---|---|---|
| **Prazo para pagar** (horário guardado) | 24 horas | 30 minutos | 3 dias; aceito apenas se a primeira Ocorrência começar em pelo menos 3 dias |
| **Quando o valor é debitado** | Na aprovação da transação pelo emissor e pelo processador, que autoriza e liquida a compra no mesmo ato. A transação pode ficar "pendente" ou "em análise" enquanto o processador conclui sua verificação antifraude | No momento em que o Locatário conclui o Pix: a transferência é instantânea e definitiva, **não é uma pré-autorização** | Quando o banco compensa o pagamento, o que pode levar até 3 dias úteis após o pagamento |
| **O que significa "pendente"** | O processador ainda não aprovou a transação; o horário continua guardado até o prazo | O QR Code ou código "copia e cola" foi gerado, mas o Pix ainda não foi feito | O boleto foi emitido, mas a compensação ainda não foi informada pelo banco |
| **Se o prazo vencer sem aprovação** | Reserva expira; nada é cobrado | Reserva expira; o Pix gerado deixa de ser válido | Reserva expira; o boleto vence e não deve ser pago |
| **Pagamento aprovado depois do prazo** | Estorno integral automático | Devolução integral automática do Pix | Devolução integral automática |
| **Forma do estorno** | Estorno na fatura do cartão | Devolução do Pix para a conta de origem | Na forma disponibilizada pelo processador para o boleto |

3.4. O saldo ou conta Mercado Pago segue as regras do cartão quanto ao prazo (24 horas) e é debitado na aprovação pelo processador.

3.5. **Não há pré-autorização.** A Plataforma não realiza pré-autorização (bloqueio de limite com captura posterior) em nenhum dos meios disponíveis. O valor é efetivamente debitado quando o pagamento é aprovado. Por isso, nas Reservas por solicitação e nas Reservas com Fiador:
- (a) o pagamento é feito antes da decisão do Anfitrião, do Fiador ou do cônjuge do Fiador;
- (b) se a Reserva não for concluída — por recusa ou silêncio do Anfitrião (24 horas) ou do Fiador ou de seu cônjuge (48 horas) —, o valor pago é **integralmente estornado** pelo mesmo meio, sem qualquer retenção, e nada é devido pelo Locatário.

3.6. **Confirmação.** Aprovado o pagamento, a Reserva segue para o aceite do Fiador (quando exigido) e, em seguida, é confirmada automaticamente (Reserva instantânea) ou submetida ao Anfitrião (Reserva por solicitação), conforme as Regras de Reserva e Uso, cláusula 4.

3.7. **Quitação.** O pagamento aprovado pelo processador quita a obrigação do Locatário de pagar o preço da Reserva perante o Anfitrião.

## 4. Divisão do pagamento e recebimento pelo Anfitrião

4.1. **Divisão automática (*split*).** O pagamento é dividido pelo próprio processador entre o Anfitrião e a Operadora, sem que a Operadora receba ou guarde a parcela do Anfitrião:

| | Mercado Pago | Asaas |
|---|---|---|
| **Quem recebe o pagamento** | A transação é criada em nome do Anfitrião, na conta Mercado Pago dele conectada à Plataforma | A cobrança é emitida pela conta Asaas da Operadora, com divisão automática para a carteira Asaas do Anfitrião |
| **Parcela do Anfitrião** | Creditada pelo Mercado Pago na conta do Anfitrião no momento da aprovação | Creditada pelo Asaas na carteira do Anfitrião quando o pagamento é confirmado, no percentual correspondente ao Valor do Anfitrião sobre o total |
| **Remuneração da Operadora** | Retida pelo Mercado Pago no ato, como tarifa de *marketplace*, correspondente à Taxa de Serviço SpaceHour e à Taxa de Serviço do Anfitrião | Parcela remanescente, que permanece na conta da Operadora |
| **Tarifa do processador** | Descontada pelo Mercado Pago da parcela do Anfitrião, conforme as condições da conta dele | Como a divisão é percentual sobre o valor líquido, a tarifa do Asaas é suportada proporcionalmente pelo Anfitrião e pela Operadora |
| **Disponibilidade do saldo** | Conforme os prazos do Mercado Pago para o meio de pagamento utilizado | Conforme os prazos do Asaas para o meio de pagamento utilizado |

4.2. A tarifa do processador não integra a Taxa de Serviço do Anfitrião e pode variar conforme o meio de pagamento e as condições contratadas pelo Anfitrião com o processador.

4.3. O Anfitrião acompanha na Plataforma o resumo de cada Reserva, mas os saldos, extratos e saques são geridos diretamente na conta do processador.

## 5. Estornos e reembolsos

5.1. Os reembolsos seguem a Política de Cancelamento e Reembolso e são feitos por **estorno, total ou parcial, da transação original**, solicitado pela Plataforma ao processador, pelo mesmo meio de pagamento:
- (a) **cartão**: estorno na fatura, em prazo que depende do emissor (em regra, de 5 a 10 dias úteis, podendo aparecer na fatura seguinte);
- (b) **Pix**: devolução para a conta de origem do Pix;
- (c) **boleto**: na forma disponibilizada pelo processador, podendo ser solicitada ao Locatário a indicação de conta bancária;
- (d) **saldo Mercado Pago**: devolução ao saldo da conta do pagador.

5.2. **Efeito sobre a divisão.** Como o valor foi dividido no momento do pagamento, o estorno é suportado pelas contas que o receberam, segundo as regras do processador. Quando a divisão do estorno pelo processador não corresponder à responsabilidade de cada parte prevista na Política de Cancelamento e Reembolso ou em decisão de Incidente, a diferença é acertada entre a Operadora e o Anfitrião por compensação ou cobrança.

5.3. Reembolsos que decorram de falha do Anfitrião (cancelamento pelo Anfitrião, falta de acesso, Anúncio impreciso) reduzem o valor recebido pelo Anfitrião; quando o saldo dele no processador não comportar o estorno, o valor pode ser cobrado do Anfitrião.

## 6. Cobranças adicionais

6.1. Tarifa adicional por atraso na saída, ressarcimento de danos, limpeza extra, multas de condomínio e cláusulas penais reconhecidas ou decididas em Incidente (Penalidades e Medidas) **não são debitadas automaticamente** do meio de pagamento do Locatário, porque os meios disponíveis não permitem cobrança sem a presença do pagador. A Plataforma envia ao Locatário um **link de pagamento** (no Asaas, cobrança por Pix), com prazo de 5 dias. Sem pagamento, a cobrança pode ser direcionada ao Fiador, até o limite de sua responsabilidade (Fiança e Caução).

6.2. Os valores pagos em cobranças adicionais devidos ao Anfitrião são creditados na conta do Anfitrião no processador ou, quando o processador não permitir a divisão automática daquela cobrança, recebidos pela Operadora e transferidos ao Anfitrião.

6.3. A cláusula penal devida pelo Anfitrião por cancelamento (Penalidades e Medidas, cláusula 5.3) e outros valores devidos por ele são cobrados à parte ou compensados com valores que lhe sejam devidos, mediante informação detalhada.

## 7. Bloqueios e retenções

7.1. A Operadora não retém a parcela do Anfitrião creditada pelo processador. Os processadores podem, segundo suas próprias regras, bloquear ou reter valores em caso de contestação (*chargeback*), suspeita de fraude ou ordem judicial.

7.2. Em caso de Incidente aberto pelo Locatário contra o Anfitrião, indício de fraude, violação grave ou ordem judicial ou administrativa, a Plataforma pode suspender o Anúncio, cancelar Reservas futuras com estorno ao Locatário e solicitar ao processador as medidas previstas nos termos dele, comunicando o Anfitrião com o motivo.

## 8. Contestações (*chargebacks*)

8.1. O Locatário deve buscar primeiro a Central de Resolução antes de contestar uma cobrança junto ao emissor do cartão. Isso não limita os direitos do titular do cartão.

8.2. Em caso de *chargeback*, a Plataforma fornecerá ao processador as evidências da Reserva (aceite dos Termos e das regras, check-in e check-out, mensagens, fotos). *Chargebacks* julgados procedentes em razão de falha do Anfitrião são suportados pelo Anfitrião. *Chargebacks* fraudulentos ou abusivos sujeitam o Locatário a suspensão e cobrança do valor.

## 9. Proibição de pagamento fora da Plataforma

9.1. Todo pagamento relativo a Reservas deve ser feito pela Plataforma. Solicitar, oferecer ou aceitar pagamento por fora (inclusive "desconto para pagar direto", depósito em conta, Pix direto, dinheiro) é falta grave que pode levar à exclusão das contas envolvidas. Pagamentos por fora não contam com qualquer proteção da Plataforma.

## 10. Recibos e documentos fiscais

10.1. O Locatário recebe comprovante eletrônico de cada pagamento, com o detalhamento dos componentes.

10.2. A Operadora emite a nota fiscal de serviço eletrônica (NFS-e) referente à sua remuneração (Taxa de Serviço SpaceHour e Taxa de Serviço do Anfitrião), conforme a legislação municipal aplicável e, na transição da Reforma Tributária (Lei Complementar nº 214/2025), observará as obrigações que lhe forem atribuídas.

10.3. O documento fiscal relativo ao **Valor Base e à Taxa de Limpeza**, quando exigido, é de responsabilidade do Anfitrião, que deve emiti-lo ao Locatário conforme a legislação aplicável. A Plataforma disponibiliza os dados necessários.

10.4. Locatários pessoa jurídica devem informar seu CNPJ para constar nos documentos.

## 11. Prevenção à fraude

11.1. A Plataforma e os processadores adotam procedimentos de prevenção à fraude e à lavagem de dinheiro, incluindo verificação de identidade, monitoramento de transações atípicas e autenticação reforçada quando exigida pelo processador.

11.2. A Plataforma pode recusar ou cancelar Reservas com indícios de fraude, uso de cartão de terceiros ou operações simuladas, com estorno do valor pago, e comunicar as autoridades competentes nos termos da lei.

11.3. Os processadores podem atuar como controladores independentes de parte dos dados de pagamento, conforme suas próprias políticas de privacidade (Política de Privacidade).
