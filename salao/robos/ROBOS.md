# Robôs do BeautyPos

Cada robô tem **gatilho**, **ação** e **limite** (nunca age sem log; ações sensíveis pedem aprovação do dono).

| # | Robô | Gatilho | Ação | Canal |
|---|---|---|---|---|
| 1 | Agendador | Mensagem do cliente | Entende o pedido, sugere horários (motor de agenda inteligente) e confirma | WhatsApp |
| 2 | Lembrete | 24h e 2h antes | Pede confirmação; sem resposta libera o horário para a lista de espera | WhatsApp/SMS |
| 3 | Retorno | Ciclo do serviço vencido (corte 25 dias, alisamento 90…) | Convida a voltar com link de agendamento | WhatsApp |
| 4 | Aniversário | Data de nascimento | Mensagem + cashback | WhatsApp/e-mail |
| 5 | Pós-venda | 2h após atendimento | Pesquisa de satisfação; nota alta pede avaliação no Google | WhatsApp |
| 6 | Encaixe | Cancelamento | Oferece a vaga à lista de espera | WhatsApp |
| 7 | Instagram | Semanal | Gera calendário, legendas, hashtags e roteiros de reels; publica após aprovação | Instagram |
| 8 | Facebook | Semanal / mensagem | Publica e responde comentários e Messenger | Facebook |
| 9 | Estoque | Saldo ≤ mínimo | Alerta e sugere pedido ao fornecedor | App |
| 10 | Fiscal | Pagamento recebido | Emite NFS-e/NF-e | Integração fiscal |
| 11 | Comissão | Fechamento | Calcula comissão, diária, split e arrendamento; gera extrato | App |
| 12 | Clube | Dia de cobrança | Cobra assinatura, trata inadimplência, controla créditos | Cartão/Pix |
| 13 | Reputação | Nova avaliação | Responde no tom da marca; negativa vai ao dono | Google |
| 14 | Gestor | Todo dia 20h | Resumo: faturamento, faltas, estoque, metas | WhatsApp do dono |

## Regras comuns
- Respeitar LGPD: só contatar quem tem consentimento; todo envio traz opção "SAIR".
- Janela de envio 8h–20h; limite diário por canal; sem repetir mensagem em 7 dias.
- Em dúvida, o robô passa a conversa para uma pessoa e registra.
- Credenciais (tokens Meta, WhatsApp Business API, etc.) são digitadas pelo dono nas telas de integração, nunca no chat nem no código.

Definição técnica: `robos/robos.json`.
