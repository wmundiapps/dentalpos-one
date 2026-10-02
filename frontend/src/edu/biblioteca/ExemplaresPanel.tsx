import { Box, Button } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { StatusChip } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { FormDialog, Tag, fmtDate, label, nameOf, openHtml, useSpaces, useToast, type Field } from "../infraestrutura/kit";
import { ObraPicker } from "./pickers";

const ESTADOS = ["OTIMO", "BOM", "REGULAR", "RUIM", "PESSIMO"];
const ST = ["DISPONIVEL", "EMPRESTADO", "RESERVADO", "EM_REPARO", "EXTRAVIADO", "BAIXADO"];

export default function ExemplaresPanel() {
  const [key, setKey] = useState(0);
  const [obra, setObra] = useState<any | null>(null);
  const [dlg, setDlg] = useState<{ kind: "novo" | "lote" | "editar" | "status" | "baixar"; row?: any } | null>(null);
  const spaces = useSpaces();
  const toast = useToast();
  const reload = () => setKey((k) => k + 1);

  const base = (): Field[] => [
    { key: "spaceId", label: "Local (espaço)", type: "select", options: spaces }, { key: "estante", label: "Estante" }, { key: "prateleira", label: "Prateleira" },
    { key: "estado", label: "Estado de conservação", type: "select", options: ESTADOS, def: "BOM" }, { key: "aquisicaoTipo", label: "Aquisição", type: "select", options: ["COMPRA", "DOACAO", "PERMUTA", "PRODUCAO_INSTITUCIONAL"], def: "COMPRA" },
    { key: "dataAquisicao", label: "Data de aquisição", type: "date" }, { key: "valor", label: "Valor (R$)", type: "number" }, { key: "fornecedor", label: "Fornecedor" }, { key: "notaFiscal", label: "Nota fiscal" },
    { key: "apenasConsulta", label: "Apenas consulta (não empresta)", type: "bool" }, { key: "observacoes", label: "Observações", type: "textarea" },
  ];
  const fields = (): Field[] => {
    switch (dlg?.kind) {
      case "novo": return [{ key: "tombo", label: "Tombo", helper: "Em branco: gerado automaticamente" }, { key: "codigoBarras", label: "Código de barras" }, ...base()];
      case "lote": return [{ key: "quantidade", label: "Quantidade de exemplares", type: "number", required: true }, ...base()];
      case "editar": return [{ key: "tombo", label: "Tombo" }, { key: "codigoBarras", label: "Código de barras" }, ...base()];
      case "status": return [{ key: "status", label: "Novo status", type: "select", options: ["DISPONIVEL", "EM_REPARO", "EXTRAVIADO"], required: true }, { key: "estado", label: "Estado de conservação", type: "select", options: ESTADOS }];
      default: return [{ key: "motivo", label: "Motivo da baixa", type: "select", options: ["PERDA", "DANO", "OBSOLETO", "DOACAO", "ROUBO", "DUPLICIDADE", "OUTRO"], required: true }, { key: "observacao", label: "Justificativa (mín. 5 caracteres)", type: "textarea", required: true }];
    }
  };
  const titulos = { novo: "Novo exemplar", lote: "Exemplares em lote", editar: "Editar exemplar", status: "Alterar status do exemplar", baixar: "Baixar exemplar (descarte)" } as const;
  async function submit(b: any) {
    const k = dlg!.kind, r = dlg!.row;
    if (k === "novo" || k === "lote") {
      if (!obra) throw new Error("Selecione a obra.");
      if (k === "novo") await eduApi.post("/biblioteca/exemplares", { ...b, obraId: obra.id });
      else { const x = await eduApi.post(`/biblioteca/obras/${obra.id}/exemplares-lote`, b); toast.ok(`${x.criados} exemplar(es) criado(s): ${(x.tombos || []).slice(0, 3).join(", ")}${(x.tombos || []).length > 3 ? "…" : ""}`); reload(); return; }
    } else if (k === "editar") await eduApi.put(`/biblioteca/exemplares/${r.id}`, b);
    else if (k === "status") await eduApi.post(`/biblioteca/exemplares/${r.id}/status`, b);
    else await eduApi.post(`/biblioteca/exemplares/${r.id}/baixar`, b);
    toast.ok("Operação concluída."); reload();
  }
  return (
    <Box>
      <ListTable path="/biblioteca/exemplares" refreshKey={key}
        filters={[{ key: "status", label: "Status", options: ST }, { key: "estado", label: "Conservação", options: ESTADOS }]}
        toolbar={<>
          <Button onClick={() => toast.run(() => openHtml("/biblioteca/descartes/termo"), "Termo aberto em nova aba.")}>Termo de baixa</Button>
          <Button onClick={() => { setObra(null); setDlg({ kind: "lote" }); }}>Em lote</Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setObra(null); setDlg({ kind: "novo" }); }}>Novo exemplar</Button>
        </>}
        columns={[
          { key: "tombo", label: "Tombo" }, { key: "obra", label: "Obra", render: (r) => r.obra?.titulo || "—" }, { key: "local", label: "Localização", render: (r) => [nameOf(spaces, r.spaceId) === "—" ? "" : nameOf(spaces, r.spaceId), r.estante, r.prateleira].filter(Boolean).join(" · ") || "—" },
          { key: "estado", label: "Conservação", render: (r) => <Tag text={label(r.estado)} tone={["RUIM", "PESSIMO"].includes(r.estado) ? "error" : r.estado === "REGULAR" ? "warning" : "success"} /> },
          { key: "status", label: "Status", render: (r) => <StatusChip value={r.status} /> }, { key: "apenasConsulta", label: "Consulta", render: (r) => (r.apenasConsulta ? <Tag text="Só consulta" /> : "—") }, { key: "dataAquisicao", label: "Aquisição", render: (r) => fmtDate(r.dataAquisicao) },
        ]}
        actions={(r, rl) => (
          <>
            <Button size="small" onClick={() => setDlg({ kind: "editar", row: r })}>Editar</Button>
            {!["EMPRESTADO", "BAIXADO"].includes(r.status) && <Button size="small" onClick={() => setDlg({ kind: "status", row: r })}>Status</Button>}
            {["BAIXADO", "EXTRAVIADO"].includes(r.status)
              ? <Button size="small" color="success" onClick={() => toast.run(() => eduApi.post(`/biblioteca/exemplares/${r.id}/reativar`, {}), "Exemplar reativado.", rl, "Reativar este exemplar?")}>Reativar</Button>
              : r.status !== "EMPRESTADO" && <Button size="small" color="error" onClick={() => setDlg({ kind: "baixar", row: r })}>Baixar</Button>}
          </>
        )} />
      <FormDialog open={!!dlg} onClose={() => setDlg(null)} title={dlg ? titulos[dlg.kind] : ""} fields={fields()} initial={dlg?.kind === "editar" ? dlg.row : dlg?.kind === "status" ? dlg.row : null} onSubmit={submit}
        intro={dlg && ["novo", "lote"].includes(dlg.kind) ? <Box sx={{ mb: 2 }}><ObraPicker label="Obra" value={obra} onChange={setObra} required /></Box> : undefined} />
      {toast.node}
    </Box>
  );
}
