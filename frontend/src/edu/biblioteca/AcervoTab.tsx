import { Box, Checkbox, FormControlLabel } from "@mui/material";
import { useState } from "react";
import EduResourcePage from "../EduResourcePage";
import ListTable from "../infraestrutura/ListTable";
import { Light, SubNav, Tag, label } from "../infraestrutura/kit";
import ExemplaresPanel from "./ExemplaresPanel";
import ImportarPanel from "./ImportarPanel";
import InventarioBib from "./InventarioBib";

const TIPOS = ["LIVRO", "PERIODICO", "TESE", "DVD", "NORMA", "MAPA", "OUTRO"];

function Consulta() {
  const [disp, setDisp] = useState(false);
  return (
    <ListTable path="/biblioteca/acervo/busca" extraQuery={disp ? { disponivel: "true" } : {}} filters={[{ key: "tipo", label: "Tipo", options: TIPOS }]}
      toolbar={<FormControlLabel control={<Checkbox checked={disp} onChange={(e) => setDisp(e.target.checked)} />} label="Só com exemplar disponível" />}
      columns={[
        { key: "titulo", label: "Título", render: (r) => <span><b>{r.titulo}</b>{r.subtitulo ? `: ${r.subtitulo}` : ""}</span> }, { key: "autores", label: "Autores", render: (r) => (r.autores || []).join("; ") || "—" },
        { key: "editora", label: "Editora/ano", render: (r) => [r.editora, r.ano].filter(Boolean).join(", ") || "—" }, { key: "cdd", label: "CDD" },
        { key: "exemplaresDisponiveis", label: "Disponibilidade", render: (r) => <Light tone={r.exemplaresDisponiveis > 0 ? "success" : r.exemplaresTotal > 0 ? "warning" : "default"} text={`${r.exemplaresDisponiveis}/${r.exemplaresTotal}`} /> },
        { key: "acessoVirtual", label: "Virtual", render: (r) => (r.acessoVirtual ? <Tag text="E-book" tone="info" /> : "—") },
      ]} />
  );
}

export default function AcervoTab() {
  const [sub, setSub] = useState("consulta");
  return (
    <Box>
      <SubNav value={sub} onChange={setSub} items={[{ key: "consulta", label: "Consulta" }, { key: "obras", label: "Obras (catalogação)" }, { key: "exemplares", label: "Exemplares" }, { key: "importar", label: "Importar" }, { key: "inventario", label: "Inventário" }]} />
      {sub === "consulta" && <Consulta />}
      {sub === "obras" && (
        <EduResourcePage title="Obras do acervo" description="Registro bibliográfico (título). Os exemplares físicos ficam na aba Exemplares." base="/biblioteca" resource="/obras" dense
          filters={[{ key: "tipo", label: "Tipo", options: TIPOS }]}
          columns={[{ key: "titulo", label: "Título" }, { key: "autores", label: "Autores" }, { key: "editora", label: "Editora" }, { key: "ano", label: "Ano" }, { key: "isbn", label: "ISBN" }, { key: "cdd", label: "CDD" }, { key: "tipo", label: "Tipo", render: (r) => label(r.tipo) }]}
          fields={[{ key: "titulo", label: "Título", required: true }, { key: "subtitulo", label: "Subtítulo" }, { key: "tipo", label: "Tipo", type: "select", options: TIPOS },
            { key: "autores", label: "Autores (separe por vírgula)", type: "json-list" }, { key: "editora", label: "Editora" }, { key: "edicao", label: "Edição" }, { key: "ano", label: "Ano", type: "number" },
            { key: "isbn", label: "ISBN" }, { key: "issn", label: "ISSN" }, { key: "cdd", label: "CDD" }, { key: "cdu", label: "CDU" }, { key: "cutter", label: "Cutter" },
            { key: "assuntos", label: "Assuntos (separe por vírgula)", type: "json-list" }, { key: "idioma", label: "Idioma" }, { key: "paginas", label: "Páginas", type: "number" }, { key: "capaUrl", label: "URL da capa" },
            { key: "resumo", label: "Resumo", type: "textarea" }, { key: "ativo", label: "Ativa", type: "bool" }]} />
      )}
      {sub === "exemplares" && <ExemplaresPanel />}
      {sub === "importar" && <ImportarPanel />}
      {sub === "inventario" && <InventarioBib />}
    </Box>
  );
}
