import { Alert, Box, Button, MenuItem, Paper, Snackbar, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import NoteAddOutlinedIcon from "@mui/icons-material/NoteAddOutlined";
import { useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import { Empty, Feedback, Status, StudentSearch, fetchHtml, fmtDate, itemsOf, label, useHtmlPreview, useLoad } from "./util";

const TIPOS_FALLBACK = [
  { codigo: "DECLARACAO_MATRICULA", nome: "Declaração de matrícula" },
  { codigo: "DECLARACAO_VINCULO", nome: "Declaração de vínculo" },
  { codigo: "HISTORICO_ESCOLAR", nome: "Histórico escolar" },
  { codigo: "COMPROVANTE_CONCLUSAO", nome: "Comprovante de conclusão" },
];

export default function DocumentosTab() {
  const tipos = useLoad<any[]>("/secretaria/documentos/tipos");
  const [aluno, setAluno] = useState<any>(null);
  const [tipo, setTipo] = useState("DECLARACAO_MATRICULA");
  const [filtroTipo, setFiltroTipo] = useState("");
  const lista = useLoad<any>(`/secretaria/documentos${qsOf({ pageSize: 30, tipo: filtroTipo, studentId: aluno?.id })}`);
  const { show, dialog } = useHtmlPreview();
  const [toast, setToast] = useState<{ t: "success" | "error"; m: string } | null>(null);
  const opcoes = Array.isArray(tipos.data) && tipos.data.length ? tipos.data : TIPOS_FALLBACK;
  const body = { tipo, studentId: aluno?.id };

  async function emitir() {
    if (!window.confirm("Emitir o documento oficial com código de verificação? Esta ação fica registrada.")) return;
    try {
      const row: any = await eduApi.post("/secretaria/documentos/emitir", body);
      setToast({ t: "success", m: `Documento emitido (${row.codigo}).` });
      lista.reload();
      show("Documento emitido", async () => row.html);
    } catch (e: any) { setToast({ t: "error", m: e.message }); }
  }
  async function cancelar(id: string) {
    if (!window.confirm("Cancelar este documento? Ele deixará de ser válido na verificação pública.")) return;
    try { await eduApi.post(`/secretaria/documentos/${id}/cancelar`, {}); lista.reload(); setToast({ t: "success", m: "Documento cancelado." }); } catch (e: any) { setToast({ t: "error", m: e.message }); }
  }

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Emissão de documentos acadêmicos</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Escolha o aluno e o tipo, confira a pré-visualização e emita com código/QR de verificação.</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.5fr 1fr auto auto auto" }, gap: 1.5, alignItems: "start" }}>
          <StudentSearch value={aluno} onChange={setAluno} required />
          <TextField select size="small" label="Tipo de documento" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {opcoes.map((t: any) => <MenuItem key={t.codigo} value={t.codigo}>{t.nome || t.titulo || label(t.codigo)}</MenuItem>)}
          </TextField>
          <Button variant="outlined" startIcon={<VisibilityOutlinedIcon />} disabled={!aluno} onClick={() => show("Pré-visualização", () => fetchHtml("/secretaria/documentos/preview?formato=html", "POST", body))}>Pré-visualizar</Button>
          <Button variant="contained" startIcon={<NoteAddOutlinedIcon />} disabled={!aluno} onClick={emitir}>Emitir</Button>
          <Button disabled={!aluno} onClick={() => show("Situação do aluno", () => fetchHtml(`/secretaria/alunos/${aluno.id}/situacao/html`))}>Situação do aluno</Button>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4 }}>
        <Box sx={{ display: "flex", gap: 2, mb: 1, alignItems: "center", flexWrap: "wrap" }}>
          <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>Documentos emitidos</Typography>
          <TextField select size="small" label="Tipo" sx={{ minWidth: 220 }} value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <MenuItem value="">Todos</MenuItem>{opcoes.map((t: any) => <MenuItem key={t.codigo} value={t.codigo}>{t.nome || label(t.codigo)}</MenuItem>)}
          </TextField>
        </Box>
        <Feedback loading={lista.loading} error={lista.error} onRetry={lista.reload} />
        {!lista.loading && !lista.error && !itemsOf(lista.data).length && <Empty>Nenhum documento emitido{aluno ? " para este aluno" : ""}.</Empty>}
        {itemsOf(lista.data).length > 0 && (
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead><TableRow>{["Tipo", "Código", "Emitido em", "Validade", "Situação", ""].map((h) => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {itemsOf(lista.data).map((d) => (
                  <TableRow key={d.id} hover>
                    <TableCell>{label(d.tipo)}</TableCell><TableCell><code>{d.codigo}</code></TableCell><TableCell>{fmtDate(d.createdAt)}</TableCell><TableCell>{fmtDate(d.validoAte)}</TableCell>
                    <TableCell><Status value={d.cancelado ? "CANCELADO" : "VIGENTE"} /></TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Button size="small" onClick={() => show(`Documento ${d.codigo}`, () => fetchHtml(`/secretaria/documentos/${d.id}/html`))}>Ver / imprimir</Button>
                      {!d.cancelado && <Button size="small" color="error" onClick={() => cancelar(d.id)}>Cancelar</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>
      {dialog}
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)}>{toast ? <Alert severity={toast.t} onClose={() => setToast(null)}>{toast.m}</Alert> : undefined}</Snackbar>
    </Box>
  );
}
