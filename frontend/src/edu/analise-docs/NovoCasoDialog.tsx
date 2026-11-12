import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Paper, TextField, Typography, useMediaQuery, useTheme } from "@mui/material";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import AddIcon from "@mui/icons-material/Add";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useEffect, useState } from "react";
import { StudentPicker } from "../desempenho/kit";
import { AD, AVISO_AGENTE, CONTEXTOS, call, errMsg, itemsOf, lerArquivoComoDataUrl, rotuloOrigem, useApi } from "./kit";

export interface Preset { origem?: string; contexto?: string; titulo?: string; studentId?: string; programId?: string; protocoloId?: string; refType?: string; refId?: string; tipo?: string }
interface Doc { tipo: string; texto: string; arquivo?: { nome: string; mime: string; dataUrl: string } }

/** Cria um caso (dossiê) para o agente: documentos por arquivo e/ou texto (OCR/digitação). O arquivo não é guardado: só o hash e os campos extraídos (cifrados). */
export default function NovoCasoDialog({ open, onClose, onCreated, preset }: { open: boolean; onClose: () => void; onCreated: (id: string) => void; preset?: Preset }) {
  const theme = useTheme();
  const full = useMediaQuery(theme.breakpoints.down("md"));
  const meta = useApi<any>(open ? `${AD}/meta` : null);
  const [origem, setOrigem] = useState("SECRETARIA");
  const [contexto, setContexto] = useState("OUTRO");
  const [titulo, setTitulo] = useState("");
  const [studentId, setStudentId] = useState("");
  const [programId, setProgramId] = useState("");
  const [docs, setDocs] = useState<Doc[]>([{ tipo: "HISTORICO_ESCOLAR", texto: "" }]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const precisaCurso = ["EQUIVALENCIA", "TRANSFERENCIA", "MATRICULA"].includes(contexto);
  const cursos = useApi<any>(open && precisaCurso && origem === "SECRETARIA" ? "/academico/programs" : null);

  useEffect(() => {
    if (!open) return;
    const o = preset?.origem || "SECRETARIA";
    setOrigem(o); setContexto(preset?.contexto || (o === "FINANCEIRO" ? "COMPROVANTE" : o === "JURIDICO" ? "CONTRATO" : "OUTRO"));
    setTitulo(preset?.titulo || ""); setStudentId(preset?.studentId || ""); setProgramId(preset?.programId || ""); setErr(null);
    setDocs([{ tipo: preset?.tipo || (o === "FINANCEIRO" ? "COMPROVANTE" : o === "JURIDICO" ? "CONTRATO" : "HISTORICO_ESCOLAR"), texto: "" }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const tipos: any[] = (meta.data?.tipos || []).filter((t: any) => t.origens.includes(origem));
  const origens: string[] = meta.data?.origens || [origem];
  const setDoc = (i: number, p: Partial<Doc>) => setDocs((l) => l.map((d, k) => (k === i ? { ...d, ...p } : d)));

  async function anexar(i: number, f?: File | null) {
    if (!f) return;
    try { setDoc(i, { arquivo: { nome: f.name, mime: f.type || "application/octet-stream", dataUrl: await lerArquivoComoDataUrl(f) } }); setErr(null); }
    catch (e: any) { setErr(errMsg(e)); }
  }

  async function enviar() {
    setErr(null);
    if (titulo.trim().length < 3) { setErr("Informe um título para o caso."); return; }
    const semConteudo = docs.findIndex((d) => !d.arquivo && !d.texto.trim());
    if (semConteudo >= 0) { setErr(`Documento ${semConteudo + 1}: envie um arquivo ou cole o texto/OCR do documento.`); return; }
    setBusy(true);
    try {
      const body: any = {
        origem, contexto, titulo: titulo.trim(), studentId: studentId || undefined, programId: programId || undefined, protocoloId: preset?.protocoloId, refType: preset?.refType, refId: preset?.refId,
        documentos: docs.map((d) => ({ tipo: d.tipo, texto: d.texto.trim() || undefined, arquivo: d.arquivo })),
      };
      const c = await call<any>("POST", `${AD}/casos`, body);
      onCreated(c.id);
      onClose();
    } catch (e: any) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={full}>
      <DialogTitle>Analisar com o agente</DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>{AVISO_AGENTE} O arquivo enviado não é armazenado: guardamos só o resumo mascarado e os campos extraídos, cifrados. Imagens/PDF digitalizados não têm OCR nesta versão: cole o texto ou digite os campos depois.</Alert>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 2 }}>
          <TextField size="small" select label="Setor" value={origem} onChange={(e) => { setOrigem(e.target.value); setDocs((l) => l.map((d) => ({ ...d, tipo: "" }))); }} disabled={!!preset?.origem}>
            {origens.map((o) => <MenuItem key={o} value={o}>{rotuloOrigem(o)}</MenuItem>)}
          </TextField>
          <TextField size="small" select label="Contexto" value={contexto} onChange={(e) => setContexto(e.target.value)}>
            {CONTEXTOS.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Título do caso" required value={titulo} onChange={(e) => setTitulo(e.target.value)} sx={{ gridColumn: { md: "1 / -1" } }} placeholder="Ex.: Transferência — histórico da instituição X" />
          {origem === "SECRETARIA" && <StudentPicker value={studentId} onChange={setStudentId} label="Aluno (opcional — habilita a checagem do cadastro e do histórico)" />}
          {precisaCurso && origem === "SECRETARIA" && (
            <TextField size="small" select label="Curso de destino (equivalência)" value={programId} onChange={(e) => setProgramId(e.target.value)} helperText="Compara as disciplinas do histórico com a matriz do curso.">
              <MenuItem value="">—</MenuItem>
              {itemsOf(cursos.data).map((c: any) => <MenuItem key={c.id} value={c.id}>{c.nome}</MenuItem>)}
            </TextField>
          )}
        </Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Documentos</Typography>
        {docs.map((d, i) => (
          <Paper key={i} variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: 3 }}>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1, flexWrap: "wrap" }}>
              <TextField size="small" select label="Tipo" value={d.tipo} onChange={(e) => setDoc(i, { tipo: e.target.value })} sx={{ minWidth: 230, flex: 1 }}>
                {tipos.map((t) => <MenuItem key={t.codigo} value={t.codigo}>{t.nome}</MenuItem>)}
              </TextField>
              <Button component="label" size="small" variant="outlined" startIcon={<UploadFileIcon />}>
                {d.arquivo ? "Trocar arquivo" : "Enviar arquivo"}
                <input hidden type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.csv" onChange={(e) => { void anexar(i, e.target.files?.[0]); e.currentTarget.value = ""; }} />
              </Button>
              {docs.length > 1 && <IconButton aria-label="Remover documento" onClick={() => setDocs((l) => l.filter((_, k) => k !== i))}><DeleteOutlinedIcon /></IconButton>}
            </Box>
            {d.arquivo && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>Arquivo: {d.arquivo.nome} ({d.arquivo.mime})</Typography>}
            <TextField size="small" fullWidth multiline minRows={4} label="Texto do documento / OCR (opcional se enviar PDF com texto)" value={d.texto} onChange={(e) => setDoc(i, { texto: e.target.value })}
              placeholder={"Nome: ...\nCPF: ...\nInstituição: ...\nCurso: ...\nCarga horária total: 3200h\nDisciplina | CH | Nota | Situação | Ano\nAnatomia | 80 | 8,5 | Aprovado | 2023"} />
          </Paper>
        ))}
        {docs.length < 15 && <Button startIcon={<AddIcon />} onClick={() => setDocs((l) => [...l, { tipo: tipos[0]?.codigo || "RG_CPF", texto: "" }])}>Adicionar documento ao caso</Button>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button variant="contained" onClick={enviar} disabled={busy}>{busy ? "Analisando…" : "Enviar para análise"}</Button>
      </DialogActions>
    </Dialog>
  );
}
