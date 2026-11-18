"""Cartas de apresentação e proposta ao parceiro (Silvio Breda). Gera HTML/PDF (via pdf.mjs) e DOCX editável.
Blocos: ("h2", txt) ("h3", txt) ("p", txt) ("ul", [txt]) ("ol", [txt]) ("table", [[cabeçalho],[linha]...]) ("nt", txt) ("sp", None)
Texto com **negrito**.
"""
import re, html, pathlib
import gerar_propostas as gp
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from PIL import Image, ImageDraw

a = pathlib.Path(__file__).parent
brl, mes = gp.brl, gp.mes
brl2 = gp.brl2
EXP = "02/12/2026"
BASE = "https://wmundi-ofertas.netlify.app/"
L_PONTO, L_PREC, L_URB = BASE + "ponto/", BASE + "precificador-8f3k/", BASE + "urbanflow/"

# logo sobre fundo marinho para o DOCX
from marca import reg_html, reg_runs, logo_com_r
lg = Image.open(logo_com_r()).convert("RGBA")
bg = Image.new("RGBA", (lg.width + 80, lg.height + 40), (11, 27, 63, 255))
bg.paste(lg, (40, 20), lg)
bg.convert("RGB").save(a / "pdf" / "logo-docx.png")

bd = lambda t: re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", html.escape(t, quote=False)).replace("\n", "<br>")
lk = lambda t: re.sub(r"(https://[^\s<)]+)", r'<a href="\1" style="color:#2f5bff">\1</a>', t)


def to_html(blocos):
    o = []
    for k, v in blocos:
        if k == "h2": o.append(f"<h2>{bd(v)}</h2>")
        elif k == "h3": o.append(f"<h3>{bd(v)}</h3>")
        elif k == "p": o.append(f"<p>{lk(bd(v))}</p>")
        elif k == "nt": o.append(f'<p class="nt">{lk(bd(v))}</p>')
        elif k in ("ul", "ol"): o.append(f"<{k}>" + "".join(f"<li>{lk(bd(x))}</li>" for x in v) + f"</{k}>")
        elif k == "table":
            o.append("<table><tr>" + "".join(f"<th>{bd(c)}</th>" for c in v[0]) + "</tr>" + "".join("<tr>" + "".join(f"<td>{bd(c)}</td>" for c in r) + "</tr>" for r in v[1:]) + "</table>")
        elif k == "sp": o.append('<div style="height:5mm"></div>')
        elif k == "pb": o.append("</div><div class=\"pg\">")
    return "".join(o)


def runs(par, txt):
    reg_runs(par, txt)


def to_docx(blocos, path):
    d = Document()
    sec = d.sections[0]
    sec.left_margin = sec.right_margin = Cm(2.2); sec.top_margin = Cm(1.8); sec.bottom_margin = Cm(1.8)
    st = d.styles["Normal"]; st.font.name = "Calibri"; st.font.size = Pt(11)
    d.add_picture(str(a / "pdf" / "logo-docx.png"), width=Cm(5))
    for k, v in blocos:
        if k == "h2":
            h = d.add_heading("", level=1); reg_runs(h, v)
            for r in h.runs: r.font.color.rgb = RGBColor(0x0b, 0x1b, 0x3f)
        elif k == "h3":
            h = d.add_heading("", level=2); reg_runs(h, v)
            for r in h.runs: r.font.color.rgb = RGBColor(0x2f, 0x5b, 0xff)
        elif k in ("p", "nt"):
            p = d.add_paragraph(); runs(p, v)
            if k == "nt":
                for r in p.runs: r.font.size = Pt(9)
        elif k == "ul":
            for x in v: runs(d.add_paragraph(style="List Bullet"), x)
        elif k == "ol":
            for x in v: runs(d.add_paragraph(style="List Number"), x)
        elif k == "table":
            t = d.add_table(rows=len(v), cols=len(v[0])); t.style = "Light Grid Accent 1"
            for i, row in enumerate(v):
                for j, c in enumerate(row):
                    cell = t.cell(i, j); cell.text = ""
                    runs(cell.paragraphs[0], c)
                    if i == 0:
                        for r in cell.paragraphs[0].runs: r.bold = True
            d.add_paragraph()
        elif k == "pb": d.add_page_break()
    d.add_paragraph()
    f = d.add_paragraph(); reg_runs(f, "WMundi · Instituto Ravel de Ensino Superior Ltda. · CNPJ 03.162.275/0001-10 · Av. XV de Novembro, 255, Sobreloja, Maringá-PR · info@wmundi.com · (44) 99946-6451 · wmundi.com")
    for r in f.runs: r.font.size = Pt(8)
    d.save(path)


