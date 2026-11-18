"""Carta-proposta para hotelaria (Ponto Facial + Precificador de Hotelaria)."""
import shutil, pathlib
from gerar_cartas import gerar, ass, L_PONTO, L_PREC, EXP, brl, mes
import gerar_propostas as gp

a = pathlib.Path(__file__).parent
eco_h = 40 * 0.7 * 35 + 800            # 40 h/mês de RH, 70% eliminadas, R$ 35/h + R$ 800 de horas extras/atrasos por falta de controle
liq_h = eco_h - 497
pay_h = 1490 / liq_h
tab_ponto = [["Faixa", "Mensalidade", "Implantação"]] + [[f"{f} funcionários", brl(m) + "/mês", brl(i)] for f, m, i in gp.faixas] + [["201 ou mais", f"{brl(897)}/mês + R$ 1,00 por funcionário acima de 200", brl(2490)]]

gerar("carta-proposta-hotelaria", "Carta-proposta para hotelaria", [
    ("h2", "Carta-proposta para hotéis, pousadas e resorts"),
    ("p", "A/C: **[Nome do responsável]** · **[Hotel / Resort]**"),
    ("p", "Prezado(a) [Nome],"),
    ("p", "A WMundi apresenta duas soluções pensadas para a operação hoteleira: o **Ponto por Reconhecimento Facial**, que cuida da jornada da equipe, e o **Precificador de Hotelaria**, que define a diária certa de cada tipo de apartamento. Cada uma pode ser contratada separadamente ou em conjunto."),
    ("h3", "1. Ponto por Reconhecimento Facial"),
    ("ul", ["Registro pelo rosto, com prova de vida, em terminais da empresa. A WMundi não recomenda o uso de celulares pessoais ou de máquinas do funcionário, para minimizar riscos trabalhistas.", "**Quantos terminais precisar, sem custo extra**: recepção, portaria de serviço, cozinha, lavanderia, governança e blocos distantes do resort.", "Modo manual, com aprovação do gestor, e modo sem internet: o terminal guarda a batida e envia sozinho quando a conexão volta.", "Atestados, banco de horas e fechamento do mês integrados ao RH.", "Alertas por e-mail ao dono ou gestor: férias chegando e vencidas, fim da experiência e renovação, estagiários, freelancers, diretoria e cargos isentos de ponto."]),
    ("table", tab_ponto),
    ("p", f"Exemplo: hotel com 80 funcionários (faixa de 51 a 100). Com 40 horas por mês do RH dedicadas à folha de ponto, das quais 70% são eliminadas, e R$ 800 por mês de horas extras e atrasos pagos por falta de controle exato, a economia estimada é de {brl(eco_h)} por mês. Economia líquida de {brl(liq_h)} por mês e payback da implantação de cerca de **{mes(pay_h)} mês**."),
    ("h3", "2. Precificador de Hotelaria"),
    ("ul", ["Diária por **nível de apartamento** (padrão, superior, luxo e suíte), para hotel comum, 4 estrelas e resort 5 estrelas.", "Custos fixos e variáveis, impostos, comissão de reservas e **lucro mensal desejado**.", "**Valor médio de mercado**: concorrentes, similares e prestadores da região.", "**Ocupação mínima** e diárias vendidas para o ponto de equilíbrio.", "Prazos de pagamento e correção, para não perder no financiamento.", "Gráfico de lucro por ocupação.", "**Personalizado** para o seu hotel: temporadas, pacotes e ligação com o site de reservas."]),
    ("table", [["Opção", "Mensalidade", "Implantação"], ["Precificador de Hotelaria (versão pronta)", brl(197) + "/mês", brl(990)], ["Personalizado para o seu hotel", brl(297) + "/mês", f"sob consulta (a partir de {brl(4900)})"]]),
    ("p", f"Exemplo: em um hotel de {gp.n_ap} apartamentos com 65% de ocupação, ajustar a diária média em apenas {brl(gp.dia_extra)} eleva a receita em cerca de {brl(gp.ganho)} por mês. Com a versão personalizada, o payback é de cerca de **{mes(gp.pay_p)} mês**."),
    ("nt", "Os exemplos mostram o método; o resultado real depende do hotel e do mercado."),
    ("h3", "As duas juntas"),
    ("table", [["", "Mensalidade", "Implantação"], ["Ponto Facial (51 a 100 funcionários) + Precificador de Hotelaria", brl(497 + 197) + "/mês", brl(1490 + 990)]]),
    ("h3", "Teste agora"),
    ("p", f"Demonstrações interativas com dados fictícios, disponíveis até {EXP}:"),
    ("ul", [f"Ponto Facial: {L_PONTO}", f"Precificador de Hotelaria: {L_PREC}"]),
] + ass, fluido=True)

d = a / "pdf" / "cartas-proposta"
d.mkdir(exist_ok=True)
for src, dst in [("carta-proposta-hotelaria", "Carta-proposta-Hotelaria"), ("carta-urbanflow-prefeituras", "Carta-proposta-Prefeituras")]:
    for ext in ("pdf", "docx"):
        pass
print("hotelaria ok", brl(eco_h), brl(liq_h), mes(pay_h))
