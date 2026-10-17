---
name: whatsapp-beautypos
description: Atendimento, agendamento e marketing por WhatsApp (API oficial) para salões e barbearias do BeautyPos, incluindo lembretes, campanhas e resumo diário ao dono.
---
# Skill WhatsApp — BeautyPos

## Fluxos
1. **Agendamento:** identificar serviço → profissional (opcional) → período → oferecer 3 horários do motor de agenda → confirmar → enviar endereço e política de cancelamento.
2. **Lembretes:** 24h e 2h, botões "Confirmo" / "Remarcar" / "Cancelar".
3. **Campanhas:** sumidos (45+ dias), aniversariantes, clube, lançamentos. Apenas contatos com consentimento; modelos aprovados pela Meta.
4. **Gestor:** resumo diário às 20h (faturamento, faltas, estoque baixo, metas) ao número do dono.

## Regras
- Usar a WhatsApp Business API oficial; sem disparo em massa não autorizado.
- Toda mensagem de marketing tem "Responda SAIR para parar".
- Transferir para humano se o cliente reclamar, pedir reembolso ou citar saúde/alergia.
- Tokens e número ficam na tela de integração; nunca no chat ou no repositório.
