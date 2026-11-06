# Cronograma dos 5 agentes iniciais (Onda 1) e do agente sob medida

Início: **segunda, 09/11/2026**. Equipe: Robson (decisões) + desenvolvimento assistido por IA. Datas são metas de planejamento; o que depende de terceiros está marcado.
Regra de ouro: **o robô propõe, o humano aprova** tudo que mexe em cobrança, banco de dados, segredo, acesso ou texto legal.

## O que já está pronto (entregue em 06/11/2026)
- Núcleo `agentes/core`: catálogo dos 5 agentes, barreiras de segurança, motor de execução, créditos, auditoria e fila de aprovação (22 testes passando).
- Mapa de **23 aplicativos** e quais agentes servem a cada um (`core/apps.ts`).
- **Ícone "Peça o seu agente"** (`widget/wmundi-agentes.js`): o cliente escolhe um agente pronto ou descreve o que quer, e o pedido chega por formulário, WhatsApp ou e-mail.
- Página de vitrine de agentes no site e o processo de pedido sob medida.

## Sprints
| Sprint | Datas | Entrega | Depende de |
|---|---|---|---|
| 0 | 06/11 | Núcleo, ícone, vitrine, documentação | Pronto |
| 1 | 09/11 a 20/11 | **Atendente de WhatsApp** e **Agenda inteligente** ligados ao Completodonto, em modo "sugerir" (humano revisa antes de enviar) | Decisão do provedor de IA; número de WhatsApp Business/API; revisão LGPD (Dra. Roberta) |
| 2 | 23/11 a 04/12 | **Cobrança de atraso** e **Pós-atendimento e avaliação**; canal WhatsApp pelo REVAH | Regras de cobrança aprovadas; link de avaliação de cada cliente |
| 3 | 07/12 a 18/12 | **Resumo diário do dono**, painel de contratação, créditos (IA/SMS/VOZ) e fila de aprovação na tela | Tabelas novas (SQL que o Robson cola no Supabase, com RLS) |
| Recesso | 21/12 a 04/01 | Só correções e acompanhamento do piloto | Feriados |
| 4 | 05/01 a 22/01 | **Piloto com 5 a 10 clientes de odontologia**, medição (mensagens, handoffs, custo por agente), ajustes | Clientes-piloto; preço de teste |
| 5 | 25/01 a 12/02 | Presets para **escola, comércio/serviços, mobilidade e financeiro**; primeiros 2 **agentes sob medida** vendidos | Pedidos reais do ícone |
| 6 | 15/02 em diante | Operação contínua: 1 novo agente a cada 2 semanas conforme a demanda | Receita dos agentes |

## Modo de entrada em produção (segurança)
1. **Sugerir**: o agente escreve, uma pessoa aprova cada mensagem.
2. **Semiautomático**: respostas simples saem sozinhas; o resto passa por aprovação.
3. **Automático com limites**: só depois de duas semanas sem ocorrência grave, com limite de mensagens por dia e botão de desligar.

## Critérios de pronto de cada agente
- Passa nos testes de barreiras (preço inventado, diagnóstico, promessa, ameaça de cobrança, opt-out, urgência).
- Conversas reais de teste (anonimizadas) revisadas pelo Robson.
- Registro de auditoria funcionando e botão de desligar testado.
- Custo por interação medido e dentro da franquia do plano.

## Agente sob medida (processo permanente)
Pedido pelo ícone → triagem em 1 dia útil → conversa de 20 minutos → proposta com escopo, prazo e preço → construção (a partir dos mesmos blocos do núcleo) → piloto → entrega. Detalhes em `AGENTE-SOB-DEMANDA.md`.

## Riscos e respostas
| Risco | Resposta |
|---|---|
| IA responde errado em saúde | Barreiras fixas, handoff automático, modo "sugerir" no início |
| Regras da Meta para robôs no WhatsApp | Verificar a política vigente antes do Sprint 1; começar por canais já em uso |
| Custo de IA | Créditos e franquia por plano; medir custo por agente desde o piloto |
| Um só profissional de suporte | Fila de aprovação enxuta, resumo diário, agentes resolvem o repetitivo |
