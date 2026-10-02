import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Step, StepLabel, Stepper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { StatusChip } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { Async, FormDialog, Light, Tag, brl, fmtDate, fmtDateTime, label, num, useApi, useSupplierOptions, useToast } from "../infraestrutura/kit";
import CotarDialog from "./CotarDialog";
import NovaRequisicao from "./NovaRequisicao";
import { useAlmoxarifados } from "./lookups";

const STATUS = ["RASCUNHO", "AGUARDANDO_APROVACAO", "APROVADA", "REPROVADA", "EM_COTACAO", "COTADA", "PEDIDO_EMITIDO", "ATENDIDA", "CANCELADA"];
const FLUXO = ["RASCUNHO", "AGUARDANDO_APROVACAO", "APROVADA", "EM_COTACAO", "COTADA", "PEDIDO_EMITIDO", "ATENDIDA"];

function Detalhe({ id, onClose }: { id: string; onClose: () => void }) {
  const st = useApi<any>(`/suprimentos/requisicoes/${id}`);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Requisição</DialogTitle>
      <DialogContent dividers>
        <Async state={st}>
          {(r) => {
            const idx = FLUXO.indexOf(r.status);
            return (
              <Box sx={{ display: "grid", gap: 2 }}>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>{r.numero}</Typography><StatusChip value={r.status} /><Tag text={label(r.tipo)} /><Tag text={`Urgência ${label(r.urgencia)}`} tone={r.urgencia === "URGENTE" ? "error" : r.urgencia === "ALTA" ? "warning" : "default"} />
                </Box>
                {idx >= 0 ? (
                  <Box sx={{ overflowX: "auto" }}>
                    <Stepper activeStep={idx} alternativeLabel sx={{ minWidth: 640 }}>{FLUXO.map((s) => <Step key={s}><StepLabel>{label(s)}</StepLabel></Step>)}</Stepper>
                  </Box>
                ) : <Typography color="text.secondary">Situação atual: {label(r.status)}{r.motivoReprovacao ? ` — ${r.motivoReprovacao}` : ""}</Typography>}
                {r.justificativa && <Typography variant="body2">Justificativa: {r.justificativa}</Typography>}
                <Box sx={{ overflowX: "auto" }}>
                  <Table size="small">
                    <TableHead><TableRow><TableCell>Item</TableCell><TableCell align="right">Qtd</TableCell><TableCell align="right">Preço est.</TableCell><TableCell align="right">Subtotal</TableCell></TableRow></TableHead>
                    <TableBody>
                      {(r.itens || []).map((i: any) => <TableRow key={i.id}><TableCell>{i.descricao}</TableCell><TableCell align="right">{num(i.quantidade, 3)} {i.unidade}</TableCell><TableCell align="right">{brl(i.precoEstimado)}</TableCell><TableCell align="right">{brl((i.precoEstimado || 0) * i.quantidade)}</TableCell></TableRow>)}
                      <TableRow><TableCell colSpan={3} align="right"><b>Total estimado</b></TableCell><TableCell align="right"><b>{brl(r.valorEstimado)}</b></TableCell></TableRow>
                    </TableBody>
                  </Table>
                </Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Cadeia de aprovação (alçadas)</Typography>
                <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                  {(r.aprovacoes || []).map((a: any) => (
                    <Light key={a.id} tone={a.status === "APROVADO" ? "success" : a.status === "REPROVADO" ? "error" : "warning"} text={`Nível ${a.nivel} · ${a.papel} · ${label(a.status)}${a.decididoEm ? ` (${fmtDateTime(a.decididoEm)})` : ""}`} />
                  ))}
                  {!(r.aprovacoes || []).length && <Typography variant="body2" color="text.secondary">Ainda não enviada para aprovação.</Typography>}
                </Box>
                {(r.cotacoes || []).length > 0 && (<><Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Cotações</Typography>{r.cotacoes.map((c: any) => <Typography key={c.id} variant="body2">{c.numero} · <StatusChip value={c.status} /> · criado em {fmtDate(c.createdAt)}</Typography>)}</>)}
              </Box>
            );
          }}
        </Async>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

export default function RequisicoesTab() {
  const [key, setKey] = useState(0);
  const [nova, setNova] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [dlg, setDlg] = useState<{ kind: "decidir" | "cotar" | "estoque"; row: any; aprovar?: boolean } | null>(null);
  const [minhas, setMinhas] = useState(false);
  const forn = useSupplierOptions();
  const almox = useAlmoxarifados();
  const toast = useToast();
  const reload = () => setKey((k) => k + 1);
  const post = (r: any, p: string, ok: string, confirm?: string) => toast.run(() => eduApi.post(`/suprimentos/requisicoes/${r.id}${p}`, {}), ok, reload, confirm);
  return (
    <Box>
      <ListTable path="/suprimentos/requisicoes" refreshKey={key} searchable={false} extraQuery={minhas ? { minhas: "true" } : {}}
        filters={[{ key: "status", label: "Situação", options: STATUS }, { key: "tipo", label: "Tipo", options: ["COMPRA", "INSUMO"] }]}
        toolbar={<><Button onClick={() => setMinhas(!minhas)} variant={minhas ? "contained" : "outlined"}>Somente minhas</Button><Button variant="contained" startIcon={<AddIcon />} onClick={() => setNova(true)}>Nova requisição</Button></>}
        columns={[
          { key: "numero", label: "Número" }, { key: "tipo", label: "Tipo", render: (r) => <Tag text={label(r.tipo)} /> }, { key: "urgencia", label: "Urgência", render: (r) => <Tag text={label(r.urgencia)} tone={r.urgencia === "URGENTE" ? "error" : r.urgencia === "ALTA" ? "warning" : "default"} /> },
          { key: "itens", label: "Itens", render: (r) => (r.itens || []).length }, { key: "valorEstimado", label: "Valor estimado", align: "right", render: (r) => brl(r.valorEstimado) },
          { key: "necessarioEm", label: "Necessário até", render: (r) => fmtDate(r.necessarioEm) }, { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
        ]}
        actions={(r) => (
          <>
            <Button size="small" onClick={() => setOpen(r.id)}>Abrir</Button>
            {r.status === "RASCUNHO" && <Button size="small" onClick={() => post(r, "/enviar", "Enviada para aprovação.")}>Enviar</Button>}
            {r.status === "AGUARDANDO_APROVACAO" && <Button size="small" color="success" onClick={() => setDlg({ kind: "decidir", row: r, aprovar: true })}>Aprovar</Button>}
            {r.status === "AGUARDANDO_APROVACAO" && <Button size="small" color="error" onClick={() => setDlg({ kind: "decidir", row: r, aprovar: false })}>Reprovar</Button>}
            {r.status === "APROVADA" && r.tipo === "COMPRA" && <Button size="small" onClick={() => setDlg({ kind: "cotar", row: r })}>Cotar</Button>}
            {r.status === "APROVADA" && <Button size="small" onClick={() => setDlg({ kind: "estoque", row: r })}>Atender do estoque</Button>}
            {r.status === "REPROVADA" && <Button size="small" onClick={() => post(r, "/reabrir", "Requisição reaberta como rascunho.")}>Reabrir</Button>}
            {["RASCUNHO", "AGUARDANDO_APROVACAO", "APROVADA", "REPROVADA"].includes(r.status) && <Button size="small" color="error" onClick={() => post(r, "/cancelar", "Requisição cancelada.", `Cancelar a requisição ${r.numero}?`)}>Cancelar</Button>}
          </>
        )} />
      <NovaRequisicao open={nova} onClose={() => setNova(false)} onSaved={(m) => { toast.ok(m); reload(); }} />
      <FormDialog open={dlg?.kind === "decidir"} onClose={() => setDlg(null)} title={`${dlg?.aprovar ? "Aprovar" : "Reprovar"} ${dlg?.row?.numero || ""}`} submitLabel={dlg?.aprovar ? "Aprovar" : "Reprovar"}
        fields={[{ key: "parecer", label: dlg?.aprovar ? "Parecer (opcional)" : "Motivo da reprovação", type: "textarea", required: !dlg?.aprovar }]}
        onSubmit={async (b) => { await eduApi.post(`/suprimentos/requisicoes/${dlg!.row.id}/decidir`, { decisao: dlg!.aprovar ? "APROVADO" : "REPROVADO", parecer: b.parecer }); toast.ok("Decisão registrada."); reload(); }} />
      <CotarDialog req={dlg?.kind === "cotar" ? dlg.row : null} fornecedores={forn} onClose={() => setDlg(null)} onDone={(m) => { toast.ok(m); reload(); }} />
      <FormDialog open={dlg?.kind === "estoque"} onClose={() => setDlg(null)} title={`Atender do estoque — ${dlg?.row?.numero || ""}`} submitLabel="Atender"
        fields={[{ key: "almoxarifadoId", label: "Almoxarifado", type: "select", options: almox }, { key: "parcial", label: "Permitir atendimento parcial", type: "bool" }]}
        onSubmit={async (b) => { const r = await eduApi.post(`/suprimentos/requisicoes/${dlg!.row.id}/atender-estoque`, b); toast.ok(r?.atendida ? "Requisição atendida pelo estoque." : `Atendimento parcial: ${(r?.faltas || []).length} item(ns) em falta.`); reload(); }} />
      {open && <Detalhe id={open} onClose={() => setOpen(null)} />}
      {toast.node}
    </Box>
  );
}
