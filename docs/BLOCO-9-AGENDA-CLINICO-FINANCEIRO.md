# DentalPos One — Bloco 9 — Agenda + Clínico + Orçamentos + Financeiro + REVAH

Implementado em 23/08/2026.

## Implementações
- Agenda com visualização Dia / Semana / Mês.
- Filtro por todos os profissionais ou profissional individual.
- Indicador financeiro diretamente na agenda: Financeiro OK / pendência / quantidade de parcelas vencidas.
- Categorias de consulta: 1ª consulta, em tratamento, retorno, pagamento, periódico, marketing, indicação, urgência e outros.
- Central lateral de pendências derivada do estado real do sistema; avisos persistem enquanto a condição existir.
- Alertas para falta ainda não remarcada, atendimento concluído sem próximo retorno e conferência de cobrança.
- Agendamento online público em /agendamento-online.
- Confirmações programadas no REVAH: no agendamento, 1 dia antes e no dia, com escolha WhatsApp ou SMS.
- Odontograma com correção, alteração de status e remoção de marcação, preservando trilha de auditoria.
- Catálogo clínico CBHPO por código/nome integrado ao prontuário, próximo procedimento, agenda e orçamento.
- Orçamento com múltiplos procedimentos, dente/fase, desconto, entrada, parcelamento, acréscimo, PIX/cartão/boleto/transferência/dinheiro e Asaas/Stripe/Banco/Manual.
- Aprovação do orçamento gera contas a receber.
- Financeiro com exportação CSV, envio para fila de cobrança REVAH e ações preparadas para PIX/boleto Asaas.
- Digitalização financeira: captura de foto/arquivo de boleto, nota, recibo ou comprovante; classificação Livro Caixa ou Empresa.
- Pacientes com painel rápido: total, ativos, em tratamento, inadimplentes, novos no mês e finalizados.

## Fonte da nomenclatura odontológica
A ABO Nacional divulga a CBHPO e direciona ao material do CFO. O catálogo inicial desta versão usa a nomenclatura pública CBHPO disponibilizada pelo CFO/ANS, sem tabela de honorários. Os valores continuam configuráveis pela clínica.

## Integrações externas
Os fluxos estão preparados, porém envio real de WhatsApp/SMS e emissão real de PIX/boleto dependem das credenciais e webhooks de Z-API/Comtele/Asaas/Stripe/bancos configurados por clínica.
