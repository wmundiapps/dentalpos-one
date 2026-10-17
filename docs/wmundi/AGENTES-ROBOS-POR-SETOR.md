# Agentes (robôs) por setor da Wmundi

## Regras para todos os robôs
1. **Dono humano** nomeado e **painel** com resultados, custo e erros.
2. **Registro de tudo** que o robô fez (quem, o quê, quando, por quê).
3. **Aprovação humana obrigatória** para: banco de dados, cobrança/pagamento, segredos e chaves, acesso e segurança, texto legal, comunicação em massa e qualquer dado sensível de saúde.
4. Robôs **nunca apagam**: corrigem ou adicionam (regra do projeto).
5. Robô nunca vê nem repete senha, chave ou token; usa cofre de segredos.
6. Cada robô tem **limite** (mensagens/dia, valor, custo) e **botão de desligar**.
7. Pendências, filas e avisos nunca somem.

## Estrutura
Cada setor tem **1 agente-gerente** (planeja, distribui, resume para o humano) e **agentes-operários**. Um **Agente Maestro** (nível empresa) junta os relatórios dos gerentes em um resumo diário para o Robson.

| Nível | Papel |
|---|---|
| Maestro | Resumo diário/semanal, alertas "VOCÊ ESTÁ EM RISCO", prioriza decisões humanas |
| Gerente de setor | Metas do setor, fila de tarefas, qualidade |
| Operário | Executa uma tarefa repetível |

## Catálogo por setor
| # | Setor | Gerente | Operários (exemplos) | Humano supervisor |
|---|---|---|---|---|
| 1 | **Diretoria e estratégia** | Maestro | Painel de métricas, radar de concorrentes, resumo de reuniões, acompanhamento de OKRs | Robson |
| 2 | **Produto** | Gerente de Produto | Coletor de feedback, priorização de pedidos, redator de especificações, testador de usabilidade | Líder de produto |
| 3 | **Engenharia** | Gerente de Engenharia | Revisor de código, gerador de testes, atualização de dependências, monitor de erros, gerador de migrações (SQL só para aprovação), documentador | Dev sênior |
| 4 | **Estúdio de apps** | Gerente do Estúdio | Gerador de telas, empacotador iOS/Android, conferidor de regras Apple/Google, redator de textos de loja, respondedor de avaliações | Dev mobile |
| 5 | **IA e dados** | Gerente de IA | Avaliador de qualidade de agentes, monitor de custo, curador de base de conhecimento, detector de alucinação | Líder de IA |
| 6 | **Marketing** | Gerente de Marketing | Redator de blog, roteirista de vídeo curto, agendador de redes sociais, gestor de anúncios, SEO, e-mail marketing | Marketing |
| 7 | **Comercial / vendas** | Gerente Comercial | Captador de leads, qualificador, enviador de proposta, follow-up, agendador de demonstração, gerador de contrato (minuta para aprovação) | Comercial |
| 8 | **Parcerias e revendas** | Gerente de Parcerias | Recrutador de parceiros, treinador, controle de comissão, material de venda por parceiro | Parcerias |
| 9 | **Atendimento e sucesso do cliente** | Gerente de CS | Atendente 24h (e-mail/WhatsApp), triagem de chamados, onboarding guiado, pesquisa de NPS, alerta de risco de cancelamento | CS |
| 10 | **Financeiro** | Gerente Financeiro | Conciliação, emissão e envio de cobranças, **cobrança de atraso**, previsão de caixa, relatório MRR | Financeiro/contador |
| 11 | **Jurídico e conformidade** | Gerente Jurídico | Monitor LGPD/GDPR, controle de contratos e prazos, respondedor de pedidos de titulares, aplicador das cláusulas-padrão (texto só com aprovação) | Dra. Roberta |
| 12 | **Pessoas (RH)** | Gerente de RH | Recrutamento (triagem), onboarding, ponto, férias, treinamento; funcionário só vê os próprios dados | RH |
| 13 | **Educação** | Gerente Acadêmico | Tutor, gerador de questões, corretor, emissor de certificados, lembretes de estudo | Coordenação |
| 14 | **Saúde (DentalPos e extensões)** | Gerente de Saúde | Agenda inteligente, confirmação de consulta, pós-atendimento, lembrete de retorno, cobrança de atraso da clínica, preenchimento assistido de prontuário (revisão do profissional) | Clínico responsável |
| 15 | **Serviços e espaços** | Gerente de Serviços | Reservas, check-in, limpeza/manutenção, faturamento de uso | Operações |
| 16 | **Automação** | Gerente de Automação | Construtor de fluxos, integrador, monitor de falhas de integração | Automação |
| 17 | **Infraestrutura e segurança** | Gerente de Segurança | Varredura de vulnerabilidades, monitor de uptime, backup/restauração, rotação de segredos (com aprovação), alerta de acesso suspeito | Segurança |
| 18 | **Internacional** | Gerente Internacional | Tradução e localização, preços por país, checklist de exigências locais (EUA/UE/BR), calendário fiscal | Diretor regional |
| 19 | **Comunidade e marca** | Gerente de Comunidade | Moderador, resposta em redes, eventos, programa de embaixadores | Marketing |

## Como "milhares de robôs" acontece
- **Um robô por cliente** (atendimento, agenda, cobrança de atraso): 1.000 clientes ≈ 3.000 robôs, mesmo código.
- **Um robô por tarefa recorrente interna** (relatórios, revisões, publicações).
- Os mesmos robôs viram **produto**: o que usamos por dentro, vendemos por fora.

## Ordem de construção (primeiros 10 robôs)
1. Atendente por e-mail/WhatsApp 2. Agenda (confirmação/remarcação) 3. Cobrança de atraso 4. Resumo diário do Maestro 5. Revisor de código 6. Redator de conteúdo 7. Qualificador de leads 8. Monitor de uptime/segurança 9. Onboarding guiado 10. Relatório de MRR.
