# Integração Asaas — reserva paga, retenção de 30% e assinatura por intervalo

> Especificação para o backend. A demo (`demo/index.html`, abas Reservar online, Avisos e Assinatura) já mostra o fluxo, sem cobrar nada. Conferir os campos na documentação atual do Asaas (docs.asaas.com) antes de codar. A chave da API (`access_token`) é digitada pelo dono na tela de integração, nunca no código nem no chat. Mexe em cobrança, banco e segredo: vira PR para o Robson decidir.

## 1. Reserva online com pagamento antecipado
1. Cliente escolhe serviço e horário; o horário fica **bloqueado por 10 min** (status `aguardando_pagamento`).
2. O cliente lê e marca o aceite: "Não comparecer sem avisar retém 30% do valor; devolvemos 70%". Guardar data, IP e texto aceito.
3. Backend cria o cliente no Asaas (`POST /v3/customers`, uma vez por pessoa) e a cobrança (`POST /v3/payments`) com `billingType` `PIX` ou `CREDIT_CARD`, `value`, `dueDate` de hoje e `externalReference` = id da reserva.
4. Pix: devolver o QR Code (`GET /v3/payments/{id}/pixQrCode`). Cartão: usar a página de pagamento do Asaas (`invoiceUrl`) ou tokenização, para o cartão nunca passar pelo nosso servidor.
5. **Webhook** `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` → reserva vira `confirmada`, agenda definitiva, Robô Lembrete agenda os avisos. Sem pagamento em 10 min → libera o horário.
6. Validar o webhook pelo token de autenticação configurado no Asaas e tratar eventos repetidos (idempotência).

## 2. Cancelamento e não comparecimento
| Situação | Ação no Asaas |
|---|---|
| Cancelou até X horas antes (padrão 24 h, configurável) | estorno total: `POST /v3/payments/{id}/refund` |
| Não compareceu | estorno parcial de **70%**: mesmo endpoint com `value` = 70% do pago; 30% ficam com o salão |
| Compareceu | nada a estornar |

- Percentual de retenção e prazo são configuráveis por salão (padrão 30% e 24 h).
- O salão marca "compareceu / faltou" na agenda; marcação automática pode ser sugerida pelo robô após o horário, mas o estorno parcial exige confirmação do salão.
- Pix e cartão aceitam estorno; conferir prazos e taxas retidas pelo Asaas, que podem reduzir o valor líquido.
- Tudo grava em `reserva_financeiro` (valor pago, retido, devolvido, id do estorno).

## 3. Assinatura com horário recorrente (semanal, 15/15, 30/30, 45/45, 60/60)
O Asaas oferece assinaturas com ciclos fixos (semanal, quinzenal, mensal, bimestral…). Por isso:
- **Semanal, 15/15 (quinzenal), 30/30 (mensal) e 60/60 (bimestral):** usar `POST /v3/subscriptions` com o `cycle` correspondente, ou, se preferir uma regra única, o item abaixo.
- **45/45 e qualquer intervalo em dias:** não existe ciclo nativo. Solução única para todos: o nosso sistema gera, a cada visita, uma cobrança avulsa (`/v3/payments`) com **7 dias de antecedência** e vencimento na data da visita, usando o cartão tokenizado do cliente (cobrança automática) ou enviando Pix.
- Ao assinar: reservar as próximas 6 datas no mesmo horário e profissional. Se uma data não estiver livre, o Robô Encaixe propõe o horário mais próximo ao cliente.
- Cobrança não paga até 24 h antes → libera o horário e avisa o cliente. Cancelar a assinatura cancela as cobranças e reservas futuras ainda não pagas.
- A regra de não comparecimento (30%) vale para cada visita da assinatura.

## 4. Avisos
Confirmação da reserva, lembrete 24 h (1 confirma / 2 remarca / 3 cancela), lembrete 2 h, falta registrada, pós-atendimento e aviso do próximo horário da assinatura. Enviados pelo WhatsApp (API oficial), com SMS e e-mail como reserva. Modelos na aba Avisos da demo.

## 5. Dados (proposta, ainda não aplicada)
Tabelas novas, todas com RLS ligado e sem acesso para `anon`/`authenticated`, em `backend/prisma/manual-migrations/`: `salao_reserva`, `salao_reserva_financeiro`, `salao_assinatura`, `salao_assinatura_visita`, `salao_politica`, `salao_aviso_log`, `salao_webhook_evento`. O SQL será colado no projeto **DentalPos One** (`lfeqfzvmasqnnmqvkjyg`) pelo Robson, conferindo o nome do projeto na tela.

## 6. Cuidados legais
Texto da política de retenção no contrato do salão com o cliente final e no aceite da reserva precisa de revisão da Dra. Roberta (Código de Defesa do Consumidor: informação clara e prévia). Minuta em `docs/contratos/TERMO-USO-CLIENTE-FINAL.md`.
