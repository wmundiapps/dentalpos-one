import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from "@mui/material";
import { HrApi, type Workplace } from "../../services/HrApi";

const blank = { name: "", address: "", latitude: "", longitude: "", radiusMeters: "150", maps: "", remote: false, tz: "-180" };
const linkOf = (w: Workplace) => `${window.location.origin}/ponto/${w.slug}`;

// Polos/unidades: local exato (para ninguém bater ponto fora do polo), raio permitido, PIN do aparelho e link do ponto de cada polo.
export default function WorkplacesTab() {
  const [rows, setRows] = useState<Workplace[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Workplace | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinFor, setPinFor] = useState<Workplace | null>(null);
  const [pin, setPin] = useState("");

  const load = useCallback(() => HrApi.workplaces().then(setRows).catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar os polos.")), []);
  useEffect(() => { void load(); }, [load]);
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const openNew = () => { setEditing(null); setForm(blank); setAccuracy(null); setError(""); setOpen(true); };
  const openEdit = (w: Workplace) => { setEditing(w); setForm({ name: w.name, address: w.address || "", latitude: String(w.latitude), longitude: String(w.longitude), radiusMeters: String(w.radiusMeters), maps: "", remote: false, tz: String(w.utcOffsetMinutes) }); setAccuracy(null); setError(""); setOpen(true); };

  const capture = () => {
    if (!navigator.geolocation) { setError("Este aparelho não informa a localização."); return; }
    setError(""); setNotice("Capturando a localização… fique no local do polo e aguarde.");
    navigator.geolocation.getCurrentPosition(
      (p) => { setForm((f) => ({ ...f, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) })); setAccuracy(Math.round(p.coords.accuracy)); setNotice(""); },
      () => { setNotice(""); setError("Não consegui obter a localização. Permita o acesso à localização no navegador."); },
      { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 },
    );
  };
  const parseMaps = (v: string) => {
    const m = /(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)/.exec(v);
    setForm((f) => ({ ...f, maps: v, ...(m ? { latitude: m[1], longitude: m[2] } : {}) }));
  };

  const save = async () => {
    setBusy(true); setError("");
    try { await HrApi.saveWorkplace(editing?.id || null, { name: form.name, address: form.address, latitude: form.latitude, longitude: form.longitude, radiusMeters: form.radiusMeters, pendingCalibration: form.remote, utcOffsetMinutes: Number(form.tz) }); setOpen(false); await load(); setNotice("Polo salvo."); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); } finally { setBusy(false); }
  };
  const savePin = async () => {
    if (!pinFor) return;
    try { await HrApi.setWorkplacePin(pinFor.id, pin); setNotice(`PIN do polo ${pinFor.name} definido. Aparelhos liberados antes com o PIN antigo precisam digitar o novo.`); setPinFor(null); setPin(""); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar o PIN."); }
  };

  return (
    <Box sx={{ p: 2, display: "grid", gap: 1.5 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 680 }}>Cada polo tem o seu <b>local exato</b> e um <b>link</b> do ponto. O celular do polo abre o link, digita o PIN uma vez e os colaboradores batem o ponto com CPF e rosto, <b>só dentro do raio do polo</b>. Esse acesso não abre nenhuma outra parte do sistema.</Typography>
        <Button variant="contained" onClick={openNew}>Novo polo</Button>
      </Box>
      {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert severity="info" onClose={() => setNotice("")}>{notice}</Alert>}
      {rows.length === 0 && <Typography color="text.secondary">Nenhum polo cadastrado ainda.</Typography>}
      {rows.map((w) => (
        <Box key={w.id} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr auto" }, gap: 1, p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2, alignItems: "center" }}>
          <Box>
            <Typography sx={{ fontWeight: 800 }}>{w.name}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{w.address || "sem endereço"} · {w.latitude.toFixed(5)}, {w.longitude.toFixed(5)} · raio {w.radiusMeters} m</Typography>
            <Typography variant="caption" sx={{ display: "block", wordBreak: "break-all" }}>{linkOf(w)}</Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            <Chip size="small" label={`${w.employees} colaborador(es)`} />
            {w.utcOffsetMinutes !== -180 && <Chip size="small" variant="outlined" label={`Fuso UTC${w.utcOffsetMinutes / 60}`} />}
            <Chip size="small" color={w.hasPin ? "success" : "warning"} label={w.hasPin ? "PIN definido" : "Sem PIN"} />
            {w.pending ? <Chip size="small" color="error" label="Local ainda não definido" /> : w.calibratedAt ? <Chip size="small" color="success" variant="outlined" label={`Local confirmado no polo ±${w.calibratedAccuracy ?? "?"} m em ${new Date(w.calibratedAt).toLocaleDateString("pt-BR")}`} /> : null}
            {w.calibrating && <Chip size="small" color="warning" label="Local será definido no próximo primeiro acesso" />}
          </Box>
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            <Button size="small" onClick={() => { void navigator.clipboard?.writeText(linkOf(w)); setNotice(`Link do polo ${w.name} copiado.`); }}>Copiar link</Button>
            <Button size="small" onClick={() => { setPinFor(w); setPin(""); }}>PIN</Button>
            <Button size="small" color={w.calibrating ? "inherit" : "warning"} onClick={async () => { try { await HrApi.setWorkplaceCalibration(w.id, !w.calibrating); await load(); setNotice(w.calibrating ? "Calibragem encerrada." : `Calibragem liberada. O próximo primeiro acesso de colaborador no polo ${w.name} (dentro do polo) define o novo local.`); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível alterar a calibragem."); } }}>{w.calibrating ? "Cancelar refazer local" : "Refazer o local no próximo acesso"}</Button>
            <Button size="small" onClick={() => openEdit(w)}>Editar</Button>
          </Box>
        </Box>
      ))}

      <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>{editing ? "Editar polo" : "Novo polo"}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <TextField label="Nome do polo" value={form.name} onChange={set("name")} required />
          <TextField label="Endereço (referência)" value={form.address} onChange={set("address")} />
          <TextField select label="Fuso horário do polo" value={form.tz} onChange={set("tz")} helperText="Os horários do ponto (entrada, atraso, espelho) valem no relógio local do polo."><MenuItem value="-180">Brasília (PR, SP...) — UTC-3</MenuItem><MenuItem value="-240">Mato Grosso do Sul, Mato Grosso, Amazonas — UTC-4</MenuItem><MenuItem value="-300">Acre — UTC-5</MenuItem><MenuItem value="-120">Fernando de Noronha — UTC-2</MenuItem></TextField>
          {!editing && <Box component="label" sx={{ display: "flex", alignItems: "flex-start", gap: 1, cursor: "pointer" }}><input type="checkbox" checked={form.remote} onChange={(e) => setForm((f) => ({ ...f, remote: e.target.checked }))} style={{ marginTop: 4 }} /><span><b>O polo é em outra cidade:</b> o local será definido no primeiro acesso de um colaborador, dentro do polo. Você cria o polo e o PIN; o primeiro colaborador a bater o ponto lá, com a localização ligada, define o local do polo.</span></Box>}
          <Alert severity="info">Para ninguém bater ponto fora do polo, o local precisa ser exato. O jeito mais preciso: <b>quem está no polo</b> abre esta tela no celular do polo, fica na recepção e clica em “Capturar a localização deste aparelho”.</Alert>
          <Button variant="outlined" onClick={capture}>Capturar a localização deste aparelho</Button>
          {accuracy !== null && <Alert severity={accuracy <= 50 ? "success" : "warning"}>Localização capturada com precisão de ±{accuracy} m.{accuracy > 50 ? " Está imprecisa: vá para perto de uma janela e capture de novo." : ""}</Alert>}
          <TextField label="Ou cole do Google Maps (clique com o botão direito no local e copie as coordenadas)" value={form.maps} onChange={(e) => parseMaps(e.target.value)} placeholder="-23.4210, -51.9331" />
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1.5 }}>
            <TextField label="Latitude" value={form.latitude} onChange={set("latitude")} />
            <TextField label="Longitude" value={form.longitude} onChange={set("longitude")} />
            <TextField label="Raio permitido (m)" value={form.radiusMeters} onChange={set("radiusMeters")} helperText="30 a 1000" />
          </Box>
          {form.latitude && form.longitude && <Button size="small" href={`https://www.google.com/maps?q=${form.latitude},${form.longitude}`} target="_blank" rel="noopener">Conferir no mapa</Button>}
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions><Button disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button><Button variant="contained" disabled={busy || form.name.trim().length < 3 || (!form.remote && (!form.latitude || !form.longitude))} onClick={() => void save()}>Salvar polo</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(pinFor)} onClose={() => setPinFor(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 900 }}>PIN do aparelho — {pinFor?.name}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <Typography variant="body2" color="text.secondary">O PIN (6 números) libera o celular do polo uma única vez. Passe só para a pessoa responsável pelo polo. Trocar o PIN desliga os aparelhos liberados antes.</Typography>
          <TextField label="PIN (6 números)" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} slotProps={{ htmlInput: { inputMode: "numeric" } }} />
          <Button size="small" onClick={() => setPin(String(Math.floor(100000 + Math.random() * 900000)))}>Sugerir um PIN</Button>
        </DialogContent>
        <DialogActions><Button onClick={() => setPinFor(null)}>Cancelar</Button><Button variant="contained" disabled={pin.length !== 6} onClick={() => void savePin()}>Salvar PIN</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
