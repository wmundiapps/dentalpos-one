import { Box, Button } from "@mui/material";
import { useState } from "react";
import EduResourcePage from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import { SubNav, Tag, brl, num, useToast } from "../infraestrutura/kit";
import { useCategoriasSup } from "./lookups";

export default function CatalogoTab() {
  const [sub, setSub] = useState("itens");
  const cats = useCategoriasSup();
  const toast = useToast();
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        <SubNav value={sub} onChange={setSub} items={[{ key: "itens", label: "Itens" }, { key: "categorias", label: "Categorias" }, { key: "almox", label: "Almoxarifados" }, { key: "alcadas", label: "Alçadas de aprovação" }]} />
        <Box sx={{ flex: 1 }} />
        <Button sx={{ mb: 2 }} onClick={() => toast.run(() => eduApi.post("/suprimentos/bootstrap", {}), "Cadastros-modelo carregados (categorias, almoxarifados, alçadas e itens).", undefined, "Carregar cadastros-modelo? Só cria o que ainda não existe.")}>Carregar cadastros-modelo</Button>
      </Box>
      {sub === "itens" && (
        <EduResourcePage title="Catálogo de itens" base="/suprimentos" resource="/itens" dense filters={[{ key: "ativo", label: "Ativo", options: ["true", "false"] }]}
          columns={[{ key: "codigo", label: "Código" }, { key: "nome", label: "Item" }, { key: "categoria", label: "Categoria", render: (r) => r.categoria?.nome || "—" }, { key: "unidade", label: "Unid." },
            { key: "estoqueMinimo", label: "Mínimo", render: (r) => num(r.estoqueMinimo, 2) }, { key: "custoMedio", label: "Custo médio", render: (r) => brl(r.custoMedio) }, { key: "precoReferencia", label: "Preço ref.", render: (r) => brl(r.precoReferencia) },
            { key: "controle", label: "Controle", render: (r) => <>{r.controlaLote && <Tag text="lote" />} {r.controlaValidade && <Tag text="validade" />}</> }]}
          fields={[{ key: "codigo", label: "Código", required: true }, { key: "nome", label: "Nome", required: true }, { key: "descricao", label: "Descrição", type: "textarea" }, { key: "categoriaId", label: "Categoria", type: "select", options: cats },
            { key: "unidade", label: "Unidade (UN, CX, KG…)" }, { key: "estoqueMinimo", label: "Estoque mínimo", type: "number" }, { key: "estoqueMaximo", label: "Estoque máximo", type: "number" }, { key: "pontoPedido", label: "Ponto de pedido", type: "number" },
            { key: "leadTimeDias", label: "Prazo de reposição (dias)", type: "number" }, { key: "precoReferencia", label: "Preço de referência (R$)", type: "number" },
            { key: "controlaLote", label: "Controla lote", type: "bool" }, { key: "controlaValidade", label: "Controla validade", type: "bool" }, { key: "ativo", label: "Ativo", type: "bool" }]} />
      )}
      {sub === "categorias" && (
        <EduResourcePage title="Categorias de itens" base="/suprimentos" resource="/categorias" dense
          columns={[{ key: "nome", label: "Nome" }, { key: "descricao", label: "Descrição" }, { key: "ativo", label: "Ativa" }]}
          fields={[{ key: "nome", label: "Nome", required: true }, { key: "descricao", label: "Descrição" }, { key: "ativo", label: "Ativa", type: "bool" }]} />
      )}
      {sub === "almox" && (
        <EduResourcePage title="Almoxarifados" base="/suprimentos" resource="/almoxarifados" dense
          columns={[{ key: "codigo", label: "Código" }, { key: "nome", label: "Nome" }, { key: "localizacao", label: "Localização" }, { key: "ativo", label: "Ativo" }]}
          fields={[{ key: "codigo", label: "Código", required: true }, { key: "nome", label: "Nome", required: true }, { key: "localizacao", label: "Localização" }, { key: "ativo", label: "Ativo", type: "bool" }]} />
      )}
      {sub === "alcadas" && (
        <EduResourcePage title="Alçadas de aprovação" description="Quem precisa aprovar requisições conforme o valor estimado (somente Financeiro edita)." base="/suprimentos" resource="/alcadas" dense searchable={false}
          columns={[{ key: "nivel", label: "Nível" }, { key: "valorMinimo", label: "A partir de", render: (r) => brl(r.valorMinimo) }, { key: "papel", label: "Papel aprovador" }, { key: "descricao", label: "Descrição" }, { key: "ativo", label: "Ativa" }]}
          fields={[{ key: "nivel", label: "Nível", type: "number", required: true }, { key: "valorMinimo", label: "Valor mínimo (R$)", type: "number", required: true }, { key: "papel", label: "Papel (COORDINATOR, FINANCE, RECTOR…)", required: true }, { key: "descricao", label: "Descrição" }, { key: "ativo", label: "Ativa", type: "bool" }]} />
      )}
      {toast.node}
    </Box>
  );
}
