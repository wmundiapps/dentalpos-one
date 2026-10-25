# Vendeu — modelo de negócio vigente (fonte única para textos, telas e divulgação)

Decisão do dono (Robson, 26/10/2026): **a negociação acontece toda dentro da plataforma, sem contato entre comprador e vendedor até o produto ser recebido.** Esta página descreve o que o servidor (`server/src/orders.ts`) já faz.

## Fluxo da compra (Compra e Locação)
1. **Anúncio.** Anunciar não custa nada. Para publicar, o vendedor precisa: e-mail e telefone verificados, identidade verificada, **conta Mercado Pago conectada** (é por onde ele recebe; login do próprio Mercado Pago, o Vendeu não vê senha nem dados bancários) e a declaração de origem assinada. Contato do vendedor nunca aparece no anúncio.
2. **Pedido.** O comprador clica **Comprar** (ou **Alugar**) pelo preço cheio, ou envia uma **proposta** (mínimo 50% do preço; o vendedor tem 48 h para aceitar/recusar). Escolhe **envio** (informa endereço de entrega) ou **retirada em mãos**. O anúncio fica **reservado** e sai da vitrine. O comprador tem 24 h para pagar (Pix); não pagou, expira e o anúncio volta.
3. **Pagamento retido.** O comprador paga **no Vendeu, por Pix, via Mercado Pago**. O dinheiro fica **retido no Mercado Pago** (não passa por conta do Vendeu) até o fim do processo. O vendedor é avisado para enviar.
4. **Entrega.**
   - *Envio:* o vendedor envia em até 5 dias (senão o valor é devolvido automaticamente) e informa o rastreio. O comprador confirma "Recebi"; se não responder em 10 dias após o envio, considera-se recebido.
   - *Retirada em mãos:* o comprador vê um **código de 6 dígitos** no app e só o passa ao vendedor quando recebe o produto; o vendedor digita o código (5 tentativas) e isso confirma o recebimento.
5. **Contato liberado só depois do recebimento.** Antes disso, mensagens passam pelo chat do Vendeu com **telefone, e-mail, links e @usuário ocultados** automaticamente. Depois do recebimento, nome, telefone e e-mail do outro lado aparecem no pedido, para os dois.
6. **Prazo de devolução: 7 dias** a partir do recebimento.
   - **Devolveu:** o comprador pede a devolução (motivo livre) dentro dos 7 dias; combina com o vendedor; quando o vendedor confirma que o produto voltou, o Mercado Pago **devolve 100% ao comprador e ninguém paga nada, nem comissão**. O anúncio volta à vitrine. Se o vendedor não confirmar em 10 dias, a moderação decide.
   - **Não devolveu:** passados os 7 dias, o valor é **repassado ao vendedor, menos a comissão do Vendeu**, e o anúncio fica como vendido.
7. **Problemas:** qualquer lado pode abrir **disputa** (não recebi, diferente do anunciado, comprador alega que não recebeu mas o rastreio mostra entrega). A moderação decide: devolver ao comprador ou liberar ao vendedor. Cancelamento depois de pago e antes do envio devolve tudo.

## Quanto custa (para o vendedor)
- Anunciar: **R$ 0**.
- **Comissão** só quando a venda/locação se conclui (descontada do repasse): até R$ 150 = R$ 15; 150,01–500 = R$ 20; 500,01–1.000 = R$ 30; 1.000,01–1.500 = R$ 50; 1.500,01–2.000 = R$ 80; 2.000,01–3.000 = R$ 100; acima de R$ 3.000: R$ 100 + R$ 50 a cada R$ 1.000 (ou fração). Base: valor combinado do pedido. Locação: sobre o valor do aluguel combinado, uma vez.
- **Retirar um anúncio já publicado sem vender: R$ 10,00** (taxa fixa, cobrada por Pix/link; 7 dias; atraso > 3 dias bloqueia novos anúncios). Sem cobrança: rascunho nunca publicado, anúncio recusado ou retirado pela moderação, pausar/retomar. Não dá para retirar enquanto há pedido em andamento.
- **Comprador:** paga só o preço combinado (sem taxa extra). Devolução: dinheiro integral de volta.

## Tom e limites de comunicação
- Pode dizer: "pagamento retido até você receber", "contato só depois do recebimento", "7 dias para devolver", "dinheiro devolvido integralmente se devolver", "anunciar não custa nada".
- Não pode dizer: "100% seguro", "compra garantida", "sem golpes", "o Vendeu garante o produto". O Vendeu é plataforma de anúncios; o pagamento é processado e retido pelo **Mercado Pago**; a moderação decide disputas com base nas informações dos pedidos.
- Nunca use "grátis" sozinho; junte "só paga comissão quando a venda se conclui".
- Imóveis e automóveis usam o mesmo fluxo (decisão pendente do Robson sobre valores altos; não prometa nada específico sobre eles nas peças).

## Pontos técnicos pendentes (não prometer em peças)
Pagamento por cartão do comprador (hoje só Pix em produção); repasse automático depende de habilitação "Pagamentos Avançados" do Mercado Pago e de validação no sandbox.