FLU = 'body{font-size:9.4pt}p{margin:1.5mm 0}.pg{height:auto;min-height:0;overflow:visible;page-break-after:auto;padding-bottom:2mm}.ft{position:static;margin-top:3mm;padding-bottom:0}h3{page-break-after:avoid}tr,li{page-break-inside:avoid}table{page-break-inside:avoid}'


def gerar(nome, titulo, blocos, fluido=False):
    corpo = to_html(blocos)
    DEMO = {"carta-ponto": [("", L_PONTO)], "carta-precificador-hotelaria": [("", L_PREC)], "carta-urbanflow-prefeituras": [("", L_URB)],
            "carta-proposta-hotelaria": [("Ponto Facial: ", L_PONTO), ("Precificador de Hotelaria: ", L_PREC)]}
    ftx = gp.FT
    if nome in DEMO:
        ls = " · ".join(f'{lb}<a href="{u}" style="color:#2f5bff">{u}</a>' for lb, u in DEMO[nome])
        ftx = gp.FT.replace('</div>', f'<br><b>Teste a demonstração:</b> {ls}</div>')
    head = f'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6mm"><img src="{gp.logo}" style="height:15mm;background:#0b1b3f;padding:2mm 4mm;border-radius:2mm"><div class="nt">[Cidade], [data]</div></div>'
    htm = f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>{titulo}</title><style>{gp.CSS}{FLU if fluido else ''}</style></head><body><div class="pg">{head}{corpo}{ftx}</div></body></html>'
    # divide em páginas quando houver "pb"
    htm = htm.replace(f'{gp.FT}</div></body>', f'{gp.FT}</div></body>')
    htm = htm.replace('</div><div class="pg">', ftx + '</div><div class="pg">')
    (a / "pdf" / f"{nome}.html").write_text(reg_html(htm))
    to_docx(blocos, a / "pdf" / f"{nome}.docx")


ass = [("sp", None), ("p", "Atenciosamente,"), ("p", "**Robson Ravel de Oliveira**\nWMundi · (44) 99946-6451 · info@wmundi.com")]

# ---------- Carta Ponto ----------
tab_ponto = [["Faixa", "Mensalidade", "Implantação"]] + [[f"{f} funcionários", brl(m) + "/mês", brl(i)] for f, m, i in gp.faixas] + [["201 ou mais", f"{brl(897)}/mês + R$ 1,00 por funcionário acima de 200", brl(2490)]]
gerar("carta-ponto", "Carta de apresentação: Ponto Facial", [
    ("h2", "Carta de apresentação: Ponto por Reconhecimento Facial"),
    ("p", "A/C: **[Nome do responsável]** · **[Empresa]**"),
    ("p", "Prezado(a) [Nome],"),
    ("p", "A WMundi apresenta o **Ponto por Reconhecimento Facial**: o funcionário olha para a câmera de um terminal de ponto da empresa, o sistema confere o rosto, faz a prova de vida e registra a jornada, que segue direto para o RH, o banco de horas e o fechamento do mês."),
    ("ul", ["Prova de vida: foto e vídeo não passam.", "Modo manual, com aprovação do gestor, para quando o rosto não é reconhecido.", "Modo sem internet: o terminal guarda a batida e envia sozinho quando a conexão volta, com a hora original.", "Atestados lançados pelo RH, com dias justificados.", "Alertas por e-mail ao dono ou gestor: férias chegando e vencidas, fim da experiência e renovação, estagiários e vínculos de freelancer, diretoria e cargos isentos de ponto.", "Quantos terminais precisar, em locais diferentes, sem custo extra. Os terminais são equipamentos da empresa; a WMundi não recomenda o uso de celulares pessoais ou de máquinas do funcionário, para minimizar riscos trabalhistas."]),
    ("h3", "Investimento"),
    ("table", tab_ponto),
    ("p", f"Com 42 funcionários, a economia estimada é de {brl(gp.eco)} por mês e o investimento se paga em cerca de **{mes(gp.pay)} mês** (exemplo ilustrativo)."),
    ("h3", "Teste agora"),
    ("p", f"Demonstração interativa, disponível até {EXP}: {L_PONTO}"),
] + ass)

