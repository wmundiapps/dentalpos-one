import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Snackbar, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import { Empty, Feedback, Status, StatCard, StatGrid, fmtDate, fmtNum, itemsOf, label, useLoad } from "../secretaria/util";

type Modo = "parecer" | "decisao";

export default function RevisoesTab() {
  const [st, setSt] = useState("");
  const lista = useLoad<any>(`/notas/revisoes${qsOf({ pageSize: 80, status: st })}`);
  const [dlg, setDlg] = useState<{ modo: Modo; rev: any } | null>(null);
  const [f, setF] = useState<any>({});
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: "success" | "error"; m: string } | null>(null);
  const rows = itemsOf(lista.data);
  const abertas = rows.filter((r) => ["SOLICITADA", "PARECER_EMITIDO"].includes(r.status));
  const atrasadas = abertas.filter((r) => r.prazoParecer && !r.parecer && new Date(r.prazoParecer).getTime() < Date.now());

  async function enviar() {
    if (!dlg) return;
    setErr(null);
    try {
      if (dlg.modo === "parecer") await eduApi.post(`/notas/revisoes/${dlg.rev.id}/parecer`, { parecer: f.parecer, notaSugerida: f.nota !== undefined && f.nota !== "" ? Number(f.nota) : undefined });
      else await eduApi.post(`/notas/revisoes/${dlg.rev.id}/decisao`, { decisao: f.decisao, justificativa: f.justificativa, notaNova: f.decisao === "DEFERIDA" && f.nota !== undefined && f.nota !== "" ? Number(f.nota) : undefined });
      setDlg(null); setF({}); setMsg({ t: "success", m: "Registrado." }); lista.reload();
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4, display: "grid", gap: 2 }}>
      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <Box sx={{ flex: 1 }}><Typography variant="h6" sx={{ fontWeight: 800 }}>Revisões de nota</Typography><Typography variant="body2" color="text.secondary">Fluxo: aluno solicita → professor emite parecer → coordenação decide (deferida altera a nota, com trilha).</Typography></Box>
        <TextField select size="small" label="Situação" sx={{ minWidth: 180 }} value={st} onChange={(e) => setSt(e.target.value)}><MenuItem value="">Todas</MenuItem>{["SOLICITADA", "PARECER_EMITIDO", "DEFERIDA", "INDEFERIDA", "CANCELADA"].map((s) => <MenuItem key={s} value={s}>{label(s)}</MenuItem>)}</TextField>
      </Box>
      <StatGrid>
        <StatCard title="Em andamento" value={abertas.length} color="#0F5FDB" />
        <StatCard title="Parecer atrasado" value={atrasadas.length} color="#D32F2F" />
        <StatCard title="Deferidas" value={rows.filter((r) => r.status === "DEFERIDA").length} color="#2E7D32" />
        <StatCard title="Indeferidas" value={rows.filter((r) => r.status === "INDEFERIDA").length} color="#607D8B" />
      </StatGrid>
      <Feedback loading={lista.loading} error={lista.error} onRetry={lista.reload} />
      {!lista.loading && !lista.error && !rows.length && <Empty>Nenhum pedido de revisão.</Empty>}
      {rows.length > 0 && (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow>{["Aberto em", "Situação", "Nota original", "Justificativa do aluno", "Parecer", "Resultado", ""].map((h) => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{fmtDate(r.createdAt)}<Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>parecer até {fmtDate(r.prazoParecer)}</Typography></TableCell>
                  <TableCell><Status value={r.status} /></TableCell><TableCell>{fmtNum(r.notaOriginal)}</TableCell>
                  <TableCell sx={{ maxWidth: 260 }}>{r.justificativa}</TableCell>
                  <TableCell sx={{ maxWidth: 240 }}>{r.parecer ? <>{r.parecer}{r.parecerNotaSugerida != null ? ` (sugere ${fmtNum(r.parecerNotaSugerida)})` : ""}</> : "—"}</TableCell>
                  <TableCell>{r.decisao ? <>{label(r.decisao)}{r.notaNova != null ? ` → ${fmtNum(r.notaNova)}` : ""}</> : "—"}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    {r.status === "SOLICITADA" && <Button size="small" onClick={() => { setF({}); setErr(null); setDlg({ modo: "parecer", rev: r }); }}>Emitir parecer</Button>}
                    {["SOLICITADA", "PARECER_EMITIDO"].includes(r.status) && <Button size="small" color="secondary" onClick={() => { setF({ decisao: "DEFERIDA" }); setErr(null); setDlg({ modo: "decisao", rev: r }); }}>Decidir</Button>}
                    {["SOLICITADA", "PARECER_EMITIDO"].includes(r.status) && <Button size="small" color="error" onClick={async () => { if (!window.confirm("Cancelar este pedido de revisão?")) return; try { await eduApi.post(`/notas/revisoes/${r.id}/cancelar`, {}); lista.reload(); } catch (e: any) { setMsg({ t: "error", m: e.message }); } }}>Cancelar</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
      <Dialog open={!!dlg} onClose={() => setDlg(null)} fullWidth maxWidth="sm">
        <DialogTitle>{dlg?.modo === "parecer" ? "Parecer do professor" : "Decisão da coordenação"}</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          {err && <Alert severity="error">{err}</Alert>}
          <Alert severity="info">Aluno alega: {dlg?.rev?.justificativa}</Alert>
          {dlg?.modo === "parecer" ? (
            <>
              <TextField multiline minRows={3} label="Parecer (mín. 10 caracteres)" value={f.parecer || ""} onChange={(e) => setF({ ...f, parecer: e.target.value })} />
              <TextField size="small" type="number" label="Nota sugerida (opcional)" value={f.nota ?? ""} onChange={(e) => setF({ ...f, nota: e.target.value })} />
            </>
          ) : (
            <>
              <TextField select size="small" label="Decisão" value={f.decisao || "DEFERIDA"} onChange={(e) => setF({ ...f, decisao: e.target.value })}><MenuItem value="DEFERIDA">Deferida (altera a nota)</MenuItem><MenuItem value="INDEFERIDA">Indeferida</MenuItem></TextField>
              {f.decisao === "DEFERIDA" && <TextField size="small" type="number" label="Nova nota" value={f.nota ?? ""} onChange={(e) => setF({ ...f, nota: e.target.value })} />}
              <TextField multiline minRows={3} label="Justificativa (mín. 10 caracteres)" value={f.justificativa || ""} onChange={(e) => setF({ ...f, justificativa: e.target.value })} />
            </>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setDlg(null)}>Cancelar</Button><Button variant="contained" onClick={enviar}>Registrar</Button></DialogActions>
      </Dialog>
      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)}>{msg ? <Alert severity={msg.t} onClose={() => setMsg(null)}>{msg.m}</Alert> : undefined}</Snackbar>
    </Paper>
  );
}
