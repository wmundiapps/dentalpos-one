"""Ordem de exibição da loja: primeiro os produtos com preço, depois por área (e em ordem alfabética dentro de cada área).
Importar em Produtos > Importar, COM "Atualizar produtos existentes" marcada."""
import csv, pathlib

aqui = pathlib.Path(__file__).parent
r = list(csv.DictReader(open(aqui / "loja/produtos-loja-wmundi.csv", encoding="utf-8-sig")))
AREAS = ["Hotelaria", "Gestão empresarial", "Saúde", "Marketing e vendas", "Educação", "Comércio e serviços", "Mobilidade e automotivo", "Carreira"]
com_preco = sorted([x for x in r if x["Regular price"]], key=lambda x: (AREAS.index(x["Categories"]), x["Name"].lower()))
sem_preco = sorted([x for x in r if not x["Regular price"]], key=lambda x: (AREAS.index(x["Categories"]), x["Name"].lower()))
ordem = com_preco + sem_preco
with open(aqui / "loja/ordem-produtos-loja.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["Type", "SKU", "Name", "Position"])
    for i, x in enumerate(ordem, 1):
        w.writerow(["external", x["SKU"], x["Name"], i])
for i, x in enumerate(ordem, 1):
    print(i, x["Name"], "|", x["Categories"], "| R$", x["Regular price"] or "Consulte")

# arquivo único de atualização: textos, preços e ordem (usar com "Atualizar produtos existentes" marcada)
with open(aqui / "loja/atualizacao-loja.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["Type", "SKU", "Name", "Short description", "Description", "Regular price", "Position"])
    for i, x in enumerate(ordem, 1):
        w.writerow(["external", x["SKU"], x["Name"], x["Short description"], x["Description"], x["Regular price"], i])
