"""Marca registrada: coloca o ® em cima do nome WMundi (texto em HTML e Word) e na logo."""
import re, pathlib
from PIL import Image, ImageDraw, ImageFont

AQUI = pathlib.Path(__file__).parent
LOGO_SRC = AQUI.parent / "site-novo/assets/logo-wmundi.png"
LOGO_R = AQUI / "logo-wmundi-r.png"


def logo_com_r():
    """Logo da WMundi com o ® no canto superior direito do nome."""
    lg = Image.open(LOGO_SRC).convert("RGBA")
    w, h = lg.size
    out = Image.new("RGBA", (w + 34, h + 12), (0, 0, 0, 0))
    out.paste(lg, (0, 12), lg)
    d = ImageDraw.Draw(out)
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"):
        try:
            font = ImageFont.truetype(f, 30)
            break
        except OSError:
            font = ImageFont.load_default()
    d.text((w + 2, 0), "®", font=font, fill=(255, 255, 255, 255))
    out.save(LOGO_R)
    return LOGO_R


NOME = re.compile(r"(?<![\w/.@-])(WMundi|WMUNDI)(?![\w.@-]|<sup|®)")


def reg_html(html):
    """® sobrescrito depois de WMundi nos textos (não mexe em tags, endereços, e-mails, <title>, <style> e <script>)."""
    partes = re.split(r"(<[^>]+>)", html)
    saida, pular = [], 0
    for p in partes:
        if p.startswith("<"):
            t = p.lower()
            if re.match(r"<(title|style|script)\b", t):
                pular += 1
            elif re.match(r"</(title|style|script)\b", t):
                pular = max(0, pular - 1)
            saida.append(p)
        elif pular:
            saida.append(p)
        else:
            saida.append(NOME.sub(lambda m: m.group(1) + "<sup>®</sup>", p))
    return "".join(saida)


def reg_runs(par, txt, negrito_ini=False):
    """Adiciona ao parágrafo do Word o texto (com **negrito**) e o ® sobrescrito depois de WMundi."""
    for i, parte in enumerate(re.split(r"\*\*(.+?)\*\*", txt)):
        bold = i % 2 == 1
        pos = 0
        for m in NOME.finditer(parte):
            r = par.add_run(parte[pos:m.end()]); r.bold = bold
            s = par.add_run("®"); s.font.superscript = True; s.bold = bold
            pos = m.end()
        r = par.add_run(parte[pos:]); r.bold = bold


if __name__ == "__main__":
    print(logo_com_r())
