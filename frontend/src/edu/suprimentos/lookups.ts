import { eduApi } from "../../services/EduApi";
import { itemsOf, useOptions } from "../infraestrutura/kit";

export const useItens = () => useOptions("sup-itens", async () => itemsOf(await eduApi.get("/suprimentos/itens?pageSize=200&ativo=true")).map((i: any) => ({ value: i.id, label: `${i.codigo} — ${i.nome}` })));
export const useAlmoxarifados = () => useOptions("sup-almox", async () => itemsOf(await eduApi.get("/suprimentos/almoxarifados?pageSize=200&ativo=true")).map((a: any) => ({ value: a.id, label: `${a.codigo} — ${a.nome}` })));
export const useCategoriasSup = () => useOptions("sup-categorias", async () => itemsOf(await eduApi.get("/suprimentos/categorias?pageSize=200&ativo=true")).map((a: any) => ({ value: a.id, label: a.nome })));
