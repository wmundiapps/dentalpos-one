# Pagamentos Internacionais

Versão 2026-09-25 · Vigência a partir de 25/09/2026

## 1. Objeto

1.1. Este documento integra os Termos de Uso e disciplina a cobrança, o processamento, o repasse, os reembolsos e as retenções de valores relativos às Reservas.

1.2. Os pagamentos são processados por instituições de pagamento e adquirentes parceiros, devidamente autorizados em cada jurisdição. A Operadora atua como agente de cobrança limitado do Anfitrião: o pagamento feito pelo Locatário à Plataforma quita a obrigação do Locatário perante o Anfitrião.

1.3. **Processadores de pagamento.** A Plataforma utiliza dois processadores:

| Processador | Países |
|---|---|
| **Mercado Pago** | Brasil, Argentina, Chile, Colômbia, México, Peru e Uruguai |
| **Stripe** | Demais países atendidos e operações internacionais |

1.4. O processador aplicável é definido pelo país do Espaço e indicado no resumo da Reserva. Anfitriões podem ter de aceitar os termos do processador e fornecer a ele os dados de identificação e bancários exigidos por sua regulação (KYC) para receber repasses.

1.5. **Dados de cartão.** Os dados de cartão são digitados diretamente nos campos seguros ou nos aplicativos do Mercado Pago ou da Stripe, certificados PCI DSS, e **nunca transitam nem são armazenados nos servidores da Plataforma**. A Plataforma recebe apenas um *token*, a bandeira, os últimos dígitos e a validade, para exibição e cobranças autorizadas.

## 2. Moeda

2.1. Todo Espaço é precificado na **moeda oficial do país onde está localizado** (por exemplo, BRL no Brasil, EUR em Portugal, USD nos Estados Unidos, no Equador, no Panamá e em El Salvador). A Reserva é cobrada nessa moeda.

2.2. A Plataforma pode exibir valores aproximados na moeda do Locatário apenas para referência. Se o meio de pagamento do Locatário estiver em outra moeda, a **conversão é feita pelo emissor** do cartão ou da conta, com taxa, tarifas e tributos (como o IOF no Brasil) definidos por ele, sobre os quais a Operadora não tem controle.

2.3. Valores são arredondados conforme as casas decimais da moeda (por exemplo, zero casas para JPY e CLP).

## 3. Composição do preço

3.1. O total pago pelo Locatário é composto por:

| Componente | Cálculo |
|---|---|
| Valor Base | Soma, por Ocorrência, de horas × preço por hora, ou preço de diária para Ocorrências de 6 horas ou mais quando mais vantajoso |
| Taxa de Limpeza | Valor fixo por Ocorrência, definido pelo Anfitrião, limitado a 30% do Valor Base |
| Taxa de Serviço do Locatário | **12%** sobre (Valor Base + Taxa de Limpeza) |
| Tributo sobre a Taxa de Serviço | Alíquota de referência do país (ex.: ISS 5% no Brasil, IVA 16% no México, IVA 23% em Portugal) aplicada sobre a Taxa de Serviço |
| **Total** | Soma dos itens acima |

3.2. O repasse ao Anfitrião é:

| Componente | Cálculo |
|---|---|
| Valor Base + Taxa de Limpeza | Integral |
| (–) Taxa de Serviço do Anfitrião | **3%** sobre (Valor Base + Taxa de Limpeza) |
| (–) Retenções legais, multas e ajustes | Quando aplicáveis |
| **Repasse** | Resultado |

3.3. **Exemplo (Brasil).** Reserva de 4 horas a R$ 80/hora, Taxa de Limpeza de R$ 30. Valor Base: R$ 320. Taxa de Serviço do Locatário: 12% × R$ 350 = R$ 42. ISS de referência (5%) sobre a Taxa de Serviço: R$ 2,10. Total pago: R$ 394,10. Taxa do Anfitrião: 3% × R$ 350 = R$ 10,50. Repasse ao Anfitrião: R$ 339,50.

3.4. O detalhamento completo é exibido antes da confirmação. Não há cobranças ocultas. Onde a lei exigir que o preço anunciado já inclua todas as taxas obrigatórias (por exemplo, Reino Unido, Austrália, Califórnia e Índia), o preço exibido nas buscas e no Anúncio inclui a Taxa de Serviço e a Taxa de Limpeza.

## 4. Meios de pagamento por país

4.1. Os meios aceitos variam por país do Espaço:

