import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Paper, TextField, Typography } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import PageHeader from "../components/PageHeader";
import { loadPlatformActivity, type PlatformActivity } from "../services/PlatformActivityApi";

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const AGORA = new Date();
const DOIS_DIAS_ATRAS = new Date(AGORA.getTime() - 2 * 24 * 3_600_000);

// Painel interno (equipe WMundi): o que as contas de teste fizeram num período — login e ações por módulo.
export default function PlatformActivity() {
  const [desde, setDesde] = useState(toLocalInput(DOIS_DIAS_ATRAS));
  const [ate, setAte] = useState(toLocalInput(AGORA));
  const [data, setData] = useState<PlatformActivity | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await loadPlatformActivity(new Date(desde).toISOString(), new Date(ate).toISOString()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao consultar atividade.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box>
      <PageHeader
        title="Atividade de teste"
        description="O que as contas de teste fizeram no período: logins e ações por módulo."
        actionLabel="Atualizar"
        actionIcon={<RefreshIcon />}
        onAction={() => void load()}
      />

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 3, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        <TextField size="small" label="De" type="datetime-local" value={desde} onChange={(e) => setDesde(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" label="Até" type="datetime-local" value={ate} onChange={(e) => setAte(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <Button variant="contained" onClick={() => void load()} disabled={loading}>Consultar</Button>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Paper variant="outlined" sx={{ p: 5, borderRadius: 3, textAlign: "center" }}>
          <CircularProgress size={28} />
        </Paper>
      ) : data ? (
        <Box sx={{ display: "grid", gap: 3 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Typography sx={{ fontWeight: 800, mb: 1.5 }}>{`Logins no período (${data.logins.length})`}</Typography>
            {data.logins.length === 0 ? (
              <Typography color="text.secondary">Nenhum login no período.</Typography>
            ) : (
              <Box sx={{ display: "grid", gap: 0.75 }}>
                {data.logins.map((l, i) => (
                  <Box key={i} sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid", borderColor: "divider", pb: 0.75 }}>
                    <Typography variant="body2" sx={{ minWidth: 150 }}>{new Date(l.horario).toLocaleString("pt-BR")}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{l.nome}</Typography>
                    <Chip size="small" label={l.role} />
                    <Typography variant="caption" color="text.secondary">{`IP: ${l.ip}`}</Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Typography sx={{ fontWeight: 800, mb: 1.5 }}>{`Ações por usuário (${data.totalEventos} no total)`}</Typography>
            {data.porUsuario.length === 0 ? (
              <Typography color="text.secondary">Nenhuma ação registrada no período.</Typography>
            ) : (
              <Box sx={{ display: "grid", gap: 2 }}>
                {data.porUsuario.map((u, i) => (
                  <Box key={i}>
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 0.5 }}>
                      <Typography sx={{ fontWeight: 700 }}>{u.nome}</Typography>
                      <Chip size="small" label={u.role} />
                    </Box>
                    <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                      {u.acoes.map((a, j) => (
                        <Chip key={j} size="small" variant="outlined" label={`${a.chave}: ${a.total}`} />
                      ))}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Paper>
        </Box>
      ) : null}
    </Box>
  );
}
