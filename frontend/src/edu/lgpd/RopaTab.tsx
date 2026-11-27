import { Alert, Box, Button, Chip, Pagination, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { FormDialog, LoadBox, Pick, Section, Status, call, fmtDate, itemsOf, useApi, useRunner, useToast } from "../desempenho/kit";
import { BASES_LEGAIS, baixar } from "./common";

export default function RopaTab() {
  const [rev, setRev] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [flt, setFlt] = useState("");
  const [edit, setEdit] = useState<null | { row?: any }>(null);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const l = useApi<any>(`/lgpd/ropa?page=${page}&pageSize=25${q ? `&q=${encodeURIComponent(q)}` : ""}${status ? `&status=${status}` : ""}${flt === "sens" ? "&sensiveis=true" : flt === "men" ? "&menores=true" : ""}`, [rev]);
  const r = edit?.row;
  return (
    <Section title="Inventário de tratamento (ROPA — art. 37)" actions={<>
      <Button onClick={() => run(() => baixar("/lgpd/ropa?formato=csv", "ropa-inventario-tratamento.csv"), "CSV baixado.")}>Exportar CSV</Button>
      <Button onClick={() => run(() => call("POST", "/lgpd/ropa/seed", {}), "Modelos conferidos.")}>Atualizar modelos</Button>
      <Button variant="contained" onClick={() => setEdit({})}>Nova atividade</Button></>}>
      {node}
      <Alert severity="info" sx={{ mb: 2 }}>As atividades vêm pré-preenchidas como <b>modelo</b> (status “Em revisão”) a partir dos módulos do EduMaster. Revise finalidade, base legal, retenção, compartilhamento e operadores com cada área e marque como “Ativa”.</Alert>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
        <TextField size="small" label="Buscar" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <Pick label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={["ATIVA", "EM_REVISAO", "DESCONTINUADA"].map((s) => ({ value: s, label: s.replace(/_/g, " ") }))} all="Todos" />
        <Pick label="Filtro" value={flt} onChange={(v) => { setFlt(v); setPage(1); }} options={[{ value: "sens", label: "Dados sensíveis" }, { value: "men", label: "Dados de menores" }]} all="Nenhum" />
      </Box>
      <LoadBox loading={l.loading} error={l.error} empty={!itemsOf(l.data).length} onRetry={l.reload}>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Atividade</TableCell><TableCell>Dados</TableCell><TableCell>Base legal</TableCell><TableCell>Retenção</TableCell><TableCell>Compartilha com</TableCell><TableCell>Status</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {itemsOf(l.data).map((a: any) => (
                <TableRow key={a.id} hover>
                  <TableCell sx={{ minWidth: 220 }}><b>{a.atividade}</b><Typography variant="caption" component="div" color="text.secondary">{a.codigo} · {a.area}</Typography>{a.dadosSensiveis && <Chip size="small" color="warning" label="sensível" sx={{ mr: 0.5 }} />}{a.dadosMenores && <Chip size="small" label="menores" sx={{ mr: 0.5 }} />}{a.transferenciaInternacional && <Chip size="small" color="info" label="transf. internacional" />}</TableCell>
                  <TableCell sx={{ minWidth: 180 }}><Typography variant="caption">{(a.categoriasDados || []).join(", ")}</Typography></TableCell>
                  <TableCell>{a.baseLegal.replace(/_/g, " ")}</TableCell><TableCell sx={{ minWidth: 150 }}><Typography variant="caption">{a.retencao ?? "—"}</Typography></TableCell>
                  <TableCell sx={{ minWidth: 160 }}><Typography variant="caption">{((a.compartilhamento as any[]) || []).map((c) => c.destinatario).join("; ") || "—"}</Typography></TableCell>
                  <TableCell><Status value={a.status} /><Typography variant="caption" component="div">rev. {fmtDate(a.revisadoEm)}</Typography></TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}><Button size="small" onClick={() => setEdit({ row: a })}>Editar</Button>{a.status !== "ATIVA" && a.status !== "DESCONTINUADA" && <Button size="small" color="success" onClick={() => run(() => call("POST", `/lgpd/ropa/${a.id}/revisar`, {}), "Marcada como revisada/ativa.")}>Marcar revisada</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        <Pagination sx={{ mt: 2 }} count={Math.max(1, Math.ceil((l.data?.total ?? 0) / 25))} page={page} onChange={(_, p) => setPage(p)} />
      </LoadBox>
      <FormDialog open={!!edit} title={r ? `Editar: ${r.atividade}` : "Nova atividade de tratamento"} maxWidth="lg" intro={<Alert severity="warning" sx={{ mb: 2 }}>Dado sensível não pode se basear em legítimo interesse, proteção ao crédito ou execução de contrato (art. 11).</Alert>}
        fields={[
          { key: "codigo", label: "Código", required: true, helper: "Ex.: ACAD-MATRICULA" }, { key: "atividade", label: "Atividade", required: true }, { key: "area", label: "Área responsável" }, { key: "sistema", label: "Módulo/sistema" },
          { key: "finalidade", label: "Finalidade", type: "textarea", required: true }, { key: "baseLegal", label: "Base legal", type: "select", required: true, options: BASES_LEGAIS }, { key: "baseLegalDetalhe", label: "Detalhe da base legal", type: "textarea" },
          { key: "categoriasTitulares", label: "Categorias de titulares", type: "list" }, { key: "categoriasDados", label: "Categorias de dados", type: "list" },
          { key: "dadosSensiveis", label: "Trata dado sensível", type: "bool" }, { key: "dadosMenores", label: "Trata dado de menores", type: "bool" }, { key: "transferenciaInternacional", label: "Transferência internacional", type: "bool" },
          { key: "retencao", label: "Prazo e regra de retenção" }, { key: "retencaoMeses", label: "Retenção (meses)", type: "number" }, { key: "responsavel", label: "Responsável na área" },
          { key: "status", label: "Status", type: "select", options: ["ATIVA", "EM_REVISAO", "DESCONTINUADA"] }, { key: "medidasSeguranca", label: "Medidas de segurança", type: "textarea" },
        ]}
        initial={r ? { ...r, categoriasTitulares: (r.categoriasTitulares || []).join(", "), categoriasDados: (r.categoriasDados || []).join(", ") } : { status: "ATIVA" }}
        onClose={() => setEdit(null)} onSubmit={async (b) => { const body = { ...b }; if (r) { delete (body as any).codigo; await call("PUT", `/lgpd/ropa/${r.id}`, body); } else await call("POST", "/lgpd/ropa", body); setRev((x) => x + 1); }} />
    </Section>
  );
}
