"""Carta-proposta de parceria, termos da parceria e termo de confidencialidade (empresa do Silvio Breda).
Campos entre colchetes são preenchidos antes do envio."""
from gerar_cartas import gerar, ass, L_PONTO, L_PREC, L_URB, EXP, brl, mes
brl2 = __import__("gerar_propostas").brl2
import gerar_propostas as gp

PARTE = "**WMUNDI:** Instituto Ravel de Ensino Superior Ltda., CNPJ 03.162.275/0001-10, com sede na Av. XV de Novembro, 255, Sobreloja, Maringá-PR, e-mail info@wmundi.com, que atua sob a marca WMundi."
PARC = "**PARCEIRO:** [razão social da empresa do Silvio Breda], CNPJ [número], com sede em [endereço], e-mail [e-mail], representada por Silvio Breda, CPF [número]."

# ---------- Carta-proposta de parceria ----------
gerar("parceria-carta-proposta", "Carta-proposta de parceria comercial", [
    ("h2", "Carta-proposta de parceria comercial"),
    ("p", "A/C: **Silvio Breda** · **[Empresa]**"),
    ("p", "Prezado Silvio,"),
    ("p", "A WMundi convida a sua empresa para uma **parceria comercial** na oferta de soluções de tecnologia aos seus clientes. Você capta e acompanha os clientes; a matriz cria, entrega, divulga e mantém as soluções."),
    ("h3", "O que a matriz WMundi faz"),
    ("ul", ["Criação e entrega dos produtos.", "Divulgação ampla das soluções.", "Assuntos técnicos (instalação, manutenção, atualizações e suporte) e administrativos (contratos, cobrança e relatórios).", "Desenvolvimento exclusivo dos sistemas e direito à comercialização total ou em partes do portfólio."]),
    ("h3", "O que a sua empresa faz"),
    ("ul", ["Capta e acompanha os clientes, e mantém o relacionamento e o acompanhamento local da implantação.", "Arca com as próprias despesas: contratações, demissões, propagandas, aluguéis, seguros e demais itens da empresa."]),
    ("h3", "Receita em split 70/30"),
    ("p", "A receita dos clientes captados é dividida em split: **70% para a WMundi e 30% para a sua empresa**, somente sobre os **valores efetivamente recebidos**, e **enquanto o contrato entre a WMundi e a sua empresa permanecer ativo**. Cobranças e responsabilidades são de ambos."),
    ("table", [["Exemplo (Ponto Facial, 1 a 50 funcionários)", "Total", "Sua empresa (30%)", "WMundi (70%)"], ["Mensalidade", brl(297) + "/mês", brl2(297 * .3) + "/mês", brl2(297 * .7) + "/mês"], ["Implantação", brl(990), brl2(990 * .3), brl2(990 * .7)]]),
    ("p", f"No UrbanFlow, a base é a parcela da arrecadação do rotativo que cabe à operação, depois dos 50% da prefeitura: na cidade de referência de 800 vagas (cenário base), {brl(gp.base * .5)} por mês, dos quais {brl(gp.base * .15)} para a sua empresa."),
    ("h3", "Vigência"),
    ("p", "Pré-contrato inicial de **6 meses**, que pode se estender **até 24 meses**, renovável por igual período caso nenhuma das partes manifeste desistência."),
    ("h3", "Como seguimos"),
    ("ol", ["Você revisa os termos do pré-contrato e o termo de confidencialidade anexos.", "Assinamos os dois documentos, inclusive por meio eletrônico.", "Liberamos o material e iniciamos as apresentações aos clientes que você captar."]),
    ("p", f"Demonstrações para testar, disponíveis até {EXP}: {L_PONTO} · {L_PREC} · {L_URB}"),
] + ass, fluido=True)

