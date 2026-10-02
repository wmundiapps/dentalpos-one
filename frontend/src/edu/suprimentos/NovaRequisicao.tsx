import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import { useEffect, useState } from "react";
import { eduApi } from "../../services/EduApi";
import { brl, usePrograms } from "../infraestrutura/kit";
import { useAlmoxarifados, useItens } from "./lookups";

interface Linha { itemId: string; descricao: string; unidade: string; quantidade: string; precoEstimado: string }
const vazia = (): Linha => ({ itemId: "", descricao: "", unidade: "UN", quantidade: "1", precoEstimado: "" });

export default function NovaRequisicao({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (msg: string) => void }) {
  const itens = useItens();
  const almox = useAlmoxarifados();
  const cursos = usePrograms();
  const [f, setF] = useState<Record<string, string>>({ tipo: "COMPRA", urgencia: "NORMAL" });
  const [linhas, setLinhas] = useState<Linha[]>([vazia()]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setF({ tipo: "COMPRA", urgencia: "NORMAL" }); setLinhas([vazia()]); setErr(null); } }, [open]);

  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const setLinha = (i: number, patch: Partial<Linha>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = linhas.reduce((s, l) => s + (Number(l.quantidade) || 0) * (Number(l.precoEstimado) || 0), 0);

  async function enviar(enviarAprovacao: boolean) {
    setErr(null);
    const validas = linhas.filter((l) => l.itemId || l.descricao.trim());
    if (!validas.length) { setErr("Informe ao menos um item."); return; }
    if (!f.cursoId && !f.centroCustoId && !f.laboratorioId) { setErr("Informe curso, centro de custo ou laboratório para apropriar o gasto."); return; }
    if (f.tipo === "INSUMO" && !f.almoxarifadoId) { setErr("Requisição de insumo exige o almoxarifado de origem."); return; }
    setBusy(true);
    try {
      const body: any = {
        tipo: f.tipo, urgencia: f.urgencia, justificativa: f.justificativa || undefined, cursoId: f.cursoId || undefined, centroCustoId: f.centroCustoId || undefined,
        laboratorioId: f.laboratorioId || undefined, almoxarifadoId: f.almoxarifadoId || undefined, necessarioEm: f.necessarioEm ? new Date(`${f.necessarioEm}T12:00:00`).toISOString() : undefined,
        itens: validas.map((l) => ({ itemId: l.itemId || undefined, descricao: l.descricao || undefined, unidade: l.unidade || undefined, quantidade: Number(l.quantidade), precoEstimado: l.precoEstimado === "" ? undefined : Number(l.precoEstimado) })),
      };
      const r = await eduApi.post("/suprimentos/requisicoes", body);
      if (enviarAprovacao) await eduApi.post(`/suprimentos/requisicoes/${r.id}/enviar`, {});
      onSaved(enviarAprovacao ? "Requisição criada e enviada para aprovação." : "Requisição salva como rascunho.");
      onClose();
    } catch (e: any) { setErr(e?.message || "Falha ao salvar."); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Nova requisição</DialogTitle>
      <DialogContent dividers>
        {err ? <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert> : null}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, pt: 1 }}>
          <TextField select size="small" label="Tipo" value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>
            <MenuItem value="COMPRA">Compra</MenuItem><MenuItem value="INSUMO">Insumo (retirada do estoque)</MenuItem>
          </TextField>
          <TextField select size="small" label="Urgência" value={f.urgencia} onChange={(e) => set("urgencia", e.target.value)}>
            {["BAIXA", "NORMAL", "ALTA", "URGENTE"].map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Curso" value={f.cursoId || ""} onChange={(e) => set("cursoId", e.target.value)}><MenuItem value="">—</MenuItem>{cursos.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}</TextField>
          <TextField size="small" label="Centro de custo (ID)" value={f.centroCustoId || ""} onChange={(e) => set("centroCustoId", e.target.value)} />
          <TextField size="small" label="Laboratório (ID)" value={f.laboratorioId || ""} onChange={(e) => set("laboratorioId", e.target.value)} />
          <TextField select size="small" label="Almoxarifado" value={f.almoxarifadoId || ""} onChange={(e) => set("almoxarifadoId", e.target.value)} required={f.tipo === "INSUMO"}><MenuItem value="">—</MenuItem>{almox.map((a) => <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>)}</TextField>
          <TextField size="small" type="date" label="Necessário até" value={f.necessarioEm || ""} onChange={(e) => set("necessarioEm", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" label="Justificativa" value={f.justificativa || ""} onChange={(e) => set("justificativa", e.target.value)} multiline minRows={2} sx={{ gridColumn: { md: "1 / -1" } }} />
        </Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mt: 2, mb: 1 }}>Itens</Typography>
        <Box sx={{ display: "grid", gap: 1 }}>
          {linhas.map((l, i) => (
            <Box key={i} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "2fr 2fr 80px 90px 120px auto" }, gap: 1, alignItems: "center" }}>
              <TextField select size="small" label="Item do catálogo" value={l.itemId} onChange={(e) => setLinha(i, { itemId: e.target.value })}>
                <MenuItem value="">Item avulso</MenuItem>{itens.map((it) => <MenuItem key={it.value} value={it.value}>{it.label}</MenuItem>)}
              </TextField>
              <TextField size="small" label="Descrição" value={l.descricao} onChange={(e) => setLinha(i, { descricao: e.target.value })} disabled={!!l.itemId} />
              <TextField size="small" label="Unid." value={l.unidade} onChange={(e) => setLinha(i, { unidade: e.target.value })} disabled={!!l.itemId} />
              <TextField size="small" type="number" label="Qtd" value={l.quantidade} onChange={(e) => setLinha(i, { quantidade: e.target.value })} />
              <TextField size="small" type="number" label="Preço est." value={l.precoEstimado} onChange={(e) => setLinha(i, { precoEstimado: e.target.value })} />
              <IconButton size="small" onClick={() => setLinhas((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls))}><DeleteOutlinedIcon fontSize="small" /></IconButton>
            </Box>
          ))}
        </Box>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1 }}>
          <Button startIcon={<AddIcon />} onClick={() => setLinhas((ls) => [...ls, vazia()])}>Adicionar item</Button>
          <Typography variant="body2">Valor estimado: <b>{brl(total)}</b></Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button onClick={() => enviar(false)} disabled={busy}>Salvar rascunho</Button>
        <Button variant="contained" onClick={() => enviar(true)} disabled={busy}>Salvar e enviar para aprovação</Button>
      </DialogActions>
    </Dialog>
  );
}
