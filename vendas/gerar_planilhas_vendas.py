#!/usr/bin/env python3
"""Planilha de acompanhamento de vendas por vendedor (DentalPos).

Uso:
  python3 gerar_planilhas_vendas.py gerar        # cria um arquivo .xlsx protegido por senha para cada vendedor
  python3 gerar_planilhas_vendas.py consolidar   # junta os dados de todos os vendedores num arquivo do gestor
  python3 gerar_planilhas_vendas.py modelo       # cria só o modelo em branco (sem senha)

Os vendedores ficam em vendedores.json (copie de vendedores.exemplo.json).
Se um vendedor não tiver "senha", uma é gerada e gravada no próprio json.
Dependências: pip install openpyxl msoffcrypto-tool
"""
import io, json, secrets, string, sys
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

AQUI = Path(__file__).resolve().parent
SAIDA = AQUI / "planilhas-geradas"
PRIMEIRA, ULTIMA = 6, 505  # linhas de dados (500 negócios por aba)

FASES = ["Novo lead", "Contato realizado", "Em negociação", "Proposta / Teste", "Fechado (ganho)", "Perdido"]
GANHO = "Fechado (ganho)"
ORIGENS = ["Instagram", "WhatsApp", "Indicação", "Site / Landing page", "Google", "Evento / Congresso",
           "Facebook / Anúncio", "Cliente atual", "Outro"]

# nome da aba, produtos/serviços, tipo (Fixo/%), valor, regra
EMPRESAS = [
    ("Uningá", ["Graduação EAD", "Pós-graduação EAD"], "Fixo", 30, "R$ 30,00 por matrícula realizada"),
    ("Dental Pós Cursos", ["Curso presencial de odontologia"], "Fixo", 200, "R$ 200,00 por matrícula realizada"),
    ("Dentalpos One", ["Gerenciador (assinatura)"], "Fixo", 50, "R$ 50,00 por cliente ativado após o período de testes"),
    ("Alignsystem", ["Captação de paciente - alinhadores"], "Fixo", 100, "R$ 100,00 por paciente convertido"),
    ("Dentalpos Clínica", ["Captação de paciente"], "Fixo", 50, "R$ 50,00 por paciente convertido"),
    ("SpaceHour", ["Cadastro de imóvel / espaço ocioso"], "Fixo", 10, "R$ 10,00 por imóvel cadastrado"),
    ("Dentalpos Componentes", ["Venda de componentes"], "%", 0.10, "10% de comissão sobre o valor da venda"),
    ("Wmundi Sites", ["Criação de site", "Hospedagem / manutenção de site"], "Fixo", 0, "(defina a comissão: tipo em B2 e valor em C2)"),
    ("Wmundi Campanhas", ["Campanha de marketing / tráfego pago"], "Fixo", 0, "(defina a comissão: tipo em B2 e valor em C2)"),
    ("Wmundi Mkt Recorrente", ["Marketing recorrente (mensalidade)"], "Fixo", 0, "(defina a comissão: tipo em B2 e valor em C2; comissão por contrato fechado)"),
    ("Novo produto 1", [], "Fixo", 0, "(preencha: nome da empresa/produto, tipo e valor da comissão)"),
    ("Novo produto 2", [], "Fixo", 0, "(preencha: nome da empresa/produto, tipo e valor da comissão)"),
    ("Novo produto 3", [], "Fixo", 0, "(preencha: nome da empresa/produto, tipo e valor da comissão)"),
]
CABECALHO = ["Produto / serviço", "Cliente", "Cidade / UF", "E-mail", "WhatsApp", "Origem (de onde veio)",
             "Interesse", "Fase da negociação", "Data de entrada", "Próximo contato", "Valor da venda (R$)",
             "Comissão (R$)", "Observações"]
LARGURAS = [26, 28, 18, 28, 17, 20, 30, 20, 14, 14, 17, 14, 36]

AZUL, AZUL_ESC, CINZA, AMARELO = "1F6FB2", "14395C", "F2F5F9", "FFF4C2"
fino = Side(style="thin", color="D0D7E2")
BORDA = Border(left=fino, right=fino, top=fino, bottom=fino)
BRL = '"R$" #,##0.00'


