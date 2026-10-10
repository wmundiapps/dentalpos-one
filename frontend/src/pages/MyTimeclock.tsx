import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, TextField, Typography } from "@mui/material";
import FingerprintIcon from "@mui/icons-material/Fingerprint";
import PageHeader from "../components/PageHeader";
import { HrApi, STATUS_LABEL, fmtDate, fmtMin, type AbsenceRequest, type DayRow, type Totals } from "../services/HrApi";

type Today = Awaited<ReturnType<typeof HrApi.me.today>>;
type Attachment = { name: string; mime: string; dataUrl: string };

const STATUS_COLOR: Record<string, "default" | "success" | "warning" | "error" | "info"> = { OK: "success", ATRASO: "warning", FALTA: "error", ABONADA: "info", INCOMPLETO: "warning", PENDENTE: "warning", NAO_ABONADA: "error", SANCIONADA: "error" };

// Foto vira JPEG menor (cabe no limite do envio); PDF vai como está, desde que seja leve.
async function toAttachment(file: File): Promise<Attachment> {
  const read = () => new Promise<string>((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => fail(new Error("Não foi possível ler o arquivo.")); r.readAsDataURL(file); });
  if (file.type === "application/pdf") {
    if (file.size > 900_000) throw new Error("O PDF passa de 900 KB. Envie uma foto do documento ou um PDF mais leve.");
    return { name: file.name, mime: file.type, dataUrl: await read() };
  }
  if (!file.type.startsWith("image/")) throw new Error("Anexe uma foto ou um PDF.");
  const img = new Image();
  img.src = await read();
  await new Promise((ok, fail) => { img.onload = ok; img.onerror = () => fail(new Error("Imagem inválida.")); });
  const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { name: file.name.replace(/\.\w+$/, "") + ".jpg", mime: "image/jpeg", dataUrl: canvas.toDataURL("image/jpeg", 0.7) };
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((ok, fail) => {
    if (!navigator.geolocation) return fail(new Error("Este aparelho não tem localização."));
    navigator.geolocation.getCurrentPosition(ok, () => fail(new Error("Ative a localização do aparelho e permita o acesso do navegador.")), { enableHighAccuracy: true, timeout: 12000 });
  });
}

