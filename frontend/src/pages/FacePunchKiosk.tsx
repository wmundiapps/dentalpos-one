import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Paper, TextField, Typography } from "@mui/material";
import PageHeader from "../components/PageHeader";
import { describeFace, loadFaceApi, snapshot, useCamera } from "../utils/faceCamera";
import { facePunch, type FacePunchResult } from "../services/HrFaceApi";

type Geo = { latitude?: number; longitude?: number; accuracy?: number };

const maskCpf = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
};

// Ponto no celular/tablet fixo da clínica: o colaborador digita o CPF, a câmera confere o rosto com o cadastro e a foto fica como comprovante.
export default function FacePunchKiosk() {
  const [cpf, setCpf] = useState("");
  const [step, setStep] = useState<"cpf" | "camera">("cpf");
  const [result, setResult] = useState<FacePunchResult | null>(null);
  const [problem, setProblem] = useState("");
  const [geoMsg, setGeoMsg] = useState("");
  const geo = useRef<Geo>({});

  // Atalho na tela inicial: troca o manifesto do app só nesta tela, para abrir direto no ponto.
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "manifest"; link.href = "/manifest-ponto.webmanifest";
    document.head.appendChild(link);
    const prev = document.title;
    document.title = "Ponto";
    return () => { link.remove(); document.title = prev; };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) { setGeoMsg("Este aparelho não informa a localização."); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => { geo.current = { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }; setGeoMsg(""); },
      () => setGeoMsg("Ative a localização do aparelho: o ponto exige o local da clínica."),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const speak = useCallback((text: string) => { try { const u = new SpeechSynthesisUtterance(text); u.lang = "pt-BR"; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); } catch { /* sem voz */ } }, []);
  const reset = useCallback(() => { setStep("cpf"); setCpf(""); setResult(null); setProblem(""); }, []);

  useEffect(() => {
    if (!result) return;
    const t = setTimeout(reset, 6000);
    return () => clearTimeout(t);
  }, [result, reset]);

  const cpfDigits = cpf.replace(/\D/g, "");
  return (
    <Box>
      <PageHeader title="Ponto por rosto" description="Digite o CPF, olhe para a câmera e o ponto é registrado com a hora, o local e a foto." />
      {geoMsg && <Alert severity="warning" sx={{ mb: 2 }}>{geoMsg}</Alert>}
      {result ? (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, textAlign: "center", maxWidth: 520, mx: "auto" }}>
          <Typography variant="h4" sx={{ fontWeight: 900 }}>{result.employeeName}</Typography>
          <Typography variant="h5" color="success.main" sx={{ fontWeight: 800, mt: 1 }}>{result.label} às {result.time}</Typography>
          {result.insideWorkplace === false && <Alert severity="warning" sx={{ mt: 2 }}>Batida fora do local da clínica: o RH será avisado.</Alert>}
          <Button sx={{ mt: 3 }} onClick={reset}>Próximo colaborador</Button>
        </Paper>
      ) : step === "cpf" ? (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, maxWidth: 420, mx: "auto", display: "grid", gap: 2 }}>
          <TextField autoFocus label="CPF" value={cpf} onChange={(e) => setCpf(maskCpf(e.target.value))} slotProps={{ htmlInput: { inputMode: "numeric", style: { fontSize: 28, textAlign: "center" } } }} onKeyDown={(e) => { if (e.key === "Enter" && cpfDigits.length === 11) { setProblem(""); setStep("camera"); } }} />
          {problem && <Alert severity="error">{problem}</Alert>}
          <Button variant="contained" size="large" disabled={cpfDigits.length !== 11} onClick={() => { setProblem(""); setStep("camera"); }}>Continuar</Button>
        </Paper>
      ) : (
        <CameraStep cpf={cpfDigits} geo={geo} onDone={(r) => { setResult(r); speak(`${r.employeeName.split(" ")[0]}, ${r.label} registrada às ${r.time}`); }} onFail={(m) => { setProblem(m); setStep("cpf"); }} onCancel={reset} />
      )}
    </Box>
  );
}

function CameraStep({ cpf, geo, onDone, onFail, onCancel }: { cpf: string; geo: React.MutableRefObject<Geo>; onDone: (r: FacePunchResult) => void; onFail: (m: string) => void; onCancel: () => void }) {
  const { videoRef, ready, error: camError } = useCamera(true);
  const [hint, setHint] = useState("Carregando o reconhecimento…");

  useEffect(() => {
    if (!ready) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();
    (async () => {
      let faceapi: Awaited<ReturnType<typeof loadFaceApi>>;
      try { faceapi = await loadFaceApi(); } catch { onFail("Não consegui carregar o reconhecimento facial."); return; }
      setHint("Olhe de frente para a câmera.");
      const tick = async () => {
        if (stop) return;
        if (Date.now() - startedAt > 30000) { onFail("Não consegui ver seu rosto. Tente de novo."); return; }
        if (videoRef.current) {
          const d = await describeFace(faceapi, videoRef.current);
          if (stop) return;
          if (d.count > 1) setHint("Uma pessoa por vez, por favor.");
          else if (d.descriptor) {
            setHint("Conferindo…");
            try { onDone(await facePunch(cpf, d.descriptor, snapshot(videoRef.current), geo.current)); }
            catch (e) { onFail(e instanceof Error ? e.message : "Não foi possível registrar o ponto."); }
            return;
          } else setHint("Olhe de frente para a câmera.");
        }
        timer = setTimeout(() => void tick(), 700);
      };
      void tick();
    })();
    return () => { stop = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, maxWidth: 520, mx: "auto" }}>
      <Box sx={{ position: "relative", borderRadius: 2, overflow: "hidden", bgcolor: "#000", aspectRatio: "4 / 3" }}>
        <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
        {!ready && !camError && <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><CircularProgress /></Box>}
      </Box>
      <Typography sx={{ mt: 2, textAlign: "center", fontWeight: 700 }}>{camError ? "" : hint}</Typography>
      {camError && <Alert severity="error" sx={{ mt: 1 }}>{camError}</Alert>}
      <Button fullWidth sx={{ mt: 1 }} onClick={onCancel}>Cancelar</Button>
    </Paper>
  );
}