def aba_empresa(wb, nome, produtos, tipo, valor, regra, lista_fases, lista_origens):
    ws = wb.create_sheet(nome)
    novo = nome.startswith("Novo produto")
    ws.sheet_properties.tabColor = "F5B301" if novo else AZUL
    ws["A1"] = "Novo produto - digite aqui o nome da empresa" if novo else nome
    ws["A1"].font = Font(size=16, bold=True, color=AZUL_ESC)
    ws["A2"], ws["B2"], ws["C2"], ws["D2"] = "Comissão:", tipo, valor, regra
    ws["A2"].font = Font(bold=True)
    for c in ("B2", "C2"):
        ws[c].fill = PatternFill("solid", fgColor=AMARELO)
        ws[c].border = BORDA
    ws["C2"].number_format = "0%" if tipo == "%" else BRL
    ws["D2"].font = Font(italic=True, color="555555")
    if novo:
        ws["A1"].fill = PatternFill("solid", fgColor=AMARELO)
    dv_tipo = DataValidation(type="list", formula1='"Fixo,%"', allow_blank=False)
    ws.add_data_validation(dv_tipo)
    dv_tipo.add("B2")
    # formato do valor acompanha o tipo escolhido
    ws.conditional_formatting.add("C2", FormulaRule(formula=['$B$2="%"'], fill=PatternFill("solid", bgColor=AMARELO)))

    # indicadores
    r = f"{PRIMEIRA}:{ULTIMA}"
    rng = lambda col: f"${col}${PRIMEIRA}:${col}${ULTIMA}"
    ind = [("Negócios", f"=COUNTA({rng('B')})", "0"),
           ("Em andamento", f'=COUNTA({rng("B")})-COUNTIF({rng("H")},"{GANHO}")-COUNTIF({rng("H")},"Perdido")', "0"),
           ("Ganhos", f'=COUNTIF({rng("H")},"{GANHO}")', "0"),
           ("Conversão", f'=IF(COUNTA({rng("B")})=0,0,COUNTIF({rng("H")},"{GANHO}")/COUNTA({rng("B")}))', "0%"),
           ("Comissão a receber", f"=SUM({rng('L')})", BRL)]
    for i, (rot, f, fmt) in enumerate(ind):
        col = 1 + i * 2 if i else 1
        col = [1, 2, 3, 4, 5][i]
        ws.cell(row=3, column=col, value=rot).font = Font(size=9, color="666666", bold=True)
        c = ws.cell(row=4, column=col, value=f)
        c.number_format, c.font = fmt, Font(size=13, bold=True, color=AZUL_ESC)
        c.alignment = Alignment(horizontal="left")

    for j, (h, w) in enumerate(zip(CABECALHO, LARGURAS), start=1):
        c = ws.cell(row=5, column=j, value=h)
        c.font, c.alignment = Font(bold=True, color="FFFFFF"), Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.fill = PatternFill("solid", fgColor=AZUL_ESC if j in (1, 2, 8) else AZUL)
        c.border = BORDA
        ws.column_dimensions[get_column_letter(j)].width = w
    ws.row_dimensions[5].height = 32

    for row in range(PRIMEIRA, ULTIMA + 1):
        ws[f"L{row}"] = f'=IF($H{row}="{GANHO}",IF($B$2="%",N($K{row})*$C$2,$C$2),0)'
        ws[f"L{row}"].number_format = BRL
        ws[f"K{row}"].number_format = BRL
        ws[f"I{row}"].number_format = ws[f"J{row}"].number_format = "dd/mm/yyyy"
        ws[f"E{row}"].number_format = "@"
        for col in range(1, 14):
            ws.cell(row=row, column=col).border = BORDA
        if row % 2:
            for col in range(1, 14):
                ws.cell(row=row, column=col).fill = PatternFill("solid", fgColor=CINZA)

    # listas suspensas
    if produtos:
        dv = DataValidation(type="list", formula1='"' + ",".join(produtos) + '"', allow_blank=True)
        dv.errorStyle = "warning"
        ws.add_data_validation(dv); dv.add(f"A{PRIMEIRA}:A{ULTIMA}")
    dv = DataValidation(type="list", formula1=f"=Listas!$A$2:$A${len(lista_fases)+20}", allow_blank=True)
    ws.add_data_validation(dv); dv.add(f"H{PRIMEIRA}:H{ULTIMA}")
    dv = DataValidation(type="list", formula1=f"=Listas!$B$2:$B${len(lista_origens)+20}", allow_blank=True)
    dv.errorStyle = "warning"
    ws.add_data_validation(dv); dv.add(f"F{PRIMEIRA}:F{ULTIMA}")

    # destaque por fase
    cores = {GANHO: "C6EFCE", "Perdido": "F8CBAD", "Em negociação": "FFEB9C", "Proposta / Teste": "FFEB9C"}
    for fase, cor in cores.items():
        ws.conditional_formatting.add(f"H{PRIMEIRA}:H{ULTIMA}",
            FormulaRule(formula=[f'$H{PRIMEIRA}="{fase}"'], fill=PatternFill("solid", bgColor=cor)))
    ws.freeze_panes = f"C{PRIMEIRA}"
    ws.auto_filter.ref = f"A5:M{ULTIMA}"
    return ws


