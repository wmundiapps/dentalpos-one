"""Carta-proposta de parceria, termos da parceria e termo de confidencialidade (empresa do Silvio Breda).
Campos entre colchetes são preenchidos antes do envio."""
from gerar_cartas import gerar, ass, L_PONTO, L_PREC, L_URB, EXP, brl, mes
import gerar_propostas as gp

PARTE = "**WMUNDI:** Instituto Ravel de Ensino Superior Ltda., CNPJ 03.162.275/0001-10, com sede na Av. XV de Novembro, 255, Sobreloja, Maringá-PR, e-mail info@wmundi.com, que atua sob a marca WMundi."
PARC = "**PARCEIRO:** [razão social da empresa do Silvio Breda], CNPJ [número], com sede em [endereço], e-mail [e-mail], representada por Silvio Breda, CPF [número]."

# ---------- Carta-proposta de parceria ----------
gerar("parceria-carta-proposta", "Carta-proposta de parceria comercial", [
    ("h2", "Carta-proposta de parceria comercial"),
    ("p", "A/C: **Silvio Breda** · **[Empresa]**"),
    ("p", "Prezado Silvio,"),
    ("p", "A WMundi convida a sua empresa para uma **parceria comercial** na oferta de soluções de tecnologia aos seus clientes. Trabalhamos com portfólio pronto, demonstrações interativas, propostas e materiais de apoio, e cuidamos do desenvolvimento, da instalação e da manutenção."),
    ("h3", "O que a WMundi entrega"),
    ("ul", ["Portfólio de soluções prontas: Ponto por Reconhecimento Facial, Precificador de Hotelaria (personalizável para qualquer segmento), UrbanFlow para prefeituras e outras soluções da apresentação anexa.", "Demonstrações para testar, cartas de apresentação e propostas comerciais.", "Desenvolvimento, instalação, atualização e manutenção dos sistemas.", "Suporte técnico aos seus clientes e treinamento para a sua equipe."]),
    ("h3", "O que a sua empresa faz"),
    ("ul", ["Apresenta as soluções aos clientes do seu relacionamento e abre as reuniões.", "Acompanha o cliente até o fechamento.", "Cuida da implantação na região dos clientes que vender.", "Mantém o relacionamento com o cliente depois da implantação."]),
    ("h3", "Condições resumidas"),
    ("table", [["Solução", "Participação do parceiro"],
               ["UrbanFlow (prefeituras)", "Dos 50% da arrecadação que não ficam com a prefeitura, 30% são do parceiro e 70% da WMundi (15% e 35% da arrecadação bruta)"],
               ["Ponto Facial e Precificador", "30% da receita recorrente (mensalidades) e 30% da implantação de cada cliente indicado"]]),
    ("p", f"Exemplo do UrbanFlow em uma cidade de referência com 800 vagas, no cenário base: arrecadação bruta de {brl(gp.base)} por mês, dos quais {brl(gp.base * .15)} para o parceiro."),
    ("h3", "Como seguimos"),
    ("ol", ["Você revisa os termos da parceria e o termo de confidencialidade anexos.", "Assinamos os dois documentos, inclusive por meio eletrônico.", "Liberamos o material e iniciamos as apresentações aos clientes que você indicar."]),
    ("p", f"Demonstrações para testar, disponíveis até {EXP}: {L_PONTO} · {L_PREC} · {L_URB}"),
] + ass, fluido=True)

