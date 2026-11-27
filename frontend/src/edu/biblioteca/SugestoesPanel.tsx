import { Box, Button } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { StatusChip } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { FormDialog, Tag, brl, fmtDate, label, useSpaces, useToast } from "../infraestrutura/kit";

export default function SugestoesPanel() {
  const [key, setKey] = useState(0);
  const [dlg, setDlg] = useState<{ kind: "nova" | "decidir" | "comprar" | "receber"; row?: any; aprovar?: boolean } | null>(null);
  const spaces = useSpaces();
  const toast = useToast();
  const reload = () => setKey((k) => k + 1);
  const fields = () => {
    switch (dlg?.kind) {
      case "nova": return [{ key: "titulo", label: "Título", required: true, full: true }, { key: "autores", label: "Autores" }, { key: "editora", label: "Editora" }, { key: "isbn", label: "ISBN" },
        { key: "tipoBibliografia", label: "Tipo", type: "select" as const, options: ["BASICA", "COMPLEMENTAR"] }, { key: "quantidade", label: "Quantidade", type: "number" as const, def: 1 }, { key: "valorEstimado", label: "Valor estimado (R$)", type: "number" as const },
        { key: "justificativa", label: "Justificativa (mín. 5 caracteres)", type: "textarea" as const, required: true }];
      case "decidir": return [{ key: "motivo", label: dlg.aprovar ? "Observação (opcional)" : "Motivo da rejeição (obrigatório)", type: "textarea" as const, required: !dlg.aprovar }, { key: "valorEstimado", label: "Valor estimado (R$)", type: "number" as const }];
      case "comprar": return [{ key: "valorEstimado", label: "Valor da compra (R$)", type: "number" as const }];
      default: return [{ key: "quantidade", label: "Quantidade recebida", type: "number" as const, def: dlg?.row?.quantidade }, { key: "spaceId", label: "Local", type: "select" as const, options: spaces }, { key: "estante", label: "Estante" }, { key: "valor", label: "Valor unitário (R$)", type: "number" as const }, { key: "fornecedor", label: "Fornecedor" }, { key: "notaFiscal", label: "Nota fiscal" }];
    }
  };
  return (
    <Box>
      <ListTable path="/biblioteca/sugestoes" refreshKey={key} searchable={false}
        filters={[{ key: "status", label: "Situação", options: ["PENDENTE", "APROVADA", "REJEITADA", "COMPRADA", "RECEBIDA"] }, { key: "origem", label: "Origem", options: ["ADEQUACAO", "ALUNO", "PROFESSOR", "BIBLIOTECA"] }]}
        toolbar={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setDlg({ kind: "nova" })}>Nova sugestão</Button>}
        columns={[
          { key: "createdAt", label: "Data", render: (r) => fmtDate(r.createdAt) }, { key: "titulo", label: "Título" }, { key: "origem", label: "Origem", render: (r) => <Tag text={label(r.origem)} /> }, { key: "quantidade", label: "Qtd" },
          { key: "valorEstimado", label: "Estimado", align: "right", render: (r) => brl(r.valorEstimado) }, { key: "justificativa", label: "Justificativa" }, { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
        ]}
        actions={(r) => (
          <>
            {r.status === "PENDENTE" && <Button size="small" color="success" onClick={() => setDlg({ kind: "decidir", row: r, aprovar: true })}>Aprovar</Button>}
            {r.status === "PENDENTE" && <Button size="small" color="error" onClick={() => setDlg({ kind: "decidir", row: r, aprovar: false })}>Rejeitar</Button>}
            {r.status === "APROVADA" && <Button size="small" onClick={() => setDlg({ kind: "comprar", row: r })}>Marcar comprada</Button>}
            {["APROVADA", "COMPRADA"].includes(r.status) && <Button size="small" onClick={() => setDlg({ kind: "receber", row: r })}>Receber</Button>}
          </>
        )} />
      <FormDialog open={!!dlg} onClose={() => setDlg(null)} fields={fields()}
        title={dlg ? { nova: "Nova sugestão de aquisição", decidir: `${dlg.aprovar ? "Aprovar" : "Rejeitar"}: ${dlg.row?.titulo || ""}`, comprar: `Compra: ${dlg.row?.titulo || ""}`, receber: `Recebimento: ${dlg.row?.titulo || ""}` }[dlg.kind] : ""}
        onSubmit={async (b) => {
          const r = dlg!.row;
          if (dlg!.kind === "nova") await eduApi.post("/biblioteca/sugestoes", b);
          else if (dlg!.kind === "decidir") await eduApi.post(`/biblioteca/sugestoes/${r.id}/decidir`, { decisao: dlg!.aprovar ? "APROVAR" : "REJEITAR", ...b });
          else if (dlg!.kind === "comprar") await eduApi.post(`/biblioteca/sugestoes/${r.id}/comprar`, b);
          else await eduApi.post(`/biblioteca/sugestoes/${r.id}/receber`, b);
          toast.ok("Operação concluída."); reload();
        }} />
      {toast.node}
    </Box>
  );
}