def montar_modelo(vendedor="(modelo)"):
    wb = Workbook()
    ins = wb.active
    ins.title = "Instruções"
    ins.sheet_properties.tabColor = "888888"
    linhas = [
        (f"Acompanhamento de vendas - {vendedor}", Font(size=18, bold=True, color=AZUL_ESC)),
        ("Este arquivo é pessoal: só quem tem a senha consegue abrir. Os dados de um vendedor não aparecem para outro.", None),
        ("", None),
        ("Como usar", Font(bold=True, size=12)),
        ("1. Vá na aba da empresa/produto e registre cada negócio em uma linha (Produto, Cliente, Cidade, E-mail, WhatsApp, Origem, Interesse...).", None),
        ("2. Atualize a coluna 'Fase da negociação' conforme o cliente avança. Só 'Fechado (ganho)' gera comissão.", None),
        ("3. A coluna 'Comissão (R$)' é calculada sozinha (não digite nela). Em Dentalpos Componentes informe o 'Valor da venda'.", None),
        ("4. A aba 'Resumo' soma tudo o que você tem a receber por produto.", None),
        ("", None),
        ("Fases: Novo lead > Contato realizado > Em negociação > Proposta / Teste > Fechado (ganho) ou Perdido", None),
        ("Dentalpos One: marque 'Fechado (ganho)' somente quando o cliente for ativado após o período de testes.", None),
        ("", None),
        ("Novos produtos", Font(bold=True, size=12)),
        ("Use as abas amarelas 'Novo produto 1/2/3': digite o nome em A1, escolha Fixo ou % em B2 e o valor da comissão em C2.", None),
        ("Precisa de mais? Clique com o botão direito numa aba amarela > Mover ou copiar > Criar uma cópia.", None),
        ("Novas fases e origens: edite a aba 'Listas' (acrescente na primeira linha vazia da coluna).", None),
    ]
    for i, (t, f) in enumerate(linhas, 1):
        ins.cell(row=i, column=1, value=t)
        if f: ins.cell(row=i, column=1).font = f
    ins.column_dimensions["A"].width = 140

    lst = wb.create_sheet("Listas")
    lst.sheet_properties.tabColor = "888888"
    lst["A1"], lst["B1"] = "Fases da negociação", "Origens"
    for c in ("A1", "B1"): lst[c].font = Font(bold=True)
    for i, f in enumerate(FASES, 2): lst.cell(row=i, column=1, value=f)
    for i, o in enumerate(ORIGENS, 2): lst.cell(row=i, column=2, value=o)
    lst.column_dimensions["A"].width = lst.column_dimensions["B"].width = 26

    for emp in EMPRESAS:
        aba_empresa(wb, *emp, FASES, ORIGENS)

    res = wb.create_sheet("Resumo", 1)
    res.sheet_properties.tabColor = "2E9E5B"
    res["A1"] = f"Resumo de comissões - {vendedor}"
    res["A1"].font = Font(size=16, bold=True, color=AZUL_ESC)
    for j, h in enumerate(["Empresa / produto", "Regra da comissão", "Negócios", "Em andamento", "Ganhos", "Conversão", "Comissão a receber"], 1):
        c = res.cell(row=3, column=j, value=h)
        c.font, c.fill, c.border = Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor=AZUL_ESC), BORDA
        c.alignment = Alignment(horizontal="center", wrap_text=True)
    for i, emp in enumerate(EMPRESAS, 4):
        q = f"'{emp[0]}'!"
        vals = [f"={q}A1", f"={q}D2", f"={q}A4", f"={q}B4", f"={q}C4", f"={q}D4", f"={q}E4"]
        for j, v in enumerate(vals, 1):
            c = res.cell(row=i, column=j, value=v)
            c.border = BORDA
        res.cell(row=i, column=6).number_format = "0%"
        res.cell(row=i, column=7).number_format = BRL
    t = 4 + len(EMPRESAS)
    res.cell(row=t, column=1, value="TOTAL").font = Font(bold=True)
    for col in (3, 4, 5, 7):
        L = get_column_letter(col)
        c = res.cell(row=t, column=col, value=f"=SUM({L}4:{L}{t-1})")
        c.font = Font(bold=True)
    res.cell(row=t, column=7).number_format = BRL
    for col, w in zip("ABCDEFG", (34, 58, 11, 14, 10, 11, 20)):
        res.column_dimensions[col].width = w
    return wb