# ---------- Carta Precificador ----------
gerar("carta-precificador-hotelaria", "Carta de apresentação: Precificador de Hotelaria", [
    ("h2", "Carta de apresentação: Precificador de Hotelaria"),
    ("p", "A/C: **[Nome do responsável]** · **[Hotel / Resort]**"),
    ("p", "Prezado(a) [Nome],"),
    ("p", "A WMundi apresenta o **Precificador de Hotelaria**, que calcula a diária de cada nível de apartamento a partir dos custos do hotel, dos impostos, do lucro desejado e do mercado da região."),
    ("ul", ["Hotel comum, 4 estrelas e resort 5 estrelas, com níveis de apartamento (padrão, superior, luxo e suíte).", "Custos fixos e variáveis, impostos, comissão de reservas e lucro mensal desejado.", "Comparação com concorrentes e prestadores da região.", "Ocupação mínima e diárias vendidas para o ponto de equilíbrio.", "Prazos de pagamento e correção, para não perder no financiamento.", "Gráfico de lucro por ocupação."]),
    ("p", "**Personalizado:** desenvolvemos o precificador sob medida para o seu negócio e para **qualquer segmento** (clínicas, comércio, serviços, locadoras e outros)."),
    ("h3", "Investimento"),
    ("table", [["Opção", "Mensalidade", "Implantação"], ["Precificador de Hotelaria (versão pronta)", brl(197) + "/mês", brl(990)], ["Personalizado", brl(297) + "/mês", f"sob consulta (a partir de {brl(4900)})"]]),
    ("p", f"Exemplo: ao ajustar a diária média em {brl(gp.dia_extra)} em um hotel de {gp.n_ap} apartamentos com 65% de ocupação, a receita sobe cerca de {brl(gp.ganho)} por mês e o investimento se paga em cerca de **{mes(gp.pay_p)} mês**."),
    ("h3", "Teste agora"),
    ("p", f"Demonstração interativa, disponível até {EXP}: {L_PREC}"),
] + ass)

