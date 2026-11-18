import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Paper, TextField, Typography } from "@mui/material";
import FacePunchKiosk from "./FacePunchKiosk";
import type { PunchApi } from "../services/HrFaceApi";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
async function call<T>(path: string, token: string | null, body?: unknown): Promise<T> {
  const r = await fetch(`${API}/public/ponto/${path}`, { method: body === undefined ? "GET" : "POST", headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d?.error || `Erro ${r.status}`), { code: d?.code as string | undefined, employeeName: d?.employeeName as string | undefined, status: r.status });
  return d as T;
}

// Primeiro acesso do polo: depois do PIN, o aparelho do polo pede para CONFIRMAR A LOCALIZAÇÃO. Grava o local exato (GPS com boa precisão),
// no lugar de qualquer local que estivesse salvo antes. Só aparece quando o RH liberou a calibragem do polo.
function CalibrateStep({ name, onConfirm }: { name: string; onConfirm: (g: { latitude: number; longitude: number; accuracy: number }) => Promise<void> }) {
  const best = useRef<{ latitude: number; longitude: number; accuracy: number; at: number } | null>(null);
  const [acc, setAcc] = useState<number | null>(null);
  const [geoErr, setGeoErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!navigator.geolocation) { setGeoErr("Este aparelho não informa a localização."); return; }
    // Guarda a leitura mais precisa dos últimos segundos; leituras sempre novas (sem cache).
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const now = Date.now();
        const cur = best.current;
        if (!cur || p.coords.accuracy <= cur.accuracy || now - cur.at > 25000) { best.current = { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, at: now }; setAcc(Math.round(p.coords.accuracy)); }
        setGeoErr("");
      },
      () => setGeoErr("Ative a localização do aparelho e permita o acesso do navegador a ela."),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const good = acc !== null && acc <= 60;
  const confirm = async () => {
    const g = best.current;
    if (!g) return;
    setBusy(true); setError("");
    try { await onConfirm({ latitude: g.latitude, longitude: g.longitude, accuracy: g.accuracy }); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível confirmar o local."); } finally { setBusy(false); }
  };

  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, display: "grid", gap: 2 }}>
      <Typography variant="h5" sx={{ fontWeight: 900, textAlign: "center" }}>Confirmar a localização — {name}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>Primeiro uso do polo: este aparelho vai gravar o local exato onde você está agora. Confirme só se estiver <b>dentro do polo</b>. Use o celular do polo, com a localização ligada.</Typography>
      {geoErr ? <Alert severity="warning">{geoErr}</Alert>
        : acc === null ? <Box sx={{ display: "grid", justifyItems: "center", gap: 1 }}><CircularProgress size={28} /><Typography variant="body2">Buscando a localização exata…</Typography></Box>
        : good ? <Alert severity="success">Localização exata encontrada (precisão ±{acc} m). Pode confirmar.</Alert>
        : <Alert severity="info">Buscando a localização exata… precisão atual ±{acc} m (precisa chegar a ±60 m). Aguarde alguns segundos e, se puder, chegue perto de uma janela ou área aberta.</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      <Button variant="contained" size="large" disabled={busy || !good} onClick={() => void confirm()}>{busy ? "Gravando…" : "Confirmar que estou no polo"}</Button>
    </Paper>
  );
}

// Ponto do polo: link próprio de cada polo (/ponto/nome-do-polo). O celular do polo digita o PIN uma vez; depois é só CPF + rosto, valendo apenas dentro do raio do polo.
export default function PoloPunch({ slug }: { slug: string }) {
  const keyName = `completodonto.polo.${slug}`;
  const [token, setToken] = useState(() => { try { return localStorage.getItem(keyName); } catch { return null; } });
  const [info, setInfo] = useState<{ name: string; ready: boolean; calibrating?: boolean; pending?: boolean } | null | undefined>(undefined);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { call<{ name: string; ready: boolean; calibrating?: boolean; pending?: boolean }>(slug, null).then(setInfo).catch(() => setInfo(null)); }, [slug]);

  const lockOut = () => { try { localStorage.removeItem(keyName); } catch { /* sem armazenamento */ } setToken(null); };
  const api: PunchApi = useMemo(() => {
    const wrap = async <T,>(fn: () => Promise<T>) => { try { return await fn(); } catch (e) { if ((e as { code?: string }).code === "POLO_LOCKED") lockOut(); throw e; } };
    return {
      cpfCheck: (cpf, geo) => wrap(() => call(`${slug}/cpf-check`, token, { cpf, ...geo })),
      facePunch: (cpf, descriptor, photo, geo) => wrap(() => call(`${slug}/face-punch`, token, { cpf, descriptor, photo, ...geo })),
      firstFaceEnroll: (cpf, samples, photo, geo) => wrap(() => call(`${slug}/face-first-enroll`, token, { cpf, samples, photo, consent: true, ...geo })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, token]);

  const unlock = async () => {
    setBusy(true); setError("");
    try { const r = await call<{ token: string }>(`${slug}/unlock`, null, { pin }); try { localStorage.setItem(keyName, r.token); } catch { /* sem armazenamento */ } setToken(r.token); setPin(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível liberar o aparelho."); } finally { setBusy(false); }
  };

  return (
    <Box sx={{ minHeight: "100vh", p: 2, display: "grid", justifyItems: "center", alignContent: "start", bgcolor: "background.default" }}>
      <Box sx={{ width: "100%", maxWidth: 560, mt: 2 }}>
        {info === undefined ? <Box sx={{ display: "grid", placeItems: "center", minHeight: 200 }}><CircularProgress /></Box>
          : info === null ? <Alert severity="error">Polo não encontrado. Confira o link com o RH.</Alert>
          : !token ? (
            <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, display: "grid", gap: 2 }}>
              <Typography variant="h5" sx={{ fontWeight: 900, textAlign: "center" }}>Ponto — {info.name}</Typography>
              {!info.ready ? <Alert severity="warning">Este polo ainda não tem o PIN do aparelho. Peça ao RH para definir.</Alert> : <>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>Primeiro uso neste aparelho: digite o PIN do polo (6 números), informado pelo RH. Depois disso não será pedido de novo.</Typography>
                <TextField label="PIN do polo" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} type="password" slotProps={{ htmlInput: { inputMode: "numeric", style: { fontSize: 26, letterSpacing: 8, textAlign: "center" } } }} onKeyDown={(e) => { if (e.key === "Enter" && pin.length === 6) void unlock(); }} />
                {error && <Alert severity="error">{error}</Alert>}
                <Button variant="contained" size="large" disabled={busy || pin.length !== 6} onClick={() => void unlock()}>Liberar este aparelho</Button>
              </>}
            </Paper>
          ) : info.calibrating ? (
            <CalibrateStep name={info.name} onConfirm={async (g) => { await call(`${slug}/calibrate`, token, g); setInfo({ ...info, calibrating: false, pending: false }); }} />
          ) : info.pending && !info.calibrating ? (
            <Alert severity="warning">O local deste polo ainda não foi definido. Peça ao RH para liberar a confirmação do local e tente de novo.</Alert>
          ) : <FacePunchKiosk embedded api={api} title={`Ponto — ${info.name}`} description={info.pending ? "PRIMEIRO ACESSO DO POLO: o seu primeiro ponto, feito agora dentro do polo, define o local do polo. Ligue a localização do aparelho e fique na recepção." : "Digite o CPF e olhe para a câmera. O ponto só vale dentro do polo, com a localização do aparelho ligada."} />}
      </Box>
    </Box>
  );
}