def carregar_vendedores():
    arq = AQUI / "vendedores.json"
    if not arq.exists():
        sys.exit("Crie vendedores.json (copie de vendedores.exemplo.json).")
    dados = json.loads(arq.read_text(encoding="utf-8"))
    alfabeto = string.ascii_letters.replace("l", "").replace("I", "").replace("O", "") + string.digits.replace("0", "")
    mudou = False
    for v in dados:
        if not v.get("senha"):
            v["senha"] = "".join(secrets.choice(alfabeto) for _ in range(10)); mudou = True
    if mudou:
        arq.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
    return dados


def nome_arquivo(nome):
    return "Vendas_" + "".join(c if c.isalnum() else "_" for c in nome) + ".xlsx"


def gravar_com_senha(wb, destino, senha):
    import msoffcrypto
    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    with open(destino, "wb") as out:
        msoffcrypto.OfficeFile(buf).encrypt(senha, out)


def gerar():
    SAIDA.mkdir(exist_ok=True)
    for v in carregar_vendedores():
        dest = SAIDA / nome_arquivo(v["nome"])
        gravar_com_senha(montar_modelo(v["nome"]), dest, v["senha"])
        print(f"{v['nome']:<25} {dest.name}   senha: {v['senha']}")


def consolidar():
    import msoffcrypto
    out = Workbook(); ws = out.active; ws.title = "Todos os negócios"
    ws.append(["Vendedor", "Empresa (aba)"] + CABECALHO)
    resumo = {}
    for v in carregar_vendedores():
        arq = SAIDA / nome_arquivo(v["nome"])
        if not arq.exists():
            print(f"(sem arquivo para {v['nome']}, ignorado)"); continue
        buf = io.BytesIO()
        f = msoffcrypto.OfficeFile(open(arq, "rb")); f.load_key(password=v["senha"]); f.decrypt(buf)
        wb = load_workbook(buf)
        for emp in EMPRESAS:
            a = wb[emp[0]]
            tipo, valor = a["B2"].value, a["C2"].value or 0
            nome_emp = a["A1"].value
            for row in a.iter_rows(min_row=PRIMEIRA, max_row=ULTIMA, max_col=13, values_only=True):
                if not row[1]:
                    continue
                row = list(row)
                ganho = row[7] == GANHO
                row[11] = (((row[10] or 0) * valor) if tipo == "%" else valor) if ganho else 0
                ws.append([v["nome"], nome_emp] + row)
                k = (v["nome"], nome_emp)
                r = resumo.setdefault(k, [0, 0, 0.0]); r[0] += 1; r[1] += ganho; r[2] += row[11]
    for j, h in enumerate([c.value for c in ws[1]], 1):
        ws.cell(row=1, column=j).font = Font(bold=True, color="FFFFFF")
        ws.cell(row=1, column=j).fill = PatternFill("solid", fgColor=AZUL_ESC)
        ws.column_dimensions[get_column_letter(j)].width = max(14, min(36, len(str(h)) + 6))
    for row in ws.iter_rows(min_row=2):
        row[10].number_format = row[11].number_format = "dd/mm/yyyy"
        row[12].number_format = row[13].number_format = BRL
    ws.freeze_panes = "C2"; ws.auto_filter.ref = ws.dimensions
    rs = out.create_sheet("Resumo por vendedor", 0)
    rs.append(["Vendedor", "Empresa", "Negócios", "Ganhos", "Comissão a pagar"])
    for c in rs[1]: c.font = Font(bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor=AZUL_ESC)
    for (vend, emp), (n, g, com) in sorted(resumo.items()):
        rs.append([vend, emp, n, g, com]); rs.cell(row=rs.max_row, column=5).number_format = BRL
    rs.append(["TOTAL", "", f"=SUM(C2:C{rs.max_row})", f"=SUM(D2:D{rs.max_row})", f"=SUM(E2:E{rs.max_row})"])
    rs.cell(row=rs.max_row, column=5).number_format = BRL
    for c in rs[rs.max_row]: c.font = Font(bold=True)
    for col, w in zip("ABCDE", (26, 28, 11, 10, 20)): rs.column_dimensions[col].width = w
    dest = SAIDA / "GESTOR_Consolidado.xlsx"
    SAIDA.mkdir(exist_ok=True); out.save(dest)
    print("Consolidado salvo em", dest)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "gerar"
    if cmd == "modelo":
        montar_modelo().save(AQUI / "Modelo_Vendas_DentalPos.xlsx"); print("Modelo criado.")
    elif cmd == "gerar": gerar()
    elif cmd == "consolidar": consolidar()
    else: sys.exit(__doc__)
