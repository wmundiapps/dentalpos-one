import { Alert, Box, Button, CircularProgress, LinearProgress, Typography } from "@mui/material";
import FaceIcon from "@mui/icons-material/Face";
import { useCallback, useEffect, useRef, useState } from "react";
import { eduApi } from "../../services/EduApi";
import {
  MODELO_FACIAL, amostraDe, cameraDisponivel, carregarMotor, desafioCumprido, mensagemErroCamera, resumirLiveness, type Amostra, type Desafio, type EvidenciaLiveness,
} from "./motorFacial";

export interface CapturaFacial { embeddings: number[][]; liveness: EvidenciaLiveness; qualidade: number; modelo: string }

type Fase = "iniciando" | "procurando" | "desafio" | "capturando" | "enviando" | "espera" | "erro";

/**
 * Câmera com reconhecimento no dispositivo. Detecta o rosto, pede um desafio de vivacidade ao servidor (piscar ou virar a cabeça),
 * confirma a vivacidade, calcula o embedding no navegador e entrega {embeddings, liveness} ao `onCaptura`.
 * Modo "identificar" repete sozinho (quiosque); modo "cadastrar" captura `amostras` vetores quando o usuário clica em iniciar.
 */
export default function FaceCamera({ modo, onCaptura, amostras = 1, pausado = false, esperaMs = 2500, aspecto = "4 / 3" }: {
  modo: "identificar" | "cadastrar";
  onCaptura: (c: CapturaFacial) => Promise<void> | void;
  amostras?: number;
  pausado?: boolean;
  esperaMs?: number;
  aspecto?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [fase, setFase] = useState<Fase>("iniciando");
  const [msg, setMsg] = useState("Carregando reconhecimento facial…");
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState(0);
  const disparos = useRef(0);   // cadastrar: incrementa ao clicar em iniciar
  const consumidos = useRef(0);
  const ativo = useRef(true);
  const pausadoRef = useRef(pausado);
  pausadoRef.current = pausado;
  const cbRef = useRef(onCaptura);
  cbRef.current = onCaptura;
  const faseRef = useRef<Fase>("iniciando");
  const setF = (f: Fase, m?: string) => { faseRef.current = f; setFase(f); if (m) setMsg(m); };

  const ciclo = useCallback(async (faceapi: any) => {
    const el = video.current;
    if (!el) return;
    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
    const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let estavel = 0;
    while (ativo.current) {
      if (pausadoRef.current) { await dormir(200); continue; }
      if (modo === "cadastrar") {
        if (disparos.current === consumidos.current) { if (faseRef.current !== "espera") setF("procurando", "Clique em “Iniciar captura do rosto” quando estiver pronto(a)"); await dormir(200); continue; }
        consumidos.current = disparos.current;
      }
      // 1) procurar um rosto estável
      setF("procurando", modo === "identificar" ? "Posicione o rosto na câmera" : "Centralize o rosto e fique parado");
      const det = await faceapi.detectSingleFace(el, opts).withFaceLandmarks();
      if (!det || det.detection.score < 0.6 || det.detection.box.width < (el.videoWidth || 640) * 0.22) { estavel = 0; setProgresso(0); await dormir(150); continue; }
      estavel++;
      setProgresso(Math.min(100, estavel * 34));
      if (estavel < 3) { await dormir(90); continue; }
      estavel = 0;
      // 2) desafio de vivacidade (nonce de uso único emitido pelo servidor)
      let desafio: Desafio;
      try { desafio = await eduApi.get<Desafio>("/presenca/biometria/desafio"); } catch (e: any) { setErro(e?.message || "Falha ao pedir o desafio."); setF("erro"); await dormir(3000); setErro(null); continue; }
      setF("desafio", desafio.instrucao);
      const amostrasL: Amostra[] = [];
      const t0 = performance.now();
      let ev: EvidenciaLiveness | null = null;
      while (ativo.current && performance.now() - t0 < 9000) {
        const d = await faceapi.detectSingleFace(el, opts).withFaceLandmarks();
        if (d) amostrasL.push(amostraDe(d, performance.now()));
        const parcial = resumirLiveness(desafio.nonce, amostrasL);
        setProgresso(Math.min(95, ((performance.now() - t0) / 9000) * 100));
        if (desafioCumprido(desafio.acao, parcial)) { ev = parcial; break; }
        await dormir(40);
      }
      if (!ativo.current) return;
      if (!ev) { setF("espera", "Não deu para confirmar que é uma pessoa. Tente de novo (pisque ou vire a cabeça devagar)."); setProgresso(0); await dormir(1800); continue; }
      // 3) embeddings (calculados aqui, no dispositivo)
      setF("capturando", "Mantenha o rosto parado…");
      const vetores: number[][] = [];
      let qualidade = 0;
      for (let i = 0; i < amostras && ativo.current; i++) {
        const c = await faceapi.detectSingleFace(el, opts).withFaceLandmarks().withFaceDescriptor();
        if (!c) { i--; if (performance.now() - t0 > 25000) break; await dormir(120); continue; }
        vetores.push(Array.from(c.descriptor as Float32Array));
        qualidade += c.detection.score;
        setProgresso(Math.round(((i + 1) / amostras) * 100));
        if (i < amostras - 1) await dormir(450);
      }
      if (vetores.length < amostras) { setF("espera", "Rosto perdido durante a captura. Tente de novo."); await dormir(1500); continue; }
      // 4) enviar só o vetor
      setF("enviando", "Verificando…");
      try { await cbRef.current({ embeddings: vetores, liveness: ev, qualidade: Math.round((qualidade / vetores.length) * 100) / 100, modelo: MODELO_FACIAL }); } catch { /* o pai mostra o resultado */ }
      if (modo === "cadastrar") { setF("espera", "Captura concluída."); setProgresso(0); continue; }
      setF("espera", "Pronto. Próxima pessoa…");
      setProgresso(0);
      await dormir(esperaMs);
    }
  }, [amostras, esperaMs, modo]);

  useEffect(() => {
    ativo.current = true;
    let stream: MediaStream | null = null;
    const cam = cameraDisponivel();
    if (!cam.ok) { setErro(cam.motivo || "Câmera indisponível."); setF("erro"); return; }
    (async () => {
      try {
        const faceapi = await carregarMotor();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        if (!ativo.current || !video.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        video.current.srcObject = stream;
        await video.current.play();
        setF("procurando", "Câmera pronta");
        await ciclo(faceapi);
      } catch (e: any) {
        setErro(e?.name ? mensagemErroCamera(e) : "Não foi possível carregar o reconhecimento facial: " + (e?.message || e));
        setF("erro");
      }
    })();
    return () => { ativo.current = false; stream?.getTracks().forEach((t) => t.stop()); };
    // o ciclo é reiniciado quando muda o modo/amostras
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, amostras]);

  const cor = fase === "desafio" ? "#ffb300" : fase === "erro" ? "#d32f2f" : fase === "enviando" || fase === "capturando" ? "#1976d2" : "#2e7d32";
  return (
    <Box sx={{ display: "grid", gap: 1 }}>
      <Box sx={{ position: "relative", borderRadius: 4, overflow: "hidden", bgcolor: "#000", aspectRatio: aspecto, width: "100%", border: `4px solid ${cor}`, transition: "border-color .2s" }}>
        <Box component="video" ref={video} muted playsInline aria-label="Imagem da câmera (processada apenas neste aparelho)" sx={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", display: "block" }} />
        {fase === "iniciando" && <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff" }}><CircularProgress color="inherit" /></Box>}
        <Box sx={{ position: "absolute", left: 0, right: 0, bottom: 0, p: 1.25, bgcolor: "rgba(0,0,0,.6)", color: "#fff" }}>
          <Typography sx={{ fontWeight: 800, textAlign: "center", fontSize: { xs: 15, md: 18 } }} role="status" aria-live="polite">{msg}</Typography>
          {(fase === "procurando" || fase === "desafio" || fase === "capturando") && progresso > 0 && <LinearProgress variant="determinate" value={progresso} sx={{ mt: 0.75, height: 6, borderRadius: 3 }} />}
        </Box>
      </Box>
      {erro && <Alert severity="error">{erro}</Alert>}
      {modo === "cadastrar" && fase !== "iniciando" && fase !== "erro" && (
        <Button variant="contained" size="large" startIcon={<FaceIcon />} disabled={fase === "desafio" || fase === "capturando" || fase === "enviando"} onClick={() => { disparos.current += 1; setF("procurando", "Centralize o rosto e fique parado"); }}>
          {fase === "espera" ? "Capturar novamente" : "Iniciar captura do rosto"}
        </Button>
      )}
    </Box>
  );
}
