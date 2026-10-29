import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { call, errMsg, fmtDate, fmtMoney } from "../desempenho/kit";
import { ResponsiveTable } from "./common";

const hoje = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Simula e cria uma proposta de acordo. `acordo` presente = renegociação do acordo informado. */
export default function AcordoDialog({ open, studentId, onClose, onDone, renegociarId }: { open: boolean; studentId: string | null; onClose: () => void; onDone: () => void; renegociarId?: string }) {
  const [f, setF] = useState<any>({ parcelas: 3, entradaPct: 20, primeiroVencimento: hoje(15), descontoEncargosPct: 0, descontoPrincipalPct: 0, autor: "INSTITUICAO", motivo: "" });
  const [sim, setSim] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setSim(null); setErr(null); } }, [open]);
  const set = (k: string) => (e: any) => { setF({ ...f, [k]: e.target.value }); setSim(null); };
  const corpo = () => ({
    parcelas: Number(f.parcelas), entradaPct: Number(f.entradaPct), primeiroVencimento: new Date(`${f.primeiroVencimento}T12:00:00`).toISOString(),
    descontoEncargosPct: Number(f.descontoEncargosPct || 0), descontoPrincipalPct: Number(f.descontoPrincipalPct || 0),
    ...(f.jurosParcelamentoPct !== undefined && f.jurosParcelamentoPct !== "" ? { jurosParcelamentoPct: Number(f.jurosParcelamentoPct) } : {}),
  });
  async function simular() {
    setErr(null); setBusy(true);
    try { setSim(await call("POST", "/cobranca/acordos/simular", { studentId, ...corpo() })); } catch (e) { setErr(errMsg(e)); setSim(null); } finally { setBusy(false); }
  }
  async function criar() {
    setErr(null); setBusy(true);
    try {
      if (renegociarId) await call("POST", `/cobranca/acordos/${renegociarId}/renegociar`, { ...corpo(), motivo: f.motivo || "Renegociação" });
      else await call("POST", "/cobranca/acordos", { studentId, ...corpo(), autor: f.autor });
      onClose(); onDone();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle>{renegociarId ? "Renegociar acordo" : "Simular e propor acordo"}</DialogTitle>
      <DialogContent dividers>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" }, gap: 2, mb: 2 }}>
          <TextField size="small" type="number" label="Nº de parcelas (0 = à vista)" value={f.parcelas} onChange={set("parcelas")} />
          <TextField size="small" type="number" label="Entrada (%)" value={f.entradaPct} onChange={set("entradaPct")} />
          <TextField size="small" type="date" label="1º vencimento" value={f.primeiroVencimento} onChange={set("primeiroVencimento")} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="number" label="Desconto sobre encargos (%)" value={f.descontoEncargosPct} onChange={set("descontoEncargosPct")} />
          <TextField size="small" type="number" label="Desconto sobre o principal (%)" value={f.descontoPrincipalPct} onChange={set("descontoPrincipalPct")} />
          <TextField size="small" type="number" label="Juros de parcelamento (% a.m.)" value={f.jurosParcelamentoPct ?? ""} onChange={set("jurosParcelamentoPct")} helperText="vazio = política" />
          {!renegociarId && <TextField select size="small" label="Quem propõe" value={f.autor} onChange={set("autor")}><MenuItem value="INSTITUICAO">Instituição</MenuItem><MenuItem value="ALUNO">Aluno (contraproposta)</MenuItem></TextField>}
          {renegociarId && <TextField size="small" label="Motivo da renegociação" value={f.motivo} onChange={set("motivo")} />}
        </Box>
        <Button variant="outlined" onClick={simular} disabled={busy}>Simular</Button>
        {sim && (
          <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
            <Typography variant="body2">Principal {fmtMoney(sim.principal)} + encargos {fmtMoney(sim.encargos)} = <b>{fmtMoney(sim.bruto)}</b></Typography>
            <Typography variant="body2">Desconto: {fmtMoney(sim.desconto)} ({sim.descontoPct}%) · política "{sim.politica.nome}" (alçada {sim.politica.descontoMaxPct}%)</Typography>
            <Typography variant="h6">Total a pagar: {fmtMoney(sim.totalAPagar)}{sim.jurosParcelamento ? ` (juros de parcelamento ${fmtMoney(sim.jurosParcelamento)})` : ""}</Typography>
            {sim.precisaAprovacao && <Alert severity="warning" sx={{ my: 1 }}>Desconto acima da alçada: somente gestor (ADMIN/Reitoria) pode criar/aprovar.</Alert>}
            {sim.avisos.map((a: string) => <Alert key={a} severity="info" sx={{ my: 1 }}>{a}</Alert>)}
            <ResponsiveTable rows={sim.plano} rowKey={(p: any) => String(p.numero)} cols={[{ key: "numero", label: "Parcela", render: (p: any) => (p.numero === 0 ? "Entrada" : `${p.numero}/${sim.parcelas}`) }, { key: "vencimento", label: "Vencimento", render: (p: any) => fmtDate(p.vencimento) }, { key: "valor", label: "Valor", align: "right", render: (p: any) => fmtMoney(p.valor) }]} />
          </Paper>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={criar} disabled={busy || !sim}>{renegociarId ? "Renegociar" : "Criar proposta"}</Button>
      </DialogActions>
    </Dialog>
  );
}