export default function MyTimeclock() {
  const ref = new Date().toISOString().slice(0, 7);
  const [today, setToday] = useState<Today | null>(null);
  const [month, setMonth] = useState<{ days: DayRow[]; totals: Totals } | null>(null);
  const [requests, setRequests] = useState<AbsenceRequest[]>([]);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [punchOpen, setPunchOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), type: "FALTA", reason: "" });
  const [files, setFiles] = useState<Attachment[]>([]);

  const load = useCallback(async () => {
    try {
      const t = await HrApi.me.today();
      setToday(t);
      if (t.linked) {
        const [m, r] = await Promise.all([HrApi.me.month(ref), HrApi.me.requests()]);
        setMonth(m); setRequests(r);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar."); }
  }, [ref]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(t); }, []);

  const punch = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      let geo: { latitude?: number; longitude?: number; accuracy?: number } = {};
      try { const p = await getPosition(); geo = { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }; }
      catch (e) { setError(e instanceof Error ? e.message : "Sem localização."); /* o servidor decide se a localização é obrigatória */ }
      const r = await HrApi.me.punch({ password, ...geo });
      setNotice(`${r.label} registrada às ${r.time}.${r.insideWorkplace === false ? " Atenção: o sistema detectou que você está fora do local de trabalho." : ""}`);
      setError(""); setPunchOpen(false); setPassword("");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível registrar."); }
    finally { setBusy(false); }
  };

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    setError("");
    try {
      const next = [...files];
      for (const f of Array.from(list)) { if (next.length >= 3) break; next.push(await toAttachment(f)); }
      setFiles(next);
    } catch (e) { setError(e instanceof Error ? e.message : "Anexo inválido."); }
  };

  const sendRequest = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      await HrApi.me.createRequest({ ...form, attachments: files });
      setNotice("Justificativa enviada. O RH ou o gestor vai analisar.");
      setForm({ ...form, reason: "" }); setFiles([]);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível enviar."); }
    finally { setBusy(false); }
  };

  if (today && !today.linked) {
    return <Box><PageHeader title="Meu ponto" description="Registre sua entrada e saída e envie justificativas." />
      <Alert severity="warning">Seu e-mail de login ainda não está cadastrado no RH. Peça ao RH para cadastrar você como colaborador com o mesmo e-mail que usa para entrar no sistema.</Alert></Box>;
  }

  const t = month?.totals;
  return (
    <Box>
      <PageHeader title="Meu ponto" description="Registre sua entrada e saída no ambiente de trabalho e envie avisos de falta, atestados e comprovantes." />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice("")}>{notice}</Alert>}

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3, textAlign: "center" }}>
        <Typography sx={{ fontWeight: 900, fontSize: { xs: 38, md: 52 }, lineHeight: 1.1 }}>{now.toLocaleTimeString("pt-BR")}</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>{now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</Typography>
        {today?.linked && (
          <Box sx={{ display: "flex", gap: 1.5, justifyContent: "center", flexWrap: "wrap" }}>
            <Button size="large" variant="contained" startIcon={<FingerprintIcon />} disabled={!today.nextKind} onClick={() => { setPassword(""); setPunchOpen(true); }}>
              {today.nextLabel ? `Registrar: ${today.nextLabel}` : "Ponto de hoje completo"}
            </Button>
            <Button size="large" variant="outlined" disabled title="Em breve">Reconhecimento facial (em breve)</Button>
          </Box>
        )}
        {today?.linked && today.punches.length > 0 && (
          <Box sx={{ display: "flex", gap: 1, justifyContent: "center", flexWrap: "wrap", mt: 2 }}>
            {today.punches.map((p) => <Chip key={p.id} color={p.insideWorkplace === false ? "warning" : "success"} variant="outlined" label={`${p.label}: ${p.time}`} />)}
          </Box>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>O ponto registra a hora do servidor, o seu IP e a localização do aparelho, e exige a sua senha.</Typography>
      </Paper>

      {t && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(5,1fr)" }, gap: 1.5, mb: 3 }}>
          {[["Horas trabalhadas", fmtMin(t.workedMin)], ["Horas esperadas", fmtMin(t.expectedMin)], ["Banco de horas", fmtMin(t.balanceMin)], ["Faltas", String(t.faltas)], ["Atrasos", String(t.atrasos)]].map(([k, v]) => (
            <Paper key={k} variant="outlined" sx={{ p: 2, borderRadius: 2 }}><Typography variant="caption" color="text.secondary">{k}</Typography><Typography variant="h6" sx={{ fontWeight: 900 }}>{v}</Typography></Paper>
          ))}
        </Box>
      )}

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Avisar falta ou enviar justificativa</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Informe o motivo e anexe atestado ou comprovante (foto ou PDF, até 3 arquivos). O RH ou o gestor analisa e decide se abona.</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 3fr" }, gap: 1.5 }}>
          <TextField type="date" label="Data da falta" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField select label="Tipo" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {[["FALTA", "Falta"], ["ATRASO", "Atraso"], ["ATESTADO", "Atestado médico"], ["OUTRO", "Outro"]].map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
          </TextField>
          <TextField label="Motivo" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap", mt: 1.5 }}>
          <Button component="label" variant="outlined">Anexar atestado/comprovante<input hidden type="file" accept="image/*,application/pdf" multiple onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} /></Button>
          {files.map((f, i) => <Chip key={i} label={f.name} onDelete={() => setFiles(files.filter((_, j) => j !== i))} />)}
          <Box sx={{ flex: 1 }} />
          <Button variant="contained" disabled={busy || form.reason.trim().length < 5} onClick={() => void sendRequest()}>Enviar justificativa</Button>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Minhas justificativas</Typography>
        {requests.length === 0 && <Typography color="text.secondary">Nenhuma justificativa enviada.</Typography>}
        {requests.map((r) => (
          <Box key={r.id} sx={{ py: 1.2, borderTop: "1px solid", borderColor: "divider", display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
            <Typography sx={{ fontWeight: 700, minWidth: 90 }}>{fmtDate(r.absenceDate)}</Typography>
            <Chip size="small" color={STATUS_COLOR[r.status] || "default"} label={STATUS_LABEL[r.status] || r.status} />
            <Typography variant="body2" sx={{ flex: 1, minWidth: 180 }}>{r.reason}{r.decisionNote ? ` — Resposta: ${r.decisionNote}` : ""}</Typography>
          </Box>
        ))}
      </Paper>

      {month && (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Meu mês ({ref.split("-").reverse().join("/")})</Typography>
          {[...month.days].reverse().map((d) => (
            <Box key={d.date} sx={{ py: 0.9, borderTop: "1px solid", borderColor: "divider", display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "110px 140px 1fr 90px 90px" }, gap: 1, alignItems: "center" }}>
              <Typography sx={{ fontWeight: 700 }}>{fmtDate(d.date)}</Typography>
              <Chip size="small" color={STATUS_COLOR[d.status] || "default"} label={STATUS_LABEL[d.status] || d.status} sx={{ width: "fit-content" }} />
              <Typography variant="body2" color="text.secondary">{d.punches.map((p) => p.time).join(" · ") || "—"}</Typography>
              <Typography variant="body2">{fmtMin(d.workedMin)}</Typography>
              <Typography variant="body2" color={d.diffMin < 0 ? "error.main" : "text.secondary"}>{d.expectedMin ? fmtMin(d.diffMin) : ""}</Typography>
            </Box>
          ))}
        </Paper>
      )}

      <Dialog open={punchOpen} onClose={() => !busy && setPunchOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 900 }}>{today?.linked ? `Registrar: ${today.nextLabel}` : "Registrar ponto"}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Digite a sua senha de acesso ao sistema. O navegador vai pedir permissão para usar a localização: permita.</Typography>
          <TextField autoFocus fullWidth type="password" label="Sua senha" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && password) void punch(); }} autoComplete="current-password" />
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setPunchOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={busy || !password} onClick={() => void punch()}>{busy ? "Registrando..." : "Confirmar ponto"}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
