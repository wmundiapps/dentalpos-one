import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, FormControlLabel, MenuItem, Paper, Switch, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import {
  CAREER_LEVEL_LABELS, MODULE_LABELS, SECTOR_LABELS, TrainingApi,
  type TrainingOverviewRow, type TrainingPrizeRow, type TrainingSettings,
} from "../services/TrainingApi";
import { errorMessage, toast } from "../utils/toast";

const PRIZE_SUGGESTIONS = ["Meio período de folga", "Uma folga", "Uma caixa de bombom", "Vale-almoço"];
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");
const fmtMin = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

export default function TrainingAdmin() {
  const [settings, setSettings] = useState<TrainingSettings | null>(null);
  const [prizes, setPrizes] = useState<TrainingPrizeRow[]>([]);
  const [overview, setOverview] = useState<TrainingOverviewRow[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, p, o] = await Promise.all([TrainingApi.settings(), TrainingApi.prizes(), TrainingApi.overview()]);
      setSettings(s);
      setPrizes(p);
      setOverview(o);
      setError("");
    } catch (e) {
      setError(errorMessage(e, "Não foi possível carregar o treinamento."));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      setSettings(await TrainingApi.saveSettings(settings));
      toast.success("Configurações do treinamento salvas.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleDelivered = async (row: TrainingPrizeRow) => {
    try {
      const updated = await TrainingApi.setDelivered(row.id, !row.deliveredAt);
      setPrizes((list) => list.map((p) => (p.id === row.id ? updated : p)));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const toggleSector = (key: string) => {
    if (!settings) return;
    const has = settings.jobRotationSectors.includes(key);
    setSettings({ ...settings, jobRotationSectors: has ? settings.jobRotationSectors.filter((k) => k !== key) : [...settings.jobRotationSectors, key] });
  };

  return (
    <Box>
      <PageHeader title="Gestão do treinamento" description="Prêmio de quem chega ao topo, limite diário de jogo, setores do Job Rotation e acompanhamento da equipe." />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!error && !settings && <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}><CircularProgress /></Box>}
      {settings && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1fr) minmax(0,1.3fr)" }, gap: 2, alignItems: "start" }}>
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Regras</Typography>
            <TextField
              label="Prêmio para quem chegar ao topo"
              value={settings.prize}
              onChange={(e) => setSettings({ ...settings, prize: e.target.value })}
              slotProps={{ htmlInput: { maxLength: 120 } }}
              helperText="Deixe em branco para não dar prêmio."
            />
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {PRIZE_SUGGESTIONS.map((p) => <Chip key={p} label={p} onClick={() => setSettings({ ...settings, prize: p })} variant={settings.prize === p ? "filled" : "outlined"} />)}
            </Box>
            <TextField
              select
              label="Dentistas: nível mínimo para ganhar"
              value={settings.minLevel}
              onChange={(e) => setSettings({ ...settings, minLevel: e.target.value })}
              helperText="Ganha quem bater todas as metas desse nível ou de um mais difícil."
            >
              {Object.entries(CAREER_LEVEL_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </TextField>
            <TextField
              type="number"
              label="Limite de jogo por dia (minutos)"
              value={settings.dailyLimitMinutes}
              onChange={(e) => setSettings({ ...settings, dailyLimitMinutes: Number(e.target.value) })}
              slotProps={{ htmlInput: { min: 1, max: 60 } }}
            />
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Setores do Job Rotation</Typography>
              <Typography variant="caption" color="text.secondary">Para subir de nível, o colaborador precisa de 70% em cada setor marcado. Quem conclui os 5 níveis ganha o prêmio.</Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap" }}>
                {Object.entries(SECTOR_LABELS).map(([k, v]) => (
                  <FormControlLabel key={k} control={<Checkbox checked={settings.jobRotationSectors.includes(k)} onChange={() => toggleSector(k)} />} label={v} />
                ))}
              </Box>
            </Box>
            <Box><Button variant="contained" onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button></Box>
          </Paper>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Prêmios conquistados</Typography>
              {prizes.length === 0 ? <Typography color="text.secondary">Ninguém chegou ao topo ainda.</Typography> : (
                <TableContainer>
                  <Table size="small">
                    <TableHead><TableRow><TableCell>Colaborador</TableCell><TableCell>Módulo</TableCell><TableCell>Prêmio</TableCell><TableCell>Código</TableCell><TableCell>Data</TableCell><TableCell>Entregue</TableCell></TableRow></TableHead>
                    <TableBody>
                      {prizes.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>{p.userName}</TableCell>
                          <TableCell>{MODULE_LABELS[p.module]}{p.module === "carreira" ? ` · ${CAREER_LEVEL_LABELS[p.level] || p.level}` : ""}</TableCell>
                          <TableCell>{p.prize}</TableCell>
                          <TableCell sx={{ fontFamily: "monospace", fontWeight: 700 }}>{p.code}</TableCell>
                          <TableCell>{fmtDate(p.createdAt)}</TableCell>
                          <TableCell><Switch checked={Boolean(p.deliveredAt)} onChange={() => void toggleDelivered(p)} slotProps={{ input: { "aria-label": `Prêmio de ${p.userName} entregue` } }} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Paper>
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Equipe jogando</Typography>
              {overview.length === 0 ? <Typography color="text.secondary">Ninguém começou a jogar ainda.</Typography> : (
                <TableContainer>
                  <Table size="small">
                    <TableHead><TableRow><TableCell>Colaborador</TableCell><TableCell>Módulo</TableCell><TableCell>Onde está</TableCell><TableCell>Tempo hoje</TableCell><TableCell>Último acesso</TableCell></TableRow></TableHead>
                    <TableBody>
                      {overview.map((o) => (
                        <TableRow key={`${o.userId}-${o.module}`}>
                          <TableCell>{o.userName}</TableCell>
                          <TableCell>{MODULE_LABELS[o.module]}</TableCell>
                          <TableCell>
                            {o.module === "carreira" ? (o.level ? `Nível ${CAREER_LEVEL_LABELS[o.level] || o.level}` : "Escolhendo nível") : (o.reachedTop ? "Topo" : `Nível ${o.level} de 5`)}
                            {o.reachedTop && <Chip size="small" color="success" label="topo" sx={{ ml: 1 }} />}
                          </TableCell>
                          <TableCell>{fmtMin(o.todaySeconds)}</TableCell>
                          <TableCell>{fmtDate(o.updatedAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Paper>
          </Box>
        </Box>
      )}
    </Box>
  );
}
