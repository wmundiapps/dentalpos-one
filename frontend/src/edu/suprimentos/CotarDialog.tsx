import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { eduApi } from "../../services/EduApi";
import type { Opt } from "../infraestrutura/kit";

export default function CotarDialog({ req, fornecedores, onClose, onDone }: { req: any | null; fornecedores: Opt[]; onClose: () => void; onDone: (msg: string) => void }) {
  const [sel, setSel] = useState<string[]>([]);
  const [criterio, setCriterio] = useState("MENOR_PRECO");
  const [prazo, setPrazo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (req) { setSel([]); setErr(null); setCriterio("MENOR_PRECO"); setPrazo(""); } }, [req]);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  async function go() {
    if (!sel.length) { setErr("Selecione ao menos um fornecedor."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await eduApi.post(`/suprimentos/requisicoes/${req.id}/cotacoes`, { fornecedorIds: sel, criterio, ...(prazo ? { prazoResposta: new Date(`${prazo}T23:59:00`).toISOString() } : {}) });
      onDone(r?.aviso || "Cotação aberta."); onClose();
    } catch (e: any) { setErr(e?.message || "Falha ao abrir a cotação."); } finally { setBusy(false); }
  }
  return (
    <Dialog open={!!req} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800 }}>Abrir cotação — {req?.numero}</DialogTitle>
      <DialogContent dividers>
        {err ? <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert> : null}
        <Alert severity="info" sx={{ mb: 2 }}>Para compras acima de R$ 1.000 recomenda-se consultar ao menos 3 fornecedores.</Alert>
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Fornecedores convidados ({sel.length})</Typography>
        <Box sx={{ maxHeight: 220, overflowY: "auto", display: "grid", mb: 2 }}>
          {fornecedores.map((f) => <FormControlLabel key={f.value} control={<Checkbox size="small" checked={sel.includes(f.value)} onChange={() => toggle(f.value)} />} label={f.label} />)}
          {!fornecedores.length && <Typography variant="body2" color="text.secondary">Nenhum fornecedor cadastrado.</Typography>}
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          <TextField select size="small" label="Critério de escolha" value={criterio} onChange={(e) => setCriterio(e.target.value)}>
            <MenuItem value="MENOR_PRECO">Menor preço</MenuItem><MenuItem value="MELHOR_PRAZO">Melhor prazo</MenuItem><MenuItem value="CUSTO_BENEFICIO">Custo-benefício</MenuItem>
          </TextField>
          <TextField size="small" type="date" label="Prazo de resposta" value={prazo} onChange={(e) => setPrazo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose} disabled={busy}>Cancelar</Button><Button variant="contained" onClick={go} disabled={busy}>Abrir cotação</Button></DialogActions>
    </Dialog>
  );
}