| País | Meios de pagamento |
|---|---|
| Brasil | Pix, cartão, boleto bancário, Apple Pay, Google Pay, Mercado Pago |
| Argentina | Cartão, Mercado Pago, transferência bancária |
| Bolívia | Cartão, transferência bancária |
| Chile | Cartão, Webpay, Mercado Pago, transferência bancária |
| Colômbia | Cartão, PSE, Mercado Pago, transferência bancária |
| Equador | Cartão, transferência bancária, PayPal |
| Paraguai | Cartão, transferência bancária |
| Peru | Cartão, Yape, Mercado Pago, transferência bancária |
| Uruguai | Cartão, Mercado Pago, transferência bancária |
| Panamá | Cartão, transferência bancária, PayPal |
| Costa Rica | Cartão, transferência bancária, PayPal |
| Guatemala | Cartão, transferência bancária |
| El Salvador | Cartão, transferência bancária |
| Honduras | Cartão, transferência bancária |
| Nicarágua | Cartão, transferência bancária |
| Belize | Cartão, transferência bancária, PayPal |
| México | Cartão, OXXO, SPEI, Mercado Pago, PayPal, Apple Pay, Google Pay |
| Estados Unidos | Cartão, ACH bank debit, Apple Pay, Google Pay, PayPal |
| Canadá | Cartão, Interac, Pre-authorized debit (PAD), Apple Pay, Google Pay, PayPal |
| Portugal | Cartão, MB WAY, Multibanco, SEPA Direct Debit, Apple Pay, Google Pay, PayPal |
| Espanha | Cartão, Bizum, SEPA Direct Debit, Apple Pay, Google Pay, PayPal |
| Itália | Cartão, Satispay, SEPA Direct Debit, Klarna, Apple Pay, Google Pay, PayPal |
| França | Cartão, Cartes Bancaires, SEPA Direct Debit, Klarna, Apple Pay, Google Pay, PayPal |
| Alemanha | Cartão, SEPA Direct Debit, Klarna, Wero, PayPal, Apple Pay, Google Pay |
| Reino Unido | Cartão, Pay by bank (Open Banking), Bacs Direct Debit, Apple Pay, Google Pay, PayPal, Klarna |
| Emirados Árabes Unidos | Cartão, Apple Pay, Google Pay, transferência bancária |
| Israel | Cartão, Bit, Apple Pay, Google Pay, PayPal, transferência bancária |
| China | Alipay, WeChat Pay, UnionPay, cartão |
| Japão | Cartão, JCB, Konbini, PayPay, Apple Pay, Google Pay |
| Índia | UPI, cartão, RuPay, net banking, PayPal |
| Austrália | Cartão, PayID, BPAY, Apple Pay, Google Pay, PayPal |

4.2. "Cartão" abrange Visa, Mastercard e American Express, conforme disponibilidade do processador. A disponibilidade efetiva de cada meio depende do processador responsável no país (cláusula 1.3); meios não suportados por ele não são exibidos no pagamento.

4.3. **Pagamentos assíncronos.** Pix, boleto, OXXO, SPEI, Multibanco, konbini, transferência bancária, BPAY, PSE, net banking, UPI, Bizum, MB WAY, Bit, PayID e Yape são confirmados somente após a compensação. A Reserva só é confirmada após o recebimento, e pagamentos não compensados no prazo indicado expiram. Esses meios não permitem pré-autorização de Caução, aplicando-se o documento Avalista e Caução.

## 5. Autorização, captura e pré-autorização

5.1. **Reserva por solicitação.** O valor é **autorizado** (reservado) e só é **capturado** quando o Anfitrião aceita. Recusa ou expiração em 24 horas libera a autorização.

5.2. **Reserva com Avalista.** O valor permanece autorizado até o aceite do Avalista (prazo de 48 horas).

5.3. **Reserva instantânea.** A captura ocorre na confirmação.

5.4. **Caução.** Pré-autorização adicional, limitada a 3 vezes o Valor Base, liberada 72 horas após o check-out se não houver Incidente.

5.5. **Reservas recorrentes.** Em séries, o valor total pode ser cobrado na confirmação ou, quando a regulação local exigir ou o Locatário optar, em parcelas por Ocorrência, observadas as regras locais de pagamentos recorrentes (por exemplo, *e-mandates* do RBI na Índia).

## 6. Repasse ao Anfitrião

6.1. O repasse é liberado **24 horas após o início da primeira Ocorrência** da Reserva, para a conta cadastrada pelo Anfitrião, deduzidas a Taxa de Serviço do Anfitrião e eventuais retenções. Em séries, a Plataforma pode liberar o repasse por Ocorrência, 24 horas após o início de cada uma.

6.2. O crédito na conta do Anfitrião depende dos prazos do meio de transferência e do banco de destino. Repasses internacionais podem estar sujeitos a tarifas bancárias e conversão cambial.

6.3. O Anfitrião deve manter conta bancária de sua titularidade (ou da pessoa jurídica titular do Anúncio) e dados fiscais atualizados.

## 7. Retenções

7.1. A Plataforma pode reter, total ou parcialmente, repasses ao Anfitrião quando: (a) houver Incidente aberto pelo Locatário ou disputa pendente; (b) houver indício de fraude, lavagem de dinheiro, conta comprometida ou violação grave; (c) faltarem dados de identificação, fiscais ou bancários; (d) houver débito do Anfitrião perante a Plataforma (multas por cancelamento, reembolsos devidos); (e) houver ordem judicial ou administrativa; (f) houver *chargeback* em curso.

