"""Organiza a entrega final: gestão (Silvio) x ofertas para empresas x interno. Rode depois de gerar tudo."""
import shutil, subprocess, pathlib, zipfile

a = pathlib.Path(__file__).parent
pdf = a / "pdf"
E = a / "entrega"
if E.exists():
    shutil.rmtree(E)
g = E / "1-GESTAO-Silvio-Breda"
o = E / "2-OFERTAS-para-empresas"
h = o / "Hotelaria"
p = o / "Prefeituras"
i = E / "3-INTERNO-WMundi-nao-enviar"
for d in (g, h, p, i):
    d.mkdir(parents=True)


def cp(src, dst, exts=("pdf", "docx")):
    for e in exts:
        f = pdf / f"{src}.{e}"
        if f.exists():
            shutil.copy(f, dst / f"{dstname[0]}.{e}")


def par(src, nome, destino, exts=("pdf", "docx")):
    for e in exts:
        f = pdf / f"{src}.{e}"
        if f.exists():
            shutil.copy(f, destino / f"{nome}.{e}")


# 1. Gestão: parceria com o Silvio
shutil.copy(a.parent / "apresentacao/WMundi-Portfolio-e-Programa-de-Gestores.pdf", g / "1-Portfolio-WMundi-e-Programa-de-Gestores.pdf")
par("proposta-silvio-breda", "2-Proposta-ao-Silvio-Breda", g)
par("parceria-carta-proposta", "3-Carta-proposta-de-Parceria", g)
par("parceria-termos", "4-Termos-da-Parceria", g)
par("parceria-confidencialidade", "5-Termo-de-Confidencialidade", g)

# 2. Ofertas para empresas
par("carta-proposta-hotelaria", "Carta-proposta-Hotelaria", h)
par("carta-urbanflow-prefeituras", "Carta-proposta-Prefeituras", p)


def unir(arqs, destino):
    subprocess.run(["pdfunite", *[str(pdf / f"{x}.pdf") for x in arqs], str(destino)], check=True)


unir(["carta-ponto", "proposta-ponto"], h / "Apresentacao-Ponto-Facial.pdf")
unir(["carta-precificador-hotelaria", "proposta-precificador"], h / "Apresentacao-Precificador-Hotelaria.pdf")
unir(["carta-urbanflow-prefeituras", "proposta-urbanflow"], p / "Apresentacao-UrbanFlow-Prefeituras.pdf")
par("carta-ponto", "Carta-de-apresentacao-Ponto-Facial", h, ("docx",))
par("carta-precificador-hotelaria", "Carta-de-apresentacao-Precificador-Hotelaria", h, ("docx",))

(o / "LINKS-das-demonstracoes.txt").write_text(
    "WMundi® · Demonstrações interativas (dados fictícios) · disponíveis até 02/12/2026\n\n"
    "1. Ponto por Reconhecimento Facial\nhttps://wmundi-ofertas.netlify.app/ponto/\n\n"
    "2. Precificador de Hotelaria\nhttps://wmundi-ofertas.netlify.app/precificador-8f3k/\n\n"
    "3. UrbanFlow (prefeituras)\nhttps://wmundi-ofertas.netlify.app/urbanflow/\n", encoding="utf-8")

# 3. Interno
par("guia-vendedor-INTERNO", "Guia-do-vendedor-INTERNO", i, ("pdf",))
par("comparativo-urbanflow", "Comparativo-UrbanFlow-INTERNO", i, ("pdf",))

z = zipfile.ZipFile(a / "WMundi-Entrega-Silvio-Breda.zip", "w", zipfile.ZIP_DEFLATED)
for f in sorted(E.rglob("*")):
    if f.is_file() and "3-INTERNO" not in str(f):
        z.write(f, f.relative_to(E))
z.close()
for f in sorted(E.rglob("*")):
    if f.is_file():
        print(f.relative_to(E))