# ---------- Carta UrbanFlow (prefeituras) ----------
gerar("carta-urbanflow-prefeituras", "Carta-proposta: UrbanFlow", [
    ("h2", "Carta-proposta: estacionamento rotativo inteligente"),
    ("p", "Ao Excelentíssimo(a) Senhor(a) Prefeito(a) Municipal de **[Município]** · Ao(À) Secretário(a) de Trânsito e Mobilidade"),
    ("p", "Senhor(a) Prefeito(a),"),
    ("p", "Apresentamos o **UrbanFlow**, sistema que mostra ao motorista, pelo celular, onde há vaga livre na rua ou na quadra, cobra o rotativo por tempo exato e entrega à prefeitura um painel com ocupação, rotatividade e arrecadação em tempo real."),
    ("h3", "O problema"),
    ("ul", ["**Motoristas rodando em busca de vaga.** Estudos que reuniram 16 pesquisas entre 1927 e 2001 (Donald Shoup, Universidade da Califórnia) encontraram, em média, cerca de 30% dos carros do trânsito congestionado do centro procurando vaga.", "**Efeito no trânsito.** Simulação publicada no Simpósio Brasileiro de Computação Urbana mostrou que, com 30% a 50% dos veículos em busca de vaga, o atraso médio de deslocamento aumenta de 2 a 3 minutos.", "**Medição de vaga é prática de órgão de trânsito.** A CET de São Paulo mantém indicador técnico (Nota Técnica 207) para medir a facilidade de encontrar vaga livre na Zona Azul.", "Resultado: mais congestionamento, combustível e poluição, comércio perdendo cliente e rotativo arrecadando abaixo do potencial."]),
    ("p", "**Dados do município:** [vagas de rotativo] · [arrecadação atual por mês] · [infrações de estacionamento por ano]. Preenchidos no levantamento com a prefeitura."),
    ("h3", "A solução"),
    ("ul", ["**Aplicativo do motorista:** mapa de vagas livres por quadra, ativação do ticket por tempo, Pix e cartão, aviso antes do vencimento.", "**Contadores nos postes:** o veículo que entra e não sai é confirmado como vaga ocupada em até 15 minutos.", "**Câmeras de placa:** se o motorista não aciona o aplicativo e passa de 15 minutos de tolerância, é lançada permanência de R$ 10,00. Ele tem 30 dias para regularizar pelo aplicativo; depois disso, vira multa conforme a legislação de trânsito do município.", "**Painel do administrador:** avisa quando há veículos sem ticket e sugere a ronda da fiscalização à quadra certa."]),
    ("pb", None),
    ("h3", "Como funciona o acordo"),
    ("table", [["WMundi", "Prefeitura"], ["Desenvolve o aplicativo e o painel\nInstala o sistema\nMantém e atualiza", "Investimento de implantação e instalação\nFiscalização e autuação\nDefine tarifa, setores e regras"]]),
    ("p", "**Divisão da arrecadação do rotativo:** 50% para a prefeitura; os outros 50% remuneram aplicativo, licença, hospedagem, suporte e manutenção."),
    ("h3", "Investimento e retorno (referência)"),
    ("table", [["", "Piloto (4 quadras, 80 vagas)", "Cidade (referência de 800 vagas)"], ["Investimento inicial da prefeitura", brl(gp.inv_pil), brl(gp.inv_cid)], ["Parte da prefeitura por mês (50%)", brl(gp.pil_base / 2), brl(gp.base / 2)], ["**Payback**", f"**{mes(gp.inv_pil/(gp.pil_base/2))} meses**", f"**{mes(gp.inv_cid/(gp.base/2))} meses**"]]),
    ("nt", "Tarifa de R$ 1,75 por hora; segunda a sexta das 8h às 18h e sábados das 8h às 12h; tolerância de 15 minutos; ocupação de 60% e pagamento de 85%. Os números reais saem do levantamento do município."),
    ("h3", "Implantação"),
    ("ol", ["Reunião técnica e levantamento das quadras e da arrecadação atual.", "Piloto de 4 quadras em até 2 meses.", "Avaliação com números reais no terceiro mês.", "Expansão gradual até a cidade toda."]),
    ("p", f"Demonstração interativa, disponível até {EXP}: {L_URB}"),
    ("nt", "Fontes: Shoup (parkingtoday.com/article/is-30-percent-of-traffic-cruising-for-parking) · Simpósio Brasileiro de Computação Urbana (sol.sbc.org.br/index.php/courb/article/download/24569/24390) · CET-SP, Nota Técnica 207 (cetsp.com.br)."),
] + ass)

