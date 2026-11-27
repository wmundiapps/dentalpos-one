import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, MenuItem, Paper, Snackbar, TextField, Typography } from "@mui/material";
import FlagIcon from "@mui/icons-material/Flag";
import { useCallback, useEffect, useState } from "react";
import { eduApi } from "../../services/EduApi";
import { SEMAFORO_COR, msgErro } from "./common";

interface KR { id: string; titulo: string; progresso: number; confianca: string; fonte: string }
interface Objetivo { id: string; codigo: string; titulo: string; ciclo: string; progresso: number; fim: string; resultados: KR[] }

function CheckinDialog({ kr, onClose, onDone }: { kr: KR | null; onClose: () => void; onDone: () => void }) {
  const [valor, setValor] = useState("");
  const [confianca, setConfianca] = useState("");
  const [coment, setComent] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { setValor(""); setConfianca(""); setComent(""); setErro(null); }, [kr]);
  if (!kr) return null;
  const salvar = async () => {
    const n = Number(valor.replace(",", "."));
    if (valor.trim() === "" || Number.isNaN(n)) { setErro("Informe o valor atual do resultado-chave."); return; }
    setBusy(true); setErro(null);
    try {
      await eduApi.post(`/reitoria/resultados-chave/${kr.id}/checkins`, { valor: n, confianca: confianca || undefined, comentario: coment || undefined });
      onDone();
    } catch (e) { setErro(msgErro(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Check-in: {kr.titulo}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        {erro && <Alert severity="error">{erro}</Alert>}
        <TextField label="Valor atual" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus fullWidth />
        <TextField select label="Confiança (opcional)" value={confianca} onChange={(e) => setConfianca(e.target.value)} fullWidth>
          <MenuItem value="">Automática</MenuItem>
          <MenuItem value="VERDE">Verde — no caminho</MenuItem>
          <MenuItem value="AMARELO">Amarelo — atenção</MenuItem>
          <MenuItem value="VERMELHO">Vermelho — em risco</MenuItem>
        </TextField>
        <TextField label="Comentário" value={coment} onChange={(e) => setComent(e.target.value)} multiline minRows={2} fullWidth />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button variant="contained" onClick={salvar} disabled={busy}>Registrar check-in</Button>
      </DialogActions>
    </Dialog>
  );
}

/** OKRs/metas ativos com progresso e check-ins dos resultados-chave manuais. */
export default function OkrPanel() {
  const [objs, setObjs] = useState<Objetivo[] | null>(null);
  const [resumo, setResumo] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [kr, setKr] = useState<KR | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [o, r] = await Promise.all([
        eduApi.get<{ items: Objetivo[] }>("/reitoria/objetivos?status=ATIVO&pageSize=50"),
        eduApi.get("/reitoria/okr/painel").catch(() => null),
      ]);
      setObjs(o.items || []); setResumo(r);
    } catch (e) { setErro(msgErro(e)); setObjs([]); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
        <FlagIcon color="primary" />
        <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>Metas e OKRs</Typography>
        {resumo && <Chip size="small" label={`${resumo.objetivosAtivos} objetivos ativos`} />}
        {resumo?.progressoMedio != null && <Chip size="small" color="primary" label={`Progresso médio ${resumo.progressoMedio}%`} />}
        {resumo?.emRisco?.length > 0 && <Chip size="small" color="error" label={`${resumo.emRisco.length} em risco`} />}
        {resumo?.desatualizados?.length > 0 && <Chip size="small" color="warning" label={`${resumo.desatualizados.length} sem check-in`} />}
      </Box>
      {objs === null && <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress /></Box>}
      {erro && <Alert severity="info">Não foi possível carregar as metas ({erro}).</Alert>}
      {objs && !erro && objs.length === 0 && <Alert severity="info">Nenhum objetivo ativo. Cadastre ou ative objetivos para acompanhar as metas aqui.</Alert>}
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" } }}>
        {(objs || []).map((o) => (
          <Paper key={o.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Typography variant="caption" color="text.secondary">{o.codigo} · ciclo {o.ciclo} · até {new Date(o.fim).toLocaleDateString("pt-BR")}</Typography>
            <Typography sx={{ fontWeight: 700, mb: 1 }}>{o.titulo}</Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
              <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, o.progresso))} sx={{ flex: 1, height: 10, borderRadius: 5 }} />
              <Typography variant="body2" sx={{ fontWeight: 800 }}>{Math.round(o.progresso)}%</Typography>
            </Box>
            {o.resultados.map((k) => (
              <Box key={k.id} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.5 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: SEMAFORO_COR[k.confianca] || SEMAFORO_COR.CINZA, flexShrink: 0 }} />
                <Typography variant="body2" sx={{ flex: 1 }}>{k.titulo}</Typography>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>{Math.round(k.progresso)}%</Typography>
                {k.fonte === "MANUAL"
                  ? <Button size="small" onClick={() => setKr(k)}>Check-in</Button>
                  : <Chip size="small" variant="outlined" label="Automático" />}
              </Box>
            ))}
          </Paper>
        ))}
      </Box>
      <CheckinDialog kr={kr} onClose={() => setKr(null)} onDone={() => { setKr(null); setAviso("Check-in registrado."); carregar(); }} />
      <Snackbar open={!!aviso} autoHideDuration={3500} onClose={() => setAviso(null)} message={aviso} />
    </Box>
  );
}