# ---------- Termos da parceria (pré-contrato) ----------
gerar("parceria-termos", "Termos da Parceria Comercial (pré-contrato)", [
    ("h2", "Termos da Parceria Comercial (pré-contrato)"),
    ("p", PARTE),
    ("p", PARC),
    ("h3", "1. Objeto e natureza"),
    ("p", "Estes termos formam o pré-contrato de parceria comercial entre WMUNDI e PARCEIRO para a captação e o acompanhamento de clientes das soluções da WMUNDI (Ponto por Reconhecimento Facial, Precificador de Hotelaria e personalizações, UrbanFlow e demais soluções do portfólio vigente). A parceria é **não exclusiva** para o PARCEIRO, não cria sociedade, vínculo empregatício, representação legal nem mandato, e o PARCEIRO não assina contratos nem recebe pagamentos em nome da WMUNDI."),
    ("h3", "2. Responsabilidades da WMUNDI (matriz)"),
    ("ul", ["Criação e entrega dos produtos.", "Divulgação ampla das soluções.", "Assuntos técnicos: instalação, manutenção, atualizações e suporte aos clientes.", "Assuntos administrativos: contratos com os clientes, cobrança, relatórios e prestação de contas ao PARCEIRO.", "Treinamento da equipe do PARCEIRO sobre as soluções."]),
    ("h3", "3. Responsabilidades do PARCEIRO"),
    ("ul", ["Captar e acompanhar clientes, manter o relacionamento e acompanhar localmente a implantação, com o apoio técnico da WMUNDI.", "Apresentar as soluções conforme os materiais e informações fornecidos, sem prometer prazos, preços, descontos, resultados ou funcionalidades que não constem das propostas da WMUNDI.", "Preservar a imagem da marca WMundi e usar o material de divulgação sem alterá-lo.", "Cumprir a legislação aplicável, inclusive a de proteção de dados e a anticorrupção."]),
    ("h3", "4. Registro dos clientes captados"),
    ("p", "O PARCEIRO registra cada cliente por e-mail para info@wmundi.com, informando cliente, contato e solução. A WMUNDI confirma o registro em até 5 dias úteis. Os clientes registrados e confirmados são os clientes captados pelo PARCEIRO. Havendo mais de um registro do mesmo cliente, prevalece o primeiro."),
    ("h3", "5. Receita compartilhada (split 70/30)"),
    ("p", "**5.1** A receita dos clientes captados pelo PARCEIRO é dividida em split: **70% para a WMUNDI e 30% para o PARCEIRO**."),
    ("p", "**5.2** A base de cálculo são **somente os valores efetivamente recebidos** pela WMUNDI desses clientes: mensalidades, implantação e demais valores. Valores não pagos pelo cliente não integram a base."),
    ("p", "**5.3** A receita é compartilhada **enquanto o contrato entre a WMUNDI e o PARCEIRO permanecer ativo**. Com o encerramento do contrato, cessa o compartilhamento."),
    ("p", "**5.4 UrbanFlow.** A base de cálculo é a parcela da arrecadação do rotativo que cabe à operação, depois da parte do município (50% da arrecadação)."),
    ("p", "**5.5** O split é realizado no recebimento, e a WMUNDI envia ao PARCEIRO relatório mensal dos valores recebidos e divididos. Se o pagamento ao PARCEIRO não for feito por split automático, será feito até o dia 10 do mês seguinte, mediante nota fiscal do PARCEIRO. Os impostos de cada parte são de sua responsabilidade."),
    ("h3", "6. Cobranças e responsabilidades"),
    ("p", "As cobranças e as responsabilidades da operação são de ambas as partes: a WMUNDI emite e executa a cobrança pelo seu sistema; o PARCEIRO acompanha o cliente e colabora na regularização. Cada parte responde pelas atribuições que assumiu neste pré-contrato."),
    ("h3", "7. Despesas de cada parte"),
    ("p", "As despesas da empresa do PARCEIRO, como contratações, demissões, propagandas, aluguéis, seguros e demais itens, são de responsabilidade exclusiva do PARCEIRO. As despesas de criação, entrega, divulgação ampla, assuntos técnicos e administrativos das soluções são da WMUNDI."),
    ("h3", "8. Desenvolvimento, propriedade intelectual e comercialização"),
    ("p", "Os desenvolvimentos são **exclusivos da WMUNDI**, assim como o direito à comercialização, total ou em partes, do portfólio. Sistemas, códigos, demonstrações, materiais e a marca WMundi são de propriedade da WMUNDI. O PARCEIRO recebe licença limitada, não exclusiva e revogável para usar os materiais de divulgação durante a parceria."),
    ("h3", "9. Preços, propostas e contratos com clientes"),
    ("p", "Preços, prazos e condições são definidos pela WMUNDI. Os contratos com os clientes são firmados entre cliente e WMUNDI. Descontos ou condições especiais dependem de autorização escrita da WMUNDI."),
    ("h3", "10. Disponibilidade e atualizações"),
    ("p", "Os sistemas são atualizados semanalmente, com melhorias e correções. Durante as atualizações, o sistema poderá ficar temporariamente indisponível. Outras causas de indisponibilidade que não sejam de responsabilidade da WMUNDI, como falhas dos servidores e provedores de hospedagem, do banco de dados, da internet, de energia e de serviços de terceiros, serão tratadas junto aos servidores e às empresas responsáveis. Em caso de indisponibilidade, o cliente contata o suporte por e-mail."),
    ("h3", "11. Confidencialidade e proteção de dados"),
    ("p", "As partes assinam, junto com estes termos, o Termo de Confidencialidade, que integra o pré-contrato. Cada parte trata os dados pessoais a que tiver acesso conforme a Lei Geral de Proteção de Dados (LGPD), somente para as finalidades da parceria, e informa a outra sobre incidentes de segurança que a afetem."),
    ("h3", "12. Limitação de responsabilidade"),
    ("p", "Nenhuma das partes responde por lucros cessantes nem por danos indiretos. A responsabilidade de cada parte limita-se ao valor que recebeu da outra nos 12 meses anteriores ao fato, salvo dolo ou quebra de confidencialidade."),
    ("h3", "13. Vigência"),
    ("p", "O pré-contrato vigora por **6 meses** a partir da assinatura, podendo se estender **até 24 meses**, e é renovado por igual período caso nenhuma das partes manifeste desistência. A desistência é comunicada por e-mail, com 30 dias de antecedência. Permanecem válidas, após o encerramento, as obrigações de confidencialidade."),
    ("h3", "14. Comunicações e assinatura eletrônica"),
    ("p", "As comunicações entre as partes podem ser feitas por e-mail. Estes termos podem ser aceitos e assinados eletronicamente, nos termos da legislação aplicável."),
    ("h3", "15. Foro"),
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
