# Meta Ads (Facebook + Instagram) — Studio Beauty Barber

**Objetivo da campanha:** Cadastros (Leads) — destino: site (`https://studiobeautybarber.com/?utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}`).
**Público inicial:** Brasil, 25–55 anos; interesses: "Salão de beleza", "Barbearia", "Empreendedorismo", "Gestão de pequenas empresas"; cargos: "Proprietário de salão". Posicionamentos: Advantage+ (Feed, Stories, Reels). Orçamento: definido por você.
**Pixel/Conversions API:** preencha `metaPixelId` em `landing/config.js`; evento `Lead` já dispara ao enviar o formulário (após consentimento de cookies).

## Cards (pasta `ads/out/`)
| Posição | Arquivo |
|---|---|
| Feed 1:1 | `*_feed-1x1.png` |
| Feed 4:5 | `*_feed-4x5.png` |
| Stories/Reels 9:16 | `*_story-9x16.png` (texto dentro da zona segura) |
| Link 1,91:1 | `*_link-1.91x1.png` |

## Textos (7 variações para teste A/B)
**E — Reserva paga** (`reserva_*`)
- Texto principal: Cliente que falta sem avisar custa caro. Com a reserva paga, ele garante o horário no Pix ou cartão e aceita a regra: faltou sem avisar, você retém 30% e devolve 70%. Cancelou no prazo, devolve tudo. Tudo automático.
- Título: Acabe com o prejuízo das faltas
- Descrição: Teste grátis por 14 dias
- Botão: Saiba mais

**F — Clube** (`clube_*`)
- Texto principal: Transforme cliente fiel em receita todo mês. No clube de assinatura, o cliente tem o horário garantido de 7, 15, 30, 45 ou 60 em 60 dias, com cobrança automática antes de cada visita.
- Título: Clube de assinatura para salões
- Descrição: Horário fixo, receita recorrente
- Botão: Cadastre-se

**G — Preço** (`preco_*`)
- Texto principal: Sistema completo para o seu salão a partir de R$ 59,90 por mês. Planos de R$ 59,90, R$ 129, R$ 249 e R$ 559, conforme o tamanho da equipe. 14 dias grátis, sem fidelidade.
- Título: A partir de R$ 59,90 por mês
- Descrição: 14 dias grátis
- Botão: Cadastre-se

**A — Agenda** (`agenda_*`)
- Texto principal: Sua agenda cheia, sem planilha e sem perder tempo no WhatsApp. O Studio Beauty Barber reúne agenda online, caixa, comissões e clientes em um só lugar. Teste grátis por 14 dias, sem cartão.
- Título: Gestão para salões e barbearias
- Descrição: Teste grátis por 14 dias
- Botão: Cadastre-se

**B — Robô** (`robo_*`)
- Texto principal: Cliente chamando às 22h? O robô responde preços e horários e agenda por você no WhatsApp, Instagram e Facebook. Você assume a conversa quando quiser.
- Título: Robô de agendamento para salões
- Descrição: Teste grátis por 14 dias
- Botão: Saiba mais

**C — Faltas** (`faltas_*`)
- Texto principal: Cliente que esquece o horário é dinheiro perdido. Lembretes automáticos 24h e 2h antes ajudam a manter a agenda cheia. Simples de configurar.
- Título: Menos faltas, mais faturamento
- Descrição: 14 dias grátis, sem fidelidade
- Botão: Cadastre-se

**D — Oferta** (`gratis_*`)
- Texto principal: Organize seu salão ou barbearia em um dia. Agenda online, caixa e campanhas. 14 dias grátis, sem cartão e sem fidelidade.
- Título: Teste grátis por 14 dias
- Descrição: Sem cartão de crédito
- Botão: Cadastre-se

## Regras e cuidados (políticas da Meta)
- Não prometa resultados garantidos nem use números inventados; não usar depoimentos falsos.
- Não use logotipos da Meta/WhatsApp nos criativos (os cards usam ícones próprios).
- Mensagens a clientes finais: o salão usa o WhatsApp Business API da própria conta; modelos de mensagem precisam de aprovação da Meta.
- Não faça disparo em massa sem consentimento (o sistema só envia a quem autorizou e respeita "PARAR").

## Testes sugeridos
1. 7 anúncios × 1 conjunto, 7 dias, mesmo orçamento; escolha pelo custo por lead. Comece por E (reserva paga), A e G.
2. Depois, teste público (donos de barbearia × donos de salão feminino).
