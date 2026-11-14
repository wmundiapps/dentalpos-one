# Sugestão de precificação (uso interno WMundi — NÃO enviar ao cliente sem aprovação)

Valores de consumo abaixo são **referências para cálculo**, não tabelas oficiais: confirme preços atuais de WhatsApp (Meta), SMS e IA com os fornecedores antes de fechar.

## 1. Estrutura sugerida
| Item | Valor sugerido | Observação |
|---|---|---|
| Mensalidade fixa | **R$ 42.000,00/mês** | todos os módulos, atualizações semanais, suporte, hospedagem do sistema |
| Valor por aluno ativo | **R$ 2,90/mês** | R$ 1,90 anterior + R$ 1,00 pedido |
| Implantação | 90 dias, com agente presencial | incluída (ou à parte, se preferir cobrar) |
| Teste | 3 meses sem custo (a confirmar) | |
| Apps Apple/Android | R$ 50.000 em 10x · hospedagem R$ 1.690/mês + R$ 1,02 por app baixado/mês | opcional, como já definido |
| Unidades avançadas/polos | orçamento adicional negociado | marketing, agenda e demais módulos |
| Integrações com sistemas atuais | orçamento por integração (ver item 3) | |

## 2. Consumo: tokens de IA, SMS e WhatsApp
**Opção A (recomendada, mais simples de defender):** a instituição contrata e paga direto aos fornecedores (Meta/WhatsApp, operadora de SMS, provedor de IA). **Sem margem e sem repasse da WMundi.** É o que já constava na proposta.

**Opção B (pacote "tudo incluído"):** soma ao valor por aluno uma franquia de consumo.
- Franquia por aluno ativo/mês (hipótese de uso): 4 WhatsApp de utilidade, 0,5 de marketing, 1,5 SMS e 3 conversas atendidas por IA.
- Custo de referência por unidade (a confirmar): WhatsApp utilidade R$ 0,05 · WhatsApp marketing R$ 0,40 · SMS R$ 0,09 · conversa de IA R$ 0,03.
- Custo da franquia: ≈ **R$ 0,62 por aluno/mês**. Sugestão de cobrança: **R$ 0,90 por aluno/mês** (cobre variação de preço e gestão). Excedente cobrado ao custo + 20%, com extrato mensal.
- Risco da B: se o preço do fornecedor subir ou o uso for maior, a margem some. Por isso exigir cláusula de reajuste do consumo.

## 3. Simulação mensal (mensalidade + valor por aluno)
| Alunos ativos | Licença (42.000 + 2,90/aluno) | Licença por aluno | Consumo A (direto ao fornecedor) | Total A | Opção B (licença + 0,90/aluno) | B por aluno |
|---|---|---|---|---|---|---|
| 3.000 | R$ 50.700 | R$ 16,90 | ≈ R$ 1.875 | R$ 52.575 | R$ 53.400 | R$ 17,80 |
| 8.000 | R$ 65.200 | R$ 8,15 | ≈ R$ 5.000 | R$ 70.200 | R$ 72.400 | R$ 9,05 |
| 15.000 | R$ 85.500 | R$ 5,70 | ≈ R$ 9.375 | R$ 94.875 | R$ 99.000 | R$ 6,60 |
| 30.000 | R$ 129.000 | R$ 4,30 | ≈ R$ 18.750 | R$ 147.750 | R$ 156.000 | R$ 5,20 |

Obs.: o fixo de R$ 42.000 pesa muito em instituição pequena. Se a Uningá tiver poucos alunos ativos, considerar degraus (ex.: fixo menor até X alunos). **Preciso do número de alunos ativos para fechar a proposta.**

## 4. Integração com os sistemas que eles já têm
Nenhuma integração com estes sistemas está construída hoje. O que existe no EduMaster: importação/cadastro, rotas de API próprias, caixa de notificações e canais de comunicação. O que cada integração exige: **documentação de API/webhook e credenciais de cada fornecedor, fornecidas pela instituição.** Escopo e prazo só podem ser confirmados depois de ler essa documentação.

| Sistema | Papel provável | Como integrar (proposta) | Ponto a validar |
|---|---|---|---|
| Jacad | sistema acadêmico/financeiro atual | **Migração e convivência:** importar alunos, matrículas, notas e financeiro; sincronização enquanto os dois rodam; depois descontinuar o que for substituído | há API aberta? exportação em lote? quais módulos ficam |
| Flugo | a confirmar com o cliente | conforme a função (captação, atendimento ou processos) | **qual o uso hoje** |
| Dynadoc | documentos / assinatura digital | documentos e assinaturas conectados à secretaria e ao agente de análise de documentos | API de envio, consulta e status de assinatura |
| Octadesk | atendimento omnicanal | manter como porta de entrada e plugar os agentes de IA e os setores via API/webhook, ou migrar os canais para o EduMaster | quais canais já estão no Octadesk (WhatsApp, e-mail, chat) |
| Leadlovers | automação de marketing e funil | leads de campanha entram no funil de admissões; status de matrícula volta ao Leadlovers | webhooks e campos de lead |

**Precificação sugerida:** cada integração como **projeto à parte**, com orçamento fechado depois da análise da API do fornecedor. Faixa de referência para negociar: **R$ 12.000 a R$ 25.000 por integração** (única) + manutenção incluída na mensalidade enquanto a API do fornecedor não mudar. Jacad tende a ser a maior, por envolver migração.

## 5. O que preciso que você decida
1. Opção A (consumo direto) ou B (pacote)?
2. Confirma R$ 42.000 + R$ 2,90/aluno? E o teste grátis de 3 meses?
3. Número aproximado de alunos ativos da Uningá.
4. Integrações: cobrar à parte (faixa acima) ou incluir parte na implantação?
5. O que é o Flugo para eles, e se há acesso à documentação dos cinco sistemas.