7.2. A retenção é comunicada ao Anfitrião com o motivo e perdura somente pelo tempo necessário.

7.3. **Retenções tributárias.** Quando a lei impuser à Plataforma retenção de tributos sobre repasses (por exemplo, IVA/ISR no México, pela Ley del IVA, Cap. III Bis, e pela LISR, arts. 113-A a 113-D; TCS de 0,5% sob o GST e TDS de 0,1% da s. 194-O do Income-tax Act na Índia; *backup withholding* nos Estados Unidos, se o Anfitrião não fornecer o Form W-9), os valores retidos são recolhidos e informados ao Anfitrião com o respectivo comprovante.

7.4. **Comunicação de rendimentos.** A Plataforma ou o processador de pagamento podem comunicar às autoridades fiscais os rendimentos recebidos pelos Anfitriões, por exemplo pela Diretiva DAC7 (União Europeia), pelo Form 1099-K (Estados Unidos), pelas regras de *platform reporting* do Reino Unido, do Canadá e da Austrália e pelas regras chinesas de comunicação de informações fiscais por plataformas (documento Obrigações do Anfitrião, cláusula 11).

## 8. Reembolsos

8.1. Os reembolsos seguem a Política de Cancelamento e Reembolso e são devolvidos pelo mesmo meio de pagamento: cartão em 5 a 10 dias úteis conforme o emissor; Pix e transferências em até 5 dias úteis; boleto, OXXO, konbini e similares por transferência para conta bancária indicada pelo Locatário.

8.2. Reembolsos que decorram de falha do Anfitrião são descontados de seus repasses futuros ou cobrados dele.

## 9. Cobranças adicionais

9.1. Atraso na saída, danos, limpeza extra, multas de condomínio e penalidades decididas em Incidente são cobrados na ordem: Caução, meio de pagamento cadastrado e Avalista (Penalidades e Medidas). O Locatário autoriza expressamente essas cobranças ao aceitar os Termos e recebe o detalhamento de cada uma.

## 10. Contestações (chargebacks)

10.1. O Locatário deve buscar primeiro a Central de Resolução antes de contestar uma cobrança junto ao emissor. Isso não limita os direitos do titular do cartão.

10.2. Em caso de *chargeback*, a Plataforma apresentará ao emissor as evidências da Reserva (aceite dos Termos e das regras, check-in/check-out, mensagens, fotos). Se o *chargeback* for julgado procedente em razão de falha do Anfitrião, o valor será debitado dos repasses deste. *Chargebacks* fraudulentos ou abusivos sujeitam o Locatário a suspensão e cobrança do valor, com tarifas.

## 11. Proibição de pagamento fora da Plataforma

11.1. Todo pagamento relativo a Reservas deve ser feito pela Plataforma. Solicitar, oferecer ou aceitar pagamento por fora (inclusive "desconto para pagar direto", depósito em conta, Pix direto, dinheiro) é falta grave que leva à exclusão das contas envolvidas. Pagamentos por fora não contam com qualquer proteção da Plataforma.

## 12. Recibos e documentos fiscais

12.1. O Locatário recebe recibo eletrônico de cada pagamento, com o detalhamento dos componentes. A Operadora emite o documento fiscal referente à **Taxa de Serviço** conforme a legislação do país (no Brasil, nota fiscal de serviço eletrônica — NFS-e).

12.2. O documento fiscal relativo ao **Valor Base e à Taxa de Limpeza**, quando exigido, é de responsabilidade do Anfitrião, que deve emiti-lo ao Locatário conforme sua legislação. A Plataforma disponibiliza os dados necessários.

12.3. Locatários pessoa jurídica devem informar sua identificação fiscal (por exemplo, CNPJ, RFC, NIF, VAT number) para constar nos documentos.

## 13. Prevenção à fraude, AML e KYC

13.1. A Plataforma adota procedimentos de **conheça seu cliente (KYC)** e de **prevenção à lavagem de dinheiro e ao financiamento do terrorismo (AML/CFT)**, incluindo verificação de identidade e de titularidade de contas bancárias, triagem em listas de sanções, monitoramento de transações atípicas, limites operacionais e verificação reforçada (3-D Secure, confirmação por *link*).

13.2. A Plataforma pode recusar, cancelar ou reter pagamentos e repasses com indícios de fraude, uso de cartão de terceiros, operações simuladas ou incompatíveis com o perfil, e comunicar as autoridades competentes conforme a lei.

13.3. Os dados de cartão são coletados e tokenizados diretamente pelo Mercado Pago ou pela Stripe, certificados PCI DSS; eles nunca transitam pelos servidores da Plataforma, que não recebe nem armazena o número completo do cartão nem o código de segurança. Autenticação reforçada (3-D Secure ou equivalente) pode ser exigida pelo processador ou pela regulação local (por exemplo, SCA na União Europeia e no Reino Unido).
