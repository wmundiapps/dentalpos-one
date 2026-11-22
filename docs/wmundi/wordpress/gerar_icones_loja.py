"""Gera os ícones (800x800) dos produtos da loja, com a cor da área, a sigla do produto e a logo da WMundi."""
import pathlib, sys
from PIL import Image, ImageDraw, ImageFont

aqui = pathlib.Path(__file__).parent
SAIDA = aqui.parent / "site-novo" / "assets" / "produtos"
LOGO = aqui.parent / "ofertas" / "logo-wmundi-r.png"
FONTE = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
COR = {"Saúde": "#7a4dff", "Marketing e vendas": "#ff5a4e", "Educação": "#13b58f", "Comércio e serviços": "#e08a00",
       "Carreira": "#2f5bff", "Gestão empresarial": "#0f9fc9", "Hotelaria": "#0b1b3f", "Mobilidade e automotivo": "#0b8f8f"}


def sigla(nome):
    p = [w for w in nome.replace("®", "").replace(",", "").split() if w[0].isalpha()]
    return (p[0][0] + (p[1][0] if len(p) > 1 else p[0][1])).upper()


def gerar(sku, nome, cat):
    SAIDA.mkdir(parents=True, exist_ok=True)
    cor = COR.get(cat, "#0b1b3f")
    im = Image.new("RGB", (800, 800), "#f5f7fc")
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((30, 30, 770, 770), radius=70, fill=cor)
    d.ellipse((250, 90, 550, 390), fill="white")
    f = ImageFont.truetype(FONTE, 130)
    s = sigla(nome)
    w = d.textlength(s, font=f)
    d.text((400 - w / 2, 175), s, font=f, fill=cor)
    # nome em até 3 linhas
    f2 = ImageFont.truetype(FONTE, 46)
    palavras, linhas, atual = nome.split(), [], ""
    for p in palavras:
        t = (atual + " " + p).strip()
        if d.textlength(t, font=f2) > 640 and atual:
            linhas.append(atual); atual = p
        else:
            atual = t
    linhas.append(atual)
    y = 430
    for l in linhas[:3]:
        w = d.textlength(l, font=f2)
        d.text((400 - w / 2, y), l, font=f2, fill="white")
        y += 60
    lg = Image.open(LOGO).convert("RGBA")
    lg.thumbnail((300, 110))
    im.paste(lg, (400 - lg.width // 2, 745 - lg.height - 20), lg)
    im.save(SAIDA / f"{sku}.png", optimize=True)
    return f"{sku}.png"


if __name__ == "__main__":
    print(gerar("WM-TESTE", "Ponto por Reconhecimento Facial", "Gestão empresarial"))
