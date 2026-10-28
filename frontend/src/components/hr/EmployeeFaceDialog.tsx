import { useEffect, useState } from "react";
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Typography } from "@mui/material";
import { describeFace, loadFaceApi, snapshot, useCamera } from "../../utils/faceCamera";
import { employeeFacePhoto, employeeFaceStatus, enrollEmployeeFace, removeEmployeeFace } from "../../services/HrFaceApi";

export default function EmployeeFaceDialog({ employee, onClose }: { employee: { id: string; name: string } | null; onClose: () => void }) {
  const { videoRef, ready, error: camError } = useCamera(Boolean(employee));
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [refPhoto, setRefPhoto] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setEnrolled(null); setConsent(false); setMsg(""); setError(""); setRefPhoto(null);
    if (employee) {
      employeeFaceStatus(employee.id).then((s) => setEnrolled(s.enrolled)).catch(() => setEnrolled(null));
      employeeFacePhoto(employee.id).then((r) => setRefPhoto(r.photo)).catch(() => undefined);
    }
  }, [employee]);

  const capture = async () => {
    if (!employee || !videoRef.current) return;
    setBusy(true); setError(""); setMsg("");
    try {
      const faceapi = await loadFaceApi();
      const samples: number[][] = [];
      let photo = "";
      for (let i = 0; i < 12 && samples.length < 3; i++) {
        const d = await describeFace(faceapi, videoRef.current);
        if (d.descriptor) { samples.push(d.descriptor); if (!photo) photo = snapshot(videoRef.current); }
        await new Promise((r) => setTimeout(r, 450));
      }
      if (samples.length < 3) throw new Error("Não consegui ver um rosto com nitidez. Olhe para a câmera, com boa luz, e tente de novo.");
      await enrollEmployeeFace(employee.id, samples, photo);
      setRefPhoto(photo); setEnrolled(true); setConsent(false); setMsg("Rosto cadastrado. O colaborador já pode bater o ponto pelo rosto.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível cadastrar o rosto."); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!employee || !window.confirm(`Remover o rosto de ${employee.name} do ponto?`)) return;
    setBusy(true);
    try { await removeEmployeeFace(employee.id); setEnrolled(false); setMsg("Rosto removido."); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível remover."); } finally { setBusy(false); }
  };

  return (
    <Dialog open={Boolean(employee)} onClose={() => !busy && onClose()} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 900 }}>Rosto para o ponto — {employee?.name}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
        <Typography variant="body2" color="text.secondary">O sistema guarda o código numérico do rosto e uma foto de referência, usados apenas para conferir o ponto (a cada batida também fica uma foto como comprovante). O colaborador será identificado pelo CPF cadastrado no RH. O colaborador precisa concordar, e o cadastro pode ser removido a qualquer momento.</Typography>
        {enrolled !== null && <Alert severity={enrolled ? "success" : "info"}>{enrolled ? "Rosto já cadastrado. Cadastrar de novo substitui o anterior." : "Rosto ainda não cadastrado."}</Alert>}
        {refPhoto && <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}><img src={refPhoto} alt="Foto de referência" style={{ width: 72, borderRadius: 8 }} /><Typography variant="caption" color="text.secondary">Foto de referência atual</Typography></Box>}
        <Box sx={{ position: "relative", borderRadius: 2, overflow: "hidden", bgcolor: "#000", aspectRatio: "4 / 3" }}>
          <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
          {!ready && !camError && <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><CircularProgress /></Box>}
        </Box>
        {camError && <Alert severity="error">{camError}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        {msg && <Alert severity="success">{msg}</Alert>}
        <FormControlLabel control={<Checkbox checked={consent} onChange={(_, v) => setConsent(v)} />} label="O colaborador autorizou o uso do rosto para registrar o ponto (LGPD)." />
      </DialogContent>
      <DialogActions>
        {enrolled && <Button color="error" disabled={busy} onClick={() => void remove()}>Remover rosto</Button>}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} disabled={busy}>Fechar</Button>
        <Button variant="contained" disabled={busy || !ready || !consent} onClick={() => void capture()}>{busy ? "Capturando..." : enrolled ? "Cadastrar de novo" : "Cadastrar rosto"}</Button>
      </DialogActions>
    </Dialog>
  );
}
