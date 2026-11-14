# Precificação definida (uso interno WMundi — NÃO enviar ao cliente sem aprovação)

## 1. Estrutura (decidida pelo Robson em 2026-11-14)
| Item | Valor |
|---|---|
| Mensalidade fixa | **R$ 41.900,00/mês**, com **franquia de até 20.000 alunos ativos** |
| Acima da franquia | **R$ 1,20 por aluno ativo adicional/mês** |
| Integrações com sistemas atuais | **tarifa única R$ 30.000,00**: 10x de R$ 3.000,00 ou **10% de desconto à vista (R$ 27.000,00)** |
| IA (tokens), WhatsApp e SMS | **pagos direto aos fornecedores, sem intermediação** (opção A) |
| Implantação | 90 dias, com agente presencial |
| Atualizações | semanais, incluídas |
| Teste | 3 meses sem custo (a confirmar) |
| Apps Apple/Android | R$ 50.000 em 10x · hospedagem R$ 1.690/mês + R$ 1,02 por app baixado/mês |
| Polos e unidades avançadas | módulos adicionais com orçamento negociado |

## 2. Simulação mensal (só a licença)
| Alunos ativos | Licença | Por aluno |
|---|---|---|
| 3.000 | R$ 41.900 | R$ 13,97 |
| 8.000 | R$ 41.900 | R$ 5,24 |
| 15.000 | R$ 41.900 | R$ 2,79 |
| 20.000 | R$ 41.900 | R$ 2,10 |
| 30.000 | R$ 53.900 | R$ 1,80 |

Preciso do número de alunos ativos da Uningá para saber em qual linha ela está.

## 3. Argumento de custo para o cliente (com as suas estimativas, NÃO confirmadas)
Estimativas do Robson para o que a Uningá paga hoje: Octadesk ≈ R$ 23.000/mês (+ tokens), Leadlovers ≈ R$ 1.000, Dynadoc ≈ R$ 4.000–5.000, Jacad desconhecido, Flugo desconhecido.
- Soma sem Jacad e Flugo: **R$ 28.000 a R$ 29.000/mês**.
- Se o EduMaster substituir esses sistemas, a proposta de R$ 41.900 fica mais barata se Jacad + Flugo custarem mais de ≈ **R$ 13.000 a R$ 14.000/mês**.
- A conta só vale com contratos ou faturas reais.

## 4. Preços públicos pesquisados (2026-11-14) — pouco confiáveis
Nenhum fornecedor publica tabela oficial para o porte de uma universidade:
- **Octadesk:** só preços de entrada em comparadores (algo como R$ 149–199/mês no plano básico). Valor de universidade é sob proposta, com créditos de WhatsApp. A estimativa de R$ 23.000 é plausível, mas não confirmei.
- **Leadlovers:** planos de entrada a partir de ~R$ 197/mês (US$ 47). Volumes grandes são negociados.
- **Dynadoc:** não achei preço público. Pode haver confusão com produtos de nome parecido.
- **Jacad:** sem preço público; costuma ser sob proposta. A empresa informa mais de 500 mil alunos atendidos e integrações com outras plataformas.
- **Flugo:** o EduMaster substitui (módulo de salas, laboratórios e horários).
Melhor caminho: pedir ao cliente as faturas dos cinco sistemas.

## 5. Integrações (tarifa única de R$ 30.000)
Nenhuma está construída. Cada uma depende da documentação de API e do acesso que a instituição fornecer.
| Sistema | Proposta |
|---|---|
| Jacad | importar alunos, matrículas, notas e financeiro; convivência na transição |
| Flugo | **substituído** pelo módulo de salas, laboratórios e horários (geração automática); importar o que já está cadastrado |
| Dynadoc | documentos e assinaturas ligados à secretaria e ao agente de análise de documentos |
| Octadesk | agentes de IA e departamentos por API/webhook, ou migrar os canais para o EduMaster |
| Leadlovers | leads para o funil de admissões e retorno do status da matrícula |

Risco: se a API de algum fornecedor for fechada ou cobrada à parte, o escopo muda. Colocar essa cláusula no contrato.

## 6. Biblioteca Pearson
- O **conteúdo** (livros e acervo) é licenciado pela editora e **não podemos fornecê-lo**. Continua sendo contratado pela instituição.
- O EduMaster faz a **administração e o controle**: cadastro da assinatura (institucional ou adesão individual com cobrança), link de acesso no portal do aluno, registro de acessos, bibliografia por disciplina e sugestão de aquisição.
- Login único e relatórios de uso dependem da Pearson. Instituições brasileiras costumam acessar a Biblioteca Virtual Pearson por link no portal ou no sistema da biblioteca; não achei API pública. Consultar a Pearson.

## 7. Pendências
1. Número de alunos ativos da Uningá.
2. Faturas dos cinco sistemas (para fechar o argumento de custo).
3. Confirmar o teste grátis de 3 meses.
