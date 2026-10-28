import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, CircularProgress, Paper, Typography } from "@mui/material";
import PageHeader from "../components/PageHeader";
import { describeFace, loadFaceApi, useCamera } from "../utils/faceCamera";
import { facePunch, type FacePunchResult } from "../services/HrFaceApi";

type Geo = { latitude?: number; longitude?: number; accuracy?: number };

// Ponto por reconhecimento facial no celular/tablet fixo da clínica: deixe esta tela aberta e cada colaborador olha para a câmera.
export default function FacePunchKiosk() {
  const { videoRef, ready, error: camError } = useCamera(true);
  const [loading, setLoading] = useState(true);
  const [hint, setHint] = useState("Carregando o reconhecimento…");
  const [result, setResult] = useState<FacePunchResult | null>(null);
  const [problem, setProblem] = useState("");
  const [geoMsg, setGeoMsg] = useState("");
  const geo = useRef<Geo>({});
  const pausedUntil = useRef(0);
  const working = useRef(false);

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

  useEffect(() => {
    if (!ready) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      let faceapi: Awaited<ReturnType<typeof loadFaceApi>>;
      try { faceapi = await loadFaceApi(); } catch { setProblem("Não consegui carregar o reconhecimento facial."); setLoading(false); return; }
      setLoading(false); setHint("Olhe para a câmera para bater o ponto.");
      const tick = async () => {
        if (stop) return;
        if (!working.current && Date.now() > pausedUntil.current && videoRef.current) {
          working.current = true;
          try {
            const d = await describeFace(faceapi, videoRef.current);
            if (d.count === 0) setHint("Olhe para a câmera para bater o ponto.");
            else if (d.count > 1) setHint("Uma pessoa por vez, por favor.");
            else if (d.descriptor) {
              setHint("Reconhecendo…");
              try {
                const r = await facePunch(d.descriptor, geo.current);
                setResult(r); setProblem("");
                speak(`${r.employeeName.split(" ")[0]}, ${r.label} registrada às ${r.time}`);
                pausedUntil.current = Date.now() + 7000;
              } catch (e) {
                setProblem(e instanceof Error ? e.message : "Não foi possível registrar o ponto.");
                pausedUntil.current = Date.now() + 5000;
              }
            }
          } finally { working.current = false; }
        }
        timer = setTimeout(() => void tick(), 900);
      };
      void tick();
    })();
    return () => { stop = true; clearTimeout(timer); };
  }, [ready, videoRef, speak]);

  useEffect(() => {
    if (!result && !problem) return;
    const t = setTimeout(() => { setResult(null); setProblem(""); setHint("Olhe para a câmera para bater o ponto."); }, result ? 7000 : 5000);
    return () => clearTimeout(t);
  }, [result, problem]);

  return (
    <Box>
      <PageHeader title="Ponto por rosto" description="Deixe esta tela aberta no celular ou tablet da clínica. Cada colaborador olha para a câmera e o ponto é registrado com a hora, o local e o rosto reconhecido." />
      {geoMsg && <Alert severity="warning" sx={{ mb: 2 }}>{geoMsg}</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
          <Box sx={{ position: "relative", borderRadius: 2, overflow: "hidden", bgcolor: "#000", aspectRatio: "4 / 3" }}>
            <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
            {(loading || !ready) && !camError && <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><CircularProgress /></Box>}
          </Box>
          <Typography sx={{ mt: 2, textAlign: "center", fontWeight: 700 }}>{camError ? "" : hint}</Typography>
          {camError && <Alert severity="error" sx={{ mt: 1 }}>{camError}</Alert>}
        </Paper>
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, display: "grid", alignContent: "center", minHeight: 260, textAlign: "center" }}>
          {result ? (
            <>
              <Typography variant="h4" sx={{ fontWeight: 900 }}>{result.employeeName}</Typography>
              <Typography variant="h5" color="success.main" sx={{ fontWeight: 800, mt: 1 }}>{result.label} às {result.time}</Typography>
              {result.insideWorkplace === false && <Alert severity="warning" sx={{ mt: 2 }}>Batida fora do local da clínica: o RH será avisado.</Alert>}
            </>
          ) : problem ? (
            <Alert severity="error" sx={{ textAlign: "left" }}>{problem}</Alert>
          ) : (
            <Typography color="text.secondary">Aguardando alguém olhar para a câmera.</Typography>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
