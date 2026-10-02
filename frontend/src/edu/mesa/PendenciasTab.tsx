import { Alert, Box, Button, Chip, CircularProgress, FormControlLabel, MenuItem, Paper, Switch, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { eduApi, qsOf } from "../../services/EduApi";
import { fmtData, mapRota, msgErro } from "../reitoria/common";
import { AdiarDialog, useConfirmAcao } from "./acoes";

const SEV_COR: Record<string, string> = { INFO: "#2E7DD6", ATENCAO: "#E5A100", CRITICO: "#D64545" };
const SEV_LABEL: Record<string, string> = { INFO: "Normal", ATENCAO: "Atenção", CRITICO: "Crítico" };
const TIPO_LABEL: Record<string, string> = { LEMBRETE: "Lembrete", APROVACAO: "Aprovação", TAREFA: "Tarefa", ETAPA_JORNADA: "Etapa de jornada", NOTIFICACAO: "Notificação" };

interface Item {
  id: string; tipo: string; modulo: string; titulo: string; descricao?: string | null; prazo?: string | null; severidade: string;
  atrasadoDias: number; rota?: string | null; ref?: { type: string; id: string } | null; acoes?: string[];
}

export default function PendenciasTab({ onChanged }: { onChanged: () => void }) {
  const nav = useNavigate();
  const [items, setItems] = useState<Item[] | null>(null);
  const [fontesComErro, setFontes] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [tipo, setTipo] = useState("");
  const [sev, setSev] = useState("");
  const [atrasados, setAtrasados] = useState(false);
  const [adiar, setAdiar] = useState<Item | null>(null);
  const { run, aviso } = useConfirmAcao();

  const carregar = useCallback(async () => {
    setErro(null); setItems(null);
    try {
      const r = await eduApi.get<{ items: Item[]; fontesComErro?: string[] }>(`/reitoria/mesa${qsOf({ tipo, severidade: sev, atrasados: atrasados ? "true" : "", pageSize: 100 })}`);
      setItems(r.items || []); setFontes(r.fontesComErro || []);
    } catch (e) { setErro(msgErro(e)); setItems([]); }
  }, [tipo, sev, atrasados]);
  useEffect(() => { carregar(); }, [carregar]);

  const depois = () => { carregar(); onChanged(); };
  const concluir = (i: Item) => run(() => eduApi.post(`/reitoria/mesa/lembretes/${i.ref!.id}/concluir`), "Lembrete concluído.", depois);
  const lida = (i: Item) => run(() => eduApi.post(`/reitoria/mesa/notificacoes/${i.ref!.id}/lida`), "Notificação marcada como lida.", depois);

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
        <TextField select size="small" label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} sx={{ minWidth: 170 }}>
          <MenuItem value="">Todos</MenuItem>
          {Object.entries(TIPO_LABEL).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Severidade" value={sev} onChange={(e) => setSev(e.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value="">Todas</MenuItem>
          {Object.entries(SEV_LABEL).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
        </TextField>
        <FormControlLabel control={<Switch checked={atrasados} onChange={(e) => setAtrasados(e.target.checked)} />} label="Somente atrasados" />
      </Box>
      {erro && <Alert severity="warning" sx={{ mb: 2 }}>Não foi possível carregar suas pendências: {erro}</Alert>}
      {fontesComErro.length > 0 && <Alert severity="info" sx={{ mb: 2 }}>Algumas fontes não responderam e podem estar incompletas: {fontesComErro.join(", ")}.</Alert>}
      {items === null && <Box sx={{ textAlign: "center", py: 5 }}><CircularProgress /></Box>}
      {items && !erro && items.length === 0 && <Alert severity="success">Tudo em dia! Nenhuma pendência encontrada.</Alert>}
      <Box sx={{ display: "grid", gap: 1.5 }}>
        {(items || []).map((i) => {
          const rota = mapRota(i.rota, i.modulo);
          return (
            <Paper key={i.id} variant="outlined" sx={{ p: 2, borderRadius: 3, borderLeft: `6px solid ${SEV_COR[i.severidade] || SEV_COR.INFO}`, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
              <Box sx={{ flex: 1, minWidth: 240 }}>
                <Box sx={{ display: "flex", gap: 1, mb: 0.5, flexWrap: "wrap" }}>
                  <Chip size="small" label={TIPO_LABEL[i.tipo] || i.tipo} />
                  <Chip size="small" variant="outlined" label={i.modulo} />
                  {i.atrasadoDias > 0 && <Chip size="small" color="error" label={`${i.atrasadoDias} dia(s) de atraso`} />}
                </Box>
                <Typography sx={{ fontWeight: 700 }}>{i.titulo}</Typography>
                {i.descricao && <Typography variant="body2" color="text.secondary" sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{i.descricao}</Typography>}
                {i.prazo && <Typography variant="caption" color="text.secondary">Prazo: {fmtData(i.prazo)}</Typography>}
              </Box>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {i.acoes?.includes("concluir") && <Button size="small" variant="contained" color="success" onClick={() => concluir(i)}>Concluir</Button>}
                {i.acoes?.includes("adiar") && <Button size="small" onClick={() => setAdiar(i)}>Adiar</Button>}
                {i.acoes?.includes("marcar-lida") && <Button size="small" onClick={() => lida(i)}>Marcar como lida</Button>}
                {rota && <Button size="small" variant="outlined" onClick={() => nav(rota)}>Abrir</Button>}
              </Box>
            </Paper>
          );
        })}
      </Box>
      <AdiarDialog
        aberto={!!adiar} titulo={adiar?.titulo}
        onClose={() => setAdiar(null)}
        onConfirm={(dias) => run(() => eduApi.post(`/reitoria/mesa/lembretes/${adiar!.ref!.id}/adiar`, { dias }), `Lembrete adiado em ${dias} dia(s).`, () => { setAdiar(null); depois(); })}
      />
      {aviso}
    </Box>
  );
}
