import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { StatusChip } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import ListTable from "./ListTable";
import { Async, FormDialog, type Opt, ProgressBar, Tag, fmtDate, label, nameOf, useApi, useToast } from "./kit";

const DIV_TONE: Record<string, any> = { NENHUMA: "success", SOBRA: "warning", LOCAL_DIVERGENTE: "warning", ESTADO_DIVERGENTE: "warning", NAO_ENCONTRADO: "error" };

function Contagem({ id, spaces, onClose, onChanged }: { id: string; spaces: Opt[]; onClose: () => void; onChanged: () => void }) {
  const st = useApi<any>(`/infraestrutura/inventarios/${id}`);
  const [tomb, setTomb] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [onlyDiv, setOnlyDiv] = useState(false);
  const [incompleto, setIncompleto] = useState(false);
  const [ajustes, setAjustes] = useState(false);
  const toast = useToast();

  async function contar() {
    if (!tomb.trim()) return;
    await toast.run(() => eduApi.post(`/infraestrutura/inventarios/${id}/contagem`, { tombamento: tomb.trim(), ...(spaceId ? { spaceId } : {}) }), "Contagem registrada.", () => { setTomb(""); st.reload(); });
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Inventário patrimonial</DialogTitle>
      <DialogContent dividers>
        <Async state={st}>
          {(inv) => {
            const aberto = inv.status === "ABERTO";
            const itens = (inv.itens || []).filter((i: any) => !onlyDiv || i.divergencia !== "NENHUMA");
            return (
              <Box sx={{ display: "grid", gap: 2 }}>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>{inv.titulo}</Typography><StatusChip value={inv.status} />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Progresso da contagem: {inv.progresso?.contados}/{inv.progresso?.total}</Typography>
                  <ProgressBar value={inv.progresso?.pct || 0} color="success" />
                </Box>
                {aberto && (
                  <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
                    <TextField size="small" label="Tombamento (leitura do QR/etiqueta)" value={tomb} onChange={(e) => setTomb(e.target.value)} onKeyDown={(e) => e.key === "Enter" && contar()} sx={{ minWidth: 260 }} />
                    <TextField select size="small" label="Local encontrado" value={spaceId} onChange={(e) => setSpaceId(e.target.value)} sx={{ minWidth: 220 }}>
                      <MenuItem value="">Local do inventário</MenuItem>
                      {spaces.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
                    </TextField>
                    <Button variant="contained" onClick={contar}>Registrar</Button>
                  </Box>
                )}
                <FormControlLabel control={<Checkbox checked={onlyDiv} onChange={(e) => setOnlyDiv(e.target.checked)} />} label="Mostrar apenas divergências" />
                <Box sx={{ display: "grid", gap: 0.75, maxHeight: 320, overflowY: "auto" }}>
                  {itens.map((i: any) => (
                    <Box key={i.id} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", p: 0.75, borderRadius: 2, bgcolor: "action.hover" }}>
                      <b>{i.tombamentoLido || i.bemId?.slice(-6)}</b>
                      <Tag text={i.contado ? "Contado" : "Pendente"} tone={i.contado ? "success" : "default"} />
                      <Tag text={label(i.divergencia)} tone={DIV_TONE[i.divergencia] || "default"} />
                      {i.spaceEncontradoId && <Typography variant="caption">em {nameOf(spaces, i.spaceEncontradoId)}</Typography>}
                      {i.observacao && <Typography variant="caption" color="text.secondary">{i.observacao}</Typography>}
                    </Box>
                  ))}
                  {!itens.length && <Typography variant="body2" color="text.secondary">Nenhum item para exibir.</Typography>}
                </Box>
                {aberto && (
                  <Alert severity="info" sx={{ alignItems: "center" }}>
                    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
                      <FormControlLabel control={<Checkbox checked={incompleto} onChange={(e) => setIncompleto(e.target.checked)} />} label="Fechar mesmo com itens não contados (viram NÃO ENCONTRADO)" />
                      <FormControlLabel control={<Checkbox checked={ajustes} onChange={(e) => setAjustes(e.target.checked)} />} label="Aplicar ajustes de local/estado nos bens" />
                      <Button color="success" variant="contained" onClick={() => toast.run(() => eduApi.post(`/infraestrutura/inventarios/${id}/fechar`, { aplicarAjustes: ajustes, permitirIncompleto: incompleto }), "Inventário fechado.", () => { st.reload(); onChanged(); }, "Fechar o inventário? Esta ação encerra a contagem.")}>Fechar inventário</Button>
                    </Box>
                  </Alert>
                )}
                {inv.resumo && <Typography variant="body2" color="text.secondary">Resumo: {JSON.stringify(inv.resumo)}</Typography>}
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

export default function InventarioPanel({ spaces, categorias }: { spaces: Opt[]; categorias: Opt[] }) {
  const [key, setKey] = useState(0);
  const [novo, setNovo] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const toast = useToast();
  const reload = () => setKey((k) => k + 1);
  return (
    <Box>
      <ListTable
        path="/infraestrutura/inventarios" refreshKey={key} searchable={false}
        filters={[{ key: "status", label: "Situação", options: ["ABERTO", "FECHADO", "CANCELADO"] }]}
        toolbar={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo(true)}>Novo inventário</Button>}
        columns={[
          { key: "titulo", label: "Título" }, { key: "spaceId", label: "Local", render: (r) => nameOf(spaces, r.spaceId) },
          { key: "n", label: "Itens", render: (r) => r._count?.itens ?? "—" }, { key: "prazoEm", label: "Prazo", render: (r) => fmtDate(r.prazoEm) },
          { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
        ]}
        actions={(r, rl) => (
          <>
            <Button size="small" onClick={() => setOpen(r.id)}>{r.status === "ABERTO" ? "Contar" : "Ver"}</Button>
            {r.status === "ABERTO" && <Button size="small" color="error" onClick={() => toast.run(() => eduApi.post(`/infraestrutura/inventarios/${r.id}/cancelar`, {}), "Inventário cancelado.", rl, "Cancelar este inventário?")}>Cancelar</Button>}
          </>
        )}
      />
      <FormDialog open={novo} title="Novo inventário" onClose={() => setNovo(false)}
        fields={[
          { key: "titulo", label: "Título", required: true, full: true },
          { key: "spaceId", label: "Escopo: espaço", type: "select", options: spaces },
          { key: "categoriaId", label: "Escopo: categoria", type: "select", options: categorias },
          { key: "prazoEm", label: "Prazo", type: "date" },
        ]}
        onSubmit={async (b) => { await eduApi.post("/infraestrutura/inventarios", b); toast.ok("Inventário aberto."); reload(); }} />
      {open && <Contagem id={open} spaces={spaces} onClose={() => setOpen(null)} onChanged={reload} />}
      {toast.node}
    </Box>
  );
}
