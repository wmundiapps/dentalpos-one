import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Autocomplete, Box, Button, Checkbox, CircularProgress, FormControlLabel, Paper, Tab, Tabs, TextField, Typography } from "@mui/material";
import PageHeader from "../components/PageHeader";
import { appointmentFlowAction } from "../services/AppointmentApi";
import { loadBackendPatients, type BackendPatient } from "../services/PatientApi";
import { enrollFace, faceStatus, identifyFace, removeFace, type FaceMatch } from "../services/FaceApi";

type FaceApiModule = typeof import("@vladmandic/face-api");
let apiPromise: Promise<FaceApiModule> | null = null;
function loadFaceApi() {
  if (!apiPromise) {
    apiPromise = (async () => {
      const faceapi = await import("@vladmandic/face-api");
      const tf = faceapi.tf as unknown as { setBackend: (n: string) => Promise<boolean>; getBackend: () => string; ready: () => Promise<void> };
      await tf.setBackend("webgl").catch(() => undefined);
      if (tf.getBackend() !== "webgl") await tf.setBackend("cpu");
      await tf.ready();
      await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri("/face-models"), faceapi.nets.faceLandmark68TinyNet.loadFromUri("/face-models"), faceapi.nets.faceRecognitionNet.loadFromUri("/face-models")]);
      return faceapi;
    })();
    apiPromise.catch(() => { apiPromise = null; });
  }
  return apiPromise;
}

const ELIGIBLE = ["SCHEDULED", "CONFIRMED", "NO_SHOW"];
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function useCamera(active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        if (videoRef.current) { videoRef.current.srcObject = s; void videoRef.current.play().then(() => setReady(true)); }
      })
      .catch(() => setError("Não consegui abrir a câmera. Permita o uso da câmera no navegador (cadeado ao lado do endereço) e tente de novo."));
    if (!navigator.mediaDevices) setError("Este navegador não permite usar a câmera.");
    return () => { cancelled = true; setReady(false); stream?.getTracks().forEach((t) => t.stop()); };
  }, [active]);
  return { videoRef, ready, error };
}

async function describe(faceapi: FaceApiModule, video: HTMLVideoElement) {
  const found = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.6 })).withFaceLandmarks(true).withFaceDescriptors();
  if (found.length !== 1) return { count: found.length, descriptor: null as number[] | null };
  return { count: 1, descriptor: Array.from(found[0].descriptor) };
}