# ---------- Termos da parceria ----------
gerar("parceria-termos", "Termos da Parceria Comercial", [
    ("h2", "Termos da Parceria Comercial"),
    ("p", PARTE),
    ("p", PARC),
    ("h3", "1. Objeto"),
    ("p", "Estes termos regem a parceria entre WMUNDI e PARCEIRO para a apresentação, indicação e acompanhamento comercial das soluções da WMUNDI (Ponto por Reconhecimento Facial, Precificador de Hotelaria e personalizações, UrbanFlow e as demais soluções do portfólio vigente), a clientes do relacionamento do PARCEIRO."),
    ("h3", "2. Natureza da parceria"),
    ("p", "A parceria é comercial e **não exclusiva** para ambas as partes. Não cria sociedade, vínculo empregatício, representação legal nem mandato. O PARCEIRO atua por conta própria, com seus meios e sua equipe, e não pode assinar contratos, receber pagamentos nem assumir obrigações em nome da WMUNDI."),
    ("h3", "3. Obrigações da WMUNDI"),
    ("ul", ["Fornecer demonstrações, cartas, propostas e materiais de apresentação.", "Desenvolver, instalar, atualizar e manter os sistemas contratados pelos clientes, e prestar suporte técnico.", "Treinar a equipe do PARCEIRO sobre as soluções.", "Enviar ao PARCEIRO relatório mensal das receitas que dão origem à participação."]),
    ("h3", "4. Obrigações do PARCEIRO"),
    ("ul", ["Cuidar da implantação local junto aos clientes que vender, com o apoio técnico da WMUNDI.", "Apresentar as soluções conforme os materiais e as informações fornecidas pela WMUNDI.", "Não prometer prazos, preços, descontos, resultados ou funcionalidades que não constem das propostas da WMUNDI.", "Manter a boa reputação da marca WMundi e usar o material de divulgação sem alterá-lo.", "Cumprir a legislação aplicável, inclusive a de proteção de dados e a anticorrupção."]),
    ("h3", "5. Registro de oportunidades"),
    ("p", "O PARCEIRO registra cada oportunidade por e-mail para info@wmundi.com, informando cliente, contato e solução. A WMUNDI confirma o registro em até 5 dias úteis. O registro confirmado vale por **12 meses**, e a participação do PARCEIRO se aplica aos contratos fechados com aquele cliente nesse período. Havendo mais de um registro do mesmo cliente, prevalece o primeiro."),
    ("h3", "6. Remuneração"),
    ("p", "**6.1 UrbanFlow.** Da arrecadação do rotativo efetivamente recebida, 50% pertencem ao município. Dos 50% restantes, **30% são do PARCEIRO e 70% da WMUNDI**, o que equivale a 15% e 35% da arrecadação bruta. A participação incide sobre os valores efetivamente arrecadados, enquanto o contrato com o município estiver vigente."),
    ("p", "**6.2 Ponto Facial e Precificador.** A participação do PARCEIRO é de **30% da receita recorrente** (mensalidades), enquanto o contrato do cliente estiver ativo e pago, e de **30% da implantação**, ambas sobre os valores efetivamente recebidos pela WMUNDI de cada cliente registrado. O PARCEIRO cuida da implantação na região dos clientes que vender, com o apoio técnico da WMUNDI. Serviços avulsos e personalizações orçadas à parte seguem a proposta específica do cliente. **6.3 Demais soluções.** A participação do PARCEIRO é definida na proposta específica de cada cliente, assinada pelas partes."),
    ("p", "**6.4 Pagamento.** A WMUNDI paga a participação até o dia 10 do mês seguinte ao recebimento, mediante nota fiscal do PARCEIRO e relatório demonstrativo. Impostos de cada parte são de sua responsabilidade."),
    ("h3", "7. Preços, propostas e contratos"),
    ("p", "Preços, prazos e condições são definidos pela WMUNDI. Os contratos com os clientes são firmados diretamente entre cliente e WMUNDI. Descontos ou condições especiais dependem de autorização escrita da WMUNDI."),
    ("h3", "8. Disponibilidade e atualizações"),
    ("p", "Os sistemas são atualizados semanalmente, com melhorias e correções. Durante as atualizações, o sistema poderá ficar temporariamente indisponível. Outras causas de indisponibilidade que não sejam de responsabilidade da WMUNDI, como falhas dos servidores e provedores de hospedagem, do banco de dados, da internet, de energia e de serviços de terceiros, serão tratadas junto aos servidores e às empresas responsáveis. Em caso de indisponibilidade, o cliente contata o suporte por e-mail."),
    ("h3", "9. Propriedade intelectual e marca"),
    ("p", "Sistemas, códigos, demonstrações, materiais e a marca WMundi são de propriedade da WMUNDI. O PARCEIRO recebe licença limitada, não exclusiva e revogável para usar os materiais de divulgação durante a parceria, nos termos fornecidos. O PARCEIRO não adquire direito algum sobre os sistemas ou a marca."),
    ("h3", "10. Confidencialidade e proteção de dados"),
    ("p", "As partes assinam, junto com estes termos, o Termo de Confidencialidade, que integra a parceria. Cada parte trata os dados pessoais a que tiver acesso conforme a Lei Geral de Proteção de Dados (LGPD), somente para as finalidades da parceria, e informa a outra sobre incidentes de segurança que a afetem."),
    ("h3", "11. Limitação de responsabilidade"),
    ("p", "Nenhuma das partes responde por lucros cessantes nem por danos indiretos. A responsabilidade de cada parte limita-se ao valor que recebeu da outra nos 12 meses anteriores ao fato, salvo dolo ou quebra de confidencialidade."),
    ("h3", "12. Vigência e encerramento"),
    ("p", "A parceria vigora por 12 meses a partir da assinatura e se renova automaticamente por iguais períodos. Qualquer parte pode encerrá-la com **30 dias** de aviso por e-mail. O encerramento não afeta os contratos já fechados: o PARCEIRO continua recebendo a participação dos clientes registrados enquanto esses contratos estiverem vigentes e pagos, e permanecem válidas as obrigações de confidencialidade."),
    ("h3", "13. Comunicações e assinatura eletrônica"),
    ("p", "As comunicações entre as partes podem ser feitas por e-mail. Estes termos podem ser aceitos e assinados eletronicamente, nos termos da legislação aplicável."),
    ("h3", "14. Foro"),
    ("p", "As partes elegem o foro da comarca de Maringá, Estado do Paraná, para dirimir questões deste documento."),
    ("p", "Maringá-PR, [data]."),
    ("table", [["WMUNDI", "PARCEIRO"], ["\n\n______________________________\nInstituto Ravel de Ensino Superior Ltda.\nRobson Ravel de Oliveira", "\n\n______________________________\n[Razão social]\nSilvio Breda"]]),
], fluido=True)

