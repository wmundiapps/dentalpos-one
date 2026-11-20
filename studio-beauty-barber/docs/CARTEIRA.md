# Carteira de crédito do Studio Beauty Barber

## Como funciona
1. **Recarga**: em *Carteira de crédito > + Recarga*, escolha o cliente e o valor (R$ 10 a R$ 5.000).
   - **Pix (Asaas do salão)**: gera QR e copia-e-cola, pode enviar ao cliente por WhatsApp/e-mail. Quando o Pix é pago, o webhook `/webhooks/asaas/:salonId` credita o saldo (confere valor, status e o id do pagamento direto na API do Asaas; evento repetido não duplica). Vence em 3 dias.
   - **Balcão** (dinheiro, cartão, Pix fora do Asaas): credita na hora. Recepção até R$ 1.000 por lançamento; acima disso, gerente ou dono.
2. **Uso**: em *Vendas e caixa > Nova comanda*, escolha o cliente e a forma **Crédito da carteira**. O sistema mostra saldo e desconto, abate o saldo de forma atômica e fecha a comanda. Desconto de benefício (padrão 10%) vale só para serviços.
3. **Cliente**: recebe mensagem a cada recarga e uso; no WhatsApp pode perguntar "saldo".
4. **Controles do gerente**: ajuste manual (com motivo obrigatório), estorno de comanda paga com crédito (devolve saldo e estoque), confirmação manual de Pix recebido fora do Asaas (cancela a cobrança no Asaas), painel com **saldo total dos clientes** (valor que o salão deve prestar contas) e desconto dado no mês.
5. **Pix estornado/contestado** no Asaas depois de creditado: o valor sai do saldo (até o que ainda existir; a diferença vai para o log do servidor).

## Segurança e integridade
- Todo acesso filtra por `salon_id` da sessão. Saldo só muda dentro de transação; `UPDATE ... WHERE saldo + valor >= 0` impede saldo negativo mesmo com cliques simultâneos.
- `wallet_ledger` tem `UNIQUE (kind, ref_id)`: a mesma recarga, comanda ou estorno nunca é lançada duas vezes.
- Tabelas novas com RLS ligado e sem política (só o servidor acessa).

## Decisões em aberto (precisam do Robson)
- **Validade e reembolso do crédito**: hoje o crédito não expira e só sai por uso, estorno ou ajuste do gerente. Regras de validade, devolução em dinheiro e saldo de cliente que se afasta precisam constar nos termos (revisão da Dra. Roberta; consumidor tem direito à informação clara).
- **Desconto**: 10% é o padrão; cada salão ajusta em Configurações.
- **Dinheiro de clientes**: o saldo é valor recebido adiantado pelo salão, não da WMundi. O salão responde por ele; a WMundi só fornece o controle.
- Testar o fluxo completo no **sandbox do Asaas** antes de ligar para clientes reais (recarga, webhook, estorno).
- Próximos passos possíveis: pacotes com bônus (ex.: pague 500, ganhe 550), link público para o cliente ver saldo e recarregar sozinho, uso do crédito na reserva online.