# ---------- Proposta ao Silvio Breda ----------
bruto = gp.base
op_u = bruto * .5   # UrbanFlow: parcela que cabe à operação, depois da parte da prefeitura
gerar("proposta-silvio-breda", "Proposta ao parceiro: Silvio Breda", [
    ("h2", "Proposta de parceria comercial (pré-contrato)"),
    ("p", "A/C: **Silvio Breda** · **[empresa]**"),
    ("p", "Silvio, a WMundi propõe à sua empresa uma parceria em que você capta clientes e a matriz cria, entrega e mantém as soluções. A receita dos clientes que você captar é **dividida em split: 70% para a WMundi e 30% para a sua empresa**."),
    ("h3", "1. Soluções para ofertar"),
    ("table", [["Solução", "Para quem", "Investimento do cliente"],
               ["Ponto por Reconhecimento Facial", "Empresas e hotelaria", "de " + brl(297) + " a " + brl(897) + "/mês, conforme a faixa de funcionários, e implantação de " + brl(990) + " a " + brl(2490)],
               ["Precificador de Hotelaria (personalizável para qualquer segmento)", "Hotéis, pousadas e resorts", brl(197) + "/mês e implantação de " + brl(990) + "; personalizado: " + brl(297) + "/mês e implantação a partir de " + brl(4900)],
               ["UrbanFlow", "Prefeituras", f"Investimento inicial da prefeitura (piloto: {brl(gp.inv_pil)}; cidade de referência: {brl(gp.inv_cid)}) e 50% da arrecadação do rotativo para a prefeitura"]]),
    ("h3", "2. Receita compartilhada: split 70/30"),
    ("ul", ["**70% WMundi e 30% da sua empresa**, sobre os valores efetivamente recebidos dos clientes que você captar: mensalidades, implantação e demais valores.", "O split é feito no recebimento: o que entra é dividido na proporção combinada.", "**Somente valores efetivamente recebidos.** O que não é pago pelo cliente não entra na divisão.", "**A receita é compartilhada enquanto o contrato entre a WMundi e a sua empresa permanecer ativo.**", "**UrbanFlow:** a base é a parcela da arrecadação que cabe à operação, depois da parte da prefeitura (50%)."]),
    ("table", [["Exemplos", "Total recebido", "Sua empresa (30%)", "WMundi (70%)"],
               ["Ponto Facial, 1 a 50 funcionários: mensalidade", brl(297) + "/mês", brl2(297 * .3) + "/mês", brl2(297 * .7) + "/mês"],
               ["Ponto Facial, 1 a 50 funcionários: implantação", brl(990), brl2(990 * .3), brl2(990 * .7)],
               ["Precificador de Hotelaria: mensalidade", brl(197) + "/mês", brl2(197 * .3) + "/mês", brl2(197 * .7) + "/mês"],
               ["UrbanFlow, cidade de referência de 800 vagas (cenário base): parcela da operação", brl(op_u) + "/mês", brl(op_u * .3) + "/mês", brl(op_u * .7) + "/mês"]]),
    ("nt", "Valores de referência. A arrecadação real depende de cada cliente e cidade."),
    ("h3", "3. Quem faz o quê"),
    ("table", [["Matriz WMundi", "Sua empresa"],
               ["Criação e entrega dos produtos\nDivulgação ampla das soluções\nAssuntos técnicos: instalação, manutenção, atualizações e suporte\nAssuntos administrativos: contratos, cobrança e relatórios\nDesenvolvimento exclusivo dos sistemas", "Capta e acompanha os clientes\nMantém o relacionamento e o acompanhamento local da implantação\nArca com as próprias despesas: contratações, demissões, propagandas, aluguéis, seguros e demais itens da empresa"]]),
    ("h3", "4. Condições"),
    ("ul", ["**Cobranças e responsabilidades** são de ambos: cada parte cumpre as suas atribuições e acompanha a cobrança e a regularização dos clientes.", "**Desenvolvimentos exclusivos da WMundi**, que detém o direito à comercialização total ou em partes do portfólio.", "Parceria sem exclusividade e sem vínculo trabalhista ou societário: as despesas da sua empresa são da sua empresa.", "Cada cliente captado é registrado por e-mail e confirmado pela WMundi."]),
    ("h3", "5. Vigência"),
    ("p", "**Pré-contrato inicial de 6 meses**, que pode se estender **até 24 meses**, renovável por igual período, caso nenhuma das partes manifeste desistência."),
    ("h3", "6. Material para enviar"),
    ("ul", [f"Ponto Facial: {L_PONTO}", f"Precificador de Hotelaria: {L_PREC}", f"UrbanFlow: {L_URB}", f"As demonstrações ficam disponíveis até {EXP}. Depois, a WMundi libera novamente a pedido.", "Cartas de apresentação e apresentações de cada solução, em PDF."]),
    ("h3", "Próximos passos"),
    ("ol", ["Você revisa os termos do pré-contrato e o termo de confidencialidade.", "Assinamos os dois documentos, inclusive por meio eletrônico.", "Liberamos o material e você começa as apresentações."]),
] + ass, fluido=True)
print("cartas ok")