# ---------- Termo de confidencialidade ----------
gerar("parceria-confidencialidade", "Termo de Confidencialidade", [
    ("h2", "Termo de Confidencialidade (mútuo)"),
    ("p", PARTE),
    ("p", PARC),
    ("p", "As partes, para avaliar e executar a parceria comercial entre elas, trocarão informações confidenciais e firmam este termo."),
    ("h3", "1. Informação confidencial"),
    ("p", "É toda informação, escrita, oral, eletrônica ou em demonstração, a que uma parte tiver acesso por causa da parceria, inclusive: sistemas, códigos, telas, funcionalidades e demonstrações não públicas; propostas, preços, condições comerciais e percentuais de participação; planos, estratégias e cálculos; dados de clientes, prospectos, prefeituras e negociações; documentos, apresentações e materiais."),
    ("h3", "2. Exceções"),
    ("p", "Não é confidencial a informação que seja de domínio público sem culpa da parte receptora, já fosse conhecida dela antes de recebê-la, tenha sido obtida legitimamente de terceiro sem dever de sigilo ou tenha sido desenvolvida de forma independente."),
    ("h3", "3. Obrigações"),
    ("ul", ["Usar a informação somente para a parceria.", "Não revelar a informação a terceiros, exceto a sócios, empregados e consultores que precisem conhecê-la e estejam sujeitos a sigilo equivalente.", "Proteger a informação com o mesmo cuidado que dá às suas próprias informações confidenciais, e no mínimo com cuidado razoável.", "Não copiar, reproduzir, fazer engenharia reversa nem tentar reproduzir sistemas, demonstrações e materiais da outra parte.", "Não contatar diretamente os clientes e prospectos apresentados pela outra parte, para tratar das soluções objeto da parceria, fora das regras dos termos da parceria."]),
    ("h3", "4. Demonstrações"),
    ("p", "As demonstrações da WMUNDI são fornecidas para avaliação, por prazo limitado, e não podem ser copiadas, compartilhadas fora dos clientes indicados nem usadas para outro fim."),
    ("h3", "5. Divulgação exigida por lei"),
    ("p", "Se a parte for obrigada por lei ou ordem de autoridade a revelar informação confidencial, avisará a outra antes, quando possível, e revelará somente o necessário."),
    ("h3", "6. Devolução"),
    ("p", "Ao término da parceria, ou a pedido, cada parte devolve ou elimina as informações confidenciais da outra, ressalvadas as cópias que a lei obrigue a guardar."),
    ("h3", "7. Prazo"),
    ("p", "Este termo vigora durante a parceria e por **5 anos** após o seu encerramento."),
    ("h3", "8. Descumprimento"),
    ("p", "O descumprimento obriga a parte infratora a indenizar a outra pelas perdas e danos comprovados, sem prejuízo das medidas judiciais para cessar a violação."),
    ("h3", "9. Dados pessoais"),
    ("p", "Dados pessoais recebidos são tratados conforme a Lei Geral de Proteção de Dados (LGPD), apenas para as finalidades da parceria."),
    ("h3", "10. Assinatura e foro"),
    ("p", "Este termo pode ser assinado eletronicamente. Fica eleito o foro da comarca de Maringá, Estado do Paraná."),
    ("p", "Maringá-PR, [data]."),
    ("table", [["WMUNDI", "PARCEIRO"], ["\n\n______________________________\nInstituto Ravel de Ensino Superior Ltda.\nRobson Ravel de Oliveira", "\n\n______________________________\n[Razão social]\nSilvio Breda"]]),
], fluido=True)
print("parceria ok")
