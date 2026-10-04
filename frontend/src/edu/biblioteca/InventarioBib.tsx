import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { StatusChip } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { Async, FormDialog, ProgressBar, Stat, StatGrid, Tag, fmtDate, label, useApi, useSpaces, useToast } from "../infraestrutura/kit";

const TONE: Record<string, any> = { CONFERIDO: "success", PENDENTE: "default", EMPRESTADO: "info", NAO_ENCONTRADO: "error", LOCAL_DIVERGENTE: "warning" };

function Conferencia({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [sit, setSit] = useState("");
  const st = useApi<any>(`/biblioteca/inventarios/${id}${sit ? `?situacao=${sit}` : ""}`);
  const [txt, setTxt] = useState("");
  const [local, setLocal] = useState("");
  const [extr, setExtr] = useState(false);
  const [out, setOut] = useState<any | null>(null);
  const toast = useToast();
  const after = () => { st.reload(); onChanged(); };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Conferência de inventário</DialogTitle>
      <DialogContent dividers>
        <Async state={st}>
          {(d) => {
            const inv = d.inventario, r = d.resumo || {};
                        return (
              <Box sx={{ display: "grid", gap: 2 }}>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}><Typography variant="h6" sx={{ fontWeight: 800 }}>{inv.nome}</Typography><StatusChip value={inv.status} /><Typography variant="caption">Esperados: {inv.totalEsperado}</Typography></Box>
                <StatGrid min={130}>{Object.entries(r).filter(([k, v]) => typeof v === "number" && k !== "percentualConferido").map(([k, v]: any) => <Stat key={k} label={label(k)} value={v} />)}</StatGrid>
                <ProgressBar value={r.percentualConferido ?? 0} color="success" />
                {inv.status === "ABERTO" && (
                  <Box sx={{ display: "grid", gap: 1 }}>
                    <TextField multiline minRows={3} size="small" label="Tombos lidos (um por linha ou separados por espaço/vírgula)" value={txt} onChange={(e) => setTxt(e.target.value)} />
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                      <TextField size="small" label="Local da leitura" value={local} onChange={(e) => setLocal(e.target.value)} />
                      <Button variant="contained" onClick={() => {
                        const tombos = txt.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
                        if (!tombos.length) return;
                        toast.run(async () => { const o = await eduApi.post(`/biblioteca/inventarios/${id}/leituras`, { tombos, local: local || undefined }); setOut(o); return o; }, "Leituras registradas.", () => { setTxt(""); after(); });
                      }}>Registrar leituras</Button>
                    </Box>
                    {out && <Alert severity="info">Conferidos: {out.conferidos} · repetidos: {out.repetidos} · não cadastrados: {(out.naoCadastrados || []).join(", ") || "0"} · local divergente: {(out.localDivergente || []).join(", ") || "0"}</Alert>}
                    <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => toast.run(() => eduApi.post(`/biblioteca/inventarios/${id}/concluir`, { marcarExtraviados: extr }), "Inventário concluído.", after, "Concluir? Itens pendentes serão marcados como NÃO ENCONTRADO.")}>Concluir</Button>}>
                      <FormControlLabel control={<Checkbox checked={extr} onChange={(e) => setExtr(e.target.checked)} />} label="Marcar pendentes como EXTRAVIADOS no acervo" />
                    </Alert>
                  </Box>
                )}
                <TextField select size="small" label="Filtrar itens" value={sit} onChange={(e) => setSit(e.target.value)} sx={{ width: 220 }} slotProps={{ select: { native: true } }}>
                  <option value="">Todos</option>{["PENDENTE", "CONFERIDO", "EMPRESTADO", "NAO_ENCONTRADO", "LOCAL_DIVERGENTE"].map((s) => <option key={s} value={s}>{label(s)}</option>)}
                </TextField>
                <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", maxHeight: 220, overflowY: "auto" }}>{(d.itens || []).map((i: any) => <Tag key={i.id} text={`${i.tombo} · ${label(i.situacao)}`} tone={TONE[i.situacao]} />)}</Box>
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

export default function InventarioBib() {
  const [key, setKey] = useState(0);
  const [novo, setNovo] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const spaces = useSpaces();
  const toast = useToast();
  const reload = () => setKey((k) => k + 1);
  return (
    <Box>
      <ListTable path="/biblioteca/inventarios" refreshKey={key} searchable={false} filters={[{ key: "status", label: "Situação", options: ["ABERTO", "CONCLUIDO", "CANCELADO"] }]}
        toolbar={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo(true)}>Novo inventário</Button>}
        columns={[{ key: "nome", label: "Inventário" }, { key: "estante", label: "Estante" }, { key: "totalEsperado", label: "Esperados" }, { key: "createdAt", label: "Abertura", render: (r) => fmtDate(r.createdAt) }, { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> }]}
        actions={(r, rl) => (<>
          <Button size="small" onClick={() => setOpen(r.id)}>{r.status === "ABERTO" ? "Conferir" : "Ver"}</Button>
          {r.status === "ABERTO" && <Button size="small" color="error" onClick={() => toast.run(() => eduApi.post(`/biblioteca/inventarios/${r.id}/cancelar`, {}), "Inventário cancelado.", rl, "Cancelar este inventário?")}>Cancelar</Button>}
        </>)} />
      <FormDialog open={novo} onClose={() => setNovo(false)} title="Novo inventário do acervo"
        fields={[{ key: "nome", label: "Nome", required: true, full: true }, { key: "spaceId", label: "Escopo: espaço", type: "select", options: spaces }, { key: "estante", label: "Escopo: estante" }]}
        onSubmit={async (b) => { await eduApi.post("/biblioteca/inventarios", b); toast.ok("Inventário aberto."); reload(); }} />
      {open && <Conferencia id={open} onClose={() => setOpen(null)} onChanged={reload} />}
      {toast.node}
    </Box>
  );
}
