import { Alert, Box, Button, MenuItem, Tab, Tabs, TextField } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useCallback, useEffect, useState } from "react";
import EduShell from "../../edu/EduShell";
import { eduApi } from "../../services/EduApi";
import { PERFIL_LABEL, msgErro } from "../../edu/reitoria/common";
import type { Indicador } from "../../edu/reitoria/IndicatorCard";
import IndicatorDialog from "../../edu/reitoria/IndicatorDialog";
import OkrPanel from "../../edu/reitoria/OkrPanel";
import PainelView, { type Painel } from "../../edu/reitoria/PainelView";
import { AssistantBox, ReportButtons } from "../../edu/reitoria/ReportAssistant";

export default function EduReitoria() {
  const [tab, setTab] = useState(0);
  const [perfis, setPerfis] = useState<string[]>([]);
  const [perfil, setPerfil] = useState<string>("");
  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sel, setSel] = useState<Indicador | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    eduApi.get<{ padrao: string; disponiveis: string[] }>("/reitoria/painel/perfis")
      .then((r) => { setPerfis(r.disponiveis || []); setPerfil(r.padrao || r.disponiveis?.[0] || "reitoria"); })
      .catch((e) => { setErro(msgErro(e)); setPerfil("reitoria"); });
  }, []);

  const carregar = useCallback(async (forcar = false) => {
    if (!perfil) return;
    setErro(null); setPainel(null);
    try {
      if (forcar) await eduApi.post("/reitoria/painel/atualizar").catch(() => undefined);
      setPainel(await eduApi.get<Painel>(`/reitoria/painel/${perfil}`));
    } catch (e) { setErro(msgErro(e)); }
  }, [perfil]);
  useEffect(() => { carregar(recarga > 0); }, [carregar, recarga]);

  return (
    <EduShell
      title="Painel executivo"
      subtitle="Indicadores, metas e decisões da instituição em um só lugar."
      actions={perfil ? <ReportButtons perfil={perfil} /> : undefined}
    >
      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 2 }}>
        <TextField select size="small" label="Perfil" value={perfil} onChange={(e) => setPerfil(e.target.value)} sx={{ minWidth: 240 }} disabled={perfis.length < 2}>
          {(perfis.length ? perfis : [perfil || "reitoria"]).map((p) => <MenuItem key={p} value={p}>{PERFIL_LABEL[p] || p}</MenuItem>)}
        </TextField>
        <Button startIcon={<RefreshIcon />} onClick={() => setRecarga((n) => n + 1)}>Atualizar</Button>
      </Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        <Tab label="Indicadores" />
        <Tab label="Metas e OKRs" />
        <Tab label="Assistente por IA" />
      </Tabs>
      {tab === 0 && <PainelView painel={painel} erro={erro} onOpen={setSel} />}
      {tab === 1 && <OkrPanel />}
      {tab === 2 && (perfil ? <AssistantBox perfil={perfil} /> : <Alert severity="info">Carregando perfil…</Alert>)}
      <IndicatorDialog ind={sel} onClose={() => setSel(null)} />
    </EduShell>
  );
}
