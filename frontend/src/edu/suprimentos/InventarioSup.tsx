import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Table, TableBody, TableCell, TableHead, TableRow, TextField } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { StatusChip } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { Async, FormDialog, Light, fmtDate, nameOf, num, useApi, useToast } from "../infraestrutura/kit";
import { useAlmoxarifados, useItens } from "./lookups";

function Contagem({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const st = useApi<any>(`/suprimentos/inventarios/${id}`);
  const itens = useItens();
  const [vals, setVals] = useState<Record<string, string>>({});
  const toast = useToast();
  const after = () => { st.reload(); onChanged(); };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Contagem de inventário</DialogTitle>
      <DialogContent dividers>
        <Async state={st}>
          {(inv) => {
            const aberto = inv.status === "ABERTO";
            const finalizado = inv.status === "CONTAGEM_FINALIZADA";
            return (
              <Box sx={{ display: "grid", gap: 2 }}>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}><StatusChip value={inv.status} /><span>{inv.tipo === "GERAL" ? "Inventário geral" : "Inventário rotativo"} · aberto em {fmtDate(inv.createdAt)}</span></Box>
                <Box sx={{ overflowX: "auto" }}>
                  <Table size="small">
                    <TableHead><TableRow><TableCell>Item</TableCell><TableCell align="right">Sistema</TableCell><TableCell align="right" sx={{ width: 150 }}>Contada</TableCell><TableCell align="right">Diferença</TableCell></TableRow></TableHead>
                    <TableBody>
                      {(inv.itens || []).map((i: any) => (
                        <TableRow key={i.id}>
                          <TableCell>{nameOf(itens, i.itemId)}</TableCell><TableCell align="right">{num(i.quantidadeSistema, 3)}</TableCell>
                          <TableCell align="right">{aberto ? <TextField size="small" type="number" value={vals[i.id] ?? (i.quantidadeContada ?? "")} onChange={(e) => setVals({ ...vals, [i.id]: e.target.value })} /> : num(i.quantidadeContada, 3)}</TableCell>
                          <TableCell align="right">{i.diferenca == null ? "—" : <Light tone={Math.abs(i.diferenca) < 1e-9 ? "success" : "error"} text={num(i.diferenca, 3)} />}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
                {aberto && (
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                    <Button variant="outlined" onClick={() => {
                      const lista = (inv.itens || []).filter((i: any) => vals[i.id] !== undefined && vals[i.id] !== "").map((i: any) => ({ itemId: i.itemId, quantidadeContada: Number(vals[i.id]) }));
                      if (!lista.length) { toast.err("Digite ao menos uma quantidade contada."); return; }
                      toast.run(() => eduApi.put(`/suprimentos/inventarios/${id}/contagem`, { itens: lista }), "Contagem salva.", () => { setVals({}); after(); });
                    }}>Salvar contagem</Button>
                    <Button variant="contained" onClick={() => toast.run(() => eduApi.post(`/suprimentos/inventarios/${id}/finalizar`, {}), "Contagem finalizada.", after, "Finalizar a contagem? Itens sem contagem podem bloquear o fechamento.")}>Finalizar contagem</Button>
                  </Box>
                )}
                {finalizado && <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => toast.run(() => eduApi.post(`/suprimentos/inventarios/${id}/ajustar`, {}), "Ajustes aplicados ao estoque.", after, "Ajustar o estoque conforme as divergências da contagem?")}>Ajustar estoque</Button>}>Contagem finalizada. Aplique o ajuste para corrigir o saldo do sistema.</Alert>}
              </Box>
            );
          }}
        </Async>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      {toast.node}
    </Dialog>
  );
}

export default function InventarioSup() {
  const [key, setKey] = useState(0);
  const [novo, setNovo] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const almox = useAlmoxarifados();
  const toast = useToast();
  const reload = () => setKey((k) => k + 1);
  return (
    <Box>
      <ListTable path="/suprimentos/inventarios" refreshKey={key} searchable={false}
        toolbar={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo(true)}>Novo inventário</Button>}
        columns={[{ key: "createdAt", label: "Abertura", render: (r) => fmtDate(r.createdAt) }, { key: "almoxarifadoId", label: "Almoxarifado", render: (r) => nameOf(almox, r.almoxarifadoId) }, { key: "tipo", label: "Tipo" }, { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> }]}
        actions={(r, rl) => (
          <>
            <Button size="small" onClick={() => setOpen(r.id)}>{["ABERTO", "CONTAGEM_FINALIZADA"].includes(r.status) ? "Contar / ajustar" : "Ver"}</Button>
            {["ABERTO", "CONTAGEM_FINALIZADA"].includes(r.status) && <Button size="small" color="error" onClick={() => toast.run(() => eduApi.post(`/suprimentos/inventarios/${r.id}/cancelar`, {}), "Inventário cancelado.", rl, "Cancelar este inventário?")}>Cancelar</Button>}
          </>
        )} />
      <FormDialog open={novo} onClose={() => setNovo(false)} title="Novo inventário de estoque"
        fields={[{ key: "almoxarifadoId", label: "Almoxarifado", type: "select", options: almox, required: true }, { key: "tipo", label: "Tipo", type: "select", options: [{ value: "ROTATIVO", label: "Rotativo (itens de maior valor)" }, { value: "GERAL", label: "Geral" }], def: "ROTATIVO" }, { key: "quantidade", label: "Itens no rotativo", type: "number", def: 20 }, { key: "observacao", label: "Observação", full: true }]}
        onSubmit={async (b) => { await eduApi.post("/suprimentos/inventarios", b); toast.ok("Inventário aberto."); reload(); }} />
      {open && <Contagem id={open} onClose={() => setOpen(null)} onChanged={reload} />}
      {toast.node}
    </Box>
  );
}