function Receive() {
  const navigate = useNavigate();
  const { videoRef, ready, error: camError } = useCamera(true);
  const [loading, setLoading] = useState(true);
  const [hint, setHint] = useState("Carregando o reconhecimento…");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ kind: "MATCH" | "CANDIDATES"; items: FaceMatch[]; note: string; arrivedId?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const pausedUntil = useRef(0);
  const working = useRef(false);

  const checkIn = useCallback(async (appointmentId: string) => {
    await appointmentFlowAction(appointmentId, "ARRIVED");
  }, []);

  useEffect(() => {
    if (!ready) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      let faceapi: FaceApiModule;
      try { faceapi = await loadFaceApi(); } catch { setError("Não consegui carregar o reconhecimento facial."); setLoading(false); return; }
      setLoading(false); setHint("Olhe para a câmera.");
      const tick = async () => {
        if (stop) return;
        if (!working.current && Date.now() > pausedUntil.current && videoRef.current) {
          working.current = true;
          try {
            const d = await describe(faceapi, videoRef.current);
            if (d.count === 0) setHint("Olhe para a câmera.");
            else if (d.count > 1) setHint("Uma pessoa por vez, por favor.");
            else if (d.descriptor) {
              setHint("Reconhecendo…");
              const r = await identifyFace(d.descriptor);
              if (r.status === "NONE" || !r.matches?.length) setHint("Não reconheci. Procure o paciente pelo nome.");
              else if (r.status === "MATCH") {
                const m = r.matches[0];
                const open = m.appointments.filter((a) => ELIGIBLE.includes(a.status));
                let arrivedId: string | undefined;
                let note = "Sem consulta marcada para hoje.";
                if (open.length === 1) { await checkIn(open[0].id); arrivedId = open[0].id; note = `Chegada registrada na agenda (${hhmm(open[0].scheduledAt)} · ${open[0].procedure}).`; }
                else if (open.length > 1) note = "Há mais de uma consulta hoje. Escolha qual marcar como chegada.";
                else if (m.appointments.some((a) => a.status === "WAITING")) note = "Já estava na sala de espera.";
                else if (m.appointments.length) note = "A consulta de hoje já está em andamento ou concluída.";
                setResult({ kind: "MATCH", items: [m], note, arrivedId });
                pausedUntil.current = Date.now() + 15000;
              } else {
                setResult({ kind: "CANDIDATES", items: r.matches, note: "Não tenho certeza. Confirme quem é:" });
                pausedUntil.current = Date.now() + 15000;
              }
            }
          } catch (e) { setError(e instanceof Error ? e.message : "Erro no reconhecimento."); pausedUntil.current = Date.now() + 5000; }
          finally { working.current = false; }
        }
        timer = setTimeout(() => void tick(), 800);
      };
      void tick();
    })();
    return () => { stop = true; clearTimeout(timer); };
  }, [ready, videoRef, checkIn]);

  const reset = () => { setResult(null); setHint("Olhe para a câmera."); pausedUntil.current = 0; };
  const mark = async (patient: FaceMatch, appointmentId: string) => {
    setBusy(true); setError("");
    try { await checkIn(appointmentId); setResult({ kind: "MATCH", items: [patient], note: "Chegada registrada na agenda.", arrivedId: appointmentId }); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível registrar a chegada."); }
    finally { setBusy(false); }
  };
  const undo = async () => {
    if (!result?.arrivedId) return reset();
    setBusy(true);
    try { await appointmentFlowAction(result.arrivedId, "UNDO_ARRIVAL"); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível desfazer."); }
    finally { setBusy(false); reset(); }
  };

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Box sx={{ position: "relative", borderRadius: 2, overflow: "hidden", bgcolor: "#000", aspectRatio: "4 / 3" }}>
          <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
          {(loading || !ready) && !camError && <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><CircularProgress /></Box>}
        </Box>
        <Typography sx={{ mt: 2, textAlign: "center", fontWeight: 700 }}>{camError ? "" : hint}</Typography>
        {camError && <Alert severity="error" sx={{ mt: 1 }}>{camError}</Alert>}
        {error && <Alert severity="error" sx={{ mt: 1 }} onClose={() => setError("")}>{error}</Alert>}
      </Paper>
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
        {!result && <Typography color="text.secondary">Quando o paciente olhar para a câmera, a ficha aparece aqui e a chegada é marcada na agenda sozinha.</Typography>}
        {result?.kind === "MATCH" && result.items[0] && (
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>{result.items[0].fullName}</Typography>
            <Alert severity={result.arrivedId ? "success" : "info"} sx={{ my: 2 }}>{result.note}</Alert>
            {result.note.startsWith("Há mais de uma") && result.items[0].appointments.filter((a) => ELIGIBLE.includes(a.status)).map((a) => (
              <Button key={a.id} variant="outlined" sx={{ mr: 1, mb: 1 }} disabled={busy} onClick={() => void mark(result.items[0], a.id)}>{hhmm(a.scheduledAt)} · {a.procedure}</Button>
            ))}
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mt: 1 }}>
              <Button variant="contained" onClick={() => navigate(`/ficha-paciente?patientId=${result.items[0].patientId}`)}>Abrir ficha</Button>
              <Button variant="outlined" onClick={() => navigate(`/prontuario?patientId=${result.items[0].patientId}`)}>Prontuário</Button>
              <Button color="warning" disabled={busy} onClick={() => void undo()}>Não é esta pessoa</Button>
              <Button onClick={reset}>Próximo</Button>
            </Box>
          </Box>
        )}
        {result?.kind === "CANDIDATES" && (
          <Box>
            <Typography sx={{ fontWeight: 700, mb: 2 }}>{result.note}</Typography>
            {result.items.map((m) => {
              const open = m.appointments.filter((a) => ELIGIBLE.includes(a.status));
              return <Button key={m.patientId} variant="outlined" fullWidth sx={{ mb: 1, justifyContent: "flex-start" }} disabled={busy} onClick={() => { if (open.length === 1) void mark(m, open[0].id); else setResult({ kind: "MATCH", items: [m], note: open.length ? "Há mais de uma consulta hoje. Escolha qual marcar como chegada." : "Sem consulta marcada para hoje." }); }}>{m.fullName}</Button>;
            })}
            <Button onClick={reset}>Nenhum deles</Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}

function Enroll() {
  const { videoRef, ready, error: camError } = useCamera(true);
  const [patients, setPatients] = useState<BackendPatient[]>([]);
  const [patient, setPatient] = useState<BackendPatient | null>(null);
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { loadBackendPatients().then(setPatients).catch(() => setError("Não consegui carregar os pacientes.")); }, []);
  useEffect(() => { setEnrolled(null); setMsg(""); if (patient) faceStatus(patient.id).then((s) => setEnrolled(s.enrolled)).catch(() => setEnrolled(null)); }, [patient]);

  const capture = async () => {
    if (!patient || !videoRef.current) return;
    setBusy(true); setError(""); setMsg("");
    try {
      const faceapi = await loadFaceApi();
      const samples: number[][] = [];
      for (let i = 0; i < 12 && samples.length < 3; i++) {
        const d = await describe(faceapi, videoRef.current);
        if (d.descriptor) samples.push(d.descriptor);
        await new Promise((r) => setTimeout(r, 450));
      }
      if (samples.length < 3) throw new Error("Não consegui ver um rosto com nitidez. Olhe para a câmera, com boa luz, e tente de novo.");
      await enrollFace(patient.id, samples);
      setEnrolled(true); setConsent(false); setMsg("Rosto cadastrado.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível cadastrar."); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!patient) return;
    setBusy(true); setError("");
    try { await removeFace(patient.id); setEnrolled(false); setMsg("Rosto removido."); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível remover."); }
    finally { setBusy(false); }
  };

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Box sx={{ borderRadius: 2, overflow: "hidden", bgcolor: "#000", aspectRatio: "4 / 3" }}>
          <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
        </Box>
        {camError && <Alert severity="error" sx={{ mt: 1 }}>{camError}</Alert>}
      </Paper>
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
        <Autocomplete options={patients} value={patient} onChange={(_, v) => setPatient(v)} getOptionLabel={(p) => p.fullName} renderInput={(params) => <TextField {...params} label="Paciente" size="small" />} noOptionsText="Nenhum paciente" />
        {patient && enrolled !== null && <Alert severity={enrolled ? "success" : "info"} sx={{ mt: 2 }}>{enrolled ? "Este paciente já tem o rosto cadastrado." : "Este paciente ainda não tem o rosto cadastrado."}</Alert>}
        <FormControlLabel sx={{ mt: 2, alignItems: "flex-start" }} control={<Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} />} label="O paciente autorizou, de forma livre e informada, o uso do reconhecimento facial para identificá-lo na recepção. Guardamos apenas um código do rosto, não a foto, e ele pode pedir a remoção quando quiser." />
        <Box sx={{ display: "flex", gap: 1.5, mt: 2, flexWrap: "wrap" }}>
          <Button variant="contained" disabled={!patient || !consent || !ready || busy} onClick={() => void capture()}>{busy ? "Capturando…" : "Capturar e cadastrar rosto"}</Button>
          {enrolled && <Button color="error" disabled={busy} onClick={() => void remove()}>Remover rosto</Button>}
        </Box>
        {msg && <Alert severity="success" sx={{ mt: 2 }}>{msg}</Alert>}
        {error && <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError("")}>{error}</Alert>}
      </Paper>
    </Box>
  );
}

export default function FacialReception() {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <PageHeader title="Chegada por rosto" description="O paciente olha para a câmera: a ficha abre e a chegada é marcada na agenda. Só funciona para quem autorizou e foi cadastrado." />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Receber paciente" />
        <Tab label="Cadastrar rosto" />
      </Tabs>
      {tab === 0 ? <Receive key="r" /> : <Enroll key="e" />}
    </Box>
  );
}
